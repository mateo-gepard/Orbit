# Release drill evidence

Executed: 2026-08-13 (Europe/Madrid)

## Automated data and MFA drill

Environment: Firebase staging project `threadmap-staging-9e0b6`

Result: PASS

| Drill | Result | Evidence |
| --- | --- | --- |
| Tenant-isolated export | PASS | Export returned the disposable owner's seeded item and did not contain the foreign tenant marker. |
| Account deletion | PASS | The Auth user and all queried owner-scoped/direct documents were absent; the durable job completed inline with `pending: false`. |
| Operator recovery | PASS | A representative item and settings snapshot were restored to a fresh disposable account and exported successfully. |
| Real TOTP recovery | PASS | A real RFC 6238 TOTP factor was enrolled through Identity Platform before recovery. |
| Digest-only storage | PASS | Ten recovery documents existed and none contained any returned plaintext code. |
| One-time use | PASS | Recovery removed the TOTP factor, deleted the complete code set, and a second use of the consumed code was rejected. |
| Cleanup | PASS | Disposable drill accounts are deleted in the runner's `finally` path; stale `release-drill-*` accounts are removed at the start of every run. |

Machine result timestamp: `2026-08-12T23:01:47.412Z`

## Rollback rehearsal

Environment: Vercel protected non-production alias `orbit-security-drill.vercel.app`

Result: PASS

| Stage | Deployment | Health result |
| --- | --- | --- |
| Baseline | `orbit-hp5klowi8-mateos-projects-c394726f.vercel.app` | `status=ok`, `service=threadmap`, `version=0.1.0` |
| Candidate | `orbit-2lvmm45bi-mateos-projects-c394726f.vercel.app` | `status=ok`, `service=threadmap`, `version=0.1.0` |
| Rollback | `orbit-hp5klowi8-mateos-projects-c394726f.vercel.app` | `status=ok`, `service=threadmap`, `version=0.1.0` |

The rehearsal changed only the disposable alias. `threadmap.app` was never reassigned. The alias was restored to the known-good production artifact after the candidate check.

## Validation gates

| Gate | Result |
| --- | --- |
| TypeScript application check | PASS |
| Functions TypeScript build | PASS |
| Changed-file ESLint | PASS |
| Next.js production build | PASS |
| Application unit tests | PASS: 461 passed, 19 emulator-only tests skipped in this command |
| Firestore and Storage rules tests | PASS: 19 passed |
| Functions tests | PASS: 49 passed |
| Active `uuid` Dependabot advisory in lock graph | PASS: removed |
| Production dependency audits | PASS: application and Functions report zero production findings |
| Production environment preflight | PASS with explicit pre-release legal values; real operator identity remains an owner/legal gate |

The repository-wide normal lint command passes with ten pre-existing warnings outside this change. This change adds no lint warnings.

## Manual sign-offs still required

- WAF blocking remains disabled because historical per-rule metrics are unavailable on the current Vercel plan. Review at least seven representative days before enforcement.
- The two unidentified legacy Google API keys remain unchanged because no owned consumer could be proven. Review per-credential Metrics Explorer traffic before a disable/delete canary.
- The transactional email channel is verified; implementing and validating the MFA-recovery security notification remains open.
- An independent engineer should review tenant boundaries and the MFA recovery threat model before formal release.
