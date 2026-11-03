"""Bounded, offline classification of frozen whole-photo quarter turns.

Matches the pinned official model's RGB/short-edge/centre-crop preprocessing.
This reports orientation evidence, never receipt extraction or financial truth.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import socket
import sys
import time

ROOT = Path(__file__).resolve().parents[2]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    plan_path, output = (Path(arg).resolve() for arg in sys.argv[1:])
    for path in (plan_path, output):
        path.relative_to(ROOT / "qa-artifacts")
    assert not output.exists()
    plan = json.loads(plan_path.read_bytes())
    for name, expected in plan["input_sha256"].items():
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env") and sha(path.read_bytes()) == expected, name

    def denied(*args, **kwargs):
        raise RuntimeError("Network access is disabled in the orientation experiment")

    socket.socket = denied
    socket.create_connection = denied
    socket.getaddrinfo = denied
    import cv2
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageDraw, ImageFont
    from importlib.metadata import version

    cv2.setNumThreads(1)
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    started = time.perf_counter()
    session = ort.InferenceSession(str(ROOT / plan["model_path"]), sess_options=options, providers=["CPUExecutionProvider"])
    initialize_ms = (time.perf_counter() - started) * 1000
    model_input = session.get_inputs()[0]
    assert model_input.shape[1:] == [3, 224, 224] and model_input.type == "tensor(float)"
    observations = []

    def predict(rgb, identity, clockwise_turns, expected):
        assert len(observations) < plan["maximum_calls"]
        transformed = np.ascontiguousarray(np.rot90(rgb, -clockwise_turns))
        h, w = transformed.shape[:2]
        assert h * w <= 4_000_000
        before = time.perf_counter()
        scale = 256 / min(h, w)
        resized = cv2.resize(transformed, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_LINEAR)
        y, x = (resized.shape[0] - 224) // 2, (resized.shape[1] - 224) // 2
        crop = resized[y:y+224, x:x+224].astype(np.float32)
        for c, (mean, std) in enumerate(zip([.485, .456, .406], [.229, .224, .225], strict=True)):
            crop[:, :, c] *= (1 / 255) / std
            crop[:, :, c] += -mean / std
        tensor = np.ascontiguousarray(crop.transpose(2, 0, 1)[None])
        preprocess_ms = (time.perf_counter() - before) * 1000
        before = time.perf_counter()
        values = session.run(None, {model_input.name: tensor})[0]
        inference_ms = (time.perf_counter() - before) * 1000
        assert values.shape == (1, 4) and np.isfinite(values).all()
        probabilities = [float(v) for v in values[0]]
        assert all(0 <= v <= 1 for v in probabilities) and abs(sum(probabilities)-1) < 0.0001
        index = int(np.argmax(values[0]))
        observations.append({"identity":identity, "clockwise_turns":clockwise_turns,
            "expected_degrees":expected, "predicted_degrees":plan["labels"][index],
            "probabilities":probabilities, "score":probabilities[index],
            "shape":[h,w], "rgb_sha256":sha(transformed.tobytes()), "tensor_sha256":sha(tensor.tobytes()),
            "preprocess_ms":preprocess_ms, "inference_ms":inference_ms})

    synthetic = Image.new("RGB", (700, 1100), "white")
    draw = ImageDraw.Draw(synthetic)
    font = ImageFont.truetype(plan["control_font"], 48)
    for i, line in enumerate(["SYNTHETIC RECEIPT", "LITTLE MARKET", "Currency GBP", "Milk 1 x 2.50", "Tea 1 x 3.00", "TOTAL GBP 5.50", "THANK YOU"]):
        draw.text((35, 100 + 110*i), line, font=font, fill="black")
    for turn in range(4):
        predict(np.asarray(synthetic), "synthetic-upright", turn, 90*turn)
    for name, color in (("synthetic-blank", 255), ("synthetic-dark", 0)):
        predict(np.full((1100,700,3), color, dtype=np.uint8), name, 0, None)
    for case in plan["cases"]:
        with Image.open(ROOT / case["path"]) as image:
            assert list(image.size) == [case["width"], case["height"]]
            rgb = np.asarray(image.convert("RGB"))
        for turn in range(4):
            predict(rgb, case["identity"], turn, 90*turn)
    assert len(observations) == plan["maximum_calls"] == 26
    result = {"completed_at":datetime.now(timezone.utc).isoformat(), "plan_sha256":sha(plan_path.read_bytes()),
              "initialize_ms":initialize_ms, "observations":observations, "calls":len(observations),
              "versions":{n:version(n) for n in ("onnxruntime", "numpy", "Pillow")},
              "receipt_uploads":0, "model_downloads_during_inference":0,
              "scope":"Five visually upright familiar photos of four transactions; exact quarter turns. No receipt extraction, original-fifty accuracy or physical-phone claim. Confidence is not calibrated correctness."}
    with output.open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2)
    genuine = [r for r in observations if not r["identity"].startswith("synthetic-")]
    print(json.dumps({"calls":len(observations), "genuine_views":len(genuine),
                      "correct_orientation":sum(r["expected_degrees"] == r["predicted_degrees"] for r in genuine),
                      "receipt_uploads":0}))


if __name__ == "__main__":
    main()
