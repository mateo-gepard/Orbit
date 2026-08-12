# Revision 3 quality-gate cross-check

Source benchmark: Team-Built Tools Quality Gates, Revision 3, 16 July 2026.
Assessment date: 12 August 2026.

## App typology

| Field | Classification |
| --- | --- |
| Tool | Threadmap |
| Tier | T4 |
| Users | External |
| Data | Personal/customer-style workspace data |
| AI | No first-party model processing; optional user-authorized MCP clients can read or act within granted scopes |
| Technical owner | Mateo Mamaladze |

## Gate matrix

| Revision 3 gate | Status | Evidence or action |
| --- | --- | --- |
| Named owner and inventory-ready record | Pass | `TOOL_INVENTORY.md`; central organizational register still needs a chosen system of record |
| Paid/organizational plan for every real service | Blocked | Firebase/GCP billing is linked; Vercel reports active Hobby billing and must be upgraded before real data under this guide |
| No secrets in source, prompts, logs, or browser bundles | Pass | Managed env/secrets, origin-restricted browser keys, no user-managed service-account keys, GitHub secret scanning/push protection |
| Authentication on non-public data | Pass | Firebase Authentication/Identity Platform; private data denied without a verified UID |
| Server/data-layer authorization | Pass | Firestore and Storage rules plus owner-scoped Functions/MCP DAL; UI hiding is not the boundary |
| Negative cross-user isolation test | Pass | `src/test/firebase-rules.test.ts`, 19/19 emulator tests |
| Data classes/processors/flows listed | Pass | `DATA_GOVERNANCE.md` |
| Retention, export, deletion, and recovery path | Pass | Settings export/deletion, public privacy notice, `RECOVERY_RUNBOOK.md`, 7-day daily/28-day weekly backups, 30-day logs |
| No real data in preview/test | Pass | Isolated staging Firebase project and Vercel preview environment; protected preview smoke test proved no production contact |
| Public brand/domain | Pass | `threadmap.app`, unified Threadmap identity and legal/security routes |
| Rate limiting/basic abuse protection | Partial | App Check and Vercel DDoS protection are active; WAF observes 120 `/api/` requests/min/IP but safe 429 enforcement awaits traffic review |
| Incident owner and escalation path | Partial | `INCIDENT_RESPONSE.md` and named technical owner exist; working security mailbox and second owner remain open |
| Automated dependency/vulnerability/license scans | Pass | npm audits, Dependabot, CodeQL, secret scanning, and deterministic production-license policy in CI |
| Platform-native and boundary testing | Pass/partial | Firebase rule suite, App Check smoke tests, callable tests, and this boundary review pass; independent human sign-off remains open |
| In-region data services | Pass/Legal | Firestore, Storage, Functions, staging, and backups are EU-based; Legal must verify processor contract/transfer language including Auth/Vercel |
| DPAs, SCCs, lawful basis, privacy approval | Blocked | Requires controller identity, Legal execution, and a maintained subprocessor register; must not be invented in code |
| External-user MFA available | Pass after rollout | Optional TOTP enrollment/challenge added and Identity Platform TOTP enabled in production/staging |
| AI/MCP flow documented | Pass | `DATA_GOVERNANCE.md` documents destinations, scopes, data returned, and provider boundary |
| Agent least privilege and human approval | Pass/partial | Separate scopes, omitted unauthorized tools, revisions/idempotency, destructive hints, quotas, and two-step deletion; client remains responsible for presenting approval for non-delete writes |
| No direct regulated-product data access | Pass | Threadmap has no Keystone/QMS or equivalent product-database connection |
| CTO/release authority green-light | Blocked | Technical permission is not legal or formal launch approval; owner must record final go-live sign-off after hard blocks close |

## Hard launch blocks under Revision 3

- Upgrade Vercel from Hobby to a paid organizational plan.
- Supply the real controller/legal identity, postal address, privacy/security inboxes, and final legal-page approval.
- Execute/file DPAs and SCCs and confirm residency/transfer terms for Google and Vercel.
- Add a second human owner and test the recovery/escalation path.
- Obtain an independent human engineer review of auth/tenant boundaries.
- Complete a real-user release drill and record final release-authority approval.

## Non-blocking scheduled follow-ups

- Review the WAF observation data, validate a 429 action in preview, and then publish production enforcement.
- Establish a verified MFA factor-reset procedure before making MFA mandatory.
- Track the dev-only Firebase tooling advisory and upgrade when upstream compatibility permits.
- Schedule the next boundary/security review no later than 12 August 2027 and a third-party test when real customer data/scale triggers it.

## Release decision

The technical isolation, authentication, secret, staging, recovery, scanning, and MCP controls meet or exceed the guide's core irreversible-harm gates. Threadmap is not fully releasable under Revision 3 until the paid-plan, legal/processor, second-owner, independent-review, and final human release gates above are closed.
