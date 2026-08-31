# Threadmap production readiness

**Decision basis reviewed:** 20 August 2026
**Current decision:** **NO-GO until every external/manual blocker below has dated evidence**

**Workflow state:** **PRODUCTION RELEASE UNAVAILABLE.** `.github/workflows/release.yml` has a failing
non-environment blocker job; the production-environment job depends on it and therefore cannot ask
for approval, receive secrets, or mutate anything. Replace that blocker only with an automated
true-staging Firebase and staging-configured Vercel job whose validated outputs feed a separate
production-environment job requesting human approval after the artifacts/results exist.

This is the authoritative launch gate. Repository controls can prove properties of a candidate
commit; they cannot prove console settings, contracts, account recovery, live data residency, or
that the candidate was actually promoted. The full 40-character commit SHA is the release
identity. Package/manifest version `0.1.0` is not deployment evidence.

## Release invariants enforced in code

- Production web promotion is manual. `vercel.json` disables automatic `main` deployment and pins
  Next.js compute to `fra1`.
- Firebase production is `orbit-9e0b6`; staging/default is `threadmap-staging-9e0b6`.
- Firebase Functions are pinned to `europe-west1`; the audit scans all app/Functions runtime
  sources for US or divergent region references.
- Production Firebase scripts require an explicit project/resource allowlist, full release SHA,
  exact clean `main` checkout, production confirmation, and passing environment preflight.
- The release workflow checks that the candidate is the exact requested SHA and an ancestor of
  `main`, verifies its Vercel organization/project link, builds once, stages without assigning
  domains, tests that artifact, and promotes only the verified URL. Every production release
  captures/verifies the currently live web SHA, deploys the compatible Firebase plane from the same
  candidate, then reruns health/identity/quota-secret/OAuth discovery probes against the old and
  staged web artifacts before promotion. Those probes are deliberately not described as proof of
  authenticated Firestore/callable/upload compatibility; matching-SHA true-staging evidence and
  protected review remain mandatory. There is no web-only production promotion path.
- `/api/health` is non-cacheable and reports readiness, full SHA, deployment metadata, runtime
  region, Firebase project/Functions origin, and only the names of missing configuration.
- Authenticated/private route families emit `X-Robots-Tag: noindex, nofollow, noarchive`; the
  marketing home, About, Privacy, Security, and Terms surfaces remain indexable.
- Service-worker caches and response bytes are keyed by release SHA while registration stays on
  stable `/sw.js`; foreground/network/hourly update checks can discover a new deployment. Worker
  and manifest responses are not immutable, and activation waits for explicit user consent.
- CI has independent app, Firebase Rules, Functions, and browser jobs. Browser coverage includes
  desktop Chromium, mobile Chromium, and mobile WebKit, moderate/serious/critical WCAG axe checks, keyboard
  access, route cold loads, overflow checks, and runtime error collection.
- Production Storage CORS is limited to `https://threadmap.app` and
  `https://www.threadmap.app`; localhost is isolated in `storage-cors.staging.json`. The release
  contract checks upload/cancellation methods and resumable-upload headers.
- Firestore/Storage Rules and authenticated Functions re-enforce uid ownership. Destructive item,
  attachment, account, OAuth, and upload paths have server-side lifecycle controls.

## GitHub production environment

Create a protected environment named `production` with required human reviewers, no self-approval
if the organization supports it, and restricted deployment branches (`main` only). Store these as
environment secrets, not repository variables or tracked files:

| Group | Required names |
| --- | --- |
| Vercel | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET` |
| Firebase web | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` |
| Server quota | `SCRAPE_RATE_LIMIT_SHARED_SECRET` |
| Google Workspace Secretary | GitHub variable `GOOGLE_WORKSPACE_CLIENT_ID`; Secret Manager values listed below |
| Private deployment/trust | `THREADMAP_DEPLOYMENT_MODE=private`, `NEXT_PUBLIC_THREADMAP_PRIVATE_MODE=true`, `LEGAL_CONTACT_EMAIL`, `SECURITY_CONTACT_EMAIL` |
| Firebase deploy | `FIREBASE_TOKEN` while the workflow still uses CLI token authentication |

The Firebase project id must be exactly `orbit-9e0b6`. The Vercel ids must link to the production
Threadmap project. Production preflight also requires the matching
`orbit-9e0b6.firebaseapp.com` Auth domain, `orbit-9e0b6.firebasestorage.app` bucket, and a Firebase
App id whose project number matches the messaging sender id. These syntactic/relational checks do
not prove that API, App Check, or VAPID keys belong to the project; verify those associations in the
provider consoles and staging/browser drill. The automation-bypass secret is required to test a
protected staged deployment; it must not be exposed to the browser or printed.

