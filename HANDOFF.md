# Threadmap — Handoff

**Written:** 2026-08-07  
**Branch:** `main` @ `c133eb0`  
**Live:** app at `https://threadmap.app` (Vercel) · Functions in Firebase project `orbit-9e0b6`

This is the state of play, what changed in the last session, and what to pick up next.
For the defect list see [AUDIT.md](AUDIT.md). For how the system is built see
[DOCUMENTATION.md](DOCUMENTATION.md).

---

## 1. Where things stand

| Area | State |
|---|---|
| App (Next.js on Vercel) | Live and healthy. 217 tests, typecheck clean, 0 lint errors (10 pre-existing warnings). |
| Cloud Functions | 16 functions deployed. Build exits 0, 38 tests pass. |
| MCP server | **Deployed and connectable.** OAuth 2.1 + DCR working against Claude. |
| Firestore rules / indexes | Deployed, including 9 TTL policies for the OAuth collections. |
| Audit findings | 70 total, 7 fixed — all in the MCP server. **63 open** across the app. |

The headline: the MCP work is finished and verified end to end. The rest of the audit
has not been started.

---

## 2. What changed in the last session

### The MCP server went from "does not compile" to "connected"

Five commits on `main`:

| Commit | What |
|---|---|
| `c57dfb9` | Backup of the pre-wiring Threadmap state. |
| `740e051` | Wire the MCP server to HTTP on the official v2 SDK. |
| `e269f85` | Keep the RFC 9728 quotes in the bearer challenge. |
| `112decc` | Narrow over-broad registration scopes instead of refusing the client. |
| `c133eb0` | Narrow over-broad scopes at authorization, not just registration. |

The substantive pieces:

- **A build blocker was removed.** `new RpcValidationError(-32600 - 1, …)` widened to `number`,
  which failed the `-32600 | -32602` union and made `npm run build` exit 2 — which aborted the
  `predeploy` hook and therefore blocked deploying *every* Cloud Function, not just MCP. Fixed to
  a literal `-32601` with a widened union.
- **A content-corrupting bug was removed.** `htmlToPlainText` ate everything between any `<` and
  the next `>`, so `Fix: if (a < b) { return <result>; }` became `Fix: if (a ; }`. Item content is
  plain text from a `<textarea>`, not Tiptap HTML as `types.ts` still claims. Now gated on an
  allowlisted tag-name pattern.
