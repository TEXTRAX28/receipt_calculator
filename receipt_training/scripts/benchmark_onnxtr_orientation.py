"""Offline, bounded whole-page orientation trial using pinned OnnxTR weights."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import socket
import sys
import time

ROOT = Path(__file__).resolve().parents[2]


def preprocess(rgb, config):
    """Match upstream PIL bilinear, aspect-preserving symmetric black padding."""
    import numpy as np
    from PIL import Image, ImageOps

    height, width = rgb.shape[:2]
    target_h, target_w = config["input_shape"][1:]
    ratio, target_ratio = height / width, target_h / target_w
    if ratio == target_ratio:
        resized_h, resized_w = target_h, target_w
    elif ratio > target_ratio:
        resized_h, resized_w = target_h, max(int(target_h / ratio), 1)
    else:
        resized_h, resized_w = max(int(target_w * ratio), 1), target_w
    image = Image.fromarray(rgb).resize((resized_w, resized_h), Image.Resampling.BILINEAR)
    delta_w, delta_h = target_w - resized_w, target_h - resized_h
    image = ImageOps.expand(image, ((delta_w + 1) // 2, (delta_h + 1) // 2, delta_w // 2, delta_h // 2), fill=0)
    values = np.asarray(image).astype(np.float32) / 255.0
    values = (values - np.array(config["mean"], dtype=np.float32)) / np.array(config["std"], dtype=np.float32)
    return np.ascontiguousarray(values.transpose(2, 0, 1)[None])


def main():
    plan_path, output = (Path(arg).resolve() for arg in sys.argv[1:])
    for path in (plan_path, output):
        path.relative_to(ROOT / "qa-artifacts")
    assert not output.exists()
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    plan = json.loads(plan_path.read_bytes())
    for name, digest in plan["input_sha256"].items():
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env") and sha(path.read_bytes()) == digest, name

    def denied(*args, **kwargs):
        raise RuntimeError("Network access is disabled in the orientation experiment")

    socket.socket = socket.create_connection = socket.getaddrinfo = denied
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageDraw, ImageFont
    from importlib.metadata import version

    config = plan["model_config"]
    assert config["classes"] == [0, -90, 180, 90] and config["input_shape"] == [3, 512, 512]
    assert plan["maximum_calls"] == 6 + 4 * len(plan["cases"]) <= 512
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    started = time.perf_counter()
    session = ort.InferenceSession(str(ROOT / plan["model_path"]), sess_options=options, providers=["CPUExecutionProvider"])
    initialize_ms = (time.perf_counter() - started) * 1000
    model_input = session.get_inputs()[0]
    assert model_input.shape[1:] == config["input_shape"] and model_input.type == "tensor(float)"
    assert len(session.get_inputs()) == len(session.get_outputs()) == 1
    observations = []

    def predict(rgb, identity, turns, expected, progress):
        assert len(observations) < plan["maximum_calls"]
        transformed = np.ascontiguousarray(np.rot90(rgb, -turns))
        height, width = transformed.shape[:2]
        assert height * width <= 4_000_000
        before = time.perf_counter()
        tensor = preprocess(transformed, config)
        preprocess_ms = (time.perf_counter() - before) * 1000
        before = time.perf_counter()
        logits = session.run(None, {model_input.name: tensor})[0]
        inference_ms = (time.perf_counter() - before) * 1000
        assert logits.shape == (1, 4) and np.isfinite(logits).all()
        exp = np.exp(logits[0] - logits[0].max())
        probabilities = exp / exp.sum()
        assert np.isfinite(probabilities).all() and abs(float(probabilities.sum()) - 1) < .00001
        index = int(np.argmax(logits[0]))
        row = {
            "identity": identity, "clockwise_turns": turns, "expected_degrees": expected,
            "raw_class": config["classes"][index], "predicted_degrees": config["classes"][index] % 360,
            "logits": [float(v) for v in logits[0]], "probabilities": [float(v) for v in probabilities],
            "score": float(probabilities[index]), "shape": [height, width],
            "rgb_sha256": sha(transformed.tobytes()), "tensor_sha256": sha(tensor.tobytes()),
            "preprocess_ms": preprocess_ms, "inference_ms": inference_ms,
        }
        observations.append(row)
        progress.write(json.dumps(row) + "\n")
        progress.flush()

    with output.with_suffix(".observations.jsonl").open("x", encoding="utf-8") as progress:
        synthetic = Image.new("RGB", (700, 1100), "white")
        draw = ImageDraw.Draw(synthetic)
        font = ImageFont.truetype(plan["control_font"], 48)
        for i, line in enumerate(["SYNTHETIC RECEIPT", "LITTLE MARKET", "Currency GBP", "Milk 1 x 2.50", "Tea 1 x 3.00", "TOTAL GBP 5.50", "THANK YOU"]):
            draw.text((35, 100 + 110*i), line, font=font, fill="black")
        for turn in range(4):
            predict(np.asarray(synthetic), "synthetic-upright", turn, 90*turn, progress)
        for name, color in (("synthetic-blank", 255), ("synthetic-dark", 0)):
            predict(np.full((1100, 700, 3), color, dtype=np.uint8), name, 0, None, progress)
        for case in plan["cases"]:
            with Image.open(ROOT / case["path"]) as image:
                assert list(image.size) == [case["width"], case["height"]]
                rgb = np.asarray(image.convert("RGB"))
            for turn in range(4):
                predict(rgb, case["identity"], turn, (case["base_orientation_degrees"] + 90*turn) % 360, progress)
    assert len(observations) == plan["maximum_calls"]
    result = {
        "completed_at": datetime.now(timezone.utc).isoformat(), "plan_sha256": sha(plan_path.read_bytes()),
        "initialize_ms": initialize_ms, "observations": observations, "calls": len(observations),
        "input": {"name": model_input.name, "shape": model_input.shape, "type": model_input.type},
        "providers": session.get_providers(),
        "versions": {n: version(n) for n in ("onnxruntime", "numpy", "Pillow")},
        "receipt_uploads": 0, "model_downloads_during_inference": 0,
        "scope": plan["scope"],
    }
    with output.open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2)
    genuine = [r for r in observations if not r["identity"].startswith("synthetic-")]
    print(json.dumps({"calls": len(observations), "genuine_views": len(genuine), "correct_orientation": sum(r["expected_degrees"] == r["predicted_degrees"] for r in genuine), "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
