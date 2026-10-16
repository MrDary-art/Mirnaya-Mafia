# Audit of `main` before the enterprise feature branch

Audit baseline: `origin/main` at `3e1dcfe819cc8ec51b79821df3411931c49ebcad` (2026-10-16). The feature branch started clean from that commit.

## Existing company product

`/business` is a separate public entry point. `/business/login` and `/business/register` reuse the platform account and authentication flow. `/business/workspaces` lists memberships and invitations; `/business/:companyId/*` is guarded by the authenticated user's active company membership. `/business/demo` is a separate, seeded demo.

The backend already has tenant-owned companies, departments, cohorts, memberships, invitations, assignments, attempts, programs, scenario versions, materials, surveys, achievements, certificates, audit events, subscriptions, integrations, schedules, leagues, 1×1 sessions and competitions. The personal Arena and the shared negotiation/scoring engine remain separate from corporate membership data.

## Findings addressed on this branch

- Capability overrides accepted `true` for any role. The effective permissions helper applied those grants, creating an escalation path around the role matrix. Grants are now rejected at `PUT /api/company/{company_id}/access/{membership_id}` and stored overrides can only remove a role permission.
- The role editor let users toggle arbitrary permissions. It now displays the effective role permissions read-only and omits stale positive overrides when saving a role.
- Added `/business/:companyId/me` as an alias to the current workspace overview, preserving the existing dashboard implementation.

## Findings still open

- Most older company endpoints still authorize with a fixed role set instead of the effective capability matrix. Capability overrides are therefore not a general-purpose custom-role system. Do not present arbitrary custom capability grants until endpoint authorization and scope checks use one policy evaluator consistently.
- Scenario publication now requires the explicit `REVIEW` state and a publisher different from the original author. The request and approval are recorded in the tenant audit log; a dedicated review-comment record is still absent.
- There is a company inbox/notifications, but no tenant-scoped direct and group messenger. Personal direct messages must not be repurposed as a corporate channel.
- `specialization` is a personal user field; there is no managed, versioned profession taxonomy attached to a company membership.
- Employee archive sharing and a company-scoped negotiation twin need separate opt-in and access controls before implementation.
- Subscription seats and provider metadata exist. Real billing, SSO, HRIS/LMS sync, and outbound email delivery require provider credentials and operational configuration.
- The demo covers representative flows only; it does not replace browser end-to-end tests for each role and tenant.

## Regression boundary

Keep the existing personal Arena, AI practice, social features, scenario engine, reporting, and administration routes intact. Company attempts should continue to be created and scored by the shared session engine; the company layer owns assignment, membership, visibility, and reporting context.
