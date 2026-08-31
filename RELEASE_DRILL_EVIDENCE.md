# Release drill evidence

**Status:** no current production-release evidence is recorded for the working tree reviewed on
20 August 2026. Earlier dated drills are historical context only and cannot authorize a different
commit.

Use this file (or an immutable linked evidence system) for the next release. Do not mark a row PASS
without a timestamp, operator, exact artifact identity, and durable evidence link. The full
40-character Git SHA is authoritative; `0.1.0` is only the product version.

## Observed production baseline before this candidate

On 20 August 2026, live deployment `dpl_Atuf64Khy9x3pSW1vrTSzEH1YHfs` was Ready but Vercel inspect
placed its Functions in `iad1`; the production response also included
`x-vercel-id: cdg1::iad1::...`. This is evidence of the pre-candidate baseline, not a PASS for the
working tree. Do not mark regional placement complete until the staged candidate and final alias
both pass `release:verify` with health `runtime.region` equal to `fra1`.

Live DNS inspection on 20 August 2026 observed a DKIM key at
`resend._domainkey.auth.threadmap.app`, custom MAIL FROM MX/SPF at `send.auth.threadmap.app`
pointing to Amazon SES EU infrastructure, and strict-alignment DMARC at
`_dmarc.auth.threadmap.app` with monitoring policy `p=none`; the parent DMARC record was also
monitor-only with aggregate reports directed to the security mailbox. This is time-bound baseline
evidence, not proof of continued DNS state, sender verification, mailbox monitoring, suppression,
delivery, or DMARC enforcement. Re-query and retain redacted provider/DNS evidence for the release.

## Candidate identity

| Field | Required value |
| --- | --- |
| Release decision | PENDING / GO / NO-GO |
| Full commit SHA | PENDING |
| GitHub release workflow run | PENDING |
| Matching-SHA true-staging evidence URL | PENDING; must be validated by the future upstream staging job |
| Staging verifier profile/result | PENDING; `--environment staging`, exact SHA/project/origin |
| Staging Firebase project | `threadmap-staging-9e0b6` |
| Approver(s) | PENDING |
| Staged Vercel URL | PENDING |
| Staged deployment id | PENDING |
| Production alias URL | `https://threadmap.app` |
| Firebase project | `orbit-9e0b6` |
| Firebase Functions region | `europe-west1` |
| Vercel configured/executing region | `fra1` / PENDING |
| Firebase plane deployed? | PENDING, with resource list |
| Start/end time and timezone | PENDING |

Attach raw `/api/health` responses for true staging, the staged production artifact, and the final
alias. They must be non-cacheable and show the exact SHA, readiness `ready`, expected environment
and Firebase project, and actual/configured regions. Record response headers including
`Cache-Control`, `X-Threadmap-Release`, and `X-Threadmap-Readiness`. The staging record must also
retain the explicit `--environment staging` verifier invocation; a production-profile probe pointed
at a different Firebase project is not staging evidence.

## Automated gates for the exact SHA

| Gate | Result | Evidence |
| --- | --- | --- |
| Candidate is exact SHA and ancestor of `main` | PENDING | workflow step link |
| Protected environment approval | PENDING | GitHub deployment record |
| Release contract / production preflight | PENDING | workflow logs |
| Region audit | PENDING | workflow logs |
| License and high-severity dependency audits | PENDING | workflow logs/artifact |
| ESLint and TypeScript | PENDING | workflow logs |
| App unit tests | PENDING | report; record executed/skipped counts |
| Firebase Rules emulator tests | PENDING | report; skipped tests are not PASS |
| Functions build/tests | PENDING | report |
| True staging Firebase + staging-configured web authenticated drill | PENDING | immutable evidence URL supplied to workflow |
| Next.js production build | PENDING | build log and deployment id |
| Desktop Chromium cold-load + axe + keyboard | PENDING | Playwright report |
| Mobile Chromium cold-load + axe + keyboard | PENDING | Playwright report |
| Mobile WebKit cold-load + axe + keyboard | PENDING | Playwright report |
| Staged exact-SHA runtime verification | PENDING | verifier log and health JSON |
| Post-Firebase staged verification, if deployed | PENDING / N/A | verifier log |
| Final production exact-SHA verification | PENDING | verifier log and health JSON |
| Post-promotion bounded runtime-error scan | PENDING | redacted query window/result |

Playwright output lives under ignored `.vercel/` paths during CI so evidence generation does not
invalidate the guarded clean-tree check. The workflows upload reports automatically; copy or link
the production report into the durable release record before its 30-day retention expires.

## Human end-to-end sign-off

Use disposable accounts and synthetic data. Record account ids only in the restricted evidence
system, not in this public repository.

