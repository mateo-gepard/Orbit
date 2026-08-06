# Threadmap Deep-Audit Snapshot Report — 2026-08-07

## 0) Requested action status

I have completed the rollback and backup step you asked for.

- Restored branch state to commit `c57dfb9`  
  - Message: **Backup: current Threadmap state before MCP wiring docs**
- Created and pushed a backup branch before any post-rollback doc edits:
  - Branch: `codex/backup-before-audit-2026-08-07`
  - Commit: `c57dfb9`
- Kept rollback state clean (no additional functional files changed before documentation).

I am now documenting what was done in this backup snapshot and what is still open.

## 1) Snapshot context

This snapshot is a large checkpoint taken after major MCP, sync, and platform hardening work, but before additional MCP wiring/documentation follow-up commits that were made later in this branch history.

### Commit inspected

- `c57dfb9` (`codex/backup-before-audit-2026-08-07`): 174 files changed, 42,919 insertions, 11,566 deletions

## 2) What has been done (done list)

This section is split by area for traceability.

### A) Core app/architecture and reliability

- Reworked major runtime surfaces and providers:
  - Auth/data/session orchestration and account scope handling in provider layer.
  - Improved data provider loading/fallback UX and sync warning/error handling.
  - Centralized loading + error boundaries and shell-level app bootstrap improvements.
- Added robust navigation and command UX improvements across shell elements and tool pages.
- Added/updated offline/PWA integration artifacts and service worker behavior:
  - `public/sw.js`, `public/offline.html`, `public/manifest.json`, and offline-related settings.
- Added production health and scraper endpoints:
  - `src/app/api/health/route.ts`
  - `src/app/api/scrape/*`
- Introduced crash/fallback pages and loading UX:
  - `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/not-found.tsx`.

### B) Firebase Functions / backend MCP stack

- Expanded Firebase Functions MCP layer with:
  - OAuth flow handling and client/token persistence
  - MCP metadata/directory and tool registration plumbing
  - Tool invocation/security boundaries
  - Additional migration tooling for legacy storage/revisions
- Files added/expanded under `functions/src/mcp/*` and `functions/src/migrate-*.ts`.
- Added/updated Functions config and dependencies to support new service surfaces.

### C) Sync, persistence, storage hardening

- Strengthened store sync and mutation durability workflows across:
  - Firestore sync path (`src/lib/firestore.ts`)
  - Item mutation outbox (`src/lib/item-mutation-outbox.ts`)
  - Queue/consistency primitives (`src/lib/keyed-serial-queue.ts`)
  - Verified local storage strategy (`src/lib/verified-storage.ts`)
  - Account-scoped storage utilities (`src/lib/account-storage.ts`, `src/lib/account-data.ts`)
- Added explicit migration and archive export/import tooling for account data:
  - `src/lib/account-export-archive.ts`
  - `src/lib/account-export-archive.test.ts`
- Extended durable sync and conflict surfaces for tags/tools/items/links/events and recovery.
- Added settings-specific cloud-sync/ownership behavior and additional account-scoped behavior.

### D) Feature stack and UX changes

- Tool and page-level enhancements across:
  - `abitur`, `briefing`, `dispatch`, `flight`, `wishlist`, and tag/areas flows.
- Added route/page changes:
  - New/updated pages in `src/app/tools/*`, `src/app/areas/[tag]`, `src/app/settings`, etc.
- Added richer project/notes workflows including versioned note drafts and better command handling.
- Added dedicated map/roadmap/graph helpers and refinements for item linking/visualization.

### E) Calendar and external integrations

- Added/expanded Google Calendar sync handling, validation and import/export flows.
- Added more defensive auth re-auth behavior and safer credential handling for external integrations.
- Added related unit/integration tests around calendar flows.

### F) Security/auth hardening and identity behaviors

- Expanded auth/session handling:
  - Re-auth helper paths
  - OAuth popup/reload guarding
  - Session token and ownership checks in key write/read paths.
- Added security-oriented helper tests in function and app layers (token/session/rate-limit/url-safety).

### G) Test and governance expansion

- Added or expanded many unit/integration tests across:
  - Stores (`abitur`, `settings`, `toolbox`, `wishlist`, `store`, `verified-storage`, etc.)
  - Dispatch + flight + mutation flow
  - Calendar/firestore rules
  - PWA/service-worker behavior
  - MCP OAuth/security handlers
- Added/updated CI workflow and test configuration.

### H) Documentation/config and ops

- Updated:
  - `README.md`
  - `PROJECT.md`
  - `PRODUCTION_READINESS.md`
  - `BACKEND_SETUP.md`
- Added onboarding/agent instructions and runtime guidance docs (`AGENTS.md`, `CLAUDE.md`).
- Updated deployment and platform config:
  - Firebase rules/indexes/functions config
  - CI config, Vercel config, and environment tooling docs.

## 3) Open items still outstanding

This section is the practical work list after this snapshot based on the latest issues you raised and what is not yet proven in this rollback state.

### High-priority

