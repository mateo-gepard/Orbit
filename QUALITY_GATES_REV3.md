# Revision 3 quality-gate assessment

**Assessment basis:** repository reviewed 20 August 2026; live controls require separate evidence
**Classification:** T4 external-user application handling personal workspace data
**Decision:** **NO-GO pending the hard blocks below**

Threadmap has no first-party model inference, but user-authorized external MCP hosts can read or
mutate data within granted scopes. That makes identity, authorization, consent, revocation, and
agent least privilege release-critical.

## Gate matrix

| Gate | Repository control | Evidence still required | Status |
| --- | --- | --- | --- |
| Named technical/product/release owners | documentation names the system and release process | current named owners, deputies, escalation roster | Partial |
| Paid organizational services | code targets Vercel and billed Firebase/GCP resources | paid Vercel org plan and approved procurement record | Blocked |
| No secrets in source/browser/logs | examples separate public ids/server secrets; secret scanning expected | current GitHub/provider scans and log sample | Partial |
| Authentication for private data | Firebase Authentication; local profile explicit | production flows and account recovery | Partial |
| Server/data authorization | uid-scoped Rules, Functions, MCP principal/DAL | current negative two-user tests and independent review | Partial |
| Preview/test isolation | staging Firebase default; preview-aware MCP routing | live Vercel env ids and no production-data proof | Partial |
| Dependency/license/supply-chain gates | audit/license scripts; full-SHA pinned Actions; pinned npm | green exact-SHA CI and exception review | Partial |
| Platform-native tests | Rules emulators, Functions tests, Playwright Chromium/WebKit | green exact-SHA reports; real iOS and assistive tech | Partial |
| Accessibility | axe moderate/serious/critical WCAG gate; keyboard smoke | manual screen reader, zoom/reflow, cognitive review | Partial |
| Data inventory/flows | architecture/governance/security documentation | owner-approved current inventory and subprocessor map | Partial |
| Retention/export/deletion | account export/deletion and durable cleanup/tombstone design | production verification and approved retention schedule | Partial |
| Recovery | runbook and staging-first restore model | current synthetic restore and production rollback drills | Partial |
| Abuse/cost protection | App Check hooks, quotas, instance caps, validation bounds | live enforcement, WAF policy, budget/alert delivery | Partial |
| Regional placement | Firebase `europe-west1`, Vercel candidate config `fra1`, recursive audit | live production was observed in `iad1`; promote only after staged/final `runtime.region` verifies `fra1`, then complete contractual transfer review | Blocked |
| Legal/privacy | configurable legal identity and public trust pages | real controller/contact/address, counsel, DPA/SCCs | Blocked |
| MFA/admin recovery | user TOTP/recovery-code code paths; provider MFA expected | recovery-capable second owner and tested provider recovery | Blocked |
| Agent least privilege | read/write/delete scopes, narrowed DCR, revision/idempotency, delete preview | real host consent/revocation test and approved scope policy | Partial |
| Incident/alert readiness | runbooks and exact-SHA health endpoint | healthy signed drain or approved error integration, multi-location synthetic, redaction/retention proof, post-deploy error scan, on-call acknowledgement drill | Blocked |
| Release authority | fail-closed workflow plus retained downstream design | implement true-staging job and separate post-evidence production approval; then exact-SHA GO record | Blocked |

“Repository control” means the candidate contains a mechanism; it does not mean the live system is
configured or the control operated successfully.

## Automated release gates

The exact candidate SHA must pass:

1. Secret-free repository contract, Firebase/Vercel region audit, license policy, and dependency
   audit with no unaccepted high/critical finding.
2. ESLint, TypeScript, app tests, Firebase Rules emulator tests, Functions build/tests, and Next
   production build.
3. Desktop Chromium, mobile Chromium, and mobile WebKit route cold loads with runtime-console,
   overflow, moderate/serious/critical WCAG axe, and keyboard command/focus checks.
4. Staged `/api/health` exact SHA/readiness, actual `fra1` compute, production Firebase project,
   `europe-west1` Functions origin, quota Function contract, and OAuth discovery.
5. Mandatory compatible Firebase deployment from the same candidate, re-verification of both the
   prior live web SHA and staged artifact, promotion of that staged artifact, and final production
   alias verification for the candidate SHA.

The automated post-deploy verifier covers release identity, regions, shared-secret/App Check
boundary, quota route, and public OAuth discovery. It does not authenticate a disposable user or
exercise Firestore/callable/upload schemas. The matching-SHA true-staging drill is therefore a
separate protected human gate, not an inferred PASS from these probes.

Skipped, quarantined, flaky-retried-only, or historical tests are not PASS without explicit risk
acceptance. A source change after staging invalidates artifact-specific evidence.

## Irreversible-harm gates

These require both automation and a human test:

- cross-user isolation for Firestore, Storage, Functions, MCP, export, and destructive operations;
- account deletion/tombstone behavior under delayed retries and upload sessions;
- permanent item/file deletion impact, idempotency, and cleanup;
- OAuth scope display, per-user revocation, token replay handling, and account deletion;
- production Storage CORS including denial of unapproved origins and resumable-upload cancellation;
- backup restore without overwriting production and rollback across web, backend, and cached clients.

## Hard launch blocks

- Replace the intentional release-workflow blocker with a real `threadmap-staging-9e0b6` Firebase
  plus staging-configured web job; pass validated outputs to a separate production-environment job
  so approval occurs after evidence and before credentials/mutation.
- Confirm a paid, organization-owned Vercel plan and provider account ownership.
- Supply and approve the legal controller identity, working privacy/security channels, postal
  address, lawful bases, retention policy, and user-facing language.
- Execute and retain DPAs/SCCs and approve the subprocessor/data-transfer register.
- Add a second recovery-capable human owner and test GitHub, Google/Firebase, Vercel, DNS, and email
  recovery with phishing-resistant MFA.
- Configure the protected GitHub `production` environment and prove live Vercel main auto-deploy is
  disabled before relying on the staged workflow.
- Run current two-user, real-host MCP, real iOS PWA, restore, rollback, and alert-delivery drills.
- Obtain independent engineering/security review and formal release-authority GO for the exact SHA.

## Accepted only with explicit time-bounded risk ownership

The following are not silent follow-ups:

- long-lived `FIREBASE_TOKEN` in release automation pending Workload Identity Federation;
- no independent Firebase Functions artifact-SHA attestation;
- any monitoring-only WAF threshold pending measured traffic;
- lack of privacy-reviewed client error telemetry;
- any upstream development-only advisory without a compatible fixed toolchain.

Each acceptance must name owner, rationale, blast radius, compensating control, expiry, and tracked
remediation. A permanent “known issue” label is not acceptance.

## Release rule

The application remains NO-GO under Revision 3 until every hard block is evidenced. Technical
review, a successful build, or access to deploy does not confer legal or release authority.
