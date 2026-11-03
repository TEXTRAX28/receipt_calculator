"""Offline delivery-aware scoring of the frozen tiny/medium trial, including failure."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

from qwen8b_resources import available_memory
from vision_trial_guard import stop_owned_process, RUNTIME_RAM_FLOOR

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "qa-artifacts/browser-paddle-medium-paired-plan-v14"
TAG = "browser-paddle-delivery-v1"
CONTROL = ROOT / "qa-artifacts" / (TAG + "-control")


def main():
    CONTROL.mkdir()
    original = json.loads((PLAN / "study-plan.json").read_text(encoding="utf-8"))
    hashes = {}

    def read(path, expected=None):
        path = path.resolve()
        name = path.relative_to(ROOT).as_posix()
        assert not path.name.startswith(".env")
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or digest == expected, name
        hashes[name] = digest
        return raw

    def write(path, data):
        with path.open("x", encoding="utf-8", newline="\n") as file:
            file.write(json.dumps(data, indent=2) + "\n")

    read(PLAN / "study-plan.json")
    for name, digest in original["source_sha256"].items():
        read(PLAN / "source" / name, digest)
    for name in ("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl",
                 "receipt_training/annotations/private/supplement-financial-v2-labels.jsonl",
                 "receipt_training/evaluation/config.json"):
        read(ROOT / name, original["input_sha256"][name])
    for name in ("score.py", "score_adjustments.py", "score_browser_paddle_medium_study.py", "adapt_browser_paddle.py"):
        key = "receipt_training/scripts/" + name
        read(ROOT / key, original["source_sha256"][key])
    read(Path(__file__))
    raw_panels = {}
    for size in ("tiny", "medium"):
        for case in original["cases"]:
            for frame in case["frames"]:
                path = ROOT / "qa-artifacts" / f"browser-paddle-paired-{size}-v14" / f"{case['receipt_id']}-photo-{frame['photo']}-part-{frame['part']}.json"
                key = (size, case["receipt_id"], frame["photo"], frame["part"])
                raw_panels[key] = read(path) if path.exists() else None
    missing = [list(k) for k, v in raw_panels.items() if v is None]
    assert missing == [["medium", "supplement-user-uk-20261026-group", 2, 1]]
    runner_source = (PLAN / "source/receipt_training/scripts/replay_browser_paddle_medium_study.mjs").read_text(encoding="utf-8")
    before = "    assert.equal(adapted.actual_ocr_sections, 8);"
    assert runner_source.count(before) == 1
    runner_source = runner_source.replace(before, '    assert.equal(adapted.actual_ocr_sections, size === "tiny" ? 8 : 7);')
    before = '      assert.equal(c.recognition.engine, `paddle-ppocrv6-${size}-browser-wasm`);'
    assert runner_source.count(before) == 1
    runner_source = runner_source.replace(before, """      if (c.delivery_error) {
        assert.equal(size, "medium");
        assert.equal(entry.receipt_id, "supplement-user-uk-20261026-group");
        await write(`${size}/${c.receipt_id}.json`, {
          ...entry, reader: `paddle-ppocrv6-${size}-browser-wasm`,
          output: { text: "" }, delivery_error: c.delivery_error,
          predictions: ["automatic", "known-currency"].map((mode) => ({
            mode, supplied_currency: null, error: c.delivery_error,
            receipt: {}, calculation: {},
          })), reading_ms: null, financial_edits: 0, checks_confirmed: 0,
        });
        cases.push({ size, receipt_id: c.receipt_id, group: entry.group,
          predictions: 2, delivery_error: c.delivery_error });
        continue;
      }