1. **MCP user scope / owner gating**
   - You previously reported: “Only the configured owner may manage MCP clients.”
   - This snapshot is before later follow-up MCP scoping fixes; still need explicit per-user owner validation and safer client list filtering in all MCP management paths for non-owner users.

2. **Wishlist sync retry banner behavior**
   - Previous symptom: “Wishlist changes are saved on this device, but cloud sync will retry.”
   - The snapshot still uses repeated warning emission patterns; you should validate retry banner lifecycle and success-clear behavior after successful retries (including cross-account/session context).

3. **Embedded browser popup compatibility**
   - Continued reports of popup-related OAuth / connect failures in embedded contexts should be re-tested against this baseline with:
     - Google sign-in / MCP connect
     - OAuth fallback path
     - Error handling and user-facing recovery actions.

4. **Three-dot / overflow menu stability**
   - User observed duplicated popups in some pages before the rollback window.
   - Re-test all “more” menus in:
     - notes editor
     - project detail panel
     - project dashboard
     - tasks/calendar/area pages
   for duplicate trigger/content rendering and scroll lock interactions.

### Medium-priority

5. **Cross-device tool sync consistency**
   - Re-verify tool/abitur/briefing/dispatch/wishlist sync convergence under:
     - offline → online transition
     - cloud conflict cases
     - delayed writes and background reconnection.

6. **Scroll and interaction regressions**
   - Re-run UI smoke checks for pages previously reported “cannot scroll on a lot of pages” to isolate if this is due:
     - global container overflow changes,
     - section-level `overflow-y-auto` layering,
     - or nested body/main/popup constraints.

7. **Production verification pass**
   - Confirm `threadmap.app` production parity for:
     - auth/login flows,
     - popup flows,
     - sync warning UX,
     - tool load/save reliability.

## 4) Files touched in this snapshot (complete inventory)

### Top-level

- `.env.local.example`
- `.github/workflows/ci.yml`
- `AGENTS.md`
- `BACKEND_SETUP.md`
- `CLAUDE.md`
- `PRODUCTION_READINESS.md`
- `PROJECT.md`
- `README.md`
- `firebase.json`
- `firestore.indexes.json`
- `firestore.rules`
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `public/manifest.json`
- `public/offline.html`
- `public/sw.js`
- `storage.rules`
- `vercel.json`
- `vitest.config.mts`

### `functions/`

- `functions/package.json`
- `functions/package-lock.json`
- `functions/src/attachment-paths.ts`
- `functions/src/index.ts`
- `functions/src/migrate-legacy-storage.ts`
- `functions/src/migrate-revisions.ts`
- `functions/src/mcp/dal.ts`
- `functions/src/mcp/metadata.ts`
- `functions/src/mcp/oauth.test.ts`
- `functions/src/mcp/oauth.ts`
- `functions/src/mcp/security.ts`
- `functions/src/mcp/server.ts`
- `functions/src/mcp/tools.ts`

### `src/app/`

- `src/app/api/health/route.ts`
- `src/app/api/scrape/image/route.ts`
- `src/app/api/scrape/price/route.ts`
- `src/app/api/scrape/route.ts`
- `src/app/archive/page.tsx`
- `src/app/areas/[tag]/page.tsx`
- `src/app/briefing/page.tsx`
- `src/app/calendar/page.tsx`
- `src/app/error.tsx`
- `src/app/files/page.tsx`
- `src/app/globals.css`
- `src/app/goals/page.tsx`
- `src/app/habits/page.tsx`
- `src/app/layout.tsx`
- `src/app/loading.tsx`
- `src/app/not-found.tsx`
- `src/app/notes/page.tsx`
- `src/app/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/tasks/page.tsx`
- `src/app/toolbox/page.tsx`
- `src/app/tools/abitur/page.tsx`
- `src/app/tools/briefing/page.tsx`
- `src/app/tools/circles/page.tsx`
- `src/app/tools/dispatch/page.tsx`
- `src/app/tools/flight/page.tsx`
- `src/app/tools/wishlist/page.tsx`

### `src/components/`

- `src/components/files/file-upload.tsx`
- `src/components/files/file-viewer.tsx`
- `src/components/flight/plane-animation.tsx`
- `src/components/items/item-row.tsx`
- `src/components/items/link-graph-node.tsx`
- `src/components/items/link-graph.tsx`
- `src/components/items/link-manager.tsx`
- `src/components/items/project-roadmap.tsx`
- `src/components/items/roadmap-node.tsx`
- `src/components/items/roadmap-utils.test.ts`
- `src/components/items/roadmap-utils.ts`
- `src/components/notes/note-draft.test.ts`
- `src/components/notes/note-draft.ts`
- `src/components/notes/note-editor.test.ts`
- `src/components/notes/note-editor.tsx`
- `src/components/notes/versioned-save-queue.ts`
- `src/components/providers/auth-provider.tsx`
- `src/components/providers/data-provider.tsx`
- `src/components/providers/error-boundary.tsx`
- `src/components/providers/providers.tsx`
- `src/components/providers/pwa-provider.tsx`
- `src/components/providers/settings-effects.tsx`
- `src/components/shell/app-shell.tsx`
- `src/components/shell/command-bar.tsx`
- `src/components/shell/detail-panel.tsx`
- `src/components/shell/item-detail-draft.test.ts`
- `src/components/shell/item-detail-draft.ts`
- `src/components/shell/mobile-nav.tsx`
- `src/components/shell/project-dashboard.tsx`
- `src/components/shell/sidebar.tsx`
- `src/components/ui/badge-stack.tsx`
- `src/components/ui/confirm-dialog.tsx`
- `src/components/ui/loading-screen.tsx`
- `src/components/ui/theme-toggle.tsx`

