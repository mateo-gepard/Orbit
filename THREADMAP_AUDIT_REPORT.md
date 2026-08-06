# Threadmap Audit Report (Detailed)

**Report date:** 2026-08-06  
**Project:** `/Users/mateomamaladze/Desktop/Projects/Orbit`  
**Branch:** `codex/backup-before-documentation-2026-08-06`  
**Backup commit:** `c57dfb9`  
**Backup branch pushed:** [`codex/backup-before-documentation-2026-08-06`](https://github.com/mateo-gepard/Orbit/tree/codex/backup-before-documentation-2026-08-06)

This report captures everything implemented so far and what is still open, with enough detail for handoff and re-prioritization.

---

## What was done and is already implemented

### 1) Hardening and persistence reliability work (already in progress and largely complete)

- **Google Calendar sync durability improvements** were implemented in [functions/src/mcp? no, actual path](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/google-calendar-sync.ts).
  - Mapping confirmation and write ordering were tightened to avoid prematurely clearing pending journal entries.
  - Added retry-aware behavior for mapped but not yet confirmed sync states.
  - Added retry/reconcile tracking for duplicates to avoid reusing stale pending operations.

- **Attachment path compatibility and migration tooling**
  - Added canonical attachment path helpers in [functions/src/attachment-paths.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/attachment-paths.ts).
  - Added legacy migration script in [functions/src/migrate-legacy-storage.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/migrate-legacy-storage.ts).
  - Added revision migration script in [functions/src/migrate-revisions.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/migrate-revisions.ts).

- **Webhook/network scraping hardening**
  - Safer URL parsing + private-net protections in [src/lib/server/url-safety.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/server/url-safety.ts).
  - Rate-limit guard and request handling updates in [src/lib/server/rate-limit.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/server/rate-limit.ts).
  - Scrape endpoint validation for image/price/scrape routes in [src/app/api/scrape/route.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/api/scrape/route.ts), [src/app/api/scrape/image/route.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/api/scrape/image/route.ts), [src/app/api/scrape/price/route.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/api/scrape/price/route.ts).

- **Health, service worker, and offline behavior**
  - Added API health check at [src/app/api/health/route.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/api/health/route.ts).
  - Added offline fallback html in [public/offline.html](/Users/mateomamaladze/Desktop/Projects/Orbit/public/offline.html).
  - Service worker updates in [public/sw.js](/Users/mateomamaladze/Desktop/Projects/Orbit/public/sw.js).

- **Error handling, lifecycle, and resilience improvements**
  - Expanded warning/exception flow in item/data stores and integrations (e.g. [src/lib/store.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/store.ts), [src/lib/firestore.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/firestore.ts), [src/lib/google-calendar.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/google-calendar.ts), [src/lib/google-calendar-sync.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/google-calendar-sync.ts)).

- **Security posture / config hardening**
  - Added stronger Content Security Policy in [next.config.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/next.config.ts).
  - Updated auth/storage/security docs and production docs:
    - [BACKEND_SETUP.md](/Users/mateomamaladze/Desktop/Projects/Orbit/BACKEND_SETUP.md)
    - [PRODUCTION_READINESS.md](/Users/mateomamaladze/Desktop/Projects/Orbit/PRODUCTION_READINESS.md)
    - [README.md](/Users/mateomamaladze/Desktop/Projects/Orbit/README.md).
  - Added `.nvmrc` and project-level runtime normalization.

- **CI/test scaffolding and static validation infrastructure growth**
  - CI workflow updates in [.github/workflows/ci.yml](/Users/mateomamaladze/Desktop/Projects/Orbit/.github/workflows/ci.yml).
  - Extensive test additions across domain modules, plus `vitest.config.mts`, Firebase rule tests, etc.
  - Added/updated function tests for Calendar/OAuth/security logic (e.g. [functions/src/mcp/oauth.test.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/oauth.test.ts), [src/lib/google-calendar.test.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/google-calendar.test.ts)).

---

### 2) MCP implementation (core) exists but is not yet connected to runtime

This is the largest completed component.

#### Added MCP modules
- MCP protocol engine: [functions/src/mcp/server.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/server.ts)
- OAuth/OIDC implementation: [functions/src/mcp/oauth.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/oauth.ts)
- OAuth security helpers: [functions/src/mcp/security.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/security.ts)
- OAuth metadata helpers: [functions/src/mcp/metadata.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/metadata.ts)
- Tool registry and tool schemas: [functions/src/mcp/tools.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/tools.ts)
- Data access layer (DAL): [functions/src/mcp/dal.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/dal.ts)
- MCP unit tests: [functions/src/mcp/oauth.test.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/oauth.test.ts)

#### What this MCP core currently supports
- Protocol versions, JSON-RPC request validation, `initialize`, `tools/list`, `tools/call` handling.
- Tool surface includes read/write/delete family for list/search/get/create/update/archive/habit completion/linking/delete preview + confirm.
- OAuth server logic with PKCE, token exchange, rotation/reuse detection, token family revocation, dynamic client registration.
- Quota + audit/idempotency scaffolding and deletion confirmation token flow in DAL/tool layer.

#### Important: these modules are present but not currently reachable via deployed endpoints.

No MCP endpoints are currently attached in the deployed runtime path in App Router or Cloud Functions, so external clients can’t discover/use them yet.

---

### 3) Major feature and UX work that is already done

#### Areas / pages / UI architecture changes
- Added dynamic Areas route at [src/app/areas/[tag]/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/areas/[tag]/page.tsx).
- Added dedicated error/loading/not-found screens: [src/app/error.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/error.tsx), [src/app/loading.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/loading.tsx), [src/app/not-found.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/not-found.tsx).
- Expanded dashboard and item detail interactions, including safer scheduling and deletion UX in [src/components/shell/project-dashboard.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/shell/project-dashboard.tsx), [src/components/shell/detail-panel.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/shell/detail-panel.tsx), [src/components/notes/note-editor.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/notes/note-editor.tsx), and shell/nav components.

#### Domain/tooling enhancements
- Notes: robust drafting infrastructure and tests.
  - [src/components/notes/note-draft.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/notes/note-draft.ts)
  - [src/components/shell/item-detail-draft.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/shell/item-detail-draft.ts)
  - [src/components/notes/versioned-save-queue.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/notes/versioned-save-queue.ts)
- Habit/dispatch/wishlist/flight/briefing/abitur/toolbox improvements and tests in their corresponding module files and tool pages.
- Deletion, upload, and file flows improved in [src/components/files/file-upload.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/components/files/file-upload.tsx), [src/lib/storage.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/storage.ts), [src/lib/fcm.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/fcm.ts).

#### Data integrity and account lifecycle
- New account data delete/export and auth re-auth support:
  - [src/lib/account-data.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/account-data.ts)
  - [src/lib/account-export-archive.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/account-export-archive.ts)
  - [src/lib/auth-reauth.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/auth-reauth.ts)
  - [src/app/settings/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/settings/page.tsx)
- Linking and roadmap data utilities expanded with tests.

---

### 4) Circles removal / legacy migration status

- Feature page removed: [src/app/tools/circles/page.tsx](/Users/mateomamaladze/Desktop/Projects/Orbit/src/app/tools/circles/page.tsx) deletion is present.
- Associated stores/modules removed: [src/lib/circles.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/circles.ts), [src/lib/circles-store.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/src/lib/circles-store.ts).

This aligns with your note that the circles thing can be removed.

---

## What is still open (and why it matters)

### Priority 1 – MCP must be wired end-to-end

This is the biggest remaining functional gap.

1. **MCP HTTP endpoints are missing**
   - No `/mcp` route is mounted in Next App Router.
   - No Cloud Functions HTTP export is exposing MCP request handler.
   - Missing surfaces for:
     - JSON-RPC server endpoint
     - `/authorize`
     - `/register`
     - `/token`
     - `/revoke`
     - `/.well-known/oauth-protected-resource`
     - `/.well-known/oauth-authorization-server`
   - Code exists but currently isolated in [functions/src/mcp/*](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp/).

2. **OAuth consent flow is incomplete at UI/runtime integration layer**
   - `THREADMAP_AUTHORIZATION_CONSENT_URL` in OAuth service points to `https://threadmap.app/integrations/authorize`, but no corresponding integration route/page is present in current app shell/settings.
   - Need explicit consent/approvals page (approve/deny) + user auth context checks + post-login redirect/token display behavior.

3. **MCP collection security model is not yet in Firestore rules**
   - MCP DAL writes/reads `mcpOAuth*`, `mcpIdempotency`, `mcpRateLimits`, `mcpAuditLogs`, `mcpDeleteConfirmations`.
   - [firestore.rules](/Users/mateomamaladze/Desktop/Projects/Orbit/firestore.rules) currently defaults to deny for unspecified collections.
   - Must define least-privilege read/write/TTL/field constraints for those collections before production use.

4. **MCP admin/owner disconnect and token lifecycle UI**
   - There is no in-app settings UI for “Connected MCP clients”, “revoke sessions”, “disconnect integration”, “rotate keys/consents”.
   - This is needed for account safety + user discoverability.

### Priority 2 – Residual architecture and UX/logic completion

5. **MCP documentation and onboarding still incomplete**
   - Need docs in-app and README for:
     - what MCP scope enables,
     - allowed clients,
     - consent flow,
     - token rotation/revocation behavior,
     - supported clients (ChatGPT / Claude / self-hosted).

6. **Settings/workflow polish gaps**
   - Some newer UX states were added, but you still have known risk areas around edge-case tab/route behavior and sub-tab consistency.
   - Several flows were heavily refactored and should be smoke-tested from user perspective before declaring done.

7. **Production hardening still pending outside code**
   - `SCRAPE_RATE_LIMIT_SHARED_SECRET`, VAPID keys/secrets, OAuth client setup, domain allowlist, and rule/test deployment sequencing are documented but still require console-side execution in production.

### Priority 3 – Verification and deployment gates

8. **Need a final verification pass from current branch before continuing edits**
   - Full run of: typecheck/build/unit tests/rule tests/emulator tests is still needed after the next change pass.
   - Existing changes are large and include a broad scope; an explicit gate is still needed before “done.”

9. **Deployment artifact/process audit**
   - Ensure Firebase Functions secrets, Firestore/Storage indexes, and Vercel config are all in sync with new MCP routes and rule collections.
   - Confirm Cloud Functions runtime has access to required collections and rate-limit collections if using MCP quotas.

---

## Known risk map (concise)

- **High:** MCP modules are complete on paper, but unusable to clients due missing transport endpoint/well-known + consent UX.
- **High:** Security policy for MCP collections unresolved; default-deny can break MCP runtime unexpectedly.
- **Medium:** Some refactors are UX-heavy with behavioral changes; user acceptance smoke test required.
- **Medium:** Deploy/ops tasks are partly documented but not executed from this branch yet.

---

## Exact change surface snapshot (high-level)

The backup commit changed/deleted/added across major areas:
- Backend: [functions/src/index.ts](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/index.ts), [functions/src/mcp](/Users/mateomamaladze/Desktop/Projects/Orbit/functions/src/mcp), migration scripts.
- App routes: new `/areas`, `/api/health`, loading/error/not-found/error screens.
- Core UI: shell, project pages, task/note/detail flows.
- Libraries: calendar, storage, firestore/store utilities, settings, dashboard, pwa, test harnesses.
- Rules/config/doc/infrastructure updates: [firestore.rules](/Users/mateomamaladze/Desktop/Projects/Orbit/firestore.rules), [storage.rules](/Users/mateomamaladze/Desktop/Projects/Orbit/storage.rules), [vercel.json](/Users/mateomamaladze/Desktop/Projects/Orbit/vercel.json), [firebase.json](/Users/mateomamaladze/Desktop/Projects/Orbit/firebase.json).
- New tests: significant additions under `src/lib`, `src/components`, and `functions/src/mcp`.

---

## Suggested immediate next sequence

1. **Finish MCP transport layer**
   - Add and mount MCP JSON-RPC and OAuth routes.
   - Add well-known metadata endpoints.
   - Wire MCP to `ThreadmapOAuthService` and `createThreadmapMcpServer`.

2. **Finish MCP security posture**
   - Add Firestore rules for MCP OAuth and MCP runtime collections.
   - Add integration tests for expected access boundaries.

3. **Finish UI integration**
   - Add integrations consent route under app shell.
   - Add user-facing connect/disconnect panel.

4. **Stability pass**
   - Run full validation (typecheck/build/tests/rules).
   - Smoke-check login, sync, settings, and scrape paths.

5. **Deploy gating**
   - Update runbook and run required secrets/deploy commands in target project.

---

## Repo backup metadata

- **Backup commit hash:** `c57dfb9`
- **Backup branch:** `codex/backup-before-documentation-2026-08-06`
- **Push status:** completed to `origin` and tracking branch is configured.
- **Why this is useful:** safe checkpoint of exactly the current state before any further edits requested in this phase.