- **The server was wired up.** New `sdk-server.ts` (registers 23 tools on `McpServer`, filtered by
  the presented token's scopes) and `http.ts` (web-standard router plus a Node/Express bridge),
  exported as the `threadmapMcp` function. The hand-rolled `server.ts` was deleted.
- **A consent screen was added** at `/integrations/authorize`, plus `firestore.rules` deny blocks
  and TTL policies for the OAuth collections.
- **CI now runs the Functions tests**, which it previously did not — 357 lines of OAuth security
  tests had never executed in CI.

### Three bugs that only a real client could find

Worth reading, because they say something about how to verify this kind of work.

1. **RFC 9728 quotes were being stripped in production.** A `safeHeaderValue()` wrapper replaced
   `"` with a space, emitting `resource_metadata= https://…` instead of the quoted form. Unit tests
   passed; only a live `curl` caught it.
2. **Registration refused Claude outright.** Discovery advertises `scopes_supported` including
   `threadmap.delete`, while `MCP_DYNAMIC_CLIENT_SCOPES` withholds it. Claude requests what the
   server advertises, so it was refused with `invalid_client_metadata`.
3. **Then authorization refused it, for the same reason.** After fixing registration, a host that
   had been granted a narrowed scope still re-requested the full advertised set at the authorize
   endpoint, which rejected the mismatch with `invalid_scope`.

Both scope bugs are now handled the way RFC 6749 §3.3 provides for: **grant the intersection and
report it back**, refusing only when nothing requested is grantable. Downstream of the authorize
endpoint every scope check stays a strict subset test, because from there the set has been
validated and a mismatch is tampering rather than host variance.

> The pattern: unit tests and self-directed `curl` probes both verified the server against my own
> assumptions about what a client sends. Neither could catch a disagreement with a real host.

### Cleanup performed

- Deleted 8 orphaned production Cloud Functions left over from abandoned branch work
  (`threadmapMcpGateway`, `getThreadmapMcpAuthorizationRequest`, `approveThreadmapMcpAuthorizationRequest`,
  `denyThreadmapMcpAuthorizationRequest`, `listThreadmapMcpClients`, `listThreadmapMcpTokenFamilies`,
  `revokeThreadmapMcpClient`, `revokeThreadmapMcpTokenFamily`).
- Cleared the 6 OAuth collections, and the throwaway clients created by production DCR probes.

---

## 3. Deployment specifics you will need

### Configuration lives in `functions/.env` — gitignored, and only on this machine

If you deploy from anywhere else, recreate it. None of these are credentials.

```
MCP_OWNER_UID=HdNrppsgPGXphsnZ75MG7wVsu982
MCP_ORIGIN=https://threadmap.app
MCP_ALLOW_LOOPBACK_REDIRECTS=true
MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read threadmap.write offline_access
```

Without `MCP_OWNER_UID` the endpoint returns 503 by design rather than serving an unbound account.

### The Firebase codebase is named `briefing-cron`

This trips people up. Deploying a single function needs the codebase in the filter:

```bash
npx firebase deploy --only functions:briefing-cron:threadmapMcp --non-interactive
```

`--only functions:threadmapMcp` silently matches nothing.

### `threadmap.delete` is deliberately withheld from dynamic clients

Deletion is irreversible, so it stays an explicit choice. A host asking for it connects with read
and write and simply never sees the two delete tools. To grant it, add it to
`MCP_DYNAMIC_CLIENT_SCOPES` and redeploy.

### Verifying a deploy

```bash
curl -s https://threadmap.app/.well-known/oauth-protected-resource/mcp
```

Then register, authorize, and confirm the 302 lands on `/integrations/authorize?request=…`.
A full probe script is in section 6 of [DOCUMENTATION.md](DOCUMENTATION.md).

---

## 4. What to pick up next

The audit's 63 open findings, in the order I would take them.

### First — the capture parser (3 criticals in one cluster)

`src/lib/command-parser.ts` and `src/components/shell/command-bar.tsx`. These compound each other,
which is why they go together:

- **F-10** — the `@` mention pattern's lookahead never terminates at a word boundary, so a mention
  absorbs the rest of the line, *including a date keyword*. `Fix bug @Openpulse tomorrow` yields
  the link title `Openpulse tomorrow` and loses the due date entirely.
- **F-11** — fuzzy link matching tests `linkTitle.includes(item.title)`, so any item whose title is
  a substring of the typed text qualifies and the first `updatedAt desc` hit wins. Because projects
  and goals become hierarchy parents, a bad match *reparents* the item. F-10 makes this far more
  likely by handing it a long string full of common words.
- **F-12** — date-keyword extraction runs for every item type and deletes the matched word from the
  title. Correct for a task; on a note or goal it edits the user's prose. German is worst hit,
  because *heute* and *morgen* are ordinary words: `/note Was ich heute gelernt habe` is stored as
  `Was ich gelernt habe`.

**F-60** is the reason all three survived: the parser tests cover dates and tags carefully but have
no case at all for mentions or the title-mutating keyword pass. Write those tests first — they will
fail, and then they will tell you when you are done.

### Then — the remaining criticals and highs

- **F-01** (critical) restoring an auto-archived task re-archives it on the next render.
- **F-13** a bare `DD.MM` always takes the current year, so anything earlier in the calendar than
  today lands already overdue.
- **F-18** Google Calendar recurrences expand into one item per occurrence — a daily standup
  becomes ~455 loose items, which then flow into **F-19**'s unbounded query.
- **F-19** the item subscription has no `limit()` and mirrors every snapshot whole into
  localStorage, against a ~5 MB ceiling.
- **F-20** conflict-recovery records are written that nothing can read, resolve or delete — and the
  toasts promise a recovery path that does not exist.
- **F-23** "Habit reminder time" persists `habitTime` and nothing ever reads it. Of everything in
  the audit, this is the one most likely to have already cost a missed habit.
- **F-44** Archive's sticky bars don't stick, because `h-full` resolves against an auto-height
  wrapper. The same structural pattern is in `areas/[tag]` and `files`.
- **F-56** an unreachable Firebase leaves the app blank forever — `onAuthStateChanged` has no
  timeout, so `loading` stays `true` and the shell renders an empty `<main>`. A local-first app
  should not be locked out of local data by a network it doesn't need.
- **F-58 / F-59** the two most intricate modules (`firestore.ts`, `store.ts`) have no tests, and in
  the Abitur tool `calculateBlockI`, `calculateAbitur` and `optimizeEinbringungen` — the headline
  number and the results that get submitted — have zero coverage.

### Judgement calls worth making before building

Four findings are feature gaps rather than defects, and each is a real design decision:

- **F-32** there is no recurrence model at all. This is what forces F-18's expansion, so the two are
  one decision, and it is the largest single gap in the calendar.
- **F-34** no bulk actions anywhere, and Archive can restore but never purge.
- **F-36** task filters are ephemeral component state — nothing in the URL, so no bookmarking, no
  sharing, no saved views. For an app built on views over one item graph, saved views are the
  natural feature and the plumbing doesn't exist yet.
- **F-43** projects can't nest (`ALLOWED_PARENT_TYPES.project = []`). Worth confirming this is
  intended rather than an omission.

### Two MCP items remain

- **M-06** (partial) — `tools.ts:515` still derives the required scope by reading `securitySchemes`
  back. Enforcement is independent and the coupling is documented, so this is tidiness, not a hole.
- **M-07** (open) — tool descriptions say what each tool does, rarely when to reach for it. This is
  the difference between a model that picks the right tool and one that guesses.

---

## 5. Things that will bite you

- **`functions/.env` is gitignored and exists only on this machine.** Recreate it before deploying
  from anywhere else, or the endpoint returns 503.
- **The Firebase codebase name is `briefing-cron`,** not the default. Single-function deploy filters
  need it.
- **`firebase functions:log` returns empty payloads for `threadmapMcp`.** Only audit-log entries are
  readable, which is why the DCR failures had to be found by replaying payloads against production.
  The last commit added OAuth error logging with route and code, so this should be better now — but
  verify it before relying on it.
- **`types.ts:37` still documents `content` as "Rich text (HTML from Tiptap)".** It holds plain
  text. Six Tiptap packages are installed and imported nowhere (**F-24**). Fixing the comment
  matters because `htmlToPlainText` was written against the false claim.
- **The audit's own blind spot.** It verified the server against itself. Both post-audit bugs needed
  a real client. If you touch the OAuth paths, test with an actual host, not only with `curl`.
- **Local `npm test` reports 19 skipped** — that is the whole Firestore rules suite, gated on
  emulator availability. CI runs it in a dedicated job, so it *is* covered, but a local run looks
  like the security rules passed when they never executed (**F-61**).

---

## 6. Commands

```bash
npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

```bash
cd functions && npm ci && npm test
```

```bash
npm run test:rules
```

```bash
npx firebase deploy --only functions:briefing-cron:threadmapMcp --non-interactive
```
