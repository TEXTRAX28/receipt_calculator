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


def reading_lines(words, polygons=None, width=None, height=None):
    """Join adjacent column fragments on the same baseline; preserve repeats.

    This operates on geometry only. It neither knows receipt labels nor repairs
    prices. OCR scores remain evidence for review, not proof of correctness.
    """
    if len(words) > 10000:
        raise ValueError("Too many OCR tokens")
    if polygons is not None:
        return polygon_reading_lines(words, polygons, width, height)
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


def polygon_reading_lines(words, polygons, width, height):
    """Use measured word directions for grouping; preserve original rectangles."""
    if len(words) != len(polygons) or len(words) > 10000:
        raise ValueError("Mismatched or excessive OCR geometry")
    if any(len(points) != 4 for points in polygons):
        return reading_lines(words)
    positions = []
    for source, polygon in zip(words, polygons, strict=True):
        points = [tuple(float(v) for v in p) for p in polygon]
        if any(len(p) != 2 or not all(math.isfinite(v) for v in p) for p in points):
            raise ValueError("Invalid OCR quadrilateral")
        a, b, c, d = points
        dx = ((b[0] - a[0]) + (c[0] - d[0])) / 2
        dy = ((b[1] - a[1]) + (c[1] - d[1])) / 2
        h = ((d[1] - a[1]) + (c[1] - b[1])) / 2
        ordered = a[0] < b[0] and d[0] < c[0] and a[1] < d[1] and b[1] < c[1]
        slope = dy / dx if dx > 0 else 0
        reliable = ordered and h >= 2 and dx >= 2 * h and abs(slope) <= math.tan(math.radians(15)) and source['confidence'] >= .75
        positions.append({'word': source, 'x': sum(p[0] for p in points) / 4,
                          'y': sum(p[1] for p in points) / 4,
                          'height': h if ordered and h > 0 else (source['box'][3] - source['box'][1]) * height,
                          'slope': slope if reliable else None})
    directions = [p['slope'] for p in positions if p['slope'] is not None]
    if len(directions) < 3:
        return reading_lines(words)
    global_slope = median(directions)
    if abs(math.degrees(math.atan(global_slope))) < .5 or math.degrees(math.atan(median(abs(s - global_slope) for s in directions))) > 5:
        return reading_lines(words)
    rows = []
    for token in sorted(positions, key=lambda p: (p['y'] - global_slope * p['x'], p['x'])):
        if not token['word']['text'].strip():
            continue
        candidates = []
        for index, row in enumerate(rows):
            delta = abs(token['y'] - (row['intercept'] + row['slope'] * token['x']))
            if delta <= .45 * min(token['height'], row['height']):
                candidates.append((delta, index))
        if candidates:
            row = rows[min(candidates)[1]]
        else:
            row = {'tokens': []}
            rows.append(row)
        row['tokens'].append(token)
        local = [p['slope'] for p in row['tokens'] if p['slope'] is not None]
        row['slope'] = median(local) if local else global_slope
        row['intercept'] = median(p['y'] - row['slope'] * p['x'] for p in row['tokens'])
        row['height'] = median(p['height'] for p in row['tokens'])
    rows.sort(key=lambda r: r['intercept'] + r['slope'] * width / 2)
    lines = []
    for row in rows:
        tokens = sorted((p['word'] for p in row['tokens']), key=lambda w: w['box'][0])
        lines.append({'text': ' '.join(w['text'].strip() for w in tokens),
                      'confidence': min(w['confidence'] for w in tokens),
                      'box': [min(w['box'][0] for w in tokens), min(w['box'][1] for w in tokens),
                              max(w['box'][2] for w in tokens), max(w['box'][3] for w in tokens)]})
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
        return {"width": width, "height": height, "words": words,
                "lines": reading_lines(words, result["rec_polys"], width, height)}


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
