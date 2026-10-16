# Corporate implementation audit

| Requirement | Status | File/API | Behaviour | Change | Risk / next step |
|---|---|---|---|---|---|
| Employee-owned archive | Done | `company_advanced_models.py`, `/api/company/{id}/archive` | Records are separate objects; owner sees them by default | Added per-record grants, exact-field preview, expiry, revoke and consent journal | File/blob storage is still an adapter boundary |
| Manager access to archive | Done | `archive_access` | A manager without an active grant receives 403 | Scope is checked on every read | Add retention worker for hard deletion |
| Negotiation twin | Done | `/twin/me` | Rule-based profile, explicit opt-in, source switches and delete | Corporate training/archive sources are isolated from personal Arena data | Add UI for source-level controls and a future signed model version |
| Multi-party negotiation | Done | `/multipart/sessions` | Three or more participants, human or deterministic AI mediator, turns and report | Dedicated session/participant/turn/report tables | Human mediator assignment can be connected to scheduling |
| Corporate messenger | Done | `/messenger/chats` | Tenant-isolated direct/group/team chats, unread, reactions, tasks and membership revocation | Dedicated chat models and policy boundary | Add object storage adapter for binary attachments |
| HR analytics | Done | `/hr/report`, `/skill-gaps`, `/recommendations` | Training results only, methodology version, small-group suppression | Profession/competency catalog, career tracks and recomputation endpoints | Real-world performance intentionally excluded |
| Employee corporate profile | Done | `/company/{id}/me` | Profession, verified manager chain, onboarding and privacy state are returned separately from the public Arena profile | Added employee workspace projection | Extend UI cards to consume the new projection |
| Custom roles | Done | `/roles`, `/roles/{id}/assign` | Tenant-scoped allow-list; owner/admin rights cannot be delegated | Added `CompanyCustomRole` and membership binding | Legacy fixed-role endpoints still need a staged policy migration |
| Mode policies and quotas | Done | `/mode-policies`, `/mode-access`, `/mode-usage` | Role/department visibility, subscription gating, voice/video flag and enforced monthly quota | Added usage ledger and reservation endpoint | Connect reservations to every external provider adapter |
| Scenario approval | Done | `/scenarios/{id}/approval` | REQUEST/RETURN/APPROVE history; author cannot approve own scenario | Explicit approval entity with reviewer/comment/version | Existing legacy publish route should be migrated fully to this gate |
| Leagues | Done | `company_growth.py`, `/leagues/{id}/consent` | Company opt-in required before join/standings; only aggregate data | Revocation and admission checks | Add scheduled moderation queue |
| Integrations | In progress | `/integration-jobs`, `/sso`, `/billing` | Durable queue, bounded retries, signed billing webhook, OIDC/SAML identity map | Added job lifecycle and audit fields | Provider adapters and outbound mail still need deployment secrets |
| B2B integration request | Done | `/api/business/leads` | `interest=integration` is stored and routed through CRM | Added dedicated CTA | Connect CRM webhook in production |

Tenant isolation starts with `member_for`, then every resource query checks both `company_id` and membership. Personal archive and direct chats never fall back to role-based manager access.
