# Enterprise API map

All routes below use `/api`. Protected routes require the existing Arena bearer token and an active membership in the path's company. The route implementation is the source of truth for field validation and response payloads.

## Public entry, identity, invitations

- `POST /business/leads` stores a consented, rate-limited company inquiry; `GET /business/leads` intentionally returns 404. Admin CRM routes are under `/admin/business/leads`.
- `GET /company/context`, `GET /company/search`, `POST /company`, `POST /company/memberships/{membership_id}/{action}`.
- Company application, directory, invitation-link, employee invitation/import, membership update/deactivation routes are under `/company/{company_id}`.
- Invitation preview and acceptance are under `/company/invitations/{token}` and `/company/invitations/{token}/accept`.

## Company operations

- `GET/POST /company/{company_id}/departments`; department and cohort CRUD under the same tenant path.
- `GET/POST/PUT /company/{company_id}/assignments`; start/resume at `POST .../assignments/{assignment_id}/start`; reports and attempts under `.../attempts`.
- Scenario, KPI, material and program routes are under `/company/{company_id}`. Published scenario edits create a new draft revision.
- Employee context, calendar, notification settings, personalization, certificates, inbox, ratings, results comments, surveys, achievements and audit/analytics use company-scoped routes.
- `GET/PUT /company/{company_id}/access` and `PUT .../access/{membership_id}` manage role profiles. Overrides can revoke but cannot grant a capability.
- `GET/PUT /company/{company_id}/subscription` tracks plan and seat metadata; it does not charge a payment method.
- Integrations, 1×1, competitions, goals, schedules, packs, and leagues have company-scoped routers.

## Authorization contract

Use backend membership and visibility checks; hiding a frontend link is not authorization. Never infer tenant from a client-provided membership ID alone. Never expose credentials stored in integration settings. Personal account routes remain independent of corporate membership.