""" + before)
    runner = CONTROL / "replay.mjs"
    runner.write_text(runner_source, encoding="utf-8", newline="\n")
    read(runner)
    write(CONTROL / "protocol.json", {
        "recorded_at": datetime.now(timezone.utc).isoformat(), "parent_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "input_sha256": dict(hashes), "missing_panels": missing,
        "scope": "Post-inference offline analysis of all four originally planned familiar transactions, not a new held-out study or new model run. Same frozen parser, matcher, labels and financial scorer; automatic/context modes stay separate. Three selected crops retain the original selected-field diagnostic.",
        "failure_policy": "An incomplete transaction contributes all known reference denominators and zero delivered-field successes, with an explicit delivery error. No partial UK draft is parsed or credited. Existing scorer counts for complete transactions are unchanged; any absence-only correct count for the failed transaction is zeroed in the separate delivery aggregate. Original scores remain retained.",
        "source_limits": "Medium's final request ledger is missing; this analysis does not create or infer it. No original pixels/labels/model outputs are edited. Raw partial UK photo 1 remains retained but is not substituted for the missing two-photo delivery.",
        "new_model_calls": 0, "private_uploads": 0, "financial_edits": 0,
        "offline_replay_start_floor_bytes": 1610612736, "offline_replay_runtime_floor_bytes": RUNTIME_RAM_FLOOR,
        "resource_scope": "Small JSON/parser replay only, no browser, image decode, model load or inference. Model/browser startup guards are unchanged.",
    })
    spec = importlib.util.spec_from_file_location("frozen_geometry", PLAN / "source/server/local_ocr_models.py")
    geometry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(geometry)
    adapted_tags = []
    for size in ("tiny", "medium"):
        output = ROOT / "qa-artifacts" / f"{TAG}-{size}-adapted"
        output.mkdir()
        adapted_tags.append(output.name)
        cases, delivered = [], 0
        for case in original["cases"]:
            panels, elapsed, unavailable = [], 0, False
            for frame in case["frames"]:
                raw = raw_panels[(size, case["receipt_id"], frame["photo"], frame["part"])]
                if raw is None:
                    unavailable = True
                    continue
                saved = json.loads(raw)
                assert not saved.get("error") and saved["frame"] == frame and len(saved["reading"]) == 1
                observed = saved["reading"][0]
                width, height = frame["width"], frame["height"]
                assert observed["image"] == {"width": width, "height": height}
                fragments = []
                for item in observed["items"]:
                    polygon = item["poly"]
                    assert len(polygon) == 4 and all(len(p) == 2 for p in polygon)
                    assert all(type(n) in (int, float) and math.isfinite(n) for p in polygon for n in p)
                    xs, ys = [p[0] for p in polygon], [p[1] for p in polygon]
                    box = [max(0, min(xs) / width), max(0, min(ys) / height), min(1, max(xs) / width), min(1, max(ys) / height)]
                    fragments.append(geometry.word(item["text"], item["score"], box))
                panels.append({"photo": frame["photo"], "part": frame["part"], "width": width, "height": height,
                               "words": fragments, "lines": geometry.reading_lines(fragments)})
                elapsed += saved["elapsed_ms"]
                delivered += 1
            row = {"receipt_id": case["receipt_id"], "image_sha256": case["image_sha256"], "frames": case["frames"],
                   "reading_ms": elapsed if not unavailable else None,
                   "recognition": {"engine": f"paddle-ppocrv6-{size}-browser-wasm", "panels": panels} if not unavailable else None}
            if unavailable:
                row["delivery_error"] = "incomplete-two-photo-delivery-after-whole-run-deadline"
            cases.append(row)
        write(output / "adapted.json", {"cases": cases, "actual_ocr_sections": delivered,
                                       "input_sha256": hashes, "scope": "Geometry only; incomplete transactions are explicit failures, not fabricated empty OCR successes."})
    env = {k: v for k, v in os.environ.items() if k.lower() in {"systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile", "appdata", "localappdata", "programdata", "programfiles", "programfiles(x86)"}}
    parity_tag = TAG + "-original-tiny-adapter"
    parity = subprocess.run([sys.executable, "-X", "utf8", "receipt_training/scripts/adapt_browser_paddle.py", "browser-paddle-paired-tiny-v14", parity_tag], cwd=ROOT, env=env, capture_output=True, text=True)
    assert parity.returncode == 0, parity.stderr
    actual = json.loads((ROOT / "qa-artifacts" / parity_tag / "adapted.json").read_text())
    current = json.loads((ROOT / "qa-artifacts" / adapted_tags[0] / "adapted.json").read_text())
    assert [c["recognition"] for c in actual["cases"]] == [c["recognition"] for c in current["cases"]]
    write(CONTROL / "adapter-parity.json", {"identical_complete_cases": 7, "identical_panels": 8, "new_model_calls": 0})
    initial = available_memory()[1]
    controller = {"initial_available_ram": initial, "spawned": False, "new_model_calls": 0, "private_uploads": 0}
    if initial < 1610612736:
        controller["error"] = "insufficient-offline-replay-memory"
    else:
        node = shutil.which("node.exe")
        assert node
        with (CONTROL / "stdout.log").open("xb") as stdout, (CONTROL / "stderr.log").open("xb") as stderr:
            process = subprocess.Popen([node, str(runner), TAG, *adapted_tags, PLAN.name], cwd=ROOT, env=env,
                                       stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=subprocess.CREATE_NO_WINDOW)
            start = time.monotonic()
            controller.update(spawned=True, pid=process.pid, minimum_available_ram=initial)
            try:
                while process.poll() is None:
                    try:
                        available = available_memory()[1]
                    except OSError:
                        controller["error"] = "memory-observation-unavailable"
                        break
                    controller["minimum_available_ram"] = min(controller["minimum_available_ram"], available)
                    if available < RUNTIME_RAM_FLOOR or time.monotonic() - start > 60:
                        controller["error"] = "offline-replay-resource-bound"
                        break
                    time.sleep(.25)
            finally:
                stop_owned_process(process)
            controller.update(exit_code=process.returncode, elapsed_ms=round((time.monotonic() - start) * 1000))
    write(CONTROL / "controller.json", controller)
    assert controller.get("exit_code") == 0 and not controller.get("error"), controller
    scored = subprocess.run([sys.executable, "-X", "utf8", "receipt_training/scripts/score_browser_paddle_medium_study.py", TAG], cwd=ROOT, env=env, capture_output=True, text=True)
    write(CONTROL / "scorer-command.json", {"exit_code": scored.returncode, "stdout": scored.stdout, "stderr": scored.stderr})
    assert scored.returncode == 0, scored.stderr
    scores_path = ROOT / "qa-artifacts" / TAG / "scores.json"
    scored_value = json.loads(read(scores_path))
    counts, rows = defaultdict(Counter), []
    for row in scored_value["scores"]:
        failure = row["size"] == "medium" and row["receipt_id"] == "supplement-user-uk-20261026-group"
        metrics = {key: (0 if failure and key.endswith("_correct") else value) for key, value in row["counts"].items()}
        metrics.update(planned_transactions=1, delivered_transactions=int(not failure), delivery_failures=int(failure))
        for group in (row["group"], "all-four"):
            counts[f"{group}/{row['size']}/{row['mode']}"].update(metrics)
        rows.append({"size": row["size"], "mode": row["mode"], "receipt_id": row["receipt_id"], "delivery_failure": failure, "counts": metrics})
    result = {"counts": {key: dict(value) for key, value in counts.items()}, "rows": rows,
              "selected_areas": scored_value["selected_areas"], "new_model_calls": 0, "private_uploads": 0,
              "raw_score_sha256": hashlib.sha256(scores_path.read_bytes()).hexdigest(),
              "scope": "Delivery-weighted field counts across all four fixed transactions; failure retains reference denominators and receives no correct-field credit. Separate CORD-only diagnostics are conditional on delivery, not a complete-run win. No latency remeasurement or app-level financial acceptance."}
    write(ROOT / "qa-artifacts" / TAG / "delivery-scores.json", result)
    print(json.dumps({"status": "scored-all-four-including-medium-delivery-failure", "scored_views": len(rows), "new_model_calls": 0}))


if __name__ == "__main__":
    main()
