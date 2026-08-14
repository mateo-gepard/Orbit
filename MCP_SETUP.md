# Threadmap MCP — setup and operations

Threadmap exposes its item graph over the Model Context Protocol so ChatGPT, Claude,
and Claude Code can read and manage tasks, projects, habits, goals, notes, and
events. One standards-compliant server serves all of them.

- **Endpoint:** `https://threadmap.app/mcp` (Streamable HTTP)
- **Authorization:** OAuth 2.1, authorization code + PKCE S256, dynamic client registration
- **Owner-scoped:** the server issues tokens for exactly one Threadmap account

---

## 1. Architecture

```
threadmap.app  (Vercel / Next.js)
 ├── /integrations/authorize        consent screen (React, Firebase Auth)
 └── rewrites ────────────────────► Cloud Function `threadmapMcp` (us-central1)
      /mcp                              └── src/mcp/http.ts        router + Node bridge
      /.well-known/oauth-*                  ├── sdk-server.ts      MCP server factory
      /api/mcp/oauth/*                      ├── oauth.ts           authorization server
                                            ├── tools.ts           23 tools, scope + quota + audit
                                            └── dal.ts             owner-scoped Firestore access
```

Responsibility split:

| Layer | Owns |
|---|---|
| `@modelcontextprotocol/server` 2.0.0 | Wire protocol: JSON-RPC framing, version negotiation, `server/discover`, `resultType`, 2025-era compatibility |
| `http.ts` | Routing, bearer verification, consent auth, error shaping, Cloud Functions bridge |
| `sdk-server.ts` | Registers the tool catalog on a per-request `McpServer`; filters by granted scope |
| `tools.ts` | Tool catalog, **scope enforcement**, quota accounting, audit records |
| `dal.ts` | Owner-scoped Firestore reads and writes, idempotency, delete confirmation |
| `oauth.ts` / `security.ts` / `metadata.ts` | The authorization server |

The MCP HTTP layer is **stateless**: a fresh server instance is built per request
from a cheap factory, so no sticky routing is required and horizontal scaling is
free. Durable state lives in Firestore.

Tool input schemas are the existing JSON Schemas, handed to the SDK through
`fromJsonSchema` — there is no second copy of the schema to drift.

---

## 2. Configuration

Set these for the `threadmapMcp` function. `MCP_OWNER_UID` is the only required one.

| Variable | Default | Purpose |
|---|---|---|
| `MCP_OWNER_UID` | *(none — required)* | Firebase uid of the single Threadmap account this server serves. Every token, authorization request, and tool call is checked against it. Without it the endpoint returns `503`. |
| `MCP_ORIGIN` | `https://threadmap.app` | Public origin. Issuer, resource, and all four OAuth endpoints are derived from it. |
| `MCP_DYNAMIC_CLIENT_SCOPES` | `threadmap.read threadmap.write offline_access` | Scopes a dynamically registered client may hold. **`threadmap.delete` is deliberately excluded** — add it here only if you want agents able to delete. A client asking for more is narrowed to this set, not refused (see below). |
| `MCP_EXTRA_REDIRECT_URIS` | *(empty)* | Space-separated extra callbacks to allowlist beyond the built-in ChatGPT and Claude ones. |
| `MCP_ALLOW_LOOPBACK_REDIRECTS` | `false` | Set `true` to accept RFC 8252 loopback callbacks — required for **Claude Code**. |

Find your uid in the Firebase console under Authentication, or in the browser
console on threadmap.app while signed in:

```bash
# functions/.env  (or set them in the Firebase console)
MCP_OWNER_UID=your-firebase-uid
MCP_ALLOW_LOOPBACK_REDIRECTS=true
```

---

## 3. Deploy

Run in this order. Steps 1 and 2 are independent of each other; step 3 needs both.

```bash
# 1. Firestore rules, indexes, and the TTL policies for OAuth state
npm run deploy:rules
```

```bash
# 2. The MCP function
npm run deploy:functions
```

```bash
# 3. Vercel — picks up the rewrites in vercel.json plus the consent page
git push
```

**TTL matters.** `firestore.indexes.json` declares `ttl: true` on `expireAt` for nine
collections (authorization requests, codes, access tokens, refresh tokens, token
families, idempotency records, delete confirmations, rate limits, audit logs).
Without step 1, expired OAuth state accumulates forever. Confirm afterwards:

```bash
npx firebase firestore:indexes
```

---

## 4. Verify before connecting a host

Discovery is unauthenticated, so `curl` proves most of the wiring.

```bash
curl -s https://threadmap.app/.well-known/oauth-protected-resource/mcp | jq
```