`FIREBASE_TOKEN` is a residual long-lived credential. Migrate the workflow to GitHub OIDC/Google
Workload Identity Federation with a narrowly scoped deploy principal. Until then, rotate the token,
restrict access to the protected environment, and audit each use.

## Firebase Functions configuration and secrets

Use `functions/.env.example` as the schema for non-secret configuration. Production must set:

```env
ENFORCE_APP_CHECK=true
THREADMAP_PRIVATE_MODE=true
MCP_ORIGIN=https://threadmap.app
MCP_ALLOW_LOOPBACK_REDIRECTS=false
MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read workspace.read offline_access
GOOGLE_WORKSPACE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
MCP_EXTRA_REDIRECT_URIS=
THREADMAP_APP_ORIGIN=https://threadmap.app
AUTH_EMAIL_FIREBASE_ACTION_HOSTS=orbit-9e0b6.firebaseapp.com,orbit-9e0b6.web.app
```

Firebase CLI deploys ordinary Functions variables from ignored local dotenv files. With an explicit
production project it loads `functions/.env` first and then
`functions/.env.orbit-9e0b6`. The protected workflow writes the project-specific file with mode
`0600`. Before any production Functions deploy, `scripts/guarded-firebase-deploy.mjs` resolves those
same files in the same order and requires the exact launch policy above. It reports only file/key
names, never dotenv values. A broad developer `.env` therefore cannot silently enable loopback,
write/delete scopes, extra callbacks, disabled App Check, or a non-production app/auth-email origin
in production; the project-specific file must override it exactly.

`MCP_EXTRA_REDIRECT_URIS` is deliberately empty for launch. A broader MCP scope or callback policy
requires a recorded product/security decision and a corresponding guard/policy change; editing an
ignored dotenv file alone must not widen production. Do not set obsolete `MCP_DISCOVERY_ORIGIN` or
`MCP_CONSENT_ORIGIN` values.

Secret Manager values used by the Functions surface include, as applicable:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
SCRAPE_RATE_LIMIT_SHARED_SECRET
MFA_RECOVERY_HMAC_KEY
RESEND_API_KEY
AUTH_EMAIL_HMAC_KEY
GOOGLE_WORKSPACE_CLIENT_SECRET
GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY
```

Verify the deployed Function definitions actually bind every required secret. Never treat an
example-file comment as proof a secret exists or is attached.

Before enabling `workspace.read`, verify the Gmail, Calendar, and Drive APIs, the Google OAuth
consent/test-user configuration, and the exact production callback
`https://threadmap.app/api/mcp/oauth/google/callback`. A real-host staging drill must prove connect,
read, disconnect/revocation, and post-disconnect denial without recording message or file content
in release evidence.

The shared Threadmap app origin and Firebase action hosts are a paired auth-email boundary.
`THREADMAP_APP_ORIGIN` also constrains attachment-upload initiation to the exact deployed web
origin; localhost and `127.0.0.1` are accepted only by the Functions emulator. Production uses the
two explicit values above (and receives the same safe defaults only when the Functions project id is exactly
`orbit-9e0b6`). Every other project fails closed unless both variables are present and valid. The
intended staging values are `https://staging.threadmap.app` and
`threadmap-staging-9e0b6.firebaseapp.com,threadmap-staging-9e0b6.web.app`; they are configuration intent, not
evidence that the staging origin/DNS exists. The example also keeps `MCP_ORIGIN` on that staging
origin. Staging must reject production Firebase action links and must never advertise the
production OAuth issuer/resource.

`RESEND_API_KEY` and `AUTH_EMAIL_HMAC_KEY` are launch prerequisites for the authentication-email
Function. Static health intentionally cannot prove sender-domain DNS, Secret Manager binding, inbox
delivery, or link behavior, and the automated production verifier must not send real email. Before
approval, the exact-SHA staging drill must use a disposable address to prove passwordless email-link
delivery, a `threadmap.app` landing URL, one-time consumption, expiry, enumeration-safe
responses, and provider suppression/bounce handling. Retain redacted headers and timestamps; never
store the delivered credential-bearing link in public evidence.

