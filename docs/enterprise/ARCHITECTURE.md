# Enterprise architecture

## Boundaries

- Identity and authentication stay in the existing `User`, auth token, and account lifecycle.
- `Company` is a tenant. `CompanyMembership` is the user's role and employment context inside that tenant. A user may have personal activity and multiple company memberships.
- Departments and cohorts belong to one company. Membership, assignment, scenario, program, audit, certificate, and integration queries must include the requested `company_id` and validate every referenced row belongs to that tenant.
- Negotiation sessions, metrics, and reports remain owned by the shared Arena engine. Company assignments store the company context and link to a session/attempt; they do not implement another scoring engine.
- The frontend `/business` shell is a separate entry point that consumes the shared auth and company context APIs. It is not a second account system.

## Access policy

Roles: `COMPANY_OWNER`, `COMPANY_ADMIN`, `LND_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `MENTOR`, `AUDITOR`, `EMPLOYEE`. The role determines capability defaults and a scope (`COMPANY`, `DEPARTMENT_SUBTREE`, `TEAM`, or `SELF`). The current implementation uses both shared capability checks and legacy role checks; this is why capability overrides are limited to revocation and are not advertised as custom role grants.

Every route that reads or mutates tenant data must establish an active membership for that company, then apply role/capability and member visibility checks. Resource IDs supplied by clients must be checked against the same tenant. A mentor or auditor never receives permission to read personal direct messages.

## Data lifecycle

Invitations are tokenized and membership activation is explicit. Deactivation changes company membership while leaving the personal user account intact. Assignment targets and attempts preserve their company and assignment linkage. Published scenario edits create a new draft revision, leaving the published revision stable. Audit records capture administrative changes. Schema changes use additive Alembic migrations and are reviewed against the current migration heads.

## Provider boundary

Billing, identity federation, HRIS/LMS synchronization, email, and external collaboration integrations are adapters. Configuration is tenant-scoped and secrets must not be returned in API payloads or written to logs. A configured flag is not evidence that a provider is connected; only a verified health check is.
