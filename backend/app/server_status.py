"""Read-only OS telemetry; no model loading, provider calls or new dependencies."""
import ctypes
import os
import shutil
import time
from pathlib import Path


def _cpu_times():
    if os.name == "nt":
        from ctypes import wintypes
        idle, kernel, user = wintypes.FILETIME(), wintypes.FILETIME(), wintypes.FILETIME()
        if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            raise OSError("GetSystemTimes failed")
        ticks = lambda value: (value.dwHighDateTime << 32) | value.dwLowDateTime
        total = ticks(kernel) + ticks(user)
        return total - ticks(idle), total
    values = [int(value) for value in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    total = sum(values)
    return total - values[3] - values[4], total


def cpu_percent(before, after):
    elapsed = after[1] - before[1]
    return round(max(0, min(100, (after[0] - before[0]) * 100 / elapsed)), 1) if elapsed > 0 else None


def _memory():
    if os.name == "nt":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_uint32), ("load", ctypes.c_uint32)] + [
                (name, ctypes.c_uint64) for name in ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise OSError("GlobalMemoryStatusEx failed")
        return status.total, status.available
    values = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        values[key] = int(value.strip().split()[0]) * 1024
    # MemAvailable includes reclaimable cache; MemFree alone exaggerates usage.
    return values["MemTotal"], values["MemAvailable"]


def resource_snapshot(disk_path):
    result = {"cpu_percent": None, "memory": None, "disk": None, "unavailable": []}
    try:
        before = _cpu_times()
        time.sleep(.25)
        result["cpu_percent"] = cpu_percent(before, _cpu_times())
    except (OSError, ValueError, IndexError, AttributeError):
        result["unavailable"].append("cpu")
    try:
        total, available = _memory()
        result["memory"] = {"total_bytes": total, "used_bytes": total - available,
                            "percent": round((total - available) * 100 / total, 1)}
    except (OSError, ValueError, KeyError, ZeroDivisionError, AttributeError):
        result["unavailable"].append("memory")
    try:
        usage = shutil.disk_usage(disk_path)
        result["disk"] = {"total_bytes": usage.total, "used_bytes": usage.used,
                          "percent": round(usage.used * 100 / usage.total, 1)}
    except (OSError, ZeroDivisionError):
        result["unavailable"].append("disk")
    return result
