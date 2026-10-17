"""Run a module against this checkout even with a shared isolated Python runtime.

Examples: python scripts/run_local.py uvicorn app.main:app --port 8000
          python scripts/run_local.py pytest -q
"""
import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if len(sys.argv) < 2:
    raise SystemExit("Specify a module: uvicorn, alembic or pytest")
module = sys.argv.pop(1)
sys.argv[0] = module
runpy.run_module(module, run_name="__main__", alter_sys=True)
