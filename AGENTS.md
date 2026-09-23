# Arena Negotiations — npm rewrite

Current behavior and limitations are documented in `README.md` and `docs/migration-audit.md`.

- Use Node.js/TypeScript for application code and npm workspaces. Keep scenario mode fully offline after installation.
- The server owns session state, scenario transitions, metrics (`trust`, `goal`, `control`, `eq`), reports, access control and XP. Never accept metric deltas or rewards from clients.
- Keep old scenario content and outcomes traceable. Any rule or schema changes need tests and migration strategy.
- Validate API inputs with shared contracts. Enforce ownership on every private resource. Do not put secrets in source or client bundles.
- Add only features that really work; incomplete sections should say so in the UI and README.
- Run `npm run check` and inspect `git diff` before reporting changes. Do not delete user runtime data in `data/`.
