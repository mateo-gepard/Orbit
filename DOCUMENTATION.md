# Threadmap system documentation

**Repository truth reviewed:** 20 August 2026

Threadmap is a local-first personal productivity application. Tasks, projects, habits, events,
goals, and notes share one `ThreadmapItem` model and can be connected by hierarchy and peer links.
This document describes the repository architecture; it does not assert that an unverified live
deployment contains the current tree. A deployment is identified by its full commit SHA, not by
the package version.

## 1. Repository map

```text
src/app/                   Next.js App Router pages and HTTP route handlers
src/components/            shell, providers, item editors, tools, and UI primitives
src/lib/                   model, state, persistence, Firebase, PWA, and integration logic
src/test/                  Firebase Rules emulator suite
e2e/                       Playwright cold-load and release smoke tests
functions/src/             Firebase Functions (Node 22, second generation)
functions/src/mcp/         OAuth authorization server, MCP router, tools, and data layer
src/app/sw.js/route.ts     stable, non-cacheable service-worker response
src/service-worker/        worker template with build-revision injection point
firestore.rules            Firestore authorization boundary
storage.rules              Storage authorization boundary
firestore.indexes.json     query indexes and TTL policies
.github/workflows/ci.yml   pull-request and branch quality gates
.github/workflows/release.yml  fail-closed production design pending true staging topology
```

This repository uses Next.js 16.3 and React 19. Before changing framework behavior, read the
matching guide under `node_modules/next/dist/docs/`; older App Router assumptions may be wrong.

## 2. Data model and relationships

`src/lib/types.ts` defines `ThreadmapItem`. `OrbitItem` is a deprecated compatibility alias while
older call sites are migrated.

```ts
type ItemType = 'task' | 'project' | 'habit' | 'event' | 'goal' | 'note';
type ItemStatus = 'active' | 'waiting' | 'done' | 'archived';
```

Every item has an id, type, status, title, timestamps, user id, and optional revision. Type-specific
fields add task due dates/checklists, project presentation, habit schedules/completions, event
times/recurrence, goal metrics, note subtype, relationships, attachments, and My Day state.

Relationships use two mechanisms:

- `parentId` expresses a directed hierarchy validated by `src/lib/links.ts`, Firestore Rules, and
  the hierarchy-repair Function.
- `linkedIds` expresses symmetric peer relationships and is maintained atomically by the data
  layer and MCP operations.

Cloud revisions provide optimistic concurrency. Any new write path must preserve owner identity,
revision behavior, relationship invariants, and account-deletion tombstones.

## 3. Runtime profiles, storage, and synchronization

Threadmap has two explicit profiles:

| Profile | Identity | Durable store | Intended use |
| --- | --- | --- | --- |
| Local/demo | local demo identity | account-scoped browser storage | development, demos, one browser |
| Cloud | Firebase Authentication uid | Firestore plus account-scoped local mirror | signed-in cross-device use |

The Firebase uid is the workspace/tenant boundary. Browser UI state is never an authorization
boundary. Firestore and Storage Rules and authenticated Functions enforce ownership again on the
server.

`src/lib/firestore.ts` orchestrates subscriptions, optimistic writes, revisions, account-generation
guards, and the mutation outbox. `src/lib/store.ts` owns in-memory Zustand state. Browser keys are
scoped by account so a signed-out or prior account cannot be silently loaded into another user.
Account deletion creates durable server-side state before destructive cleanup; old credentials and
delayed upload sessions must not be able to recreate a deleted account.

The provider composition in `src/components/providers/` covers authentication, data subscriptions,
settings effects, themes, PWA lifecycle, and render-error containment.

## 4. Application surface

The principal routes are dashboard (`/`), Today, tasks, projects, habits, goals, notes, calendar,
files, archive, life areas, toolbox, focused tools, briefing, and settings. Public trust surfaces
include About, Privacy, Terms, Security, and `/.well-known/security.txt`.

`/integrations/authorize` is the Firebase-authenticated MCP consent surface. `/api/health` is the
release liveness/readiness endpoint. `/api/scrape` and its image/price variants are authenticated,
bounded wishlist helpers and share a distributed Firebase quota.

The command bar is the central capture surface. It parses bilingual type commands, tags, priority,
mentions, and dates. Parser changes require focused tests because the same text can influence title,
relationships, type, and schedule.

## 5. Firebase and regional topology

Firebase production is `orbit-9e0b6`; staging is `threadmap-staging-9e0b6`. `.firebaserc` deliberately
sets staging as the default. Application runtime code imports the single
`FIREBASE_FUNCTIONS_REGION` constant from `src/lib/deployment-config.ts`; Firebase Functions have a
separate build boundary, so `scripts/check-deployment-regions.mjs` verifies their local
`FUNCTION_REGION` remains equal.

| Plane | Region | Reason it is separate |
| --- | --- | --- |
| Firebase Functions | `europe-west1` | callable, HTTP, scheduled, and event Functions |
| Vercel Functions / Next.js compute | `fra1` | Next.js route handlers and server rendering |

The region audit recursively scans application and Functions runtime sources for disallowed US
references, divergent literals, and hard-coded regional endpoints. It also validates Next/Vercel
configuration. Passing the static audit does not prove where a live instance executed; the staged
release verifier requires the health route to report `fra1` at runtime.

