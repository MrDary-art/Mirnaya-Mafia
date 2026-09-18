# Backend instructions

Read the root `AGENTS.md` first. This backend is FastAPI with async SQLAlchemy/aiosqlite, Pydantic schemas, and Alembic.

## Responsibilities

- `app/routers/`: HTTP boundary, auth/dependencies, validation and HTTP errors.
- `app/services.py`: existing session orchestration and persistence. Do not put all new domain logic here; place domain behavior in the most appropriate `engine/`, `features/` (if introduced deliberately), or service module.
- `app/engine/`: scenario loading/traversal, metrics, offline report, parser, and LLM/fallback logic.
- `app/data/scenarios/`: authored JSON scenarios.
- `app/models.py`: persistence schema; any schema change requires a reviewed Alembic migration.

## Conventions and safeguards

- Keep database operations async and use the supplied `AsyncSession` dependency.
- Preserve backend ownership of session state, metrics, endings, and reports.
- External LLM calls need timeouts, error handling, response validation, and a fallback. Unit tests must mock providers and never need real GigaChat/Ollama credentials.
- Scenario edits must validate unique IDs, valid `next` references, no dead ends, reachable completion paths, and valid endings.
- Scoring edits must test clamp behavior from 0 to 100 and prevent duplicate application of option effects.
- Offline reports must not require a LLM.
- Do not alter `models.py`, `alembic/`, routers, services, or shared schemas without the high-risk-file procedure in the root instructions.

## Commands

- Setup: `cd backend`; `python -m venv .venv`; activate it; `pip install -r requirements.txt`
- Run: `uvicorn app.main:app --reload --port 8000`
- Tests: `pytest -q`
- Lint/type checking: **Not configured**
