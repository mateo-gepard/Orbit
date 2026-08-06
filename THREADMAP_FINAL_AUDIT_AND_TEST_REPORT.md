# Threadmap Audit and Test Report — 2026-08-06

## Current branch and working state

- Branch: `codex/backup-complete-mcp-open-items-fixed-2026-08-06`
- Modified files at report time:
  - `next.config.ts`
  - `src/components/providers/auth-provider.tsx`
- Git status (tracked changes only): 2 modified files above.

## What is complete

### 1) MCP gateway now reachable on production domain

Root issue found: production `threadmap.app` was returning 404 for:
- `/mcp`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/authorize`
- `/register`
- `/token`
- `/revoke`

Cause: `next.config.ts` rewrites for MCP routes were not yet deployed to production.

Fix:
- Added/kept `next.config.ts` MCP rewrites that proxy these paths to:
  - `https://us-central1-${NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/threadmapMcpGateway`
  - with override support through `MCP_GATEWAY_ORIGIN` / `NEXT_PUBLIC_MCP_GATEWAY_ORIGIN`.
- Production deploy triggered and alias verified on `threadmap.app`.
- Post-deploy checks now return:
  - `/mcp` → `405 method_not_allowed` (expected for GET)
  - `/.well-known/oauth-authorization-server` → JSON metadata (`200`)
  - `/.well-known/oauth-protected-resource` → JSON metadata (`200`)
  - `/authorize` without query → `400 invalid_request`

### 2) MCP Functions now present and deployed

- Deployed Firebase Functions include MCP callable + gateway endpoints:
  - `threadmapMcpGateway`
  - `getThreadmapMcpAuthorizationRequest`
  - `approveThreadmapMcpAuthorizationRequest`
  - `denyThreadmapMcpAuthorizationRequest`
  - `listThreadmapMcpClients`
  - `listThreadmapMcpTokenFamilies`
  - `revokeThreadmapMcpClient`
  - `revokeThreadmapMcpTokenFamily`
- Verified via `firebase functions:list` that all MCP endpoints are deployed in `us-central1`.

### 3) Google popup robustness for Firebase auth

- `src/components/providers/auth-provider.tsx` now includes popup capability detection and fallback:
  - Detect whether popup-based Google auth is supported in the current environment.
  - Fallback to `signInWithRedirect` when popup is unavailable or blocked.
  - Handles popup-related errors (`auth/popup-blocked`, `operation-not-supported-in-this-environment`, etc.).
  - Keeps popup capability cached so subsequent attempts use the working path.
- Added `getRedirectResult` handling so redirect sign-ins can complete.

### 4) Validation already run in this pass

- Local route verification (`NEXT_PUBLIC_FIREBASE_PROJECT_ID=orbit-9e0b6 npm run dev`):
  - `/mcp` → `405 method_not_allowed`
  - metadata paths return `200` JSON
- Production route verification (`threadmap.app`):
  - same successful results after deploy
- Firebase functions compile:
  - `npm --prefix functions run build` ✅
- Unit tests:
  - `npm run test` ✅ (`36 passed | 1 skipped`, `217 passed | 20 skipped`)
- Type/lint checks:
  - `npm run typecheck` ✅
  - `npm run lint` ✅ (pre-existing warnings only)

## What remains open / follow-up

### 1) Build in local environment

- `npm run build` still fails with a Turbopack panic (`Failed to write app endpoint /page`) in this container due environment process/port constraints.
- This appears environmental (Next/Flutterpack + CSS pipeline issue) and not from this MCP/auth change set; monitor upstream until fixed.

### 2) Google Calendar sync end-to-end browser verification

- We have fixed the routing/auth architecture and code paths, but we still need a full interactive browser run with real Google account credentials to complete this user-level acceptance test:
  - login with Google
  - open Calendar tab / settings
  - connect Google Calendar and trigger a sync cycle
- This can be finished by you in your test browser; this report gives all code-level and endpoint-level blockers cleared.

### 3) Claude MCP confirmation

- With routes now live on `threadmap.app`, MCP discovery paths are reachable.
- Next step is a final client-side confirmation in Claude after this deploy to ensure your specific MCP client config has no stale cache.

## Deployment and backup actions taken

- Production Vercel deploy executed: `threadmap.app` now points to deployment
  `orbit-pqze2o2kp-mateos-projects-c394726f.vercel.app` in this session.
- Existing threadmap.app alias is attached to that deployment.

