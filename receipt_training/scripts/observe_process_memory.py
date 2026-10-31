"""Sample a benchmark-owned Windows process tree; never reads receipts or keys."""
import argparse
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[2]
MAX_PROCESSES = 128
WAIT_TIMEOUT = 258


class Memory(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
        (name, ctypes.c_size_t) for name in [
            "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage",
            "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage",
        ]
    ]


class ProcessEntry(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
        ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260),
    ]


def process_parents(kernel):
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)  # TH32CS_SNAPPROCESS
    if snapshot == ctypes.c_void_p(-1).value:
        raise OSError("Process tree could not be inspected")
    try:
        entry = ProcessEntry(); entry.dwSize = ctypes.sizeof(ProcessEntry)
        result = {}
        more = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
        while more:
            result[entry.th32ProcessID] = entry.th32ParentProcessID
            more = kernel.Process32NextW(snapshot, ctypes.byref(entry))
        return result
    finally:
        kernel.CloseHandle(snapshot)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.pid <= 0:
        raise ValueError("A benchmark-owned PID is required")
    output = Path(args.output).resolve()
    output.relative_to((ROOT / "receipt_training/evaluation/runs").resolve())
    if output.exists():
        raise ValueError("Preserve the existing observation and choose a new output")
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    for name in ["Process32FirstW", "Process32NextW"]:
        function = getattr(kernel, name)
        function.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
        function.restype = wintypes.BOOL
    read = ctypes.WinDLL("psapi").GetProcessMemoryInfo
    read.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
    read.restype = wintypes.BOOL
    # Query/VM-read/synchronize only, with no terminate or write permissions.
    def open_process(pid):
        return kernel.OpenProcess(0x1000 | 0x0010 | 0x00100000, False, pid)

    handle = open_process(args.pid)
    handles = {args.pid: handle} if handle else {}
    processes = {args.pid: {"pid": args.pid, "parent_pid": None, "os_peak_working_set_bytes": None}} if handle else {}
    errors = set()
    result = {"pid": args.pid, "samples": 0, "peak_sampled_process_tree_working_set_bytes": None,
              "scope": "Peak sampled sum of the owned worker and observed descendants, including Windows venv launcher children. 250ms sampling can miss short-lived children. Excludes browser, Node parent and GPU memory; per-process OS peaks are reported separately."}
    started = time.monotonic()
    if not handle:
        errors.add("process unavailable to memory observer")
    else:
        try:
            while True:
                alive = {pid for pid, owned in handles.items() if kernel.WaitForSingleObject(owned, 0) == WAIT_TIMEOUT}
                if not alive:
                    break
                try:
                    parents = process_parents(kernel)
                    # Only live owned processes can establish descendant ownership.
                    while True:
                        children = {pid: parent for pid, parent in parents.items() if parent in alive and pid not in handles}
                        if not children:
                            break
                        added = False
                        for pid, parent in children.items():
                            if len(handles) >= MAX_PROCESSES:
                                errors.add("process observation limit reached")
                                break
                            owned = open_process(pid)
                            if not owned:
                                errors.add("an observed child process could not be sampled")
                                continue
                            handles[pid] = owned
                            processes[pid] = {"pid": pid, "parent_pid": parent, "os_peak_working_set_bytes": None}
                            alive.add(pid)
                            added = True
                        if not added:
                            break
                except OSError:
                    errors.add("process tree could not be inspected")
                total, sampled = 0, False
                for pid in alive:
                    usage = Memory(); usage.cb = ctypes.sizeof(Memory)
                    if read(handles[pid], ctypes.byref(usage), ctypes.sizeof(usage)):
                        sampled = True
                        total += usage.WorkingSetSize
                        processes[pid]["os_peak_working_set_bytes"] = max(processes[pid]["os_peak_working_set_bytes"] or 0, usage.PeakWorkingSetSize)
                    elif kernel.WaitForSingleObject(handles[pid], 0) == WAIT_TIMEOUT:
                        errors.add("a live owned process could not be sampled")
                if sampled:
                    result["samples"] += 1
                    result["peak_sampled_process_tree_working_set_bytes"] = max(result["peak_sampled_process_tree_working_set_bytes"] or 0, total)
                if time.monotonic() - started > 900:
                    errors.add("observer deadline reached")
                    break
                time.sleep(.25)
        finally:
            for owned in handles.values():
                kernel.CloseHandle(owned)
    result["processes"] = list(processes.values())
    result["observed_process_count"] = len(processes)
    result["errors"] = sorted(errors)
    result["observed_ms"] = round((time.monotonic() - started) * 1000)
    with output.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
