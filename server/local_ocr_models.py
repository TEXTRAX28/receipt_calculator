"""Local model adapters. No receipt parsing, financial decisions or HTTP uploads.

Heavy libraries are imported only when their adapter is explicitly selected.
Boxes are normalized coordinates in the exact image given to the model.
"""
from __future__ import annotations

import math
from pathlib import Path
from statistics import median


def word(text, confidence, box):
    coordinates = [float(v) for v in box]
    score = float(confidence)
    if (len(coordinates) != 4 or not all(math.isfinite(v) for v in coordinates)
            or not math.isfinite(score) or not 0 <= score <= 1):
        raise ValueError("Invalid OCR geometry or confidence")
    x0, y0, x1, y1 = coordinates
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        raise ValueError("OCR box is outside the image")
    if not isinstance(text, str) or len(text) > 2000:
        raise ValueError("Invalid OCR text token")
    return {"text": text, "confidence": score, "box": coordinates}


def reading_lines(words):
    """Join adjacent column fragments on the same baseline; preserve repeats.

    This operates on geometry only. It neither knows receipt labels nor repairs
    prices. OCR scores remain evidence for review, not proof of correctness.
    """
    if len(words) > 10000:
        raise ValueError("Too many OCR tokens")
    rows = []
    for token in sorted(words, key=lambda w: ((w["box"][1] + w["box"][3]) / 2, w["box"][0])):
        if not token["text"].strip():
            continue
        x0, y0, x1, y1 = token["box"]
        cy, height = (y0 + y1) / 2, y1 - y0
        candidates = []
        for index, row in enumerate(rows):
            center = median((w["box"][1] + w["box"][3]) / 2 for w in row)
            row_height = median(w["box"][3] - w["box"][1] for w in row)
            if abs(cy - center) <= 0.45 * min(height, row_height):
                # Overlapping detections must not silently overwrite each other.
                candidates.append((abs(cy - center), index))
        if candidates:
            rows[min(candidates)[1]].append(token)
        else:
            rows.append([token])
    lines = []
    for row in rows:
        row.sort(key=lambda w: w["box"][0])
        lines.append({"text": " ".join(w["text"].strip() for w in row),
                      "box": [min(w["box"][0] for w in row), min(w["box"][1] for w in row),
                              max(w["box"][2] for w in row), max(w["box"][3] for w in row)],
                      "confidence": min(w["confidence"] for w in row)})
    return lines


class PaddleAdapter:
    name = "paddle-ppocrv6-medium-onnx"

    def __init__(self, threads=4):
        from paddleocr import PaddleOCR
        self.model = PaddleOCR(ocr_version="PP-OCRv6", lang="en", device="cpu",
                               engine="onnxruntime", cpu_threads=threads,
                               use_doc_orientation_classify=False,
                               use_doc_unwarping=False, use_textline_orientation=False)

    def recognize(self, path: Path):
        from PIL import Image
        with Image.open(path) as image:
            width, height = image.size
        result = list(self.model.predict(str(path)))[0]
        words = []
        for text, score, polygon in zip(result["rec_texts"], result["rec_scores"], result["rec_polys"], strict=True):
            xs, ys = [float(p[0]) for p in polygon], [float(p[1]) for p in polygon]
            box = [max(0, min(xs) / width), max(0, min(ys) / height),
                   min(1, max(xs) / width), min(1, max(ys) / height)]
            words.append(word(text, score, box))
        return {"width": width, "height": height, "words": words, "lines": reading_lines(words)}


class DoctrAdapter:
    name = "doctr-db-resnet50-parseq-cpu"

    def __init__(self, threads=4):
        import torch
        from doctr.models import ocr_predictor
        torch.set_num_threads(threads)
        self.model = ocr_predictor(det_arch="db_resnet50", reco_arch="parseq", pretrained=True,
                                   assume_straight_pages=True, det_bs=1, reco_bs=32).eval()

    def recognize(self, path: Path):
        import torch
        from doctr.io import DocumentFile
        with torch.inference_mode():
            page = self.model(DocumentFile.from_images(str(path))).export()["pages"][0]
        height, width = page["dimensions"]
        words = []
        for block in page["blocks"]:
            for line in block["lines"]:
                for token in line["words"]:
                    (x0, y0), (x1, y1) = token["geometry"]
                    words.append(word(token["value"], token["confidence"], [x0, y0, x1, y1]))
        return {"width": width, "height": height, "words": words, "lines": reading_lines(words)}


def create_adapter(name, threads=4):
    adapters = {"paddle-v6": PaddleAdapter, "doctr": DoctrAdapter}
    if name not in adapters:
        raise ValueError("Unknown local OCR engine")
    return adapters[name](threads=threads)
