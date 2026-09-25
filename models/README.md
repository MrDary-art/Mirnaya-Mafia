# Speech models included in this version

The actual weights are hosted in this repository through Git LFS:

- `whisper-base/model.bin`: faster-whisper base, 145,217,532 bytes.
- `piper/ru_RU-dmitri-medium.onnx`: Russian Dmitri voice, 63,201,294 bytes.

Configuration, vocabulary and tokenizer files are ordinary Git files. The bundled base model is selected by default for a lightweight, offline CPU path.
`manifest.json` records the size and SHA256 of every required file.

Install Git LFS before cloning, or run `git lfs install` then `git lfs pull`
in an existing checkout. GitHub's file page can display an LFS pointer; the actual
weights are uploaded to GitHub LFS. ZIP archives may contain pointers, so use a
Git checkout with LFS for a complete installation.

From the repository root, verify without network access:

```powershell
backend/.venv/Scripts/python.exe scripts/prepare_voice.py --check-only
```

Sources: [Systran faster-whisper-base](https://huggingface.co/Systran/faster-whisper-base/tree/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66),
[Piper Dmitri voice](https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/dmitri/medium).