The launch client intentionally offers only Google and inbox-verified email-link authentication;
password signup/sign-in is not a launch surface. In both staging and production, enable email-link
authentication, disable Email/Password password authentication, enable Identity Platform email
enumeration protection, and enforce the approved App Check/reCAPTCHA abuse controls. Release
evidence must show that a direct public password `signUp` request is refused, an unused address
cannot receive a workspace session until its email link is opened, and existing email-link accounts
remain usable. This external provider configuration is mandatory because hiding an `EMAIL_EXISTS`
message in the UI cannot remove the underlying public signup oracle.

The sending identity is `sign-in@auth.threadmap.app` and the code sets `support@threadmap.app` as
Reply-To. Launch requires fresh DNS/dashboard proof for the `auth.threadmap.app` DKIM selector, its
custom MAIL FROM SPF/MX records, DMARC alignment/reporting, and a human-monitored support mailbox
with tested reply routing and an incident owner. DMARC must progress from monitored `p=none` toward
an approved quarantine/reject policy only after reviewing reports; the rollout decision and date
belong in release evidence.

The repository currently has no signature-verified Resend delivery-event webhook or local
suppression consumer. This is a NO-GO until release authority either (a) accepts and proves Resend's
provider-native hard-bounce/complaint suppression, dashboard alerting, retention, and named owner,
or (b) ships an idempotent verified webhook plus suppression/list-hygiene store and runbook. Initial
alerts must be configured and drill-tested for bounce rate above 2%, complaint rate above 0.05%,
five consecutive provider/API failures, and sustained accepted-to-delivered latency above two
minutes; low-volume single complaints and hard bounces still require review and suppression.

Capture Resend dashboard evidence that open and click tracking remain disabled for the
`auth.threadmap.app` transactional stream and that sent-email retention is 30 days. Record the
provider's actual data topology: sending executes in `eu-west-1`, while Resend account/email
metadata remains in the United States. The DPA, current subprocessor list, transfer mechanism,
privacy disclosure, and retention/legal basis therefore need explicit privacy/legal approval;
European send infrastructure alone is not an EU-residency claim. Test the real templates through
the organization's link scanners/security gateway and prove automated inspection neither consumes
one-time sign-in/reset state nor rewrites the landing outside `threadmap.app`.

## Automated candidate gates

Normal pull requests run the secret-free contract and do not need production credentials:

```bash
npm ci
npm run release:contract
npm run audit:regions
npm run audit:licenses
npm run lint
npm run typecheck
npm test
npm run test:rules
npm run build
(cd functions && npm ci && npm test)
npm run test:e2e
```

The retained downstream workflow steps describe these gates but are intentionally unreachable
behind the topology blocker. After the required two-job design exists, it must run `npm audit` at
high severity for app and Functions, confirm required secrets, validate `.vercel/project.json`, and
test the staged production artifact. A green historical run is not evidence for a new SHA.

The future true-staging job must use the explicit staging verifier profile. It accepts only
`staging.threadmap.app` or a deployment hostname belonging to this Vercel project, requires the
staging Firebase project, preview runtime identity, App Check configuration, `fra1`, the quota
cross-plane probe, and MCP discovery bound to the verified staging target:

```bash
npm run release:verify -- \
  --environment staging \
  --url <https-staging-url> \
  --sha <full-sha>
```

That static verifier support does not create a staging project, DNS name, secret set, authenticated
test account, or evidence store. The production workflow remains fail-closed until an upstream job
actually deploys and exercises those resources.

The staged and final production targets must use the default production profile and both pass:

```bash
npm run release:verify -- --url <https-staged-url> --sha <full-sha>
npm run release:verify -- --url https://threadmap.app --sha <full-sha>
```

Run those commands only in a protected environment where
`SCRAPE_RATE_LIMIT_SHARED_SECRET` is supplied as an environment secret, never as a CLI argument or
log value. The verifier sends an exact-schema request with that secret and deliberately invalid App
Check/bearer credentials; exact `401 invalid_app_check` proves shared-secret agreement and
production App Check ordering without consuming user quota. If a Vercel protection-bypass secret
is used, `THREADMAP_VERCEL_BYPASS_ORIGIN` must equal the one verified HTTPS origin exactly; this
prevents the header from following cross-origin probes or being sent to an arbitrary target.

The production verifier accepts only `threadmap.app` or a deployment hostname belonging to this
Vercel project. It requires ready health, exact SHA, a production Vercel runtime with a deployment
URL, configured App Check, Firebase project `orbit-9e0b6`, Firebase Functions region
`europe-west1`, configured and executing Vercel region `fra1`, an HTTP contract probe of the quota
Function, and working MCP OAuth discovery at the canonical production origin.

