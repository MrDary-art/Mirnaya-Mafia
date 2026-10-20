"""The chosen model/precision must reach GPU loading and protocol metadata."""
import importlib.util
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import time
import uuid
import hashlib
from types import SimpleNamespace
import unittest
from unittest.mock import patch, AsyncMock
import httpx

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('profile_worker_test',ROOT/'worker/worker.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ModelTests(unittest.IsolatedAsyncioTestCase):
    async def test_result_reports_the_real_selected_model(self):
        pcm=b'pcm-test-data';sent=[]
        def serve(request):
            if request.url.path.endswith('/audio'): return httpx.Response(200,content=pcm)
            if request.url.path.endswith('/result'): sent.append(json.loads(request.content))
            return httpx.Response(200,json={'accepted':True})
        client=httpx.AsyncClient
        with patch.object(worker.httpx,'AsyncClient',side_effect=lambda **kw:client(transport=httpx.MockTransport(serve),**kw)):
            w=worker.Worker({'url':'https://example.test','token':'test-token','model':'large-v3'})
        job={'id':str(uuid.uuid4()),'lease':'a'*64,'bytes':len(pcm),'sha256':hashlib.sha256(pcm).hexdigest(),'deadline':time.time()+60}
        try:
            with patch.object(w,'decode',return_value='Проверка речи'): await w.process(job)
            self.assertEqual(sent[0]['model'],'large-v3')
            self.assertEqual(sent[0]['text'],'Проверка речи')
        finally: await w.client.aclose()

    async def test_old_config_defaults_remain_compatible(self):
        with patch.dict('os.environ',{},clear=True):
            w=worker.Worker({'url':'https://example.test','token':'test-token'})
        self.assertEqual((w.model_name,w.compute_type),('large-v3-turbo','float16'))
        await w.client.aclose()

    async def test_selected_model_and_precision_are_used_and_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            pcm=Path(directory)/'smoke.pcm';pcm.write_bytes(b'fake-pcm')
            seen=[]
            def serve(request):
                seen.append(json.loads(request.content))
                w.revoked=True
                return httpx.Response(200,json={'ok':True})
            client=httpx.AsyncClient
            with patch.object(worker.httpx,'AsyncClient',side_effect=lambda **kw:client(transport=httpx.MockTransport(serve),**kw)):
                w=worker.Worker({'url':'https://example.test','token':'test-token','gpu_uuid':'GPU-test',
                    'model':'large-v3','compute_type':'int8_float16','model_path':str(Path(directory)/'whisper-large-v3'),'smoke_pcm':str(pcm)})
            calls=[]
            fake=SimpleNamespace(WhisperModel=lambda *a,**kw:calls.append((a,kw)))
            with patch.dict(sys.modules,{'faster_whisper':fake}), patch.dict('os.environ',{},clear=True), patch.object(w,'decode',return_value='Здравствуйте проверка голоса'):
                w.load()
                self.assertEqual(worker.os.environ['CUDA_VISIBLE_DEVICES'],'GPU-test')
            self.assertEqual(calls[0][1]['compute_type'],'int8_float16')
            self.assertEqual(calls[0][1]['device'],'cuda')
            self.assertTrue(calls[0][1]['local_files_only'])
            try:
                with patch.object(worker.asyncio,'sleep',new_callable=AsyncMock): await w.heartbeat()
                self.assertEqual(seen[0]['model'],'large-v3')
            finally: await w.client.aclose()


if __name__=='__main__': unittest.main()