Expect `resource` to be `https://threadmap.app/mcp` and `authorization_servers` to
be `["https://threadmap.app"]`.

```bash
curl -s https://threadmap.app/.well-known/oauth-authorization-server | jq
```

Expect `code_challenge_methods_supported: ["S256"]`, a `registration_endpoint`, and
`none` among `token_endpoint_auth_methods_supported` (the public-client method both
hosts use with PKCE).

```bash
curl -si -X POST https://threadmap.app/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | head -20
```

Expect `401` with a `WWW-Authenticate: Bearer resource_metadata="…"` header. That
header is how a host discovers where to authenticate; if it is missing, hosts will
fail with an opaque error.

If any of these return Vercel's 404 page, the rewrite is not live. If they return
`503 temporarily_unavailable`, `MCP_OWNER_UID` is unset.

---

## 5. Connect a host

### Claude (claude.ai / Desktop)

Settings → Connectors → Add custom connector → `https://threadmap.app/mcp`.
Claude registers itself dynamically, sends you to the Threadmap consent screen, and
completes the flow. Its callback is `https://claude.ai/api/mcp/auth_callback`, which
is allowlisted.

### ChatGPT

Enable Developer mode in settings, then Plugins → create a developer-mode app with
`https://threadmap.app/mcp` and OAuth. Its callback is
`https://chatgpt.com/connector/oauth/{callback_id}`, matched by pattern. Refresh the
app after changing tools or metadata.

### Claude Code

```bash
claude mcp add --transport http threadmap https://threadmap.app/mcp
```

Claude Code uses an ephemeral loopback callback, so set
`MCP_ALLOW_LOOPBACK_REDIRECTS=true` first or registration is refused.

### Claude API MCP connector

Supported — the connector is tools-only, and this server's core surface is tools, so
nothing is lost. Pass the access token as the bearer.

---

## 6. Tool catalog

23 tools. `tools/list` is filtered to the scopes the presented token actually
carries, so a read-only token is never offered a write tool.

| Scope | Tools |
|---|---|
| `threadmap.read` | `get_life_overview`, `get_agenda`, `list_items`, `search_items`, `get_item`, `list_tags`, `list_files_metadata`, `get_wishlist`, `get_abitur_profile`, `get_flight_logs`, `get_briefing_journal`, `get_dispatch_plans`, `get_settings`, `get_toolbox` |
| `threadmap.write` | `create_item`, `update_item`, `complete_item`, `archive_item`, `set_habit_completion`, `link_items`, `unlink_items` |
| `threadmap.delete` | `preview_delete_item`, `confirm_delete_item` |

Hosts commonly request every scope the discovery document advertises. Rather than
refuse the registration, the endpoint grants the intersection with
`MCP_DYNAMIC_CLIENT_SCOPES` and reports the granted scope in its response — the
behaviour RFC 7591 §2 and RFC 6749 §3.3 both provide for. So a host asking for
`threadmap.delete` connects successfully with read and write, and simply never
sees the two delete tools. Registration is refused only when *nothing* requested
is grantable.

Write safety, enforced server-side regardless of what a host or model claims:

- Mutations require `expected_revision` and fail on a stale revision.
- Every write requires a fresh `client_request_id` UUID; replays are idempotent.
- Deletion is two-stage: `preview_delete_item` returns the impact plus a
  short-lived, single-use token bound to owner, client, and revision, which
  `confirm_delete_item` must present.
- File metadata only — names, MIME types, sizes, timestamps. Never URLs, storage
  paths, or contents.
- `get_settings` returns an allowlisted projection; email, bio, tokens, and secrets
  are excluded.

---

## 7. Security model

| Control | Where |
|---|---|
| PKCE S256 required; `plain` rejected | `security.ts` |
| Tokens stored only as SHA-256 hashes; constant-time comparison | `security.ts` |
| Refresh-token rotation with reuse detection that revokes the whole token family | `oauth.ts` |
| RFC 8707 resource binding checked on authorize, token, and every call | `oauth.ts` |
| Redirect URIs allowlisted in canonical form; one platform per dynamic client | `security.ts` |
| Access tokens capped at one hour | `oauth.ts` |
| Tokens refused once an account-deletion job exists | `oauth.ts` |
| Per-tool scope check before dispatch, plus per-kind quotas and an audit record | `tools.ts` |
| Bounded outputs (60 KB per result, 12 KB per content field) | `dal.ts` |
| Consent endpoints separated from MCP endpoints, with distinct token parsers | `http.ts` |
| Browser Origin allowlist on consent endpoints | `http.ts` |
| No stack traces, Firestore detail, or token material in any error response | `http.ts` |

