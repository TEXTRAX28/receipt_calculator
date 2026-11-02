"""Research geometry assembly, using the existing local OCR baseline rule.

Copied from server/local_ocr_models.py:reading_lines (graph L27), excluding
confidence aggregation: spotting supplies no confidence. No receipt labels,
amount repair, duplicate removal or reference-based ordering enters here.
"""
from statistics import median


def join_spotted_columns(regions):
    rows = []
    indexed = list(enumerate(regions))
    for position, token in sorted(indexed, key=lambda pair: ((pair[1]["box"][1] + pair[1]["box"][3]) / 2, pair[1]["box"][0])):
        if not token["text"].strip():
            continue
        x0, y0, x1, y1 = token["box"]
        cy, height = (y0 + y1) / 2, y1 - y0
        candidates = []
        for index, row in enumerate(rows):
            center = median((value["box"][1] + value["box"][3]) / 2 for _, value in row)
            row_height = median(value["box"][3] - value["box"][1] for _, value in row)
            if abs(cy - center) <= .45 * min(height, row_height):
                candidates.append((abs(cy - center), index))
        if candidates:
            rows[min(candidates)[1]].append((position, token))
        else:
            rows.append([(position, token)])
    return [{"text": " ".join(token["text"].strip() for _, token in sorted(row, key=lambda pair: pair[1]["box"][0])),
             "source_region_indices": [position for position, _ in sorted(row, key=lambda pair: pair[1]["box"][0])],
             "confidence": None} for row in rows]
