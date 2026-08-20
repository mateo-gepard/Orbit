# Threadmap MCP setup and operations

**Repository truth reviewed:** 20 August 2026

Threadmap exposes its item graph through one stateless Streamable HTTP MCP endpoint:
`https://threadmap.app/mcp`. Authorization uses OAuth 2.1 authorization code flow with PKCE S256
and dynamic client registration. Each user consents while authenticated with Firebase, and every
issued credential remains bound to that user's uid.

## Architecture and trust boundary

```text
MCP host
  │ discovery, registration, OAuth, MCP
  ▼
threadmap.app (Vercel / Next.js)
  ├─ /integrations/authorize       Firebase-authenticated consent UI
  └─ environment-aware rewrites
       ▼
threadmapMcp (Firebase Functions, europe-west1)
  ├─ http.ts       routing, Firebase ID-token consent authentication, bearer gate
  ├─ oauth.ts      client registration, grants, codes, tokens, rotation, revocation
  ├─ sdk-server.ts per-request MCP server and scope-filtered catalog
  ├─ tools.ts      23 tool definitions, authorization, quotas, audit records
  └─ dal.ts        uid-scoped Firestore reads/writes and destructive safeguards
```

The endpoint is multi-user. There is no `MCP_OWNER_UID`: consent binds an authorization request to
the Firebase uid that approved it. The MCP data layer builds its principal from the validated
access token and never accepts a user id in tool input.

Production rewrites point at Firebase project `orbit-9e0b6`. Preview/development rewrites point at
`threadmap-staging-9e0b6`; only an allowlisted Vercel preview host can influence the staging OAuth
origin. The Settings connection card derives `/mcp` from the current browser origin, so staging
does not advertise or authorize the production endpoint. Firebase Functions are in
`europe-west1`; Vercel compute is independently in `fra1`.

## Non-secret configuration

Start from `functions/.env.example` for local/emulator configuration. Production values belong in
the Firebase Functions environment, and secrets belong in Secret Manager.

| Variable | Repository default/example | Purpose |
| --- | --- | --- |
| `MCP_ORIGIN` | `https://staging.threadmap.app` in the safe staging example; production explicitly uses `https://threadmap.app` | Single public issuer/resource origin from which every OAuth URL is derived |
| `MCP_DYNAMIC_CLIENT_SCOPES` | `threadmap.read offline_access` | Space-separated maximum scopes available to dynamically registered clients in this deployment |
| `MCP_ALLOW_LOOPBACK_REDIRECTS` | `false` | Enables RFC 8252 loopback callbacks for local native clients such as Claude Code |
| `MCP_EXTRA_REDIRECT_URIS` | unset | Space-separated explicit callback additions after security review |
| `ENFORCE_APP_CHECK` | `false` in the example | Callable-Function App Check switch; enable only after verified client traffic |

`MCP_DISCOVERY_ORIGIN` and `MCP_CONSENT_ORIGIN` are obsolete and must not be used. Discovery,
consent, token, registration, revocation, and resource URLs derive from `MCP_ORIGIN` so they cannot
drift to different issuers.

The code default allows read, write, and offline access, but the checked-in operational example is
intentionally narrower: read plus offline access. Treat write/delete scope enablement as a release
policy decision. Never add a uid, token, client secret, or redirect-specific credential to a tracked
environment file.

## Production launch policy

The checked-in production workflow is the authoritative launch contract:

- Dynamically registered clients receive `threadmap.read` and, when requested, `offline_access`.
  Create, update, completion, archive, linking, and deletion tools are not exposed in production.
- Browser-hosted ChatGPT and Claude custom connections may use HTTPS callbacks accepted by the
  redirect policy. Each host must still pass the real-client staging drill before release sign-off.
- Claude Code is not launch-supported. Its native OAuth flow uses a loopback callback, while
  production deliberately sets `MCP_ALLOW_LOOPBACK_REDIRECTS=false`. Do not advertise or enable it
  until its redirect behavior, port binding, consent flow, revocation, and post-revocation denial
  have passed a security-reviewed compatibility drill.

Enabling a broader scope or another redirect class is a security-policy change, not a routine
configuration edit. It requires updated consent and product copy, focused authorization tests, a
staging real-host drill, and an approved release record.

## Public endpoints

```text
/mcp
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
/api/mcp/oauth/authorize
/api/mcp/oauth/token
/api/mcp/oauth/register
/api/mcp/oauth/revoke
/integrations/authorize
```

All OAuth endpoints and the resource identifier share the public Threadmap origin. This is required
for issuer/resource validation and is why clients must use `threadmap.app`, not the raw
`cloudfunctions.net` URL.

## Authorization and mutation controls