### `src/lib/`

- `src/lib/abitur-store.test.ts`
- `src/lib/abitur-store.ts`
- `src/lib/abitur.test.ts`
- `src/lib/abitur.ts`
- `src/lib/account-data.ts`
- `src/lib/account-export-archive.test.ts`
- `src/lib/account-export-archive.ts`
- `src/lib/account-storage.ts`
- `src/lib/analytics.ts`
- `src/lib/auth-reauth.test.ts`
- `src/lib/auth-reauth.ts`
- `src/lib/auto-archive.test.ts`
- `src/lib/auto-archive.ts`
- `src/lib/badges.test.ts`
- `src/lib/badges.ts`
- `src/lib/briefing-notifications.ts`
- `src/lib/briefing.test.ts`
- `src/lib/briefing.ts`
- `src/lib/calendar-access.ts`
- `src/lib/calendar-event.test.ts`
- `src/lib/calendar-event.ts`
- `src/lib/circles-store.ts`
- `src/lib/circles.ts`
- `src/lib/command-parser.test.ts`
- `src/lib/command-parser.ts`
- `src/lib/dashboard.test.ts`
- `src/lib/dashboard.ts`
- `src/lib/dispatch-durability.test.ts`
- `src/lib/dispatch-schedule.ts`
- `src/lib/dispatch.test.ts`
- `src/lib/dispatch.ts`
- `src/lib/fcm.ts`
- `src/lib/firebase-config.ts`
- `src/lib/firebase.ts`
- `src/lib/firestore.ts`
- `src/lib/flight-retention.ts`
- `src/lib/flight-session.test.ts`
- `src/lib/flight-session.ts`
- `src/lib/flight.test.ts`
- `src/lib/flight.ts`
- `src/lib/google-calendar-sync.test.ts`
- `src/lib/google-calendar-sync.ts`
- `src/lib/google-calendar.test.ts`
- `src/lib/google-calendar.ts`
- `src/lib/habits.test.ts`
- `src/lib/habits.ts`
- `src/lib/hooks/use-links.ts`
- `src/lib/i18n.ts`
- `src/lib/item-mutation-outbox.test.ts`
- `src/lib/item-mutation-outbox.ts`
- `src/lib/keyed-serial-queue.test.ts`
- `src/lib/keyed-serial-queue.ts`
- `src/lib/pwa.test.ts`
- `src/lib/pwa.ts`
- `src/lib/server/attachment-paths.test.ts`
- `src/lib/server/firebase-auth.ts`
- `src/lib/server/rate-limit.test.ts`
- `src/lib/server/rate-limit.ts`
- `src/lib/server/url-safety.test.ts`
- `src/lib/server/url-safety.ts`
- `src/lib/service-worker-cache.test.ts`
- `src/lib/settings-store.test.ts`
- `src/lib/settings-store.ts`
- `src/lib/storage.test.ts`
- `src/lib/storage.ts`
- `src/lib/store.ts`
- `src/lib/tool-conflict-recovery.test.ts`
- `src/lib/tool-conflict-recovery.ts`
- `src/lib/toolbox-store.ts`
- `src/lib/types.ts`
- `src/lib/utils.ts`
- `src/lib/verified-storage.test.ts`
- `src/lib/verified-storage.ts`
- `src/lib/wishlist-store.test.ts`
- `src/lib/wishlist-store.ts`
- `src/lib/zip.test.ts`
- `src/lib/zip.ts`
- `src/test/firebase-rules.test.ts`

### Tests added under other folders

- `functions/src/mcp/oauth.test.ts`
- `src/components/items/roadmap-utils.test.ts`
- `src/components/notes/note-draft.test.ts`
- `src/components/notes/note-editor.test.ts`
- `src/components/shell/item-detail-draft.test.ts`

## 5) Recommended immediate next steps (post-rollback)

1. Push a dedicated test browser pass against production (`threadmap.app`) with the exact user flows:
   - Google auth popup flow
   - MCP connect/disconnect flow
   - Wishlist edit/save and forced reconnect
   - Scrolling and menu interactions in:
     - notes editor
     - project detail panel
     - project dashboard
2. Re-apply the MCP user-scope correction work (non-owner access path) and validate:
   - no admin-owner-only gating
   - user can self-manage clients from own account
3. Re-verify sync-clear semantics so `threadmap:sync-warning` does not remain stuck after successful retries.
4. Once above passes, generate a fresh backup commit and tag it as the “audit-clean” baseline.
