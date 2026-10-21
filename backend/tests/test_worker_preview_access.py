"""Preview-gated enrollment must retain scoped worker authentication."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))
import preview_access
spec = importlib.util.spec_from_file_location("preview_worker_test", ROOT / "worker/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
import httpx


class PreviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_enroll_and_subsequent_requests_keep_cookie_and_bearer(self):
        password = "AbЯё7!@#" * 12 + "xЮ9$"
        digest = hashlib.sha256(password.encode()).hexdigest()
        seen = []
        def serve(request):
            seen.append(request)
            if request.headers.get("Cookie") != "__Host-arena_preview=" + digest:
                return httpx.Response(403, headers={"Content-Type": "text/html"}, text="<html>__Host-arena_preview</html>")
            return httpx.Response(200, json={"token": "scoped-worker-token"})
        real_client = httpx.AsyncClient
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            args = SimpleNamespace(allow_local=False, models=root/'models', gpu='GPU-test', config=root/'private/worker.json')
            with patch('builtins.input', return_value='https://example.test'), patch('getpass.getpass', side_effect=['one-time-code', password]), patch.object(worker.httpx, 'AsyncClient', side_effect=lambda **kw: real_client(transport=httpx.MockTransport(serve), **kw)):
                await worker.enroll(args)
            config = json.loads(args.config.read_text())
            self.assertNotIn(password, args.config.read_text())
            self.assertEqual(config['preview_cookie_sha256'], digest)
            self.assertEqual(len(seen), 2)
            self.assertEqual(json.loads(seen[1].content)['code'], 'one-time-code')
            with patch.object(worker.httpx, 'AsyncClient', side_effect=lambda **kw: real_client(transport=httpx.MockTransport(serve), **kw)):
                runtime = worker.Worker(config)
            try:
                self.assertEqual(runtime.client.headers['Cookie'], '__Host-arena_preview=' + digest)
                self.assertEqual(runtime.client.headers['Authorization'], 'Bearer scoped-worker-token')
            finally:
                await runtime.client.aclose()

    async def test_invalid_code_is_not_mistaken_for_preview_gate(self):
        response = httpx.Response(403, headers={'Content-Type':'application/json'}, json={'detail':'Code expired'})
        self.assertFalse(preview_access.is_preview_gate(response))

    async def test_bad_cookie_is_rejected(self):
        with self.assertRaises(ValueError):
            preview_access.preview_headers({'preview_cookie_sha256':'bad\r\nInjected: value'})
        self.assertEqual(preview_access.preview_headers({}), {})


if __name__ == '__main__':
    unittest.main()
