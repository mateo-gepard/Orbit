# Threadmap – Deep Audit Report (Usability, Logic, Workflows, UI/UX, Missing Work)

**Report date:** 2026-08-06  
**Branch:** `codex/backup-before-full-mcp-ui-rules-2026-08-06`  
**Project path:** `/Users/mateomamaladze/Desktop/Projects/Orbit`

This is a complete current-state audit after the MCP security + settings/consent integration pass.

---

## Executive summary

The following high-impact items are now completed:
- MCP OAuth/consent data access is now exposed to the client through a dedicated client wrapper and consent route.
- MCP collections in Firestore are locked to Cloud Functions/Admin-only access via rules.
- Settings has a dedicated **Integrations** tab with MCP endpoint and scope documentation.
- All recent type issues in those touched UI paths were fixed.
- Root app build and TypeScript checks are clean.

Remaining risks are focused on product completeness, not correctness:
- There is still no in-app MCP client management workflow (connected clients, token/session revocation UI, rotation helpers).
- The full OAuth user journey still relies on the Firebase Functions gateway and external MCP client configuration, so onboarding copy and docs should be expanded before production rollout.
- Firebase Emulator-based rule verification is blocked in this environment due missing Java runtime.

---

## What has been implemented (done)

### 1) MCP transport + consent front-end integration

- Added a client-side MCP authorization wrapper:
  - [src/lib/mcp.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/mcp.ts)
    - `getThreadmapMcpAuthorizationRequest`
    - `approveThreadmapMcpAuthorizationRequest`
    - `denyThreadmapMcpAuthorizationRequest`
- Added consent page and route:
  - [src/app/integrations/authorize/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/integrations/authorize/page.tsx)
  - Displays request details, scope selection, sign-in gate, deny/approve actions, spinner/error states.
- Added matching Firebase callable exports in functions:
  - [functions/src/index.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/index.ts)
    - `getThreadmapMcpAuthorizationRequest`
    - `approveThreadmapMcpAuthorizationRequest`
    - `denyThreadmapMcpAuthorizationRequest`
- Hardened request flow logic in consent page:
  - Removed unstable union-state branch (`idle|loading|action`) and replaced with explicit loading boolean.
  - Cleared stale request/scopes on token or auth changes.
  - Prevented stale UI showing old request while a new request loads.

### 2) Firestore security posture for MCP collections

- Added explicit function-only deny rules for all MCP runtime/control-plane collections:
  - [firestore.rules](/Users/mateomamaladze/Desktop/Projects/Orbit/firestore.rules)
  - `mcpOAuthClients`
  - `mcpOAuthAuthorizationRequests`
  - `mcpOAuthAuthorizationCodes`
  - `mcpOAuthAccessTokens`
  - `mcpOAuthRefreshTokens`
  - `mcpOAuthTokenFamilies`
  - `mcpIdempotency`
  - `mcpRateLimits`
  - `mcpAuditLogs`
  - `mcpDeleteConfirmations`
- Added explicit regression coverage:
  - [src/test/firebase-rules.test.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/test/firebase-rules.test.ts)
  - New test ensures direct client read/write/list/get/delete for all MCP collections fails.
- This keeps MCP runtime data mutable only from trusted Functions/Admin flows.

### 3) Settings UX for MCP metadata + discovery

- Added new settings tab:
  - [src/app/settings/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/settings/page.tsx)
  - New section `settings.integrations` with:
    - MCP endpoint URL card list:
      - `/mcp`
      - `/.well-known/oauth-authorization-server`
      - `/.well-known/oauth-protected-resource`
      - `/integrations/authorize`
    - Scope notes for `threadmap.read` and `threadmap.write`.
    - Inline help text for where/when to register these URLs.
- Added/strengthened translation coverage:
  - [src/lib/i18n.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/i18n.ts)
  - New settings keys for MCP authorization/consent and integrational text.
  - Added `common.loading` for existing loading copy.

