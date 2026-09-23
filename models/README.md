# Speech models included in this version

The actual weights are hosted in this repository through Git LFS:

- `whisper-base/model.bin`: faster-whisper base, 145,217,532 bytes.
- `piper/ru_RU-dmitri-medium.onnx`: Russian Dmitri voice, 63,201,294 bytes.

Configuration, vocabulary and tokenizer files are ordinary Git files.
`manifest.json` records the size and SHA256 of every required file.

From the repository root, after installing backend requirements, prepare the models:

```powershell
python scripts/prepare_voice.py
```

The script uses Git LFS in a checkout and downloads missing weights directly from
the source repositories when the checkout is unavailable (including ZIP archives).
It verifies sizes and SHA256 hashes from `manifest.json` before loading both models.

From the repository root, verify without network access:

```powershell
backend/.venv/Scripts/python.exe scripts/prepare_voice.py --check-only
```

Sources: [Systran faster-whisper-base](https://huggingface.co/Systran/faster-whisper-base/tree/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66),
[Piper Dmitri voice](https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/dmitri/medium).
