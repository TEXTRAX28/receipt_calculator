"""Research-only baseline grouping from actual word edges; no financial rules."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
from statistics import median

from project_azure_words import ROOT, FOLDER
from review_veryfi_screening import exact_json


def oriented_lines(words, polygons, page_angle):
    if len(words) != len(polygons) or not 0 < len(words) <= 10000:
        raise ValueError("One polygon per bounded word required")
    phi = math.radians(float(page_angle))
    if not math.isfinite(phi) or not -math.pi < phi <= math.pi:
        raise ValueError("Invalid clockwise page orientation")
    wrap = lambda value: math.atan2(math.sin(value), math.cos(value))
    tokens = []
    for index,(word,polygon) in enumerate(zip(words,polygons,strict=True)):
        p = [float(v) for v in polygon]
        if len(p) != 8 or not all(math.isfinite(v) for v in p):
            raise ValueError("Valid four-corner source polygon required")
        dx,dy = ((p[2]-p[0])+(p[4]-p[6]))/2,((p[3]-p[1])+(p[5]-p[7]))/2
        along = math.hypot(dx,dy)
        height = (math.hypot(p[6]-p[0],p[7]-p[1])+math.hypot(p[4]-p[2],p[5]-p[3]))/2
        if along <= 0 or height <= 0: raise ValueError("Degenerate word edges")
        tokens.append({"index":index,"cx":sum(p[::2])/4,"cy":sum(p[1::2])/4,
            "height":height,"weight":along,"angle":wrap(math.atan2(dy,dx)-phi),"polygon":p})
    def orientation(row):
        ordered = sorted(row,key=lambda token:token["angle"])
        halfway,carried = sum(token["weight"] for token in ordered)/2,0
        for token in ordered:
            carried += token["weight"]
            if carried >= halfway: return phi+token["angle"]
        raise AssertionError("Empty row")
    normal = lambda token,angle: -math.sin(angle)*token["cx"]+math.cos(angle)*token["cy"]
    tangent = lambda token,angle: math.cos(angle)*token["cx"]+math.sin(angle)*token["cy"]
    def interval(token,angle):
        p=token["polygon"]
        values=[math.cos(angle)*p[i]+math.sin(angle)*p[i+1] for i in range(0,8,2)]
        return min(values),max(values)
    rows = []
    for token in sorted(tokens,key=lambda item:(normal(item,phi),tangent(item,phi))):
        if not words[token["index"]]["text"].strip(): continue
        candidates = []
        for index,row in enumerate(rows):
            if any(abs(wrap(member["angle"]-token["angle"])) > math.radians(15) for member in row): continue
            height = median(member["height"] for member in row)
            if min(height,token["height"])/max(height,token["height"]) < 0.5: continue
            angle = orientation(row+[token])
            lo,hi=interval(token,angle)
            overlaps=False
            for member in row:
                left,right=interval(member,angle)
                if min(hi,right)-max(lo,left) > .25*min(hi-lo,right-left):
                    overlaps=True
                    break
            if overlaps: continue
            residual = abs(normal(token,angle)-median(normal(member,angle) for member in row))
            if residual <= 0.45*min(height,token["height"]): candidates.append((residual,index))
        if candidates: rows[min(candidates)[1]].append(token)
        else: rows.append([token])
    rows.sort(key=lambda row:median(normal(token,phi) for token in row))
    lines,membership = [],[]
    for row in rows:
        angle = orientation(row)
        row.sort(key=lambda token:tangent(token,angle))
        ids = [token["index"] for token in row]
        membership.append(ids)
        items = [words[index] for index in ids]
        lines.append({"text":" ".join(item["text"].strip() for item in items),
            "confidence":min(item["confidence"] for item in items),
            "box":[min(item["box"][0] for item in items),min(item["box"][1] for item in items),
                   max(item["box"][2] for item in items),max(item["box"][3] for item in items)]})
    assert Counter(i for row in membership for i in row) == Counter(i for i,word in enumerate(words) if word["text"].strip()), "Word lost or duplicated"
    return lines,membership


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run",required=True)
    args = parser.parse_args()
    assert re.fullmatch(r"[\w-]+",args.run)
    out = FOLDER/args.run
    assert not out.exists(), "Preserve saved evidence"
    evidence = {}
    def read(path,expected=None):
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or digest == expected,str(path)
        evidence[path.relative_to(ROOT).as_posix()] = digest
        return raw
    old = FOLDER/"word-layout-v1"
    metadata = json.loads(read(old/"metadata.json"))
    for name,expected in metadata["evidence_sha256"].items(): read(ROOT/name,expected)
    rows = [json.loads(line) for line in read(old/"recognition.jsonl",metadata["recognition_sha256"]).decode().splitlines()]
    for row in rows:
        raw = read(FOLDER/"run"/row["case"]/"response.json",row["provider_response_sha256"])
        page = exact_json(raw)["analyzeResult"]["pages"][0]
        panel = row["recognition"]["panels"][0]
        lines,membership = oriented_lines(panel["words"],[word["polygon"] for word in page["words"]],page["angle"])
        panel["lines"] = lines
        row["derived_row_word_indices"] = membership
    out.mkdir()
    (out/"source").mkdir()
    sources = {}
    for path in (Path(__file__),Path(__file__).with_name("project_azure_words.py"),ROOT/"server/local_ocr_models.py",Path(__file__).with_name("review_veryfi_screening.py")):
        raw = read(path)
        target = out/"source"/path.name
        target.write_bytes(raw)
        sources[path.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
        evidence[target.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
    payload = "".join(json.dumps(row,ensure_ascii=False)+"\n" for row in rows).encode()
    (out/"recognition.jsonl").write_bytes(payload)
    (out/"metadata.json").write_text(json.dumps({"scope":"Local word-edge orientation/baseline grouping on six saved exact Azure responses. Original word content, confidence and normalized source boxes unchanged. No financial fields, labels, image transformations or requests.",
        "source_sha256":sources,"recognition_sha256":hashlib.sha256(payload).hexdigest(),"cases":6,
        "application_engine_registered":False,"new_model_requests":0,"external_requests":0,
        "evidence_sha256":evidence},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"cases":6,"derived_row_counts":[len(row["recognition"]["panels"][0]["lines"]) for row in rows],"external_requests":0}))


if __name__ == "__main__": main()
