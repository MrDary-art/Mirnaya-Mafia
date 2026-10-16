# Implementation status

## Delivered in this branch

- [x] Privacy archive objects, per-record scopes, expiry, revoke, preview and consent journal.
- [x] Employee opt-in negotiation twin with explainable rules, source controls and deletion.
- [x] Multi-party engine with human/AI mediator modes, turn model and participant report.
- [x] Tenant-isolated corporate messenger with unread counters, reactions and tasks.
- [x] Versioned profession/competency catalog, search, career tracks, skill gaps and recommendations.
- [x] Privacy-aware employee workspace (`/company/{id}/me`) with profession and manager chain.
- [x] Tenant-scoped custom roles with an allow-list and non-delegable critical capabilities.
- [x] Mode policy quotas with a period usage ledger and enforced reservation endpoint.
- [x] HR report population declaration and small-sample suppression.
- [x] Approval history, reviewer comment, return-to-draft and second-person approval guard.
- [x] League consent gate and revocation.
- [x] Integration queue, retry lifecycle, signed billing events and authenticated SSO assertion boundary.
- [x] B2B integration-request CTA and CRM interest type.
- [x] Reversible migrations `0040`, `0041`, `0042`, `0043` and `0044`.

## Verification

- `python -m py_compile` for all changed backend modules: passed.
- `alembic upgrade head`: passed; head is `0044_company_mode_usage`.
- Migration copy check: downgraded a SQLite backup to `0039_social_feed_backfill` and upgraded it back to `0044_company_mode_usage`.
- `alembic check`: passed with no new upgrade operations (one pre-existing SQLAlchemy cycle warning remains for social media tables).
- Frontend `npm run build`: passed.
- Backend `pytest -q`: `315 passed, 3 skipped, 5 warnings`.
- Frontend page tests: `12 passed`.
- Live smoke: archive create/preview/delete, twin opt-in/generate, messenger chat/message, signed webhook rejection: passed.

## Remaining deployment work

- Configure a real mail provider and outbound invitation worker.
- Connect an OIDC/SAML metadata verifier, HRIS/LMS provider adapters and payment provider credentials.
- Add a production object-storage adapter for attachments and retention hard-delete worker.
- Finish migrating the legacy scenario publishing route to the approval entity and run browser E2E plus two-tenant security matrix.
