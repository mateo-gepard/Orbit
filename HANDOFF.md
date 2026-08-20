# Threadmap engineering handoff

**Updated:** 20 August 2026

## Current state

The shared working tree contains a broad CTO-audit remediation across interface, lifecycle/security,
and release/observability areas. It is intentionally uncommitted and has not been deployed,
promoted, pushed, or used to change live provider settings. Do not describe production as containing
these changes until an exact-SHA staged release proves it.

The package/manifest product version remains `0.1.0`. Deployment identity is the full Git commit
SHA exposed by `/api/health` and verified before promotion.

Live production is not yet on the intended region. On 20 August 2026,
`dpl_Atuf64Khy9x3pSW1vrTSzEH1YHfs` was Ready but its Functions inspected in `iad1`, corroborated by
`x-vercel-id: cdg1::iad1::...`. Treat `fra1` as unshipped candidate intent until a new exact-SHA
staged release and the final alias both pass the runtime-region gate.

## Release/operations work in this candidate

- `.firebaserc` defaults to isolated staging; production has an explicit alias.
- Root Firebase deploy commands target staging explicitly. Production commands use a guard that
  requires `orbit-9e0b6`, an approved resource list, exact release SHA, clean `main`, confirmation,
  and production preflight.
- GitHub Actions use verified full commit pins. CI adds a browser job for desktop Chromium, mobile
  Chromium, and mobile WebKit and retains its report as a SHA-named artifact.
- The retained downstream production workflow design checks an exact `main` SHA, source/rules/
  Functions gates, intended Vercel link, a staged prebuilt artifact, Playwright/axe, runtime
  identity, mandatory compatible Firebase deployment, shallow post-deploy probes of the old/staged
  web artifacts, and promotion of the same artifact; it is unreachable behind the topology block.
- Production release is intentionally unavailable: a failing non-environment blocker prevents the
  dependent production job from requesting approval, receiving credentials, or mutating anything
  until a true-staging Firebase + staging-configured web job feeds evidence into that separate
  post-evidence production approval/deploy job. A planned production URL cannot substitute for
  authenticated staging read/write/upload compatibility.
- `vercel.json` disables automatic `main` production deployment and pins Vercel compute to `fra1`.
- The region audit scans all application and Functions runtime sources, validates the single app
  Firebase Functions region constant (`europe-west1`), and distinguishes it from Vercel `fra1`.
- MCP and Firebase Auth rewrites now share one validated deployment project selection; production
  requires `orbit-9e0b6`, previews require staging, and provider/config drift fails the build.
- `/api/health` reports safe liveness/readiness, SHA/deployment identity, actual/configured Vercel
  region, Firebase project/Functions origin, App Check presence, and missing configuration names.
- The service worker uses a stable `/sw.js` registration whose non-cacheable response embeds the
  release SHA, periodic/foreground/network update discovery, release-keyed caches, explicit update
  consent, cancellable listeners, private/no-store/cookie response cache rejection, and a persisted
  monotonic generation barrier that prevents delayed pre-sign-out schedule messages from restoring
  notification state after a clear.
- Production Storage CORS is canonical and limited to Threadmap production domains; local origins
  live in a staging file. The setup script validates project/bucket, applies the right file, reads
  it back, and compares the live policy. The release contract rejects policy drift.
- Legacy `scripts/setup-firebase.sh` is retired because it accepted arbitrary projects and
  overwrote `.env.local` unsafely.
- Auth email launch depends on Secret Manager `RESEND_API_KEY` and `AUTH_EMAIL_HMAC_KEY`, verified
  sender-domain DNS, and a disposable-address staging delivery/link/replay/expiry/suppression drill;
  health and unauthenticated release probes cannot establish email delivery. The repo has no Resend
  event consumer, so launch also needs explicit provider-native suppression approval or a verified
  webhook, monitored `support@threadmap.app`, drilled delivery thresholds, disabled tracking,
  30-day retention, EU-send/US-metadata transfer review, and a real link-scanner drill.
- Auth-email link branding now fails closed outside the exact production project unless
  `THREADMAP_APP_ORIGIN` and `AUTH_EMAIL_FIREBASE_ACTION_HOSTS` are configured together. The same
  exact app origin gates attachment-upload initiation outside the emulator. The env example names
  the intended staging origin/hosts; DNS/live staging proof remains a release blocker.
- Node/npm/Playwright/axe are pinned where reproducibility matters; workflow actions are SHA-pinned.

