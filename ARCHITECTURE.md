# Corporate architecture

## Policy boundary

Authenticated requests enter `company_advanced.py`. `member_for` validates the active tenant membership and company status; `require_action` resolves role capabilities plus explicit overrides. Resource handlers then check ownership or a scoped grant. A manager is never an implicit reader of an employee archive or a direct chat.

## Entity groups

- **Identity and lifecycle:** `CompanyOnboarding`, `CompanySsoIdentity`, `CompanyActiveSession`, `CompanyCustomRole`.
- **Taxonomy and development:** `CompanyProfession`, `CompanyCompetency`, join tables, `CompanyCareerTrack`, `CompanyCareerStep`, `CompanySkillGap`, `CompanyLearningRecommendation`.
- **Privacy:** `CompanyArchiveRecord` → `CompanyArchiveGrant` → `CompanyArchiveConsent`; `CompanyTwinProfile` → `CompanyTwinSource` → `CompanyTwinTrainingUse`.
- **Practice:** `CompanyMultiPartySession` → participants, turns and report; `CompanyScenarioApproval` and `CompanyScenarioRequest`.
- **Communication:** `CompanyChat` → active members, messages, reactions and tasks.
- **Operations:** mode policies, integration requests/jobs, invoices/events, league consent.

## Access matrix

| Resource | Employee | Manager / HR | Owner / admin |
|---|---|---|---|
| Own archive | read/create/delete | only after per-record grant | same policy; no bypass |
| Own twin | opt-in, sources, generate, delete | cannot inspect | cannot inspect |
| Direct chat | members only | members only | members only |
| Team chat | members only | assigned team members | company members by explicit invitation |
| HR report | own recommendation | aggregate with small-group suppression | aggregate and methodology |
| Catalog / career tracks | read | manage with capability | manage |
| SSO, billing, modes | no | policy-dependent | manage_company |
| League | no implicit publication | consent only if authorized | consent/revoke/moderate |
| Custom role assignment | no | no | manage_company; critical capabilities are never delegable |

## Migrations

`0040_company_advanced` creates privacy, taxonomy, twin, multi-party, policy, approval, integration and billing tables. `0041_company_messenger` creates tenant-isolated chat tables. `0042_membership_profession` stores the primary profession directly on a membership while retaining the many-to-many history. `0043_company_custom_roles` adds tenant-scoped custom roles and binds them to memberships. `0044_company_mode_usage` records period quotas for enabled modes. All are reversible and use `checkfirst` for installations that already contain part of the schema.