| Flow | Required proof | Result |
| --- | --- | --- |
| Two-user isolation | cross-user Firestore/Storage/MCP/export attempts denied | PENDING |
| Auth and MFA | enroll, challenge, recovery code, consumed-code denial, second-device recovery | PENDING |
| Auth email delivery | staged disposable sign-in/reset; threadmap.app landing; one-time/expiry; enumeration and suppression behavior | PENDING |
| Shared app/auth-email origin boundary | staging app origin/action hosts configured together; staging rejects production action links and production-origin upload initiation; production uses threadmap.app + orbit hosts | PENDING |
| Email domain and Reply-To | auth.threadmap.app DKIM + MAIL FROM SPF/MX + DMARC; support@ reply reaches named human | PENDING |
| Email events and alerts | provider-native suppression approval or verified webhook; bounce/complaint/API/latency drill | PENDING |
| Email privacy/provider controls | tracking off; 30d retention; eu-west-1 send + US metadata; DPA/subprocessors/transfers approved | PENDING |
| Email link scanner | real staged templates survive enterprise scanner and retain one-time/expiry/threadmap.app behavior | PENDING |
| Data synchronization | create/edit conflict, offline queue, reconnect, no silent loss/duplication | PENDING |
| Attachments | upload, download, delete/cancel, owner isolation, cleanup completion | PENDING |
| Storage CORS | production origins succeed; localhost/unapproved origin denied | PENDING |
| Calendar | connect, sync, recurrence/conflict behavior, disconnect/revoke | PENDING |
| Notifications | foreground/background/closed-app delivery and stale-device cleanup | PENDING |
| MCP | real host registration/consent/use/revoke; old token denied; second user unaffected | PENDING |
| Account export/deletion | complete export, durable deletion, delayed cleanup, tombstone denial | PENDING |
| Desktop accessibility | keyboard, focus, zoom/reflow, screen reader critical paths | PENDING |
| iOS PWA | install, cold load, offline, safe areas, update prompt, saved-draft preservation | PENDING |
| Android PWA | install, cold load, offline, update prompt, notification flow | PENDING |
| Legal/support mail | privacy/security inbox delivery and ownership acknowledgement | PENDING |
| Alerts | uptime/5xx/security/budget signal received and acknowledged | PENDING |
| Observability path | signed healthy drain or approved integration; two operators; redaction/retention proof | PENDING |
| Synthetic health | multi-location no-store/ready/exact-SHA/fra1 failure and recovery | PENDING |
| Performance baseline | LCP/INP/CLS/TTFB evidence and alert owner | PENDING |

## Staged promotion record

Record the exact commands/steps or link the protected workflow log:

1. The protected reviewer inspected the matching-SHA true-staging evidence URL before approving
   any production Firebase mutation.
2. `vercel pull` linked the expected organization and project.
3. One production artifact was built for the candidate SHA.
4. `vercel deploy --prebuilt --prod --skip-domain` created the staged URL without moving domains.
5. Browser and runtime checks passed against that exact URL.
6. Before the mandatory Firebase deployment, the workflow captured and fully verified the currently
   live web SHA; the deployment named the production project and exact resources from the same
   candidate.
7. Both the previous live web SHA and staged candidate passed the shallow automated release probes
   after Firebase changes; authenticated compatibility evidence remains the separate true-staging
   record above.
8. `vercel promote` moved the already-tested artifact.
9. `threadmap.app` returned the exact SHA and ready status.
10. A bounded post-promotion log/error scan and observation window found no unresolved release
    regression; the query window and redacted result are attached.

## Rollback rehearsal

| Field | Required evidence |
| --- | --- |
| Trigger and decision owner | PENDING |
| Known-good full SHA/deployment id | PENDING |
| Candidate full SHA/deployment id | PENDING |
| Vercel rollback start/end | PENDING |
| Restored production health JSON | PENDING |
| Firebase compatibility decision | PENDING |
| Data migration/restore decision | PENDING |
| Service-worker behavior after rollback | PENDING |
| Alert/status/customer communication | PENDING |
| Post-rollback observation window | PENDING |

The rollback passes only when the production alias reports the known-good SHA, critical user flows
work, old/new service-worker clients remain safe, and no incompatible Firebase schema or Function
change prevents the restored web artifact from operating.

## External control evidence

Attach current screenshots/exports for Vercel plan/project/auto-deploy settings, GitHub production
environment protection, Firebase App Check enforcement, Functions regions, Storage CORS, Firestore
PITR/backups, IAM owners/MFA recovery, Resend sender-domain DNS plus Secret Manager bindings,
redacted staged disposable-address delivery, tracking/retention/region dashboard settings, link-
scanner results, processor agreements, Vercel drain/integration health and retention, synthetic
monitor state, performance baseline, post-promotion error scan, and the final release-authority
decision. Redact tokens, keys, email action links, personal account ids, and recovery material.

## Historical evidence policy

Prior staging data/MFA drills and disposable Vercel alias rollback rehearsals may demonstrate that a
procedure once worked. They do not prove the current code, live settings, exact artifact, provider
plan, or operator access. Preserve those records separately with their original timestamps and
SHAs; never copy their PASS labels into a new release row.
