# Deploy Firestore and Storage rules

This repository treats rules and indexes as release artifacts. Do not paste rules into the Firebase
Console and do not run an unqualified `firebase deploy`: both paths bypass the repository target,
commit, test, and production-readiness controls.

The rules deployment bundle is:

- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

## Verify the candidate first

Use the repository-pinned Node/npm toolchain and Java 21:

```bash
npm ci
npm run release:contract
npm run test:rules
```

`test:rules` must execute the Firestore and Storage emulator suite. A root unit-test run that reports
those tests as skipped is not equivalent evidence.

## Staging

The default Firebase alias is staging, but the command still names the project explicitly:

```bash
npm run deploy:rules:staging
```

This deploys the three artifacts above to `threadmap-staging-9e0b6`. After deployment, exercise the
authenticated read/write, revision-conflict, parent-link, server-orchestrated delete, upload, and
account-deletion boundaries with disposable staging accounts. Preserve the command log, timestamp,
source SHA, project id, and test evidence.

## Production

The normal production release is intentionally unavailable until the true-staging topology and
post-evidence approval workflow described in `PRODUCTION_READINESS.md` exist. Do not bypass that
blocker for an ordinary release.

An authorized incident recovery must use a clean `main` checkout at the exact reviewed SHA, satisfy
the complete production preflight, and set both guard values:

```bash
export THREADMAP_RELEASE_SHA=<full-40-character-main-commit>
export THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=orbit-9e0b6
npm run deploy:rules:production
```

The wrapper accepts only `orbit-9e0b6`, only the allowlisted rule/index resources, and only the exact
clean release commit. It does not replace protected-environment approval, a compatibility review,
or a rollback plan.

## Current security model

- Account-deletion tombstones deny owner access before delayed cleanup completes.
- Item and tool records validate ownership, allowed fields, bounded payloads, and monotonic
  revisions; item deletion is server-orchestrated.
- Client attachment arrays cannot add or remove files directly.
- Analytics writes are closed. Historical analytics remain server-only for export/deletion.
- OAuth, upload-intent, audit, deletion, export, and other privileged collections are server-only.
- Storage objects are owner-readable, but raw browser writes are closed; uploads use a
  server-authorized resumable session.

The rules are one layer of the boundary. Cloud Functions must independently enforce ownership,
quotas, lifecycle state, and mutation policy.

## Post-deploy evidence

Record and verify all of the following before calling the change complete:

1. The exact Firebase project and source SHA.
2. Emulator test counts with no skipped rules suite.
3. The Firebase deployment/release identifier and completion time.
4. Positive owner access and negative cross-user/unauthenticated tests.
5. Old and new web-client compatibility for any changed schema or lifecycle behavior.
6. Production health and critical-flow checks if this was an approved recovery.

See `RECOVERY_RUNBOOK.md` for rollback constraints. Reverting rules can restore availability while
reopening a security flaw, so production rollback requires explicit security review.
