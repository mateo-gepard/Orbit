# Threadmap — System Documentation

**Written:** 2026-08-07 · against `main` @ `c133eb0`

Threadmap is a local-first personal productivity system built on a single universal item type.
Tasks, projects, habits, events, goals and notes are all the same shape, linked into one graph, so
a task can belong to a project, reference a note, support a goal, and appear on the calendar
without leaving the model.

This document describes how the system is actually built. For known defects see
[AUDIT.md](AUDIT.md); for the current state of work see [HANDOFF.md](HANDOFF.md).

---

## Contents

1. [Shape of the repository](#1-shape-of-the-repository)
2. [The data model](#2-the-data-model)
3. [Runtime, storage and sync](#3-runtime-storage-and-sync)
4. [The app surface](#4-the-app-surface)
5. [Cloud Functions](#5-cloud-functions)
6. [The MCP server](#6-the-mcp-server)
7. [Internationalisation](#7-internationalisation)
8. [Testing](#8-testing)
9. [Build, CI and deployment](#9-build-ci-and-deployment)

---

## 1. Shape of the repository

```
src/
  app/          App Router pages + API routes      ~25 routes
  components/   shell, providers, items, files, notes, mobile, ui
  lib/          stores, persistence, Firebase, parsing, tools     ~70 modules
  test/         Firestore rules suite (emulator-gated)
functions/
  src/          Cloud Functions (Node 22, 2nd gen)
  src/mcp/      OAuth 2.1 AS + MCP server + 23 tools
firestore.rules · storage.rules · firestore.indexes.json
```

Roughly **53,000 lines** across `src/` and **9,300** across `functions/src/`.

The largest modules, which is also a fair map of where the complexity lives:

| Module | Lines | What |
|---|---:|---|
| `src/app/tools/abitur/page.tsx` | 2,620 | German Abitur grade calculator |
| `src/app/tools/flight/page.tsx` | 2,429 | Flight logging tool |
| `src/app/settings/page.tsx` | 2,240 | Settings |
| `src/lib/i18n.ts` | 2,206 | 423-key en/de translation table |
| `src/lib/firestore.ts` | 2,154 | Sync orchestration — optimistic writes, revisions, outbox |
| `functions/src/index.ts` | 2,035 | All Cloud Functions |
| `src/components/shell/detail-panel.tsx` | 1,805 | The universal item editor |
| `functions/src/mcp/dal.ts` | 1,777 | Owner-scoped Firestore access for MCP |
| `functions/src/mcp/oauth.ts` | 1,680 | OAuth 2.1 authorization server |

---

## 2. The data model

### The universal item

Everything the user creates is an `OrbitItem` (`src/lib/types.ts`). One shape, six types,
type-specific fields left optional:

```ts
type ItemType   = 'task' | 'project' | 'habit' | 'event' | 'goal' | 'note';
type ItemStatus = 'active' | 'waiting' | 'done' | 'archived';
type Priority   = 'low' | 'medium' | 'high';
```

| Group | Fields |
|---|---|
| Identity | `id`, `type`, `status`, `title`, `content`, `userId` |
| Time | `createdAt`, `updatedAt`, `completedAt`, `revision` |
| Task | `dueDate`, `priority`, `checklist`, `myDay` |
| Project | `emoji`, `color`, `tier` (1–3) |
| Habit | `frequency`, `customDays`, `habitTime`, `completions` |
| Event | `startDate`, `endDate`, `startTime`, `endTime`, `googleCalendarId`, `calendarSynced` |
| Goal | `timeframe` (quarterly/yearly/longterm), `metric` |
| Note | `noteSubtype` (idea/principle/plan/journal/general) |
| Relations | `parentId`, `linkedIds`, `tags` |
| Files | `files: ProjectFile[]` |

> **Correction pending.** `types.ts:37` documents `content` as *"Rich text (HTML from Tiptap)"*.
> It holds **plain text** — the note editor is a `<textarea>` and no Tiptap package is imported
> anywhere. This false comment is what `htmlToPlainText` was written against, and it caused a
> content-corruption bug (audit M-03). See F-24.

### Relations

Two distinct mechanisms:

- **`parentId`** — hierarchy. Projects and goals act as parents; `ALLOWED_PARENT_TYPES`
  (`src/lib/links.ts`) governs what may parent what. Projects cannot currently nest.
- **`linkedIds`** — peer links, bidirectional, with reverse links surfaced in the UI.

`revision` is a monotonic cloud counter used to reject stale cross-device writes.

### Tags and life areas

11 fixed life-area tags (`tech`, `uni`, `career`, `health`, `family`, `social`, `growth`,
`finance`, `home`, `personal`, `life`) plus free tags. Each area gets a generated page at
`/areas/[tag]`.

---

## 3. Runtime, storage and sync

Threadmap runs in two modes, chosen explicitly rather than by silent fallback.

| Mode | Identity | Storage |
|---|---|---|
| Local / demo | `demo-user` | localStorage only, no backend |
| Signed in | Firebase Auth uid | Firestore + localStorage mirror |

### Account-scoped storage

Every browser key is scoped by account (`src/lib/account-storage.ts`):

```
orbit-items:<uid>        orbit-settings:<uid>       orbit-wishlist:<uid>
orbit-tags:<uid>         orbit-abitur:<uid>         orbit-toolbox:<uid>
```

The pre-auth scope is the literal string `signed-out`. `migrateLegacyStorageToDemo` carries
unscoped legacy keys into the demo profile **only** — never into a signed-in account, deliberately,
so one user's browser data cannot leak into another's account.

> Work done before signing in is therefore orphaned rather than migrated (F-22). Real data can sit
> under `orbit-abitur:signed-out` and be unreachable after account creation.

### The sync path

`src/lib/firestore.ts` is the orchestration layer. Its public surface:

```
subscribeToItems · createItem · updateItem · deleteItem · getItem
linkItems · unlinkItems
subscribeToUserSettings · saveUserSettings · saveTagMutation
saveToolData · subscribeToToolData
setFirestoreDataContext · isFirestoreDataContextCurrent · retryQueuedItemMutations
```

Writes are optimistic: the Zustand store updates first, the Firestore write follows, and a
`revision` check rejects stale writes from another device. Failed writes go to a **mutation
outbox** (`item-mutation-outbox.ts`) and are retried. Per-item ordering is guaranteed by a
`KeyedSerialQueue`, so concurrent edits to one item serialise while different items proceed in
parallel. `setFirestoreDataContext` / `isFirestoreDataContextCurrent` are account-generation
guards — they stop an in-flight write from a previous account landing in the current one.

The primitives underneath are individually tested (outbox, keyed queue, verified storage, merge
recovery). The orchestration on top of them is not (F-58) — which is where this design's risk
actually lives.

> The item subscription is `where userId == uid` + `orderBy updatedAt desc` with **no `limit()`**,
> and each snapshot is `JSON.stringify`'d whole into localStorage against a ~5 MB ceiling (F-19).

### Providers

`src/components/providers/` composes the runtime:

| Provider | Responsibility |
|---|---|
| `auth-provider` | Firebase Auth state, sign-in flows, local-mode flag |
| `data-provider` | Subscriptions, sync status, conflict banners |
| `settings-effects` | Applies settings as side effects (auto-archive, theme, fonts) |
| `theme-provider` | Light/dark/system |
| `pwa-provider` | Service worker registration and update prompts |
| `error-boundary` | Render-error containment |

---

## 4. The app surface

### Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard — focus tiles, week strip, carried-over work |
| `/today` | My Day |
| `/tasks` | Task list — status/tag/priority filters, sort, grouping |
| `/projects` | Projects and project dashboards |
| `/habits` | Habit tracking, week and month views |
| `/goals` | Goals with progress |
| `/notes` | Notes, filtered by subtype |
| `/calendar` | Month / week / day grids |
| `/files` | Attachments (projects only today — F-25) |
| `/archive` | Archived items, restore |
| `/areas/[tag]` | Generated life-area pages |
| `/toolbox` | Tool launcher |
| `/tools/{abitur,flight,dispatch,briefing,wishlist}` | Focused tools |
| `/briefing` | Daily briefing |
| `/settings` | Settings |
| `/integrations/authorize` | **MCP OAuth consent screen** |
| `/api/health` | Vercel health probe |
| `/api/scrape`, `/api/scrape/image`, `/api/scrape/price` | Wishlist import helpers |

### The command bar

`⌘K` opens the single capture surface (`src/components/shell/command-bar.tsx`), which parses a
natural-language line via `src/lib/command-parser.ts`:

| Syntax | Meaning |
|---|---|
| `/task` `/note` `/project` `/habit` `/goal` `/event` `/idea` | Item type |
| `#tag` | Tag |
| `!priority` | Priority |
| `@name` | Link to another item |
| `heute`, `morgen`, `tomorrow`, `friday`, `15.12`, … | Bilingual date keywords |

> This language is **undocumented anywhere in the app** (F-14) and the parser has three critical
> defects in it (F-10, F-11, F-12). It is the app's headline feature and its least safe surface.
> Read those findings before changing anything here.

### The shell

`app-shell.tsx` owns layout: sidebar, mobile nav, command bar, detail panel, completion animation.
Two exemptions matter — the MCP consent screen (`/integrations/authorize`) renders bare, without
app chrome, because it is a standalone decision surface and provides its own `<main>`; and it is
exempt from the signed-out redirect, so a one-time `?request=` token is never discarded.

---

## 5. Cloud Functions

Firebase project `orbit-9e0b6`, region `us-central1`, Node 22, 2nd gen.
**The codebase is named `briefing-cron`** — deploy filters must include it.

| Function | Purpose |
|---|---|
| `sendBriefingNotifications` | Scheduled push briefings |
| `upsertThreadmapPushDevice` / `updateThreadmapPushSchedule` / `deleteThreadmapPushDevice` | Push device registry |
| `consumeThreadmapScrapeQuota` | Rate limiting for scrape helpers |
| `repairThreadmapHierarchy` | Parent/child integrity repair |
| `deleteThreadmapItem` | Cascade delete |
| `beginThreadmapUpload` / `attachThreadmapUpload` / `cleanupThreadmapUpload` | Upload handshake |
| `deleteThreadmapAttachment` / `cleanupDeletedItemFiles` | Attachment lifecycle |
| `exportThreadmapAccount` / `deleteThreadmapAccount` / `retryThreadmapAccountDeletions` | Account workflows |
| `threadmapMcp` | **The MCP + OAuth HTTP endpoint** |

---

## 6. The MCP server

`functions/src/mcp/` — an OAuth 2.1 authorization server and an MCP server over Streamable HTTP,
serving exactly one Threadmap account. Full operational detail is in [MCP_SETUP.md](MCP_SETUP.md);
this is the shape.

### Layout

| File | Role |
|---|---|
| `config.ts` | Derives every URL from one origin; reads env |
| `oauth.ts` | OAuth 2.1 AS — PKCE, DCR, resource indicators, refresh rotation |
| `metadata.ts` | RFC 8414 / RFC 9728 discovery documents |
| `http.ts` | Web-standard router + Node/Express bridge |
| `sdk-server.ts` | Registers the tool catalog on a per-request `McpServer` |
| `tools.ts` | Tool catalog, scope enforcement, quotas, audit records |
| `dal.ts` | Owner-scoped Firestore access, idempotency, delete confirmation |
| `security.ts` | Redirect classification, PKCE, token hashing |

Built on `@modelcontextprotocol/server` v2, stateless per request via
`createMcpHandler(factory, { legacy: 'stateless' })`.

### Endpoints

```
/mcp                                            the MCP endpoint
/.well-known/oauth-protected-resource/mcp       RFC 9728
/.well-known/oauth-authorization-server         RFC 8414
/api/mcp/oauth/{authorize,token,register,revoke}
/integrations/authorize                         consent screen (Next.js)
```

### Authorization

OAuth 2.1: authorization code + PKCE S256, RFC 8707 resource indicators, dynamic client
registration, RFC 7009 revocation, RFC 8252 loopback redirects for local clients. Refresh tokens
rotate, and reuse is detected — a replayed refresh token revokes its whole token family.

**Scope narrowing.** Hosts commonly request every scope discovery advertises. Rather than refuse,
both the registration and authorization endpoints grant the intersection with policy and report it
back (RFC 7591 §2, RFC 6749 §3.3), refusing only when nothing requested is grantable. Downstream of
the authorize endpoint every check is a strict subset test.

### Tools

23 tools, and `tools/list` is filtered to the scopes the presented token actually carries.

| Scope | Tools |
|---|---|
| `threadmap.read` | `get_life_overview`, `get_agenda`, `list_items`, `search_items`, `get_item`, `list_tags`, `list_files_metadata`, `get_wishlist`, `get_abitur_profile`, `get_flight_logs`, `get_briefing_journal`, `get_dispatch_plans`, `get_settings`, `get_toolbox` |
| `threadmap.write` | `create_item`, `update_item`, `complete_item`, `archive_item`, `set_habit_completion`, `link_items`, `unlink_items` |
| `threadmap.delete` | `preview_delete_item`, `confirm_delete_item` |

Write safety, enforced server-side regardless of what a host or model claims: mutations require
`expected_revision` and fail on a stale one; every write needs a fresh `client_request_id` UUID and
replays are idempotent; deletion is two-stage, where `preview_delete_item` returns a short-lived,
single-use token bound to owner, client and revision that `confirm_delete_item` must present. File
tools return metadata only — never URLs, paths or contents. `get_settings` returns an allowlisted
projection.

Nothing an item's own content says can widen a scope, skip a confirmation, or trigger a tool.

### Verifying a deployment

```bash
curl -s https://threadmap.app/.well-known/oauth-protected-resource/mcp
```

```bash
curl -s -X POST https://threadmap.app/api/mcp/oauth/register -H 'content-type: application/json' -d '{"client_name":"Probe","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"scope":"threadmap.read threadmap.write threadmap.delete offline_access"}'
```

A correct server returns 201 with `scope` narrowed to `threadmap.read threadmap.write
offline_access`. Delete probe clients from `mcpOAuthClients` afterwards.

---

## 7. Internationalisation

English and German, with German as the primary language. `src/lib/i18n.ts` holds **423 keys** at
exact en/de parity — no duplicates, no gaps — plus a `hockeyOverrides` layer for a joke theme.

Alongside it sit roughly **250 inline `language === 'de' ? … : …` ternaries across 27 files**
(F-49). Two surfaces — `areas/[tag]/page.tsx` and the sidebar's delete-area dialog — bypass the
table entirely. A third language would mean hunting through components rather than editing one
table.

The app addresses the user informally (*du*) throughout, with two stray formal *Sie* strings in the
email-link sign-in flow (F-51).

---

## 8. Testing

| Suite | Runner | Count |
|---|---|---|
| App unit tests | Vitest | **217 passing**, 19 skipped |
| Firestore rules | Vitest + emulators | 19 (the skipped ones) |
| Functions | `node:test` | **38 passing** |

```bash
npm test           # app
npm run test:rules # rules, needs Java + emulators
cd functions && npm test
```

> A local `npm test` reports 19 skipped. That is the entire Firestore rules suite, gated on
> emulator availability. CI runs it in a dedicated job so it *is* covered — but a local run looks
> like the security rules passed when they never executed (F-61).

**Well covered:** the storage and sync primitives (outbox, keyed queue, verified storage, merge
recovery), task buckets, dates, badges, dispatch durability, flight sessions, the OAuth flow end to
end, and — in the Abitur tool — `calculateBlockII`, `calculateSemesterPoints`,
`calculateSeminarTotal`, and validation.

**Not covered:** `firestore.ts` and `store.ts`, the two most intricate modules (F-58); the Abitur
tool's `calculateBlockI`, `calculateAbitur` and `optimizeEinbringungen` — the headline number and
the results that get submitted (F-59); and the command parser's mention and keyword-stripping
passes, which is exactly why three critical parser bugs survived (F-60).

---

## 9. Build, CI and deployment

**Stack.** Next.js 16.3 · React 19.2 · TypeScript · Tailwind 4 · Zustand 5 · `radix-ui` ·
Firebase 12 (Auth, Firestore, Storage, Messaging, Functions) · Vercel · Node 22 (`.nvmrc`).

Six `@tiptap/*` packages and `cmdk` are declared dependencies with **zero imports** anywhere in
`src/` — the note editor is a plain `<textarea>` and the command bar is hand-rolled (F-24).

> `AGENTS.md` warns that this Next.js version has breaking changes against older knowledge. Read
> `node_modules/next/dist/docs/` before writing framework code.

### CI

`.github/workflows/ci.yml` runs three jobs: **app** (lint, typecheck, test, build), **rules**
(emulator-backed Firestore rules), **functions** (build + `node:test`). The functions job was added
in this session — 357 lines of OAuth security tests had never run in CI before it.

### Full local verification

```bash
npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

### Deployment

The Next.js app deploys to Vercel from `main`. `vercel.json` rewrites five paths to the Cloud
Functions origin, which is what makes the MCP server appear on the app's own domain:

```
/mcp                                        → …cloudfunctions.net/threadmapMcp/mcp
/.well-known/oauth-authorization-server      → …/threadmapMcp/.well-known/…
/.well-known/oauth-protected-resource[/mcp]  → …/threadmapMcp/.well-known/…
/api/mcp/oauth/:path*                        → …/threadmapMcp/api/mcp/oauth/:path*
```

This matters more than it looks: OAuth metadata validation requires the issuer origin and every
endpoint origin to match, so the server must be reachable at `threadmap.app`, not at the raw
Functions URL. `MCP_ORIGIN` and these rewrites have to agree.

```bash
npm run deploy:rules
```

```bash
npx firebase deploy --only functions:briefing-cron:threadmapMcp --non-interactive
```

MCP configuration lives in `functions/.env`, which is **gitignored and exists only on the original
machine** — recreate it elsewhere or the endpoint returns 503 by design. See
[HANDOFF.md](HANDOFF.md) §3.
