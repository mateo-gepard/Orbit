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

Current risks are narrowed to operational/docs readiness and environment hardening:
- In-app MCP management is now implemented in settings, including connected clients and session revocation.
- The full OAuth journey still relies on proper MCP client setup and external docs for onboarding.
- Firebase Emulator-based rule verification remains blocked in this environment because Java runtime is unavailable (`java -version`).

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
  - Added MCP management section text (connected clients, client/session statuses, revoke actions and feedback copy).
  - Added `common.loading` for existing loading copy.

### 4) Settings in-app MCP client/session management

- Added a new "MCP Clients & Sessions" management card inside the Integrations tab:
  - [src/app/settings/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/settings/page.tsx)
  - Fetches and displays MCP clients and their active sessions via new callables.
  - Shows active/revoked status, created/updated timestamps, and client-scoped session family IDs.
  - Supports explicit client revoke and explicit session revoke actions.
  - Refreshes state after every mutation and surfaces actionable error/success toasts.
- Added backend management callables for settings:
  - [functions/src/index.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/index.ts)
    - `listThreadmapMcpClients`
    - `listThreadmapMcpTokenFamilies`
    - `revokeThreadmapMcpClient`
    - `revokeThreadmapMcpTokenFamily`
- Added typed client wrappers for those functions:
  - [src/lib/mcp.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/mcp.ts)
- Implemented backend-safe validation for owner-only MCP management calls and parameter checks.

### 5) Type/Build fixes in Functions MCP runtime path (supporting code health)

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
- Remaining production items to close:
  - Onboarding and examples for specific MCP clients (for example ChatGPT/Claude).
  - Post-approve/error visibility when MCP returns token-exchange or callback errors.
  - A “revoke all sessions” bulk action (optional quality-of-life improvement).

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

### P1 – Production readiness
- Add onboarding docs for MCP clients (ChatGPT/Claude flow examples, quick setup checklist).
- Add bulk session management (all sessions for one client) if needed for admin UX.
- Add retry-safe UX copy if network errors occur between revoke call and local state refresh.

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

- MCP/UI/rules hardening backup commit: [`28ee27d`](https://github.com/mateo-gepard/Orbit/commit/28ee27d)
- Backup branch: [`codex/backup-before-full-mcp-ui-rules-2026-08-06`](https://github.com/mateo-gepard/Orbit/tree/codex/backup-before-full-mcp-ui-rules-2026-08-06)
- Files included in this backup:
  - [THREADMAP_AUDIT_REPORT.md](/Users/mateomamaladze/Desktop/Projects/Orbit/THREADMAP_AUDIT_REPORT.md)
  - [firestore.rules](/Users/mateomamaladze/Desktop/Projects/Orbit/firestore.rules)
  - [src/lib/mcp.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/mcp.ts)
  - [src/app/integrations/authorize/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/integrations/authorize/page.tsx)
  - [functions/src/index.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/index.ts)
  - [functions/src/mcp/server.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/server.ts)
  - [src/app/settings/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/settings/page.tsx)
  - [src/lib/i18n.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/i18n.ts)
  - [src/test/firebase-rules.test.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/test/firebase-rules.test.ts)