Two properties worth stating explicitly:

**Item text is data, not instructions.** Notes and titles are the user's own
content and can contain anything, including text that looks like a command. The
server never interprets it, and the server `instructions` tell the model the same.
Nothing an item says can widen a scope, skip a confirmation, or trigger a tool.

**Annotations and host dialogs are not security.** `readOnlyHint`,
`destructiveHint`, `securitySchemes`, and the host's own approval prompt are all
advisory. Authorization happens on the server, every call.

---

## 8. Compatibility

| Surface | Transport | Status |
|---|---|---|
| Claude.ai / Desktop connector | Streamable HTTP | Supported |
| ChatGPT developer-mode plugin | Streamable HTTP | Supported |
| Claude Code | Streamable HTTP | Supported with `MCP_ALLOW_LOOPBACK_REDIRECTS=true` |
| Claude API MCP connector | Streamable HTTP, tools only | Supported |

Protocol revisions: the SDK serves **2026-07-28** and keeps 2025-era Streamable
HTTP working through its stateless legacy path (`legacy: 'stateless'`, the default).
Both paths are covered by tests — the end-to-end suite drives a 2025-era client,
which is what hosts send today.

Not implemented, by choice: prompts, resources, subscriptions, sampling,
elicitation, and MCP Apps UI. Host support for those differs, and every workflow
here is tool-driven so nothing depends on them.

---

## 9. Operations

**Logs.** The function emits structured JSON to Cloud Logging with
`component: "mcp"`, carrying route, client id, token id, and scopes. Tokens, tool
arguments, and item content are never logged.

**Revoking a connection.** Deleting the client document in `mcpOAuthClients`
invalidates every token derived from it immediately — `authenticateAccessToken`
re-checks the client on every call.

**Rotating the owner.** Changing `MCP_OWNER_UID` invalidates all existing tokens,
since tokens are bound to the owner uid.

**Quotas.** Per token, per minute: 120 read, 30 write, 5 delete calls.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `503 temporarily_unavailable` | `MCP_OWNER_UID` unset |
| Vercel 404 on `/mcp` | Rewrites not deployed |
| `invalid_client` at the token endpoint | Client registered with a different auth method than it is presenting |
| `redirect_uri is not an approved …` on registration | Claude Code without `MCP_ALLOW_LOOPBACK_REDIRECTS=true`, or a client not on the allowlist |
| Consent screen says the request is invalid or expired | Authorization requests live 10 minutes; restart from the client |
| Tool calls return `insufficient_scope` | The scope was never granted — check `MCP_DYNAMIC_CLIENT_SCOPES`, then reconnect |
| Write returns a revision conflict | The item changed since it was read; re-read and retry |

---

## 10. Tests

```bash
cd functions && npm test
```

37 tests, no external services required:

| Suite | Covers |
|---|---|
| `oauth.test.ts` | PKCE against the RFC 7636 example, redirect classification, resource and scope binding, metadata, TTL caps, error serialization, and the full DCR → consent → code → access → refresh-rotation → replay-revocation flow |
| `http.test.ts` | Both discovery documents, the bearer gate and its `WWW-Authenticate` challenge, consent auth and Origin checks, method and route handling, open-redirect refusal, the Cloud Functions bridge, and an **end-to-end register → authorize → consent → token → `initialize` → `tools/list` → `tools/call` → refresh → replay** run over HTTP |
| `sdk-server.test.ts` | Catalog registration and deterministic order, schema round-trip, `_meta.securitySchemes`, scope-filtered listing, and that enforcement is independent of what was advertised |
| `dal.test.ts` | Content projection: plain text preserved, legacy HTML reduced, script and style removed, truncation |

---

## 11. Known limits

- **Bundle size.** The SDK adds ~7.5 MB unpacked, which is cold-start weight. If it
  becomes noticeable, split `threadmapMcp` into its own codebase so the briefing,
  push, and deletion functions do not load it.
- **Single owner.** One `MCP_OWNER_UID` per deployment. Multi-account support would
  need the consent screen to bind a request to the signed-in uid rather than
  asserting a configured one.
- **No `search`/`fetch` compatibility tools.** ChatGPT deep-research retrieval
  expects that specific pair; `search_items` and `get_item` are the equivalents but
  are not wire-compatible with it. Add them if that workflow matters.
- **Content format is inferred.** `htmlToPlainText` detects HTML rather than being
  told. A plain-text note that literally contains something like `<b>` is treated as
  markup. A `contentFormat` field on the item would remove the guess.
