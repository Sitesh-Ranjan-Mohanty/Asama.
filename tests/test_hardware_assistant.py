import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import hardware_assistant as assistant


class ParserTests(unittest.TestCase):
    def test_parse_proc_meminfo_converts_kib_to_bytes(self):
        result = assistant.parse_proc_meminfo("MemTotal:       16384000 kB\nMemAvailable:    8192000 kB\n")
        self.assertEqual(result["total_bytes"], 16_777_216_000)
        self.assertEqual(result["available_bytes"], 8_388_608_000)

    def test_parse_proc_meminfo_requires_total(self):
        with self.assertRaisesRegex(ValueError, "MemTotal"):
            assistant.parse_proc_meminfo("MemAvailable: 100 kB\n")

    def test_parse_proc_meminfo_does_not_invent_missing_available_memory(self):
        result = assistant.parse_proc_meminfo("MemTotal: 1024 kB\n")
        self.assertIsNone(result["available_bytes"])

    def test_parse_lscpu_keeps_colons_in_values(self):
        result = assistant.parse_lscpu("Model name: Example CPU: Series A\nCPU(s): 8\n")
        self.assertEqual(result["Model name"], "Example CPU: Series A")
        self.assertEqual(result["CPU(s)"], "8")

    def test_parse_lsblk_returns_physical_disks_only(self):
        result = assistant.parse_lsblk(
            json.dumps(
                {
                    "blockdevices": [
                        {"name": "nvme0n1", "type": "disk", "size": 512000, "rota": 0, "tran": "nvme"},
                        {"name": "nvme0n1p1", "type": "part", "size": 1000},
                    ]
                }
            )
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "nvme0n1")
        self.assertEqual(result[0]["transport"], "nvme")

    def test_parse_dmidecode_counts_empty_and_installed_slots(self):
        result = assistant.parse_dmidecode_memory(
            "Physical Memory Array\n\tMaximum Capacity: 64 GB\n"
            "Memory Device\n\tSize: 16 GB\n"
            "Memory Device\n\tSize: No Module Installed\n"
        )
        self.assertEqual(result["maximum_capacity"], "64 GB")
        self.assertEqual(result["total_slots"], 2)
        self.assertEqual(result["used_slots"], 1)
        self.assertEqual(result["free_slots"], 1)


class SafeExecutionTests(unittest.TestCase):
    def test_unknown_tool_is_rejected_without_execution(self):
        with self.assertRaisesRegex(ValueError, "not allow-listed"):
            assistant.run_allowlisted_tool("python")

    def test_allowlisted_tool_uses_fixed_args_without_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "lsblk"
            binary.touch()
            calls = []

            def fake_runner(command, **kwargs):
                calls.append((command, kwargs))
                return SimpleNamespace(returncode=0, stdout='{"blockdevices": []}', stderr="")

            result = assistant.run_allowlisted_tool(
                "lsblk", runner=fake_runner, search_paths=(Path(directory),)
            )

        self.assertEqual(result["status"], "ok")
        command, options = calls[0]
        self.assertEqual(command[1:], list(assistant.TOOL_ARGUMENTS["lsblk"]))
        self.assertFalse(options["shell"])
        self.assertEqual(options["timeout"], assistant.TOOL_TIMEOUT_SECONDS)

    def test_tool_timeout_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "lscpu").touch()

            def timeout_runner(*args, **kwargs):
                raise subprocess.TimeoutExpired(args[0], kwargs["timeout"])

            result = assistant.run_allowlisted_tool(
                "lscpu", runner=timeout_runner, search_paths=(Path(directory),)
            )
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("timed out", result["error"])


class AnswerTests(unittest.TestCase):
    def test_ram_answer_discloses_unavailable_upgrade_information(self):
        snapshot = {
            "memory": {"status": "ok", "data": {"total_bytes": 16 * 1024**3}},
            "memory_topology": {"status": "unavailable", "error": "dmidecode was not found."},
        }
        answer = assistant.answer_question("Can I upgrade my RAM?", snapshot)
        self.assertIn("16.0 GiB", answer)
        self.assertIn("can't confirm", answer)

    def test_storage_answer_identifies_nvme_from_device_data(self):
        snapshot = {
            "storage": {
                "status": "ok",
                "data": [{"name": "nvme0n1", "transport": "nvme", "rotational": 0, "size_bytes": 512_000_000_000}],
            }
        }
        self.assertIn("NVMe", assistant.answer_question("Is my SSD NVMe?", snapshot))

    def test_unknown_question_does_not_guess(self):
        answer = assistant.answer_question("What is my laptop's maximum display brightness?", {})
        self.assertIn("don't have evidence", answer)


if __name__ == "__main__":
    unittest.main()
