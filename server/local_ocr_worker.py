"""Bounded local OCR worker protocol; the parent owns temporary-file cleanup.

stdin/stdout contain JSON lines. Only parent-created files under runtime_root
are accepted. Model setup precedes input processing; no receipt API is called.
This is a worker boundary, not an operating-system security sandbox.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import warnings

MAX_REQUEST = 18 * 1024 * 1024
MAX_RESPONSE = 1024 * 1024


def validate_panel(panel, runtime_root):
    from PIL import Image
    if (not isinstance(panel, dict) or set(panel) != {"path", "photo", "part", "sha256"}
            or type(panel["photo"]) is not int or not 1 <= panel["photo"] <= 12
            or type(panel["part"]) is not int or not 1 <= panel["part"] <= 12
            or not isinstance(panel["path"], str) or not isinstance(panel["sha256"], str)):
        raise ValueError("Invalid panel")
    path = Path(panel["path"]).resolve(strict=True)
    path.relative_to(runtime_root.resolve(strict=True))
    if not path.is_file() or not 8 <= path.stat().st_size <= 6 * 1024 * 1024:
        raise ValueError("Invalid image size")
    if hashlib.sha256(path.read_bytes()).hexdigest() != panel["sha256"]:
        raise ValueError("Image bytes changed")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(path) as image:
            width, height = image.size
            if image.format != "JPEG" or min(width, height) < 8 or max(width, height) > 4000 or width * height > 4_000_000:
                raise ValueError("Invalid decoded image dimensions or type")
            image.verify()
    return path


def send(payload):
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_RESPONSE:
        encoded = b'{"error":"output-too-large"}'
    sys.stdout.buffer.write(encoded + b"\n")
    sys.stdout.buffer.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["paddle-v6", "doctr"], required=True)
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--cache-root", type=Path, required=True)
    args = parser.parse_args()
    runtime_root = args.runtime_root.resolve(strict=True)
    os.environ["PADDLE_PDX_CACHE_HOME"] = str(args.cache_root / "paddlex")
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    os.environ["DOCTR_CACHE_DIR"] = str(args.cache_root / "doctr-models")
    from local_ocr_models import create_adapter
    try:
        with contextlib.redirect_stdout(sys.stderr):
            adapter = create_adapter(args.engine)
    except Exception:
        send({"fatal": "model-unavailable"})
        return

    def deny_network(*_args, **_kwargs):
        raise RuntimeError("Network disabled during local inference")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    send({"ready": True, "engine": adapter.name})
    while raw := sys.stdin.buffer.readline(MAX_REQUEST + 1):
        if len(raw) > MAX_REQUEST or not raw.endswith(b"\n"):
            send({"error": "request-too-large"})
            return
        try:
            request = json.loads(raw)
            if not isinstance(request, dict) or set(request) != {"panels"}:
                raise ValueError("Invalid request")
            panels = request["panels"]
            if not isinstance(panels, list) or not 1 <= len(panels) <= 24:
                raise ValueError("Invalid panel count")
            paths = [validate_panel(panel, runtime_root) for panel in panels]
        except Exception:
            send({"error": "invalid-image"})
            continue
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = [{"photo": panel["photo"], "part": panel["part"], **adapter.recognize(path)}
                          for panel, path in zip(panels, paths, strict=True)]
            send({"engine": adapter.name, "panels": result})
        except Exception:
            send({"error": "recognition-failed"})


if __name__ == "__main__":
    main()