## Operational observability evidence

Repository health metadata is a probe target, not an observability system. Before launch, record a
named primary and backup operator and prove they can access Vercel build/runtime logs and Firebase
Functions logs without sharing personal credentials. Choose and evidence at least one durable error
path: a tested Vercel log/trace drain with raw-body signature verification, or a privacy-reviewed
error-monitoring integration with source maps, release SHA tagging, redaction, retention, and alert
ownership. On a plan without drains, document the bounded Vercel CLI/dashboard log procedure and
its shorter retention/continuity limitations. An untested or errored drain is not evidence.

Production logs must carry request/deployment correlation identifiers and durations where useful,
but must not contain bearer tokens, App Check values, scrape-shared secrets, OAuth codes, email
action links, user-entered product lookup terms/URLs, item contents, or full user identifiers.
Configure a multi-location synthetic check of `/api/health` that requires `200`, `no-store`,
readiness `ready`, the approved SHA, and `fra1`; separately alert on elevated web/Functions 5xx,
timeouts, quota denials, and budget anomalies. Exercise delivery and acknowledgement to the named
after-hours owner.

After staged verification and again after promotion, perform a bounded runtime-error scan and
retain the query window/result with the release record. Observe the promoted alias for at least 60
minutes or the approved traffic-based window before declaring the release stable. Establish
real-user performance baselines (or an approved privacy-preserving equivalent) for LCP under 2.5 s,
INP under 200 ms, CLS under 0.1, and TTFB under 800 ms; threshold changes require measured traffic and
a recorded owner. Do not add client analytics/error capture until privacy, consent, field
redaction, retention, and international-transfer impacts are approved.

## Manual launch blockers

All checkboxes require an owner, timestamp, and evidence link in `RELEASE_DRILL_EVIDENCE.md`.

- [ ] Upgrade/confirm Vercel on an approved paid organizational plan that supports the configured
  runtime region and required security/continuity controls.
- [ ] Confirm Vercel's production project has `main` Git auto-deploy disabled in live settings.
  Repository configuration is intent, not proof it has taken effect; the first deployment of this
  change needs special care because older settings may still auto-promote it.
- [ ] Configure and test the protected GitHub `production` environment, reviewer path, secret
  availability, concurrency behavior, and branch restriction.
- [ ] Deploy the exact candidate SHA to `threadmap-staging-9e0b6` with a staging-configured web
  artifact and exercise authenticated sign-in/read/write/upload/MCP-revoke plus old/new contract
  compatibility. Store immutable evidence; the staged production Vercel URL is not a true staging
  backend test. Replace the workflow's explicit blocker only when this is an automated upstream job
  whose validated outputs feed a separate post-evidence production approval/deploy job. Assign a
  stable reviewed HTTPS staging origin and add only that exact origin to staging Storage CORS;
  localhost-only CORS cannot validate the hosted upload flow and wildcard Vercel origins are banned.
- [ ] Keep the private owner claim limited to the intended account and working legal/security
  mailboxes. Before offering public registration, switch to public mode and record the real
  controller/legal identity and postal address, plus appropriate review of Privacy/Terms, lawful
  bases, retention, age policy, and translations.
- [ ] Execute/file Google/Firebase and Vercel DPAs/SCCs and maintain a current subprocessor/data-flow
  register. Confirm EU residency/transfer claims with contracts, not only configured regions.
- [ ] Enable phishing-resistant MFA and preserve recovery codes for GitHub, Google/Firebase,
  Vercel, DNS/registrar, and email. Add and test a second recovery-capable human owner.
- [ ] Verify production App Check registration and enforcement for every claimed product. Prove an
  allowed browser succeeds and a tokenless protected request fails. Avoid enabling enforcement
  before healthy verified traffic exists.
- [ ] Verify Firestore delete protection, PITR/backups, backup retention, restore permissions, and
  a staging restore drill using synthetic data.
- [ ] Apply `storage-cors.json` to the exact production bucket and inspect the live policy. Confirm
  uploads, downloads, and resumable-upload cancellation (`DELETE`) from `threadmap.app`, and denial
  from an unapproved origin.
- [ ] Run two-account negative isolation tests for Firestore, Storage, exports, attachments, MCP,
  push device state, and account deletion using disposable production-like accounts.
- [ ] Test Chrome desktop, Android-class Chromium, and real iOS Safari/PWA: cold start, install,
  offline navigation, update prompt, unsaved draft preservation, accepted update, and no reload loop.
