# Firebase Storage CORS operations

Threadmap has two explicit policies:

| File | Project/bucket | Allowed origins |
| --- | --- | --- |
| `storage-cors.staging.json` | `threadmap-staging-9e0b6` | `https://staging.threadmap.app` plus local development origins |
| `storage-cors.json` | `orbit-9e0b6` | `https://threadmap.app`, `https://www.threadmap.app` only |

Do not merge localhost, preview, or legacy Vercel domains into the production policy. The stable
staging origin remains a release gate until DNS, ownership, and lifecycle are independently proven.

Both policies permit `GET`, `HEAD`, `POST`, `PUT`, and `DELETE`, including resumable-upload start,
transfer, read, and cancellation. `OPTIONS` is the browser preflight and is not a valid configured
Cloud Storage CORS method. Required request/response headers include authorization, content/range,
ETag, `x-goog-resumable`, and the Threadmap upload-id metadata header.

## Prerequisites

- Google Cloud CLI authenticated as an approved operator.
- Access to the exact intended project and bucket.
- For production: clean reviewed `main` checkout, exact full release SHA, production preflight
  values, explicit confirmation, change approval, rollback owner, and evidence record.

The script uses a fixed project-to-bucket map, verifies the bucket exists under the explicit
project, chooses the matching policy, applies it, reads the live bucket back, and compares the CORS
policy semantically. It exits nonzero on update or verification failure and reports exact origins.

## Staging/local policy

Staging is the default and does not require production credentials:

```bash
./scripts/setup-storage-cors.sh threadmap-staging-9e0b6
```

Test upload, download, and resumable cancellation from `https://staging.threadmap.app`,
`http://localhost:3000`, and `http://127.0.0.1:3000`. Confirm an unrelated web origin is denied.

## Production policy

Do not invoke a raw `gcloud storage buckets update` for production. The guard requires the same
exact-SHA/clean-main/preflight contract as other production mutations:

```bash
export THREADMAP_RELEASE_SHA=<full-40-character-main-commit>
export THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=orbit-9e0b6
./scripts/setup-storage-cors.sh orbit-9e0b6
```

The script refuses arbitrary project ids and does not infer production from the active gcloud
configuration.

## Read-only inspection

Inspect the live production bucket without changing it:

```bash
gcloud storage buckets describe gs://orbit-9e0b6.firebasestorage.app \
  --project=orbit-9e0b6 \
  --format=json
```

Compare the returned CORS configuration to `storage-cors.json`. The repository contract also checks
that only approved production origins exist, exactly the supported methods are used, required
resumable headers remain, no competing legacy CORS file exists, and the setup script retains target
and read-back verification:

```bash
npm run release:contract
```

## Release evidence

Record project, bucket, policy file hash or candidate SHA, operator/approver, update timestamp, live
read-back output, and browser results. Validate:

- production upload and download from `threadmap.app`;
- resumable upload creation and `DELETE` cancellation;
- correct allowed/exposed headers;
- denial from localhost, a legacy preview domain, and an unrelated origin;
- owner isolation and attachment cleanup after the CORS transport succeeds.

CORS is not authorization. Storage Rules, authenticated uid ownership, upload intents/registries,
size/type limits, and cleanup remain mandatory even for an allowed origin.