## Validation completed on the shared tree

At the time of this handoff, the release slice passed:

```text
npm run release:contract
npm run audit:regions
npm run typecheck
npx vitest run src/app/api/health/route.test.ts src/lib/pwa.test.ts src/lib/service-worker-cache.test.ts
```

Focused Vitest runs passed, but concurrent lifecycle work can change the executed count; rerun on
the settled tree rather than treating a historical number as release evidence. `git diff --check`
also passed for the then-current tree and still needs a final integration run.

Playwright 1.57 Chromium and WebKit binaries were installed locally. The first E2E attempt did not
exercise a page: Next refused to start because another build already held the shared build lock.
No lock was removed and no process was killed. The final owner should run one clean broad browser
round only after all concurrent edits are complete.

## Final integration sequence

1. Review `git status` and reconcile overlapping edits without reverting another agent's work.
2. Verify root and Functions lockfiles/manifests are aligned and no implicit production deploy
   command remains (notably check `functions/package.json`).
3. Run the complete local gates on Node 22/npm 11.5.1:

```bash
npm ci
npm run release:contract
npm run audit:regions
npm run audit:licenses
npm run lint
npm run typecheck
npm test
npm run test:rules
(cd functions && npm ci && npm test)
npm run build
npm run test:e2e
git diff --check
```

4. Inspect the Playwright report for all three projects. Any moderate/serious/critical WCAG violation fails
   with rule id, selector, HTML, and failure summary; fix rather than excluding broadly.
5. Review the full diff for generated files, secrets, stale region/project/domain names, and claims
   of live completion.
6. Only after review, create the intended commit/PR. Do not use ordinary Git/Vercel auto-deploy as
   the production release path.

## Production setup still required

- Configure a protected GitHub environment named `production`, main-only deployment, required
  reviewers, Vercel ids/token/bypass secret, production Firebase web values, quota secret, legal
  values, and the mandatory Firebase deploy credential.
- Confirm the live Vercel production project honors disabled `main` auto-deploy before relying on
  repository configuration. The first deployment carrying that setting is a transition risk.
- Move live Next.js compute out of observed `iad1` by completing the guarded `fra1` release; never
  waive `release:verify`'s `runtime.region` check to force promotion.
- Confirm paid organizational provider plans, DPAs/SCCs, working legal/security mailboxes, approved
  policies, phishing-resistant MFA, recovery codes, and a second recovery-capable owner.
- Configure and verify Firebase App Check, Secret Manager bindings, EU Function regions, PITR,
  backups, alerts/budgets, and production Storage CORS.
- Migrate the long-lived Firebase CLI token to GitHub OIDC/Google Workload Identity Federation.
- Add independent Firebase Functions build-SHA attestation; current web health cannot prove backend
  source identity.
- Run the manual two-user, real MCP host, real iOS PWA, data restore, alert delivery, and rollback
  drills in `RELEASE_DRILL_EVIDENCE.md`.

## Release procedure

When every blocker in `PRODUCTION_READINESS.md` is evidenced:

1. Select the reviewed full SHA on `main`.
2. Do not dispatch the production workflow until its explicit topology blocker is replaced by a
   true-staging job and a separate post-evidence production approval/deploy job.
3. Review the matching-SHA staging artifact, authenticated contract results, and rollback evidence.
4. Approve the production job only after that evidence exists; Firebase is mandatory for the
   release and the already-tested web artifact may promote only after post-deploy probes pass.
5. Record final health, deployment id, Firebase release, approvers, manual flows, and rollback owner.

If any gate fails, the candidate remains unpromoted. Do not bypass the SHA/readiness/region checks
to work around a provider incident; resolve the incident or deliberately roll back.

## Authoritative references

- `DOCUMENTATION.md` and `ARCHITECTURE.md`: current repository shape and trust boundaries.
- `MCP_SETUP.md`: current multi-user OAuth/MCP configuration and operation.
- `PRODUCTION_READINESS.md`: go/no-go checklist and required secrets/manual controls.
- `RELEASE_DRILL_EVIDENCE.md`: exact-SHA evidence template.
- `RECOVERY_RUNBOOK.md`: multi-plane rollback/restore procedure.
- `SECURITY_BOUNDARY_REVIEW.md`: authorization model and unresolved assurance risks.
- `QUALITY_GATES_REV3.md`: launch-gate cross-check.

Older audit counts, test counts, single-owner MCP instructions, `us-central1` references, and
package-version-only health evidence are historical and must not be reused.
