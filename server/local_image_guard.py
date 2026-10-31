"""One-shot JPEG validation before native vision inference; no model or network calls."""
from pathlib import Path
import json
import sys
from local_ocr_worker import validate_panel


def main():
    try:
        root = Path(sys.argv[1]).resolve(strict=True)
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("Oversized image manifest")
        request = json.loads(raw)
        if not isinstance(request, dict) or set(request) != {"panels"}:
            raise ValueError("Invalid image manifest")
        panels = request["panels"]
        if not isinstance(panels, list) or not 1 <= len(panels) <= 3:
            raise ValueError("Invalid section count")
        from PIL import Image
        for panel in panels:
            path = validate_panel(panel, root)
            # Image.verify alone does not fully decode JPEG pixel data.
            with Image.open(path) as image:
                image.load()
        result = {"valid": True}
    except Exception:
        result = {"valid": False}
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
