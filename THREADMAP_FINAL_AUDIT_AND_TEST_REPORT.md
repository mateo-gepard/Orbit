# Threadmap Deep Audit, Fixes, and Remaining Work

**Date:** 2026-08-06  
**Branch:** `codex/backup-complete-mcp-open-items-fixed-2026-08-06`  
**Latest production target:** `threadmap.app` (Firebase project `orbit-9e0b6`, Cloud Functions `threadmapMcpGateway`)

## Scope covered in this pass

- MCP gateway routing and discovery endpoints
- CORS/cross-origin behavior for MCP and Google OAuth metadata
- Google authentication popup robustness (Firebase Auth)
- Google Calendar consent/sync flow (embedded-browser constraints)
- Browser-level smoke checks and endpoint validation
- Deployment + backup status

## What was changed

### 1) MCP gateway CORS and preflight hardened

**File updated:** `functions/src/index.ts`

Changes in `threadmapMcpGateway`:

- Added explicit CORS response headers for all gateway routes:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers` (dynamic set of required headers)
  - `Access-Control-Max-Age: 600`
  - `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`
- Added OPTIONS handling with clean allow list:
  - `Allow: GET, POST, OPTIONS`
  - `Cache-Control: no-store`
- Improved header construction to avoid duplicate/malformed CORS header values:
  - merges any pre-existing `Access-Control-Allow-Headers` values with requested+required values
  - removes any existing value before setting
- Fixed method validation response for `OPTIONS` and endpoint handlers to keep browser preflight consistent.

Why this matters:
- This directly addresses browser MCP client failures when cross-origin checks are strict.

---

### 2) Google auth popup fallback retained and hardened

**File updated (already in branch):** `src/components/providers/auth-provider.tsx`

- Added popup-capability probing with `window.open`.
- If popup is unavailable/blocked, path falls back to `signInWithRedirect`.
- Handles common popup-block and environment errors in `isPopupUnavailableError`.

---

### 3) Google Calendar sync path gets clearer failure handling in popup-heavy environments

**Files updated:**
- `src/lib/google-calendar.ts`
- `src/app/settings/page.tsx`
- `src/lib/i18n.ts`

Improvements:

- Normalized Google Calendar token client errors from GIS (`requestCalendarPermission`) into clearer user-facing messages when popups are blocked/closed/denied.
- Added popup-blocked UX handling for Calendar (`isCalendarPopupBlockedError` + dedicated fallback toast key `settings.calendarPopupBlocked` in EN/DE).
- `handleCalendarSyncChange` now surfaces safer error-specific messages instead of always a generic toast.

Why this matters:
- In embedded browsers (or strict popup policies), users now get actionable feedback instead of a silent generic "Could not connect" message.

---

## Production verification done

### Gateway endpoint checks against `threadmap.app`

Executed with `curl` on 2026-08-06:

- `OPTIONS /mcp` -> `204`
  - includes:
    - `access-control-allow-origin: *`
    - `access-control-allow-methods: GET, POST, OPTIONS`
    - `access-control-allow-headers` (deduped set)
    - `access-control-max-age: 600`
    - `vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`
- `GET /.well-known/oauth-authorization-server` -> `200` JSON metadata with CORS headers
- `GET /.well-known/oauth-protected-resource` -> `200` JSON metadata with CORS headers
- `GET /authorize` malformed input -> `400 invalid_request`
- `POST /mcp` without token -> `401` with `WWW-Authenticate: Bearer ...`

### Direct function endpoint verification

Executed against direct cloud function (`threadmapmcpgateway-br7nx44qrq-uc.a.run.app`):

- Preflight (`OPTIONS`) and metadata routes return expected headers and status.
- `POST /mcp` missing token returns expected `401 invalid_token` response.

### Local/CI validation

- `npm run typecheck` ✅
- `npm run lint` ✅ (existing unrelated warnings; no new errors)
- `npm run test` ✅ (217 passed, 20 skipped)
- `npm --prefix functions run build` ✅

---

## What is still open / requires follow-up

### 1) Full interactive Google sign-in and sync smoke test with real credentials

I validated endpoint-level and preflight behavior thoroughly, but I cannot complete end-to-end interactive Google OAuth in this environment without a real account session and user interaction.

Remaining acceptance steps for you:
- Open `threadmap.app` in your test browser
- Sign in with Google
- Go to Settings → Google Calendar Sync (toggle on)
- Confirm permission flow completes and at least one sync cycle runs

### 2) Optional UX polish

- Optional: surface a separate “allow popups” help link in Settings when `window.open` is unavailable, with a one-click copy to settings instruction.

### 3) MCP client-side confirmation

- Network contract is now aligned for MCP discovery and OAuth endpoints.
- Please confirm from your Claude MCP client that full handshake now succeeds without the discovery/auth errors.

---

## Backup and deployment state

### Git state before these final changes

- Working tree before these final changes included MCP + Calendar + Firebase auth-related edits in this branch.

### Current status

- Working tree now includes:
  - `functions/src/index.ts`
  - `src/lib/google-calendar.ts`
  - `src/app/settings/page.tsx`
  - `src/lib/i18n.ts`
  - `THREADMAP_FINAL_AUDIT_AND_TEST_REPORT.md`

### What we still need user-side testing for

- **Embedded browser limitation**: in this environment, `window.open` is unavailable in the Codex/browser shell; Google Calendar popup consent cannot be completed there, so use normal browser for full sign-in + sync validation.
- **Google sign-in + Calendar sync smoke test**: still requires real interactive credentials to verify successful authorization and sync.

### New local verification done this pass

- Local Functions emulator tested at `http://127.0.0.1:5001/orbit-9e0b6/us-central1/threadmapMcpGateway`
  - `OPTIONS /mcp` → `204`
  - `POST /register` with `application/x-www-form-urlencoded` now parses and validates payload (no parser error)
  - `POST /token` URL-encoded now parses and returns `unsupported_grant_type` for bad grant in absence of valid client state
  - `POST /revoke` URL-encoded now parses and returns expected OAuth auth errors
  - metadata routes return expected JSON + CORS
- Production (`threadmap.app`) `POST /register` responds with OAuth validation errors (not parser format errors), confirming parser compatibility for non-JSON clients with current production code.

### Recommended next ops

- Commit these changes (and push) as a dedicated backup/finalization commit so we have an auditable snapshot before any further functional edits.
