# Arena Negotiations

«Арена переговоров» — интерактивный симулятор деловых переговоров.

Core loop: Home → Session Setup → Negotiation → Opponent reaction → Metrics/state changes → Branching → Ending → Report → Retry.

## Product priorities

- **P0:** offline Scenario Mode, at least two complete scenarios, real branching, metrics, distinct endings, offline report, session setup, admin configuration, tests, reproducible launch.
- **P1:** online AI mode, GigaChat, Ollama fallback, Ghost Coach, timer, hidden goal, history/profile, UI polish.
- **P2:** chaos, levels, stars, achievements.
- Do not implement PvP, UGC, rating, voice, daily challenge, cosmetics, or a complex star economy without a separate task.

## Core architectural rules

- Do not rewrite the project from scratch without an explicit request.
- Offline Scenario Mode must work without GigaChat, Ollama, external LLMs, or API keys. LLM is not required for core gameplay.
- Backend is the source of truth for session state, current step, metrics, endings, report data, rewards, and feature effects. Frontend renders state and sends user actions.
- Do not make frontend the canonical source for final scoring. Metrics are `trust`, `goal`, `control`, `eq`, always in `[0, 100]`; do not add alternative metric names without an agreed contract change.
- For Scenario Mode, the canonical metric input is the selected scenario option effect. Techniques/tags explain behavior and support reporting; do not independently score the same option twice.
- For Online Mode, prefer: player text → validated LLM classification → behavioral tags → deterministic scoring → deltas. Do not let an LLM mutate application state without validation.
- TKI and EQ describe behavior in one game session, not personality, clinical, or psychometric diagnosis. Show BATNA/ZOPA only when defined by the scenario context.
- Schema changes require an Alembic migration. Never add secrets to source or commit `.env`. Do not add dependencies or silently change public API/SessionSettings contracts without need and agreement.

## Team and merge rules

- Work in a feature branch; never force-push. Use small, scoped commits and require review before merging a PR.
- Scenario/scoring ownership: `backend/app/engine/`, `backend/app/data/scenarios/`.
- Online AI ownership: `backend/app/engine/llm.py`.
- Game feature ownership: `backend/app/features/` and `frontend/src/components/features/`; introduce these areas only when a feature has a real reuse boundary.
- UI ownership: `frontend/`. Proposed feature component areas are `frontend/src/components/features/`; create them only when needed.
- High-risk shared files: `backend/app/models.py`, `backend/app/services.py`, `backend/app/routers/`, `frontend/src/api.js`, `frontend/src/auth.jsx`, `frontend/package.json`, `backend/requirements.txt`, and `backend/alembic/`.
- Before changing a high-risk file, explain why it is needed, which contract changes, and which consumers may be affected. Do not change one as a side effect of unrelated work.

## Working style

Before changing code, read related implementation and tests. Reuse existing mechanisms; do not create parallel architecture. Keep changes minimal, avoid unrelated refactors and broad formatting. After changes, run relevant tests and any configured checks, inspect `git diff`, and report changed files, rationale, results, and remaining risks.

## Commands discovered

### Backend

- Setup: `cd backend`; `python -m venv .venv`; activate the environment; `pip install -r requirements.txt`
- Run: `uvicorn app.main:app --reload --port 8000`
- Tests: `pytest -q`
- Lint: **Not configured**

### Frontend

- Setup: `cd frontend`; `npm install`
- Run: `npm run dev`
- Tests: **Not configured**
- Lint: **Not configured**
- Production build: `npm run build`