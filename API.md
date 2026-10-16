# Corporate API contract

All endpoints are under `/api` and require `Authorization: Bearer <token>` unless marked webhook.

## Archive

- `GET /company/{company_id}/archive` — owner records and records with an active grant.
- `POST /company/{company_id}/archive` body `{title, record_type, data_scope, payload, session_id?, methodology_version?}`.
- `GET /company/{company_id}/archive/{archive_id}/preview` — exact visible fields and grant expiry.
- `POST /company/{company_id}/archive/{archive_id}/grants` body `{grantee_membership_id, data_scope, purpose, duration_days, confirm_preview:true}`.
- `POST /company/{company_id}/archive/{archive_id}/grants/{grant_id}/revoke`.
- `POST /company/{company_id}/archive/{archive_id}/transfer` body `{target_membership_id, confirm:true, reason}` — protected ownership transfer.
- `GET /company/{company_id}/archive/{archive_id}/consents`.
- `DELETE /company/{company_id}/archive/{archive_id}` — owner soft-delete.

## Twin and multi-party

- `PUT /company/{company_id}/twin/me` body `{opt_in, source_types[]}`.
- `PATCH /company/{company_id}/twin/me/sources/{source_type}` body `{enabled}`.
- `POST /company/{company_id}/twin/me/generate`, `DELETE .../twin/me`, `POST .../training-use`.
- `POST /company/{company_id}/multipart/sessions` body `{title, context, mode, participant_membership_ids[]}`; at least three members are required.
- `POST .../join`, `POST .../turns`, `POST .../close`, `GET .../sessions/{id}`.

## Employee workspace and roles

- `GET /company/{company_id}/me` returns the corporate employee profile, profession, manager chain, onboarding state and privacy flags.
- `GET/POST /company/{company_id}/roles` lists and creates tenant-scoped custom roles.
- `POST /company/{company_id}/roles/{role_id}/assign?membership_id=` assigns a role after validating its capability allow-list; critical owner/admin rights cannot be delegated.

## HR and operations

- `GET /company/{company_id}/catalog?version=&q=`.
- `GET /company/{company_id}/hr/report?profession_id=&min_group_size=`.
- `POST /company/{company_id}/skill-gaps/{membership_id}/recompute`.
- `GET /company/{company_id}/career-tracks`; POST track and step resources.
- `GET/PUT /company/{company_id}/mode-policies/{mode}` and `GET .../mode-access/{mode}`.
- `POST /company/{company_id}/mode-usage/{mode}` reserves one allowed use and returns the current-period remaining quota.
- `POST .../integration-jobs`, `POST .../integration-jobs/{id}/retry`.
- `POST /company/billing/webhooks` requires `X-Arena-Signature = HMAC-SHA256(secret, event_id + ':' + sha256(payload))`.
- `POST /company/{company_id}/sso/{oidc|saml}/assert` requires an authorized company manager.

## Messenger

- `POST/GET /company/{company_id}/messenger/chats`.
- `GET/POST /company/{company_id}/messenger/chats/{chat_id}/messages`.
- `POST .../read`, `POST /messenger/messages/{message_id}/reaction`, `POST .../task`.
- `DELETE .../chats/{chat_id}/members/{membership_id}` revokes membership access.
