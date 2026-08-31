# Deploy Firebase Storage rules

Storage access has two independent controls:

- `storage.rules` authorizes object access.
- `storage-cors*.json` controls which browser origins may make bucket requests.

Deploying one does not deploy or verify the other.

## Current rule boundary

- The caller must be authenticated, own the `{userId}` path, and have no account-deletion tombstone.
- Existing legacy one-segment attachment paths are owner-readable but never writable.
- Current intent-scoped paths are owner-readable, but raw Firebase SDK writes are also denied.
- New uploads use a server-created resumable session after server-side ownership, quota, MIME, and
  size validation.
- Every unmatched path denies reads and writes.

The old documentation described a 10 MB/type allowlist inside Storage Rules and broad access for
any authenticated user. That is no longer the implementation. Limits and upload authorization are
enforced by the server workflow; Storage Rules keep direct writes closed.

## Verify before deployment

Use Java 21 for the emulator suite:

```bash
npm ci
npm run release:contract
npm run test:rules
```

Do not treat skipped emulator tests as a pass.

## Deploy rules to staging

The checked-in bundle deploys Firestore rules/indexes and Storage Rules together so their lifecycle
contract cannot drift:

```bash
npm run deploy:rules:staging
```

The target is explicitly `threadmap-staging-9e0b6` even though staging is also the default alias.

## Deploy rules to production

Ordinary production release remains blocked pending the true-staging workflow in
`PRODUCTION_READINESS.md`. For an authorized incident recovery only:

```bash
export THREADMAP_RELEASE_SHA=<full-40-character-main-commit>
export THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=orbit-9e0b6
npm run deploy:rules:production
```

The guard requires the exact clean `main` commit, production configuration, explicit project, and
an allowlisted resource set. Do not publish in the Firebase Console or run bare `firebase deploy`.

## Configure and verify CORS separately

Staging uses `storage-cors.staging.json`; production uses `storage-cors.json` and contains only the
approved `threadmap.app` origins. The script validates bucket ownership, applies the selected file,
reads the live policy back, and compares it semantically:

```bash
# Staging
npm run release:contract
./scripts/setup-storage-cors.sh threadmap-staging-9e0b6

# Authorized production recovery only; use the same guard variables as above
./scripts/setup-storage-cors.sh orbit-9e0b6
```

The CORS operation requires an authenticated `gcloud` CLI. Never add wildcard or localhost origins
to the production policy.

## Post-deploy tests

With disposable accounts and synthetic files, retain evidence that:

1. An owner can upload through a server-issued session and then download the object.
2. Direct SDK writes, unauthenticated access, cross-user access, and unapproved origins fail.
3. Oversized/disallowed uploads fail at the server boundary.
4. Resumable upload cancellation (`DELETE`) succeeds from an approved origin.
5. Item deletion, upload cancellation, account deletion, and scheduled cleanup remove or reconcile
   objects without leaving a readable orphan.
6. The live CORS policy exactly matches the intended environment file.

See `STORAGE_CORS_SETUP.md`, `PRODUCTION_READINESS.md`, and `RECOVERY_RUNBOOK.md` for the complete
operational gates.
