# Security hardening status

Updated: 2026-08-13

## Dependency and CI remediation

- The open GitHub development alert is `GHSA-w5hq-g745-h8pq` in `uuid`, reached through `firebase-tools -> gaxios`.
- `firebase-tools` is already at the latest available release (`15.26.0`). Downgrading to the audit-suggested `14.23.0` was rejected because that version introduces a critical `tar` advisory and two moderate advisories.
- The vulnerable `gaxios@6.7.1` edge is constrained to `uuid@11.1.1`, the first patched release. This keeps the current Firebase CLI while removing the active Dependabot finding.
- GitHub Actions now use the supported majors `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/setup-java@v5`.

## MFA recovery security model

- Ten independent 80-bit recovery codes are generated with cryptographic randomness.
- Plaintext codes are returned exactly once. Firestore stores only HMAC-SHA-256 digests under a Secret Manager key.
- Generating or rotating a set requires a recently authenticated account with an enrolled second factor. Rotation invalidates the previous set atomically.
- Recovery attempts are limited to eight per source address per 15-minute window and are additionally protected by Firebase App Check when enforcement is enabled.
- A code is transactionally claimed before use. Successful recovery clears enrolled second factors, revokes refresh tokens, deletes the entire code set, and records a content-free audit event.
- Recovery never issues a login token. The user must repeat their primary sign-in after the second factor is removed.
- The remaining operational gap is an out-of-band security notification after recovery; Threadmap does not yet have a verified transactional-email channel.

## WAF analysis and recommendation

- Live rule: `Observe API bursts`, path prefix `/api/`, fixed 60-second window, source key `IP`, threshold `120`, action `log`.
- The rule is valid and live. There is no unpublished firewall draft.
- Historical rule metrics cannot be queried on the current Vercel Hobby plan because Observability Plus requires Pro or Enterprise.
- Do not switch this rule to blocking without traffic evidence. Vercel's safe sequence is log, observe legitimate matches, then enforce.
- Provisional future enforcement ceiling: return `429` at `300 requests/minute/IP` for `/api/` with a one-minute action window, but only after at least seven representative days show legitimate peak traffic below 60 requests/minute/IP and shared-network users do not trigger the rule.
- The current `120 requests/minute/IP` log rule should remain unchanged until that evidence exists. No production WAF change was published by this work.

## Legacy API-key audit

Keys reviewed:

- `OrbitApiKey` (`2ef1628b-f961-489a-b218-e5261e6188c1`)
- `API-Schlussel 2` (`390f6c18-2b84-4ebf-8af2-fd38a7c56d42`)

Evidence:

- Neither key matches the production Firebase web-app configuration.
- Neither key matches any Vercel production, preview, or development environment value.
- Neither key appears in the repository outside excluded generated/dependency paths.
- Neither key is represented by a GitHub Actions secret name.
- The active Firebase browser key is a different key and already has both browser-referrer and API-service restrictions.

Decision:

- The consumers of the two legacy keys are not provably understood. Restricting or deleting them could break an unrelated historical client, so no availability-affecting change was made.
- Manual sign-off remains: inspect each key's 30-day API usage in Google Cloud Metrics Explorer, disable one key at a time, observe a rollback window, then delete it if no owned workload fails.

## Automated staging drills

Run the destructive data and MFA drills only against `threadmap-staging-9e0b6`:

```bash
THREADMAP_STAGING_FIREBASE_API_KEY='staging-browser-key' \
GCLOUD_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
  node functions/scripts/staging-release-drill.mjs
```

The runner refuses every other project ID. It creates disposable users and verifies tenant-isolated export, account deletion, representative operator restore, digest-only MFA recovery storage, second-factor removal, session revocation, and rejection of code reuse. It cleans up drill users in a `finally` block.

## Manual sign-offs remaining

- Review at least seven representative days of WAF matches after production traffic metrics become available.
- Review Google Cloud per-credential usage before disabling either unidentified legacy key.
- Verify the transactional security-notification email once a mail channel exists.
- Have an independent engineer review the recovery threat model and tenant boundary evidence.