### 4) Type/Build fixes in Functions MCP runtime path (supporting code health)

- Fixed request-header typing in Functions gateway request adaptor:
  - [functions/src/index.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/index.ts)
  - Added helper for both `Headers.get(...)` and raw header record input styles.
- Fixed MCP method error handling code path:
  - [functions/src/mcp/server.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/server.ts)
  - Method-not-found now returns standard JSON-RPC error code `-32601`.

---

## Verification status

- ✅ `npm run typecheck` passes (no TS errors).
- ✅ `npm run build` passes (Next.js production build).
- ✅ `npm --prefix functions run build` passes (Functions TypeScript compile).
- ⚠️ `npm run test:rules` could not run in this environment because the Firebase emulator requires Java (`java -version` unavailable).
  - Error: `Unable to locate a Java Runtime`.

---

## UX / Logic / Workflow / Sub-tab audit

### Settings sub-tabs currently covered well
- `Profile`
- `Appearance`
- `Language & Region`
- `General`
- `Notifications`
- `Calendar`
- `Shortcuts`
- `Privacy`
- `Accessibility`
- `Easter eggs`
- `Integrations` (new)
- `Data & Account`

### Integrations UX (now implemented)
- Good:
  - One clear discoverability panel with all MCP endpoints and scope meanings.
  - Consent route path is visible and copy is explicit.
  - Scope selector on consent requires at least one scope.
- Still missing for full production usability:
  - A dedicated "Connected clients / active grants" list in-app.
  - Session/token status and explicit revoke UX.
  - “Try this client” guidance in onboarding (copy/examples for ChatGPT, Claude, etc.).
  - Post-approve error/success messaging if redirect returns query-state or code issues.

### Consent flow logic audit
- Works for the intended browser-to-function path:
  - Reads request token from query string.
  - Loads request server-side via callable.
  - Enforces auth and demo-mode blocks.
  - Approves/denies request through callables and redirects using function return location.
- Edge cases now addressed:
  - stale request during token changes,
  - loading state transitions around fetch and action calls.
- Remaining edge cases to watch:
  - transient network failure after approve/deny call before redirect location is handled,
  - explicit unsupported/malformed scope names from client metadata should remain validated server-side.

---

## Remaining open work (priority order)

### P1 – Product completeness
- Add MCP client/session management UI in settings.
- Add explicit revoke-by-token and revoke-all UX.
- Add per-client "last used / created / scopes" metadata table.

### P2 – Deployment readiness
- Add README/system docs:
  - MCP discovery endpoints and how to register.
  - Expected callback/redirect behavior.
  - Scope behavior and token lifecycle.
- Add production runbook step for required Function env vars/secrets and domain verification.

### P3 – Rules/testing confidence
- Re-run emulator rule tests once Java is available:
  - `npm run test:rules`
- Optionally add dedicated MCP integration tests that exercise:
  - authorize consent token expiry path,
  - deny/approve mismatch handling,
  - repeated/duplicate approval prevention.

---

## Open technical debt in touched areas

- Hard-coded origin URLs still appear in multiple config spots where environment-aware URL construction would be safer.
- Integration routes are function-led for MCP; no Next.js-side `/mcp` API route exists in this app shell.
- `THREADMAP_AUTHORIZATION_CONSENT_URL` flow remains dependent on the deployed origin being correctly configured in environment.

---

## Commit-level snapshot

- Working tree currently has these active changes since the last backup:
  - `firestore.rules`
  - `src/lib/mcp.ts`
  - `src/app/integrations/authorize/page.tsx`
  - `functions/src/index.ts`
  - `functions/src/mcp/server.ts`
  - `src/app/settings/page.tsx`
  - `src/lib/i18n.ts`
  - `src/test/firebase-rules.test.ts`

When you want, I can immediately create:
1. a backup commit in git for the current state,
2. push it to GitHub,
3. and open a follow-up commit for any remaining P1 items.

