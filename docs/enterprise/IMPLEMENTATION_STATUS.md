# Implementation status

Status reviewed 2026-10-16 against the enterprise specification and the branch baseline.

## Delivered in the current codebase

- Separate `/business` public entry, shared login/registration, company workspaces, guarded tenant routes, seeded demo, and company inquiry form/CRM.
- Shared user identity with independent company memberships, invitations, invitation links, employee applications, CSV preview/import, org departments, cohorts, manager/mentor relations, and role-based navigation.
- Employee overview, assignments, practice, result history, learning programs, calendar, directory, notifications, profile, achievements, and certificates.
- Manager/HR views, assignment workflow, schedules, result release/comments, analytics, CSV export, small-sample suppression, audit log, benchmark, scenario builder/revisions, materials, KPIs, programs, surveys, and certificates/PDF.
- Company 1×1 scheduling, competitions, leagues, team goals, industry packs, integration configuration, license metadata, and audit events.
- This branch closes capability-grant escalation through overrides, supports `/business/:companyId/me` as the overview alias, and requires scenario publication to pass through review by someone other than its author.

## Partially implemented / requires a separate vertical slice

- Role authorization uses a mixture of role sets and capabilities. Granular custom roles and scope delegation need a single policy engine plus full route coverage before being enabled.
- Scenario approval identity is captured in the audit log; a dedicated review record with comments and review history UI is still missing.
- “Programs” and “practice” support existing assignments and shared Arena scenarios; richer HR/L&D learning paths and requests for new modes need lifecycle refinement.
- Corporate integrations have provider configuration and test hooks; external provider delivery/synchronization is not active without real credentials and callbacks.
- Competitions and leagues exist as modules; cross-company league governance and privacy rules need production hardening.

## Not implemented / not to be represented as done

- Tenant-scoped direct/group messenger with member-based ACLs and unread state.
- Explicit employee-controlled archive sharing and consent/revocation history.
- Opt-in explainable negotiation twin based on company data.
- Separate mediator/multi-party negotiation engine; current shared session engine must not be portrayed as this feature.
- Verified employer representative onboarding, SSO, HRIS/LMS sync, real billing/webhooks, and production mail delivery.
- Full browser E2E matrix for two tenants and every role, migration rehearsal on production-like data, load tests, and operational alerts.

## Verification on this branch

- `python -m pytest -q tests/test_company.py tests/test_company_enterprise.py tests/test_company_business_access.py tests/test_company_business_workflow.py tests/test_company_growth.py tests/test_business_crm.py` — 31 passed.
- `npm.cmd run build` — passed.
- Full backend suite, browser E2E, migration rehearsal, and load tests remain to be run before release.