- Authorization codes require PKCE S256 and expire quickly.
- Opaque access/refresh credentials are stored only as hashes.
- Refresh tokens rotate; reuse revokes the token family.
- RFC 8707 resource binding is checked at authorization, token exchange, refresh, and tool call.
- Dynamic client redirects are canonicalized and platform constrained; loopback is opt-in.
- `tools/list` omits tools outside the granted scopes, and dispatch enforces scope independently.
- Read/write/delete quotas are enforced per principal and recorded without item content or tokens.
- Writes require the current `expected_revision` and a fresh UUID idempotency key.
- Permanent deletion requires preview, displayed impact, explicit confirmation, and a short-lived
  single-use token bound to user, client, item, and revision.
- Attachments return metadata only; file URLs, storage paths, and contents are excluded.
- An account-deletion tombstone blocks authorization, refresh, access, and data recreation.

Users can list and revoke their own MCP authorizations in Settings. Revocation writes an atomic
per-user grant barrier checked on access/refresh/code exchange before derivative tokens are swept.
Deleting one user's grant must not revoke another user's connection to the same dynamic client.

## Scope and tool policy

The server implements 23 tools, but launch clients see only the read tools allowed by production
policy:

- `threadmap.read`: overview, agenda, item search/list/detail, tags, attachment metadata, wishlist,
  Abitur profile, focus-session logs, briefing journal, dispatch plans, settings projection, toolbox.
- `threadmap.write`: create/update/complete/archive items, habit completion, link/unlink.
- `threadmap.delete`: preview and confirm permanent item deletion.

`offline_access` controls refresh-token issuance and is not itself a tool scope. A client requesting
more than policy permits is narrowed to the allowed intersection when at least one scope remains.
Downstream scope checks remain strict. The write and delete lists above document dormant server
capability; they are not a promise that those actions are enabled in the production launch.

## Staging-first deployment

Do not deploy with an implicit Firebase project. The repository default is staging, but commands
still name the target explicitly:

```bash
npm run release:contract
npm run audit:regions
npm run deploy:rules:staging
npm run deploy:functions:staging
```

The retained production sequence lives in `.github/workflows/release.yml`, but an upstream blocker
currently makes it unavailable until true staging and post-evidence approval are implemented. A
genuine incident-only break-glass production Functions deployment requires all of the following,
formal authorization, and the full production preflight:

```bash
export THREADMAP_RELEASE_SHA=<full-40-character-main-commit>
export THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=orbit-9e0b6
npm run deploy:functions:production
```

The guard refuses a dirty tree, non-`main` branch, wrong SHA, wrong project, unknown resource, or
missing production configuration. It does not replace GitHub environment approval or a rollback
plan. The Functions codebase name in `firebase.json` is `briefing-cron`; prefer repository scripts
over hand-written single-Function filters.

## Verification

Static repository gates:

```bash
npm run release:contract
npm run audit:regions
(cd functions && npm test)
```

Unauthenticated discovery probes:

```bash
curl -fsS https://threadmap.app/.well-known/oauth-protected-resource/mcp
curl -fsS https://threadmap.app/.well-known/oauth-authorization-server
curl -i -X POST https://threadmap.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

The unauthenticated MCP request should return `401` and a quoted
`WWW-Authenticate: Bearer resource_metadata="…"` challenge. Discovery must identify
`https://threadmap.app/mcp` as the resource and `https://threadmap.app` as the authorization server.

The automated production verifier additionally checks OAuth discovery after proving the exact web
SHA, readiness, actual Vercel region, Firebase project, Firebase Functions region, and quota
Function reachability:

```bash
npm run release:verify -- --url https://threadmap.app --sha <full-sha>
```

This command requires `SCRAPE_RATE_LIMIT_SHARED_SECRET` in the protected process environment. Do
not pass or print it on the command line. The quota probe expects exact `401 invalid_app_check`
after the shared secret is accepted, establishing secret agreement and App Check enforcement
without a real user token.

An end-to-end release sign-off must use a real disposable account and host to exercise registration,
consent, granted-scope display, token exchange, read, any enabled write, disconnect/revocation, and
post-revocation denial. Do not create probe clients in production unless cleanup is included.

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| Vercel 404 on `/mcp` | deployed SHA, `VERCEL_ENV`, environment-aware Next rewrites |
| 503 configuration response | Functions environment, `MCP_ORIGIN`, deployment logs |
| `invalid_redirect_uri` | exact registered callback, approved platform, loopback flag |
| `invalid_scope` | dynamic scope policy and the scopes granted on the consent screen |
| revision conflict | re-read the item and retry with its new revision and a new operation id |
| refresh token rejected after reuse | expected family revocation; reconnect from the host |
| one user cannot connect while another can | account-deletion tombstone or per-user revoked grant |

Logs may identify route/client/token ids and scopes but must never include bearer tokens, OAuth
codes, tool arguments, or item content. Record deployment SHA and project with every investigation.

## Known operational limits

- The MCP SDK contributes to Functions cold-start weight; measure before splitting codebases.
- Search operates on a bounded owner-scoped window rather than a dedicated search index.
- Host support for MCP prompts/resources/apps differs; Threadmap deliberately exposes tools only.
- Browser/curl probes cannot replace a real host compatibility test after OAuth changes.
