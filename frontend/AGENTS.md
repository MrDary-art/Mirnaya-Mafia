# Frontend instructions

Read the root `AGENTS.md` first. The frontend is React 19 with Vite, React Router, Tailwind CSS, and Recharts.

## Architecture

- Reuse `src/api.js`; do not create a second API client.
- Reuse `src/auth.jsx`; do not duplicate auth state.
- The backend remains authoritative for game state, session progression, endings, and canonical scoring. Do not calculate final canonical scores in the UI.
- Keep `Play` from becoming a monolith. Extract reusable negotiation, report, or feature UI into `src/components/` only when a real reuse boundary exists.
- Account for loading, empty, error, AI-unavailable, disabled, and mobile states when applicable.
- Preserve Vite proxy and deployment configuration unless the task requires a reviewed change. Do not modify `src/api.js` as a side effect of UI work.

## Commands

- Setup: `cd frontend`; `npm install`
- Run: `npm run dev`
- Production build: `npm run build`
- Tests: **Not configured**
- Lint/type checking: **Not configured**
