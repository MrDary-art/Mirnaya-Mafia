"""Hardware-policy tests use no GPU, driver changes or network requests."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("hardware_policy_test", ROOT / "install/worker_hardware.py")
hardware = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = hardware
spec.loader.exec_module(hardware)
GPU = hardware.GPU


class HardwareTests(unittest.TestCase):
    def gpu(self, free, name="Test GPU", uuid="GPU-test", cap=(8, 9)):
        return GPU(uuid, name, max(free, 24564), free, cap)

    def test_4090_realtime_and_quality(self):
        gpu = self.gpu(24549, "RTX 4090")
        live = hardware.choose_plan([gpu])
        self.assertEqual((live.model, live.compute_type), ("large-v3-turbo", "float16"))
        quality = hardware.choose_plan([gpu], "quality")
        self.assertEqual((quality.model, quality.compute_type), ("large-v3", "float16"))

    def test_free_memory_not_total_controls_selection(self):
        busy = self.gpu(4096)
        result = hardware.choose_plan([busy])
        self.assertEqual(result.compute_type, "int8_float16")
        with self.assertRaises(RuntimeError):
            hardware.choose_plan([self.gpu(4095)])
        with self.assertRaises(RuntimeError):
            hardware.choose_plan([busy], model="large-v3")

    def test_memory_boundaries_and_quality_fallback(self):
        for free, expected in ((4096,"int8_float16"),(6143,"int8_float16"),(6144,"float16")):
            with self.subTest(free=free):
                self.assertEqual(hardware.choose_plan([self.gpu(free)]).compute_type, expected)
        self.assertEqual(hardware.choose_plan([self.gpu(12287)], "quality").model, "large-v3-turbo")
        self.assertEqual(hardware.choose_plan([self.gpu(12288)], "quality").model, "large-v3")

    def test_gpu_memory_is_not_pooled_and_manual_uuid_is_respected(self):
        a,b=self.gpu(4096,uuid="GPU-a"),self.gpu(16384,uuid="GPU-b")
        self.assertEqual(hardware.choose_plan([a,b]).gpu.uuid,"GPU-b")
        self.assertEqual(hardware.choose_plan([a,b],gpu_uuid="GPU-a").gpu.uuid,"GPU-a")
        with self.assertRaises(RuntimeError):
            hardware.choose_plan([a,a],model="large-v3")
        with self.assertRaises(RuntimeError):
            hardware.choose_plan([a],gpu_uuid="GPU-missing")

    def test_unsupported_architecture_and_invalid_input(self):
        with self.assertRaises(RuntimeError):
            hardware.choose_plan([self.gpu(24549,cap=(6,1))])
        with self.assertRaises(ValueError):
            hardware.choose_plan([self.gpu(24549)],"invented")

    def test_driver_probe_and_bad_output(self):
        result=SimpleNamespace(stdout='GPU-one, NVIDIA GeForce RTX 4090, 24564, 24549, 8.9\n')
        with patch.object(hardware.subprocess,"run",return_value=result) as run:
            devices=hardware.detect_gpus()
            self.assertEqual(devices[0].free_mib,24549)
            self.assertIn('memory.free',run.call_args.args[0][1])
        with patch.object(hardware.subprocess,"run",return_value=SimpleNamespace(stdout='GPU-one, unknown, N/A, N/A, N/A')):
            with self.assertRaises(RuntimeError): hardware.detect_gpus()
        with patch.object(hardware.subprocess,"run",side_effect=FileNotFoundError):
            with self.assertRaises(RuntimeError): hardware.detect_gpus()


if __name__ == '__main__':
    unittest.main()