- [ ] Prove `RESEND_API_KEY` and `AUTH_EMAIL_HMAC_KEY` are bound to the exact staging/production
  auth-email Functions and verify `auth.threadmap.app` DKIM, custom MAIL FROM SPF/MX, DMARC
  alignment/reporting, and the approved enforcement-progression owner.
- [ ] With a disposable staging address, test passwordless sign-in delivery, link landing on
  `threadmap.app`, one-time consumption, expiry, enumeration-safe unknown-account behavior, and
  bounce/suppression recovery. Record redacted evidence; do not automate production sends.
- [ ] Prove Email/Password password authentication is disabled, email-link and Google sign-in are
  enabled, email enumeration protection and approved abuse controls are active, direct password
  signup is refused, and no unused address gains a session before inbox verification.
- [ ] Prove `support@threadmap.app` replies reach a monitored human and record response/escalation
  ownership. Approve provider-native Resend suppression with dashboard evidence or implement a
  signature-verified idempotent event consumer; drill the documented bounce, complaint, failure,
  and delivery-latency alerts.
- [ ] Record Resend dashboard proof of disabled open/click tracking, 30-day sent-email retention,
  `eu-west-1` sending, and US account/email metadata; approve its DPA, subprocessors, international
  transfer mechanism, privacy text, and retention basis.
- [ ] Send the real staged sign-in/reset templates through the deployed mail security/link-scanner
  path and prove scans do not consume one-time state, break expiry, or redirect outside
  `threadmap.app`.
- [ ] Test Google Calendar connect/sync/conflict/disconnect, push delivery with the app closed,
  attachment lifecycle, export, deletion, and cleanup completion.
- [ ] Test Google Workspace Secretary connect, Gmail/Calendar/Drive bounded reads, disconnect,
  provider revocation, post-disconnect denial, encrypted-token deletion/export exclusion, and one
  prompt-injection sample per provider source without retaining private content in evidence.
- [ ] Connect at least one real MCP host, review consent scopes, execute each enabled capability,
  revoke in Settings, and prove the old token is rejected without affecting a second user.
- [ ] Prove a durable error-monitoring path (healthy signed drain or approved integration),
  multi-location exact-SHA `/api/health` synthetic, runtime-error scan procedure, and Core Web
  Vitals baseline. Deliver uptime/5xx/timeout/security/budget alerts to a human, acknowledge them,
  and record escalation and after-hours ownership.
- [ ] Complete a staged deployment and production rollback rehearsal with the exact-SHA health gate.
- [ ] Obtain independent security/tenant-boundary review and explicit release-authority sign-off.

## Residual technical and operational risks

- **Observed live-region blocker (20 August 2026):** production deployment
  `dpl_Atuf64Khy9x3pSW1vrTSzEH1YHfs` was Ready, but its Functions inspected in `iad1` and the live
  health response carried `x-vercel-id: cdg1::iad1::...`. The repository's `fra1` setting is only
  candidate intent until a new exact-SHA release is promoted. Production therefore remains in a US
  compute region and remains a release blocker; `release:verify` must reject the candidate unless
  `/api/health` reports `runtime.region === "fra1"` on both the staged URL and final alias.
- Firebase Functions do not expose an independent artifact-SHA endpoint. The release workflow can
  prove the web artifact SHA and Firebase target/reachability, but not that every live Function was
  built from the same commit. Add signed Functions build metadata or a protected version endpoint.
- The staged workflow can deploy Firebase before Vercel promotion. Backend changes therefore must
  remain compatible with both the old production web client and the staged candidate throughout
  the transition and rollback window. The workflow tests both after the mandatory backend deploy;
  a failure blocks promotion and requires an explicit backend recovery decision.
- Automated axe checks cover moderate/serious/critical machine-detectable WCAG violations, not keyboard
  semantics, screen-reader quality, zoom/reflow, cognitive load, or real assistive-technology use.
- Runtime health proves configuration presence, not validity of every credential or provider
  control. Manual end-to-end probes remain mandatory.
- Client error telemetry requires a privacy-reviewed provider, redaction policy, retention period,
  and alert ownership before sensitive browser data is collected.
- Rate-limit/WAF thresholds require measured representative traffic and a tested 429 policy; do not
  switch from observation to blocking blindly.

## Go/no-go rule

Release only when the candidate workflow is green for the exact SHA, every manual blocker has
current evidence, rollback ownership is online, and the designated release authority records GO.
Any SHA change invalidates artifact-specific browser, health, and staged-runtime evidence.