The Functions surface includes authentication email, notification scheduling/device lifecycle,
MFA recovery-code operations, distributed scraper quota, hierarchy repair, item/attachment/upload
lifecycle, account export/deletion/retry, connection management, and the MCP HTTP endpoint.

## 6. MCP and OAuth

`functions/src/mcp/` implements a multi-user OAuth 2.1 authorization server and stateless MCP
Streamable HTTP endpoint. A consent decision binds the dynamically registered client to the
currently authenticated Firebase uid; there is no deployment-wide owner uid.

Public paths share the Threadmap origin and are forwarded by environment-aware Next.js rewrites:

```text
/mcp
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
/api/mcp/oauth/{authorize,token,register,revoke}
```

Authorization uses PKCE S256, resource indicators, hashed opaque tokens, short-lived codes, refresh
rotation/reuse detection, per-user grants, and owner-visible revocation. The data layer constructs
every query from the authenticated principal and never accepts an owner id from a tool argument.
Writes use expected revisions plus idempotency ids. Permanent deletion is a preview/confirm flow
with a short-lived owner/client/revision-bound token. File tools expose metadata, never file URLs,
paths, or content.

There are 23 tools across `threadmap.read`, `threadmap.write`, and `threadmap.delete`. The server
filters `tools/list` to granted scopes and enforces the required scope again before dispatch. The
checked-in Functions example intentionally defaults dynamic clients to `threadmap.read` plus
`offline_access`; widening write or delete access is an explicit production policy decision.

See `MCP_SETUP.md` for configuration and operational verification.

## 7. PWA and deployment-safe updates

The app registers the stable `/sw.js` URL. Its route embeds the exact deployment SHA in the worker
response bytes and cache names, old Threadmap/legacy caches are deleted on activation, and Next.js
serves the worker with `no-store`/`no-cache` headers. Because the URL stays stable while bytes
change, browser update comparison can discover release B from a page still running release A.
Visibility, restored-network, and hourly checks cover long-lived SPA sessions.

An installing worker does not call `skipWaiting` automatically. When an update is waiting, the app
shows a persistent localized prompt. Only the user's “Reload now” action asks the worker to
activate. A session marker permits one controlled reload after `controllerchange`; an activation
that occurs because old tabs were closed must not overwrite an open draft. Provider and worker
listeners are removed on unmount.

## 8. Health and release identity

`GET /api/health` is dynamic and non-cacheable. Its payload includes:

- liveness (`status`) and configuration readiness;
- product version and full/short release SHA;
- Vercel deployment URL/id and environment where available;
- executing and configured Vercel regions;
- Firebase project and Functions origin/region;
- App Check configuration presence and the names—not values—of missing production settings.

The package/manifest version is currently `0.1.0`. It is not sufficient to prove artifact identity.
Promotion and rollback evidence must record the full 40-character commit SHA and deployment URL/id.

## 9. Test and release system

Run local gates without relying on historical test counts:

```bash
npm ci
npm run release:contract
npm run audit:regions
npm run audit:licenses
npm run lint
npm run typecheck
npm test
npm run test:rules       # requires Java and Firebase emulators
npm run test:e2e         # requires Playwright Chromium and WebKit
npm run build
(cd functions && npm ci && npm test)
```

CI separates application, Rules, Functions, and browser jobs. Browser smoke coverage cold-loads
key routes using project device fixtures for desktop Chromium, Pixel-class Chromium, and iPhone
WebKit. Artifacts live under ignored `.vercel/` paths so evidence generation cannot make the
guarded production worktree dirty; a full-SHA-pinned upload action retains CI and staged-release
reports for 14 and 30 days respectively.

Production promotion is intentionally unavailable until the release topology is corrected. The
workflow has an unconditional fail-closed step before secrets or mutations. Implement a true
staging-Firebase plus staging-configured-web job first, then pass validated SHA/status/artifact
outputs to a separate `production` environment job so human approval occurs after evidence exists.
Only then enable this intended sequence:

1. Dispatch `.github/workflows/release.yml` on `main` with the exact full candidate SHA.
2. The upstream staging job produces matching-SHA Firebase/web/authenticated-contract evidence.
3. GitHub's protected `production` environment requests approval after that evidence and supplies
   production secrets only to the mutation job.
4. Validate that the SHA is an ancestor of `main`, run all source gates, and link the intended
   Vercel organization/project explicitly.
5. Build once, deploy the prebuilt production artifact with `--skip-domain`, and test the staged URL.
6. Verify health SHA, readiness, production provider/deployment identity, actual regions, Firebase
   project, quota Function, and OAuth discovery.
7. Capture and verify the currently live web SHA, deploy the compatible Firebase plane from the
   same candidate, then rerun release-level health/identity/quota-secret/OAuth probes for both the
   prior web artifact and staged candidate. Authenticated compatibility comes from the required
   matching-SHA true-staging record; promotion has no web-only bypass.
8. Promote the already-tested Vercel artifact and verify `threadmap.app` against the candidate SHA.

Automatic `main` promotion is disabled in `vercel.json`. No ordinary pull request needs production
secrets: `release:contract` validates structure only, while `release:check` and the future enabled
release topology validate actual production values. See `PRODUCTION_READINESS.md`, `RELEASE_DRILL_EVIDENCE.md`, and
`RECOVERY_RUNBOOK.md` for approval, evidence, and rollback requirements.
