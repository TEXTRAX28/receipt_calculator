"""Actual Windows handles, with one injected stale Toolhelp parent-PID link."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time

import observe_process_memory as observer
from vision_trial_guard import stop_owned_process

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    out = ROOT / "receipt_training/evaluation/runs" / tag
    out.mkdir()
    sources = {}
    for name in ("observe_process_memory.py", "test_process_memory_ownership.py"):
        raw = (ROOT / "receipt_training/scripts" / name).read_bytes()
        (out / name).write_bytes(raw)
        sources["receipt_training/scripts/" + name] = hashlib.sha256(raw).hexdigest()
    kwargs = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
              "stderr": subprocess.DEVNULL, "creationflags": subprocess.CREATE_NO_WINDOW}
    older = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(20)"], **kwargs)
    time.sleep(.1)
    command = "import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(1.8)'],creationflags=subprocess.CREATE_NO_WINDOW); p.wait(); time.sleep(.5)"
    owned = subprocess.Popen([sys.executable, "-c", command], **kwargs)
    original = observer.process_parents
    old_args = sys.argv
    try:
        def stale_link(kernel):
            parents = original(kernel)
            # This older process is also ours, but it is not this root's child.
            # Simulate the stale parent ID that Windows can retain after reuse.
            if older.poll() is None:
                parents[older.pid] = owned.pid
            return parents
        observer.process_parents = stale_link
        sys.argv = [str(Path(observer.__file__)), "--pid", str(owned.pid), "--output", str(out / "owned-memory.json")]
        started = time.monotonic()
        observer.main()
        data = json.loads((out / "owned-memory.json").read_text(encoding="utf-8"))
        assert not data["errors"], data["errors"]
        assert data["samples"] >= 3 and data["observed_process_count"] >= 2
        assert older.pid not in {p["pid"] for p in data["processes"]}
        assert any(p["pid"] == older.pid for p in data["excluded_stale_parent_links"])
        assert older.poll() is None and owned.poll() == 0
        assert time.monotonic() - started < 10
        result = {"controlled_stale_link_excluded": True, "actual_owned_child_sampled": True,
                  "unrelated_test_process_still_running_after_observation": True,
                  "observer_finished_after_owned_tree_exit": True,
                  "scope": "Real Windows process handles and creation times. Only the older test process's reported parent link is injected. No user processes are touched; the observer never terminates any process.",
                  "source_sha256": sources, "observation": data, "network_requests": 0}
        with (out / "result.json").open("x", encoding="utf-8") as file:
            file.write(json.dumps(result, indent=2) + "\n")
        print(json.dumps({k:v for k,v in result.items() if k not in {"observation", "source_sha256"}}))
    finally:
        sys.argv = old_args
        observer.process_parents = original
        stop_owned_process(owned)
        stop_owned_process(older)


if __name__ == "__main__":
    main()
