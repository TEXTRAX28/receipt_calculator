"""Decode literal Paddle spotting lines; locations are model predictions, not confidence."""
import re

RECORD = re.compile(r"([^\n]+?)((?:<\|LOC_\d{1,4}\|>){8})(?:\n|$)")
COORDINATE = re.compile(r"<\|LOC_(\d{1,4})\|>")


def parse_spotting(text):
    if not isinstance(text, str) or not text or len(text) > 60000:
        raise ValueError("Empty or oversized spotting response")
    body = text.replace("\r\n", "\n").strip()
    if body.endswith("</s>"):
        body = body[:-4].rstrip()
    rows, offset = [], 0
    while offset < len(body):
        match = RECORD.match(body, offset)
        if match is None:
            raise ValueError("Incomplete or unlocated text; do not silently salvage a partial reading")
        literal = match[1].strip()
        if not literal or any(token in literal for token in ("<|", "<s>", "</s>", "\x00")):
            raise ValueError("Unexpected control token in literal text")
        numbers = list(map(int, COORDINATE.findall(match[2])))
        if len(numbers) != 8 or any(number > 1000 for number in numbers):
            raise ValueError("Spotting coordinates exceed the documented 0–1000 frame")
        polygon = list(zip(numbers[::2], numbers[1::2]))
        turns = []
        for i in range(4):
            a, b, c = polygon[i], polygon[(i + 1) % 4], polygon[(i + 2) % 4]
            if a == b:
                raise ValueError("Degenerate spotting polygon")
            turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
        if not (all(turn > 0 for turn in turns) or all(turn < 0 for turn in turns)):
            raise ValueError("Crossed, concave or degenerate spotting polygon")
        xs, ys = numbers[::2], numbers[1::2]
        rows.append({"text": literal, "polygon_1000": [list(point) for point in polygon],
                     "box": [min(xs) / 1000, min(ys) / 1000, max(xs) / 1000, max(ys) / 1000],
                     "confidence": None})
        if len(rows) > 1000:
            raise ValueError("Too many spotting rows")
        offset = match.end()
    if not rows:
        raise ValueError("No located text")
    return rows
