#!/usr/bin/env python3
"""Read-only, local Linux hardware Q&A assistant."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

TOOL_ARGUMENTS: dict[str, tuple[str, ...]] = {
    "lscpu": (),
    "lsblk": ("-J", "-b", "-o", "NAME,SIZE,TYPE,MOUNTPOINT,MODEL,ROTA,TRAN"),
    "lspci": ("-nn",),
    "dmidecode": ("--type", "memory"),
}
STANDARD_BIN_DIRS = (Path("/usr/bin"), Path("/bin"), Path("/usr/sbin"), Path("/sbin"))
TOOL_TIMEOUT_SECONDS = 5


def parse_proc_meminfo(text: str) -> dict[str, int | None]:
    values: dict[str, int] = {}
    for line in text.splitlines():
        match = re.match(r"^([A-Za-z_()]+):\s+(\d+)\s*(kB)?$", line)
        if match:
            name, number, unit = match.groups()
            values[name] = int(number) * (1024 if unit == "kB" else 1)
    if "MemTotal" not in values:
        raise ValueError("MemTotal is missing from /proc/meminfo.")
    return {
        "total_bytes": values["MemTotal"],
        "available_bytes": values.get("MemAvailable"),
    }


def parse_lscpu(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip()
    return values


def parse_lsblk(text: str) -> list[dict[str, Any]]:
    payload = json.loads(text)
    block_devices = payload.get("blockdevices")
    if not isinstance(block_devices, list):
        raise ValueError("lsblk output does not contain a blockdevices list.")

    devices: list[dict[str, Any]] = []
    for device in block_devices:
        if not isinstance(device, dict) or device.get("type") != "disk":
            continue
        devices.append(
            {
                "name": device.get("name"),
                "size_bytes": device.get("size"),
                "model": device.get("model"),
                "rotational": device.get("rota"),
                "transport": device.get("tran"),
            }
        )
    return devices


def parse_lspci(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if re.search(r"\b(?:VGA compatible|3D|Display) controller\b", line, re.IGNORECASE)
    ]


def parse_dmidecode_memory(text: str) -> dict[str, Any]:
    device_sections = re.split(r"(?m)^\s*Memory Device\s*$", text)[1:]
    installed_modules: list[str] = []
    for section in device_sections:
        size = re.search(r"(?m)^\s*Size:\s*(.+?)\s*$", section)
        if size and size.group(1).strip().lower() not in {"no module installed", "no module installed."}:
            installed_modules.append(size.group(1).strip())
    max_capacity = re.search(r"(?im)^\s*Maximum Capacity:\s*(.+?)\s*$", text)
    return {
        "maximum_capacity": max_capacity.group(1).strip() if max_capacity else None,
        "total_slots": len(device_sections),
        "used_slots": len(installed_modules),
        "free_slots": len(device_sections) - len(installed_modules),
        "installed_modules": installed_modules,
    }


def _find_tool(name: str, search_paths: tuple[Path, ...]) -> Path | None:
    for directory in search_paths:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return None


def run_allowlisted_tool(
    name: str,
    *,
    runner: Callable[..., Any] = subprocess.run,
    search_paths: tuple[Path, ...] = STANDARD_BIN_DIRS,
) -> dict[str, Any]:
    if name not in TOOL_ARGUMENTS:
        raise ValueError(f"Tool is not allow-listed: {name}")

    binary = _find_tool(name, search_paths)
    if binary is None:
        return {"status": "unavailable", "error": f"{name} was not found in standard system directories."}

    command = [str(binary), *TOOL_ARGUMENTS[name]]
    try:
        result = runner(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=TOOL_TIMEOUT_SECONDS,
            shell=False,
            env={**os.environ, "LC_ALL": "C"},
        )
    except subprocess.TimeoutExpired:
        return {"status": "unavailable", "error": f"{name} timed out after {TOOL_TIMEOUT_SECONDS} seconds."}
    except OSError:
        return {"status": "unavailable", "error": f"{name} could not be executed."}

    if result.returncode != 0:
        return {"status": "unavailable", "error": f"{name} exited with status {result.returncode}."}
    return {"status": "ok", "stdout": result.stdout}


def _read_memory(proc_root: Path) -> dict[str, Any]:
    try:
        values = parse_proc_meminfo((proc_root / "meminfo").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"status": "unavailable", "error": "/proc/meminfo was not found."}
    except PermissionError:
        return {"status": "unavailable", "error": "Permission denied reading /proc/meminfo."}
    except OSError:
        return {"status": "unavailable", "error": "Could not read /proc/meminfo."}
    except ValueError as error:
        return {"status": "unavailable", "error": str(error)}
    return {"status": "ok", "data": values}


def _run_and_parse(
    name: str,
    parser: Callable[[str], Any],
    *,
    runner: Callable[..., Any],
    search_paths: tuple[Path, ...],
) -> dict[str, Any]:
    result = run_allowlisted_tool(name, runner=runner, search_paths=search_paths)
    if result["status"] != "ok":
        return result
    try:
        return {"status": "ok", "data": parser(result["stdout"])}
    except ValueError as error:
        return {"status": "unavailable", "error": f"Could not parse {name} output: {error}"}


def collect_snapshot(
    *,
    proc_root: Path = Path("/proc"),
    runner: Callable[..., Any] = subprocess.run,
    search_paths: tuple[Path, ...] = STANDARD_BIN_DIRS,
) -> dict[str, Any]:
    cpu = _run_and_parse("lscpu", parse_lscpu, runner=runner, search_paths=search_paths)
    storage = _run_and_parse("lsblk", parse_lsblk, runner=runner, search_paths=search_paths)
    graphics = _run_and_parse("lspci", parse_lspci, runner=runner, search_paths=search_paths)
    memory_topology = _run_and_parse(
        "dmidecode", parse_dmidecode_memory, runner=runner, search_paths=search_paths
    )
    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "privacy": "Collected locally; no network requests are made.",
        "cpu": cpu,
        "memory": _read_memory(proc_root),
        "storage": storage,
        "graphics": graphics,
        "memory_topology": memory_topology,
    }


def _gib(value: int) -> str:
    return f"{value / (1024 ** 3):.1f} GiB"


def _unavailable(component: dict[str, Any], label: str) -> str:
    return f"I can't determine {label}: {component.get('error', 'system data is unavailable')}"


def answer_question(question: str, snapshot: dict[str, Any]) -> str:
    query = question.casefold()
    if re.search(r"\b(ram|memory|upgrade|slots?)\b", query):
        memory = snapshot["memory"]
        if memory["status"] != "ok":
            return _unavailable(memory, "the installed memory")
        installed = _gib(memory["data"]["total_bytes"])
        topology = snapshot["memory_topology"]
        if topology["status"] == "ok":
            details = topology["data"]
            maximum = details["maximum_capacity"] or "not reported"
            return (
                f"The system reports {installed} of installed RAM. "
                f"{details['used_slots']} of {details['total_slots']} memory slots are in use; "
                f"maximum capacity reported by firmware: {maximum}."
            )
        return (
            f"The system reports {installed} of installed RAM. Slot count and maximum supported "
            f"capacity are unavailable ({topology.get('error', 'firmware data was not reported')}); "
            "I can't confirm whether or how much you can upgrade."
        )

    if re.search(r"\b(ssd|storage|drive|disk|nvme|hdd)\b", query):
        storage = snapshot["storage"]
        if storage["status"] != "ok":
            return _unavailable(storage, "the storage devices")
        devices = storage["data"]
        if not devices:
            return "No physical disk devices were reported by lsblk."
        descriptions = []
        for device in devices:
            name = device.get("name") or "unnamed device"
            transport = str(device.get("transport") or "").lower()
            rotational = device.get("rotational")
            if transport == "nvme" or str(name).lower().startswith("nvme"):
                kind = "NVMe device"
            elif rotational in (0, "0", False):
                kind = "non-rotational disk (typically an SSD)"
            elif rotational in (1, "1", True):
                kind = "rotational disk (typically an HDD)"
            else:
                kind = "drive type unavailable"
            size = device.get("size_bytes")
            size_text = f", {int(size) / (1000 ** 3):.0f} GB" if isinstance(size, (int, float)) else ""
            model = f", {device['model'].strip()}" if device.get("model") else ""
            descriptions.append(f"{name}: {kind}{size_text}{model}")
        return "Storage reported by lsblk: " + "; ".join(descriptions) + "."

    if re.search(r"\b(cpu|processor|core|thread)\b", query):
        cpu = snapshot["cpu"]
        if cpu["status"] != "ok":
            return _unavailable(cpu, "the processor details")
        values = cpu["data"]
        model = values.get("Model name") or values.get("Model")
        if not model:
            return "The processor model wasn't included in the available lscpu output."
        cores = values.get("Core(s) per socket")
        sockets = values.get("Socket(s)")
        core_count = f", {cores} cores per socket across {sockets} socket(s)" if cores and sockets else ""
        return f"The processor is reported as {model}{core_count}."

    if re.search(r"\b(gpu|graphics|video)\b", query):
        graphics = snapshot["graphics"]
        if graphics["status"] != "ok":
            return _unavailable(graphics, "the graphics devices")
        devices = graphics["data"]
        if not devices:
            return "lspci did not report a VGA, 3D, or display controller."
        return "Graphics devices reported by lspci: " + "; ".join(devices) + "."

    return (
        "I can answer questions about RAM, memory slots, storage, the processor, and graphics "
        "using the current local system snapshot. I don't have evidence for that detail."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ask read-only questions about this Linux computer's hardware.")
    parser.add_argument("--snapshot", action="store_true", help="print the collected hardware data as JSON")
    parser.add_argument("--once", metavar="QUESTION", help="answer one question and exit")
    args = parser.parse_args(argv)

    if platform.system() != "Linux":
        parser.exit(2, "This assistant inspects Linux systems only; no hardware commands were run.\n")

    snapshot = collect_snapshot()
    if args.snapshot:
        print(json.dumps(snapshot, indent=2))
        return 0
    if args.once:
        print(answer_question(args.once, snapshot))
        return 0

    print("Local Linux hardware assistant (read-only; type 'quit' to exit).")
    print("Hardware data stays on this computer; no LLM or network service is used.")
    while True:
        try:
            question = input("\nYou: ").strip()
        except EOFError:
            print()
            return 0
        if question.casefold() in {"quit", "exit"}:
            return 0
        if question:
            print(f"Assistant: {answer_question(question, snapshot)}")


if __name__ == "__main__":
    raise SystemExit(main())
