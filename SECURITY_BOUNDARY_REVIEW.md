# Authentication and tenant-boundary review

Review date: 12 August 2026
Scope: production and staging authentication, Firestore/Storage isolation, callable Functions, MCP authorization, secrets, preview isolation, and destructive actions.
Next review due: 12 August 2027, or earlier after a major auth/data-boundary change.

## Boundary model

Threadmap uses per-user workspaces rather than shared organization tenants. The verified Firebase Authentication UID is the tenant key. UI state is not an authorization boundary.

## Evidence reviewed

| Boundary | Evidence | Result |
| --- | --- | --- |
| Firestore | Rules scope records to the authenticated UID; 19 emulator rule tests include negative cross-user cases | Pass |
| Storage | Rules bind paths and metadata to the authenticated UID; covered by emulator tests | Pass |
| Functions | Authentication and App Check are verified before protected operations; production enforcement is enabled | Pass |
| MCP identity | OAuth access token resolves the owner; the DAL is constructed with that owner and does not accept a caller-provided owner ID | Pass |
| MCP least privilege | Read/write/delete scopes are separate; ungranted tools are omitted; quotas and tool annotations are enforced | Pass |
| MCP deletion | Preview plus short-lived owner/client/revision-bound single-use token and explicit destructive metadata | Pass |
| Secrets | Server secrets remain in managed environments; browser Firebase identifiers are origin-restricted; GitHub push protection is active | Pass |
| Preview data | Vercel preview/development environments use isolated staging Firebase resources, preview SSO, and preview-host-bound EU MCP metadata | Pass |
| Function residency | Callable, HTTP, schedule, and event functions run in `europe-west1`; CI rejects US-region regressions | Pass |
| MFA | TOTP enrollment and sign-in challenge are available to verified cloud accounts | Pass |
| Sensitive writes | Targeted Google Cloud Data Access audit logging records write/security metadata with 30-day retention | Pass |

## Automated assurance

- CI runs lint, type checking, application tests, production build, dependency audit, license policy, Firebase rule tests, and Functions build/tests.
- CodeQL, Dependabot security updates, secret scanning, push protection, and protected-branch checks are enabled.
- Firebase App Check is enforced for Authentication, Firestore, Storage, and protected Functions.
- Production has PITR, delete protection, scheduled backups, uptime alerting, budget alerts, and a tested staging restore drill.

## Findings and residual risk

No unresolved critical or high-severity technical tenant-isolation finding was identified in this review.

| Severity | Finding | Required action |
| --- | --- | --- |
| Blocker | Vercel is on Hobby, while Revision 3 prohibits free tiers for real services/data | Owner upgrades to a paid organizational plan and records DPA/SCC evidence |
| Blocker | Controller identity, legal contact/address, DPA/SCC register, and release approval are not complete | Legal/product owner supplies and approves these facts |
| High operational | Only one confirmed human owner/recovery path | Add a second owner and test account/cloud recovery |
| Medium | TOTP has no self-service recovery codes | Establish a verified support/admin factor-reset process before promoting MFA as mandatory |
| Medium | WAF API rate limit is monitoring-only during safe tuning | Review matched production traffic, test enforcement in preview, then publish a 429 policy |
| Medium | Independent engineer/third-party testing is not yet evidenced | Obtain human boundary sign-off before meaningful exposure; schedule third-party test at scale and at least annually |
| Low | A moderate dev-only advisory remains through current Firebase tooling | Track the upstream compatible update; production bundles are unaffected |

This document records the technical review. It is not a substitute for the guide's required independent human engineer review or legal approval.
