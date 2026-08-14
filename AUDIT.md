# Threadmap — Codebase Audit

> Production-launch controls and remaining console/owner actions are tracked separately in `PRODUCTION_READINESS.md`.

**Audited:** 2026-08-06 → 2026-08-07  
**Scope:** the full repository at `main` — app, Cloud Functions, rules, tests, docs.  
**Method:** code reading throughout, plus live probing of the signed-in production app at `threadmap.app` and of the deployed Cloud Functions. Findings marked **Proven** were reproduced (a probe, a measurement, or a live request); findings marked **Read** are from code inspection alone.

> The original audit artifact reused the id `F-11` for two different findings. Ids here are renumbered cleanly in document order; where a finding’s original label differed it is noted as *(was F-xx)*.

## Summary

| Severity | Count | Fixed | Open |
|---|---:|---:|---:|
| Critical | 6 | 4 | 2 |
| High | 16 | 2 | 14 |
| Medium | 26 | 3 | 23 |
| Low | 20 | 1 | 19 |
| **Total** | **70** | **9** | **61** |

The table covers the 70 findings with two further defects (M-08, M-09) found afterwards while connecting a real client and both are fixed — bringing the totals to **70 findings, 9 fixed**.

Every MCP item in section 10 is now fixed. Sections 2–9 still contain open findings.

## Priority order

The six criticals and the highs that compound them, in the order they should be taken:

| # | Id | Finding | Why first |
|---:|---|---|---|
| 1 | M-01 | Functions package does not compile | Blocked deploying *every* Cloud Function, not just MCP. |
| 2 | M-03 | `htmlToPlainText` destroys content | Silent data corruption on every read path through it. |
| 3 | F-10 | An @ mention swallows everything after it | Eats the due date too, and feeds F-11. |
| 4 | F-11 | Fuzzy link matching reparents arbitrarily | Wrong parent is worse than a stray link; F-10 makes it likely. |
| 5 | F-12 | Date keywords deleted from note/goal titles | Edits the user’s prose; worst in German. |
| 6 | F-01 | Restoring an auto-archived task re-archives it | Unrecoverable from the UI; burns a write each attempt. |

---

## 02 · Data integrity & logic

*9 findings*

### F-01 · Restoring an auto-archived task immediately re-archives it

**Critical** · Proven · ⬜ Open

Archive's restore sets `status: 'done'` and keeps the original `completedAt`. The auto-archive effect then re-matches the same task on the very next render, because its `completedAt` is still past the cutoff. The user gets an "Item restored" toast and watches the row vanish — forever, on every attempt. It also burns a Firestore write each time.

Only triggers when `autoArchiveDays > 0`, which is off by default.

```
Probe: task completed 40d ago, policy 30d, "restored" to done
getAutoArchiveTaskIds([restored], 30, now) → ["t1"]   // re-archived
```

`src/app/archive/page.tsx:49–52` · `src/components/providers/settings-effects.tsx:81` · `src/lib/auto-archive.ts:14`

### F-02 · Goal progress is diluted by items that can never complete *(was F-06)*

**High** · Read · ⬜ Open

The denominator counts *every* related item — child or linked, of any type. Notes, events and habits go in but can never reach `status: 'done'`, so attaching reference notes to a goal permanently caps it below 100%. A goal with two finished tasks and three reference notes reads 40%.

`src/app/goals/page.tsx:38–51`

### F-03 · Rapid habit toggles are dropped without feedback *(was F-16)*

**High** · Read · ⬜ Open

`toggleInFlightRef` is keyed by habit ID alone, so ticking several days of one habit in quick succession discards every click after the first — no error, no visual revert. `updateItem` already serialises per item via `KeyedSerialQueue`, so this guard only costs input.

`src/app/habits/page.tsx:61`

### F-04 · European price formats are silently discarded by the scraper *(was F-15)*

**High** · Read · ⬜ Open

The cleaner strips non-numerics then replaces only the *first* comma, so `"1.234,56"` becomes `"1.234.56"` and fails the final `^\d{1,8}(\.\d{1,2})?$` guard. Price comes back undefined. This is the default format on the German retail sites the tool sends a `de-DE` Accept-Language for.

`src/app/api/scrape/route.ts:177` · `:41`

### F-05 · "Sort by due date, descending" puts undated tasks at the top *(was F-11)*

**Medium** · Read · ⬜ Open

The comparator deliberately pushes tasks without a due date to the end, then the whole array is `.reverse()`d for descending order — flipping them to the front. The one sort a user reaches for to see "furthest-out work" leads with everything unscheduled.

`src/app/tasks/page.tsx:59–62, 77`

### F-06 · The sort direction arrow is inverted for "Newest" *(was F-12b)*

**Low** · Read · ⬜ Open

`createdAt`'s comparator already returns newest-first, but selecting it sets `sortAsc: true` and renders ↑. The arrow says ascending while the list shows descending.

`src/app/tasks/page.tsx:69–70, 517–528`

### F-07 · Numeric HTML entities above U+FFFF get mangled *(was F-14b)*

**Low** · Read · ⬜ Open

The entity decoder uses `String.fromCharCode` where it needs `fromCodePoint`, so an emoji in a scraped page title arrives as garbage.

`src/app/api/scrape/route.ts:80–81`

### F-08 · Two independent implementations of "project progress" *(was F-32)*

**Low** · Read · ⬜ Open

`getProjectStats` on the Projects page and `getProjectTaskProgress` in `lib/dashboard.ts` compute the same number separately. They agree today — the library's own comment says "Match the Projects view", which is the tell that they can drift.

`src/app/projects/page.tsx:105–113` · `src/lib/dashboard.ts:13`

### F-09 · A dead branch in the task bucket filter *(was F-33)*

**Low** · Read · ⬜ Open

`item.status === 'done' || item.status !== 'archived'` reduces to `status !== 'archived'`; the first clause can never decide the result. Behaviour is correct, intent is not readable.

`src/lib/task-buckets.ts:37–39`

---

## 03 · Capture — the command bar & parser

*8 findings*

### F-10 · An `@` mention swallows everything after it *(was F-02)*

**Critical** · Proven · ⬜ Open

The link pattern's lookahead only terminates at another sigil or end-of-string, never at a word boundary. So the mention absorbs the rest of the line — including a date keyword, which means the due date is silently lost as well as the link being unresolvable.

```
"Email @john about the report"
  → linkedItemTitles: ["john about the report"]

"/task Fix bug @Openpulse tomorrow"
  → linkedItemTitles: ["Openpulse tomorrow"]
  → dueDate: undefined        // "tomorrow" was eaten

"/task ping @Alice @Bob now"
  → linkedItemTitles: ["Alice", "Bob now"]
```

`src/lib/command-parser.ts:69`

### F-11 · Fuzzy link matching can attach an item to an arbitrary parent *(was F-03)*

**Critical** · Read · ⬜ Open

The fallback match tests `linkTitle.includes(item.title)` — so *any* item whose title happens to be a substring of the typed text qualifies, and the first hit in `updatedAt desc` order wins. Because projects and goals become
*hierarchy parents* rather than peer links, a bad match doesn't just add a stray
link: it reparents the new item under the wrong project.

F-02 makes this materially worse, since the swallowed text is long and full of common words.

`src/components/shell/command-bar.tsx:211–214, 235–238`

### F-12 · Date keywords are deleted from note and goal titles *(was F-04)*

**Critical** · Proven · ⬜ Open

Keyword extraction runs for every item type and removes the matched word from the title. On a task that's the intent. On a note or goal it quietly edits the user's prose and attaches a due date that means nothing. German is hit hardest, because `heute` and `morgen` are ordinary words in ordinary sentences.

```
"/note Was ich heute gelernt habe"
  → title: "Was ich gelernt habe"   dueDate: 2026-08-07

"/note Ideas for the Monday meeting"
  → title: "Ideas for the meeting"  dueDate: 2026-08-10

"/goal Become fluent by friday"
  → title: "Become fluent by"       dueDate: 2026-08-14
```

`src/lib/command-parser.ts:87–128`

### F-13 · A bare `DD.MM` resolves into the past *(was F-05)*

**High** · Proven · ⬜ Open

A date without a year always takes the current year, so anything earlier in the calendar than today lands as an already-overdue task. No roll-forward to the next occurrence, and no indication that the parsed date is behind you.

```
system date 2026-08-07
"Taxes 1.3"    → dueDate 2026-03-01   // five months overdue
"Review 15.12" → dueDate 2026-12-15          // correct
```

`src/lib/command-parser.ts:101–120`

### F-14 · The whole capture language is undocumented *(was F-13b)*

**High** · Read · ⬜ Open

Settings → Shortcuts lists four bindings: `⌘K`, `Esc`, `Enter`, `↑↓`. Nothing anywhere documents the type prefixes (`/task` … `/idea`), `#tag`, `!priority`, `@link`, or the bilingual date keywords. The command bar's empty state shows only six type buttons.

This is the feature the README leads with, and it's the app's least discoverable surface. It also means users have no way to anticipate F-02 or F-04.

`src/app/settings/page.tsx:277–282` · `src/components/shell/command-bar.tsx:701–729`

### F-15 · Search is inconsistent across five surfaces *(was F-34)*

**Medium** · Read · ⬜ Open

Command bar matches title + tags and *includes archived items with no label*; Tasks matches title only; Notes matches title + content; Archive matches title + tags; Areas matches title only. Note bodies are unreachable from the global command bar — the one place a user would look. The command bar caps at six results with no "see all".

`command-bar.tsx:137–145` · `tasks/page.tsx:313–316` · `notes/page.tsx:55–58` · `archive/page.tsx:27–31` · `areas/[tag]/page.tsx:53`

### F-16 · Submitting an empty command closes silently *(was F-35)*

**Low** · Read · ⬜ Open

Typing `/task` and pressing Enter clears the input and dismisses the dialog with no item created and no message. Also: `parsed.title` is mutated in place during submit to strip leftover `@` text — a sign the parser and the command bar disagree about who owns mention handling.

`src/components/shell/command-bar.tsx:176–180, 223–225`

### F-17 · Command bar listbox ARIA is structurally invalid *(was F-36)*

**Low** · Read · ⬜ Open

`role="option"` elements sit inside section-label `<div>`s under `role="listbox"`. Options must be children of the listbox, or wrapped in `role="group"`. Screen readers won't reliably report position or count.

`src/components/shell/command-bar.tsx:486–596`

---

## 04 · Scale & storage

*5 findings*

### F-18 · Google Calendar recurrences expand into one item per occurrence *(was F-10)*

**High** · Read · ⬜ Open

The fetch passes `singleEvents: 'true'` over a window of −90 days to +1 year, and each expanded instance becomes its own Threadmap `event`. A weekly meeting produces roughly 68 items; a daily standup roughly 455. They carry no relationship to each other, can't be bulk-edited, and there's no recurrence model to push back.

They then flow into the dashboard week strip, the calendar, search results and the item count — and into F-11's unbounded query.

`src/lib/google-calendar.ts:667` · `src/lib/google-calendar-sync.ts:188–197`

### F-19 · No query limit, and every snapshot is mirrored whole into localStorage *(was F-11)*

**High** · Proven · ⬜ Open

The item subscription is `where userId == uid` + `orderBy updatedAt desc` with no `limit()`, so the client downloads the entire item history every session and holds it in memory. `saveLocalItems` then `JSON.stringify`s the whole array into localStorage on every snapshot.

Your account is comfortable today, but tool data already outweighs items, and the ~5 MB localStorage ceiling is a hard wall that F-10 can drive you into.

```
live signed-in browser, threadmap.app
items                       310  (task 205, event 63, project 23, note 10, habit 5, goal 4)
orbit-items                 103.0 KB   ≈ 330 B/item
orbit-tool-conflict:wishlist 88.2 KB   ← stranded, see F-09
orbit-tool-wishlist          44.0 KB   ┐ same payload,
orbit-wishlist               43.9 KB   ┘ stored twice (F-17)
total localStorage          293.2 KB
```

`src/lib/firestore.ts:726–730, 366–393`

### F-20 · Conflict recovery writes records nothing can read, resolve, or delete *(was F-09)*

**High** · Proven · ⬜ Open

`tool-conflict-recovery.ts` exports `listToolConflicts`, which is never called anywhere in the app. There is no resolve function and no delete function. Records accumulate until the cap, at which point `preserveToolConflict` throws.

Meanwhile the conflict toasts promise recovery — "This browser copy was preserved", "reload to choose which version to keep", "remains available in this account's export" — but the banner offers only Retry and Dismiss. There is no in-app path to any of it. Your browser is holding an 88 KB wishlist conflict right now, the second-largest key in storage, with no way to see or act on it.

```
grep listToolConflicts src/ → 0 call sites
grep 'removeToolConflict|resolveToolConflict|clearToolConflict' → 0 matches
MAX_CONFLICTS_PER_ACCOUNT = 30, then preserveToolConflict() throws
```

`src/lib/tool-conflict-recovery.ts:29, 65` · `src/lib/firestore.ts:2030–2057` · `src/components/providers/data-provider.tsx:326–346`

### F-21 · Wishlist data is persisted twice under two keys *(was F-17)*

**Medium** · Proven · ⬜ Open

The Zustand `persist` copy (`orbit-wishlist:<uid>`) and the tool-data mirror (`orbit-tool-wishlist:<uid>`) hold the same payload — 43,920 and 43,981 bytes in your browser. Every tool that combines `persist` with `saveToolData` doubles its local footprint.

`src/lib/wishlist-store.ts:555` · `src/lib/firestore.ts:1928`

### F-22 · Work done before signing in is orphaned, not migrated *(was F-18)*

**Medium** · Proven · ⬜ Open

Storage is scoped per account, and the pre-auth scope is literally `signed-out`. There's a legacy → demo migration but nothing that carries `signed-out` data into a real account, and nothing surfaces it. A user who fills in the Abitur tracker before creating an account finds it empty afterwards, with the data sitting in their browser untouched.

```
present in your browser right now, unreachable by the app:
orbit-abitur:signed-out    3,269 B   ← real Abitur data
orbit-settings:signed-out    910 B
orbit-tags:signed-out        154 B
orbit-wishlist:signed-out     64 B
orbit-toolbox:signed-out      60 B
orbit-tags                   154 B   ← pre-scoping legacy key
```

`src/lib/account-storage.ts:4–7, 14, 40`

---

## 05 · Dead ends & unkept promises

*9 findings*

### F-23 · "Habit reminder time" saves a value that never reminds anyone *(was F-08)*

**High** · Proven · ⬜ Open

The detail panel offers a `type="time"` input labelled *Habit reminder time* and persists `habitTime`. Nothing reads it — no notification scheduling, no display in the habits list, no sorting. Its only other appearance is field pass-through in the Cloud Functions MCP layer.

Of everything here, this is the finding most likely to have already cost you a missed habit.

```
grep habitTime src/ →
  src/lib/types.ts:58                       (declaration)
  src/components/shell/detail-panel.tsx:1244 (the input)
  no readers
```

`src/components/shell/detail-panel.tsx:1244` · `src/lib/types.ts:58`

### F-24 · Six Tiptap packages and `cmdk` are installed but never imported *(was F-19)*

**Medium** · Proven · ⬜ Open

Zero imports across `src/`. The note editor is a plain `<textarea>` and the command bar is hand-rolled. They don't reach the client bundle, but they're install weight and a misleading signal — and `types.ts` still documents `content` as "Rich text (HTML from Tiptap)" when it holds plain text.

```
@tiptap/react, /starter-kit, /pm, /extension-placeholder,
/extension-task-list, /extension-task-item   → 0 src files
cmdk                                          → 0 src files
```

`package.json:21–26, 31` · `src/lib/types.ts:37` · `src/components/notes/note-editor.tsx:577`

### F-25 · File attachments only work on projects, and not at all offline *(was F-20)*

**Medium** · Proven · ⬜ Open

`files` lives on the universal item, but `FileUpload` is rendered in exactly one place — the project dashboard. Tasks, notes, goals and events can't hold an attachment, which cuts against the unified-item premise. The Files page only scans projects, so anything attached elsewhere would be invisible.

Every attachment path goes through `httpsCallable`, so uploads and deletes are unavailable in local mode — as is wishlist product import, since `/api/scrape` requires a Firebase user. The README advertises local mode without noting either.

`src/components/shell/project-dashboard.tsx:661` · `src/app/files/page.tsx:42` · `src/lib/storage.ts:234`

### F-26 · `settings.bio` is editable and rendered nowhere *(was F-21)*

**Medium** · Proven · ⬜ Open

A 2,000-character bio field, normalised, cloud-synced and persisted — with no reader anywhere in the app.

`src/app/settings/page.tsx:1368–1373` · `src/lib/settings-store.ts:315`

### F-27 · Dead exports and an unused field *(was F-22)*

**Low** · Proven · ⬜ Open

`areItemsConnected`, `addLink`, `removeLink` (`links.ts`) and `getWeekGrid` (`habits.ts`) have no callers. `OrbitItem.assignee` is declared and never read or written — reasonable for a single-user app, but then it shouldn't be in the type.

### F-28 · 17 unreferenced translation keys, four of them with hockey overrides *(was F-23)*

**Low** · Proven · ⬜ Open

Out of 423 keys. `dashboard.projectsLabel`, `today.tasks`, `today.events` and `today.noTasks` each have a bespoke `hockeyOverrides` entry and are never rendered — someone wrote joke copy for strings that don't exist on screen.

```
calendar.import · calendar.multiDay · calendar.noEventsMonth · common.export
dashboard.projectsLabel · detail.syncFailed · itemRow.today · notes.saveHint
projects.kanban · settings.accountExportDownloaded · status.archived.desc
status.waiting.desc · tasks.closeGroupMenu · tasks.closeSortMenu
today.events · today.noTasks · today.tasks
```

### F-29 · Leftover scaffolding assets and an empty doc *(was F-24)*

**Low** · Proven · ⬜ Open

`public/` still carries the Next.js starter set — `file.svg`, `globe.svg`, `vercel.svg`, `window.svg` — plus unreferenced `logo.png` and `logo.svg`. `BADGE_SYSTEM.md` is committed at 0 bytes. `lg60sidee.png` (73 KB) exists at the repo root *and* in `public/`; only the `public/` copy is served.

### F-30 · Accent colour reads global, changes almost nothing *(was F-25)*

**Low** · Read · ⬜ Open

A full colour picker in Appearance, wired to the active sidebar row plus one checkbox and one toggle rule. Buttons, links, focus rings and primary CTAs stay monochrome — so the setting looks broken rather than subtle.

`src/app/globals.css:764–780` · `src/components/shell/sidebar.tsx:277, 290`

### F-31 · A no-op callback passed as if it mattered *(was F-26)*

**Low** · Read · ⬜ Open

`<FileUpload project={item} onFilesChange={() => {}} />` — the only call site.

`src/components/shell/project-dashboard.tsx:661`

---

## 06 · Missing capability

*12 findings*

### F-32 · No recurring events anywhere in the model *(was F-27)*

**High** · Read · ⬜ Open

No `rrule`, no repeat field, no UI. Habits cover repetition for habits, but a weekly class or standing meeting has no representation — which is why F-10 has to expand Google's recurrences into hundreds of loose items. This is the single largest gap in the calendar.

### F-33 · The `waiting` status has no view *(was F-28)*

**Medium** · Read · ⬜ Open

It's a first-class `ItemStatus` with its own badge in every row, and the Tasks page offers only Active / Completed / All. There is no way to list what you're blocked on — the exact question the status exists to answer.

`src/lib/types.ts:7` · `src/app/tasks/page.tsx:406` · `src/components/items/item-row.tsx:237–241`

### F-34 · No bulk actions, and no permanent delete from Archive *(was F-29)*

**Medium** · Read · ⬜ Open

No multi-select anywhere: no bulk complete, tag, reschedule, archive or delete. Archive can restore but never purge, so the only way to remove archived items is one at a time through the detail panel. With 205 tasks and 63 events already, this is a daily cost.

### F-35 · No inline task creation on the Tasks page *(was F-30)*

**Medium** · Read · ⬜ Open

Every new task routes through the command bar — which means every new task also routes through F-02, F-04 and F-05. A plain "add task" row on the list would give users a path that can't mangle their text.

### F-36 · Task filters are ephemeral component state *(was F-31)*

**Medium** · Read · ⬜ Open

Status, tag, priority, search, sort, grouping and collapsed groups all reset when you navigate away. Nothing is in the URL, so a filtered view can't be bookmarked, shared or saved. For an app built on views over one item graph, saved views are the natural feature and the plumbing for them doesn't exist yet.

`src/app/tasks/page.tsx:261–272`

### F-37 · `⌘K` is the only global keyboard shortcut

**Medium** · Read · ⬜ Open

No new-item binding, no complete-task binding, no list navigation, no `?` help overlay, no go-to-page chords. Keyboard users tab through everything.
Thin for a desktop tool that positions itself as a productivity OS.

`src/components/shell/command-bar.tsx:115–124`

### F-38 · The habits week view can't leave the current week

**Medium** · Read · ⬜ Open

`weekStart` is derived from `new Date()` with no navigation, while the month view has full prev/next. You can review last month's consistency but not last week's.

`src/app/habits/page.tsx:38–40`

### F-39 · No way to pause a habit, or recover one that leaves `active`

**Medium** · Read · ⬜ Open

The page filters strictly on `status === 'active'`. Any habit that becomes done, waiting or archived disappears from Habits entirely with no filter to find it — and there's no pause concept for a habit you're deliberately dropping for a month.

`src/app/habits/page.tsx:53–56`

### F-40 · Calendar has no drag-to-move, no resize, and no agenda view

**Medium** · Read · ⬜ Open

Month, week and day grids only. Rescheduling anything means opening the detail panel and editing time fields — the interaction a calendar exists to avoid. No list/agenda mode for scanning what's next.

### F-41 · Habits and Goals create a real item before the user types anything

**Medium** · Read · ⬜ Open

"New" immediately writes a "New habit" / "New goal" item and opens the panel, so backing out leaves debris in the list, the sidebar badge and the cloud. Projects and Notes get this right with a proper draft dialog — the inconsistency is the bug.

`src/app/habits/page.tsx:109–120` · `src/app/goals/page.tsx:67–77`

### F-42 · A note's subtype is decided by whichever filter tab is open

**Medium** · Read · ⬜ Open

Quick-add sets `noteSubtype` and a matching tag from the active filter, with no picker in the dialog. Create a note while filtered to Journal and it silently becomes a journal entry; there's no way to make a plain note without first clearing the filter.

`src/app/notes/page.tsx:106–107`

### F-43 · Projects can't nest

**Low** · Read · ⬜ Open

`ALLOWED_PARENT_TYPES.project = []`. Goals act as the only intermediate layer, so a large effort like a multi-year roadmap can't be broken into sub-projects. Worth confirming this is the intended shape rather than an omission.

`src/lib/links.ts:10–17`

---

## 07 · UI & UX consistency

*12 findings*

### F-44 · Archive's sticky tab bar and search box don't stick *(was F-07)*

**High** · Proven · ⬜ Open

The page is written as if it owns a bounded scroller — `h-full` root, inner `flex-1 overflow-y-auto` — but `h-full` resolves against an auto-height wrapper inside the shell's `<main>`, so the inner element never scrolls and each sticky element's containing block is only as tall as itself. Both bars scroll away. Measured live on threadmap.app:

The same structural pattern is in `areas/[tag]` and `files`.

```
#main-content   scrollHeight 9283 / clientHeight 850   → this is the scroller
inner .flex-1.overflow-y-auto   714 / 714              → never scrolls
tab bar (sticky top-0)  top at scroll 0   = 149
                        top at scroll 300 = -151   → stuck: false
```

`src/app/archive/page.tsx:70, 88, 143` · `src/components/shell/app-shell.tsx:141–142`

### F-45 · A 12 px hairline gap between Archive's two sticky bars, and an overlap waiting to happen *(was F-44)*

**Medium** · Proven · ⬜ Open

The search bar is pinned at `top-[49px]` but the tab bar measures 37 px, so content slides through a 12 px band. With the accessibility font size set to Large the tab bar grows past 49 px and the two overlap instead. `top-[49px] lg:top-[49px]` also duplicates itself for no reason.

```
tab bar height        37 px
search bar sticky top 49 px   → 12 px uncovered band
```

`src/app/archive/page.tsx:128`

### F-46 · The dashboard's headline tile reads 0 while 15 tasks wait below it *(was F-45)*

**Medium** · Proven · ⬜ Open

`focusTaskCount` sums overdue + due-today + My Day, and excludes `notDoneFromBefore`. Your dashboard right now shows tasks 0 next to Not Done from Before 15, with all fifteen listed underneath. The number a user reads first is the one that under-reports the day.

`src/app/page.tsx:893, 1131–1132`

### F-47 · Four different visual treatments for the same sub-tab interaction *(was F-46)*

**Medium** · Proven · ⬜ Open

Only Archive and Areas use the shared `Tabs` primitive; everything else is hand-rolled `aria-pressed` buttons, in three further styles. Same interaction, four appearances, and no single place to change tab styling.

```
underline tabs      Archive                        (Radix Tabs, border-b-2)
plain Radix tabs    Areas                          (Radix Tabs, unstyled)
pill tabs           Tasks status, Notes filters     (bg-foreground)
segmented control   Habits, Calendar, Projects      (bg-muted/30 p-0.5)
large pills         Files project filter            (text-sm rounded-lg)
```

### F-48 · The Files page is off the design system *(was F-47)*

**Medium** · Read · ⬜ Open

`text-xl lg:text-2xl font-bold` where every sibling page uses `text-xl font-semibold tracking-tight`; Tailwind's default `text-sm`/`text-base` instead of the app's explicit bracket sizes; `px-4 lg:px-6 py-4 lg:py-5` instead of `p-4 lg:p-8`. It reads as a heavier, larger page than the rest of the app.

`src/app/files/page.tsx:85–105`

### F-49 · Two competing translation systems *(was F-48)*

**Medium** · Proven · ⬜ Open

The 423-key table is excellent — exact en/de parity, no duplicates, no gaps. Alongside it sit roughly 250 inline `language === 'de' ? … : …` ternaries across 27 files.
`areas/[tag]/page.tsx` and the sidebar's delete-area dialog bypass the table entirely, so a third language means hunting through components.

```
settings/page.tsx      58        habits/page.tsx        4
detail-panel.tsx       51        goals/page.tsx         3
calendar/page.tsx      34        theme-toggle.tsx       3
command-bar.tsx        14        loading-screen.tsx     3
tools/flight/page.tsx  14        …27 files total
briefing-notif.ts      13
projects/page.tsx      11
areas/[tag]/page.tsx   11        ← no i18n table use at all
sidebar.tsx             9
```

### F-50 · The English label for the dashboard's task tile is lowercase *(was F-49)*

**Low** · Proven · ✅ Fixed

`'dashboard.tasks': 'tasks'` sits beside "Not Done from Before", "Habits" and "Projects". German has it right as `'Aufgaben'`. "Not Done from Before" also reads like a placeholder — "Carried over" or "Unfinished" would sit better.

`src/lib/i18n.ts:372, 429`

### F-51 · Two German strings slip into formal "Sie" *(was F-50)*

**Low** · Proven · ⬜ Open

The app addresses the user informally throughout — 36 "du" constructions — then switches to "Sie" in the email-link sign-in flow. Small, but it lands in your primary language on the first screen a new user sees.

```
i18n.ts:2131  'Öffnen Sie den Link … Sie können diesen Tab schließen.'
i18n.ts:2133  'Klicken Sie auf den Link in der E-Mail.'
```

### F-52 · Item rows print raw times, ignoring the 12/24-hour setting *(was F-51)*

**Low** · Read · ⬜ Open

`{item.startTime}` renders straight from storage, so a user on 12-hour time still sees `14:00` in every event row. The Calendar and Dispatch views do respect the setting.

`src/components/items/item-row.tsx:252–256`

### F-53 · The habits month button says "Today" whatever month you're on *(was F-52)*

**Low** · Read · ⬜ Open

The label is always `Today · {currentMonth}`, so browsing October reads "Today · Oct 2026". The dashboard solves this properly by branching on `isViewingToday`.

`src/app/habits/page.tsx:162–167`

### F-54 · Sync messages collapse into a single slot *(was F-53)*

**Low** · Read · ⬜ Open

`data-provider` holds one `error` string, so concurrent warnings overwrite each other and only the last survives. Being offline and having an unresolvable cloud conflict get the same banner and the same two buttons — even though one clears itself and the other can't be resolved at all (F-09).

`src/components/providers/data-provider.tsx:303–346`

### F-55 · Unscheduled habit days are unlabelled for screen readers *(was F-54)*

**Low** · Read · ⬜ Open

Scheduled days are buttons with rich `aria-label`s; unscheduled days render a bare decorative dot. A screen reader user gets silence where a sighted user sees "not scheduled". Grid position alone doesn't carry it.

`src/app/habits/page.tsx:331–335, 525–529`

---

## 08 · Robustness

*2 findings*

### F-56 · An unreachable Firebase leaves the app blank forever *(was F-12)*

**High** · Proven · ⬜ Open

`onAuthStateChanged` has an error callback but no timeout. If it never fires, `loading` stays `true` and `AppShell` renders an empty `<main>` — no spinner, no message, no escape hatch to local mode.

I hit exactly this running the dev server offline: `orbitLocalMode === '1'` and a full set of `orbit-items:demo-user` data in localStorage, and a permanently black page. A local-first app should never be locked out of local data by a network it doesn't need. A timeout that falls through to the stored local-mode flag would close it.

```
document.body.children → 8   (all scripts; no rendered UI)
localStorage           → orbitLocalMode: "1", orbit-items:demo-user present
console                → no errors, no auth callback
```

`src/components/providers/auth-provider.tsx:155–202` · `src/components/shell/app-shell.tsx:60–62`

### F-57 · COOP warnings repeat on the production sign-in screen *(was F-55)*

**Low** · Proven · ⬜ Open

`Cross-Origin-Opener-Policy policy would block the window.closed call` fires repeatedly on threadmap.app while the Google popup is open. Your header is already `same-origin-allow-popups`, which is the right value, and this warning is often benign with Firebase popup sign-in — but it's worth confirming the flow actually completes on a browser enforcing COOP strictly, since the fallback is a dead-end popup.

`next.config.ts:28` · `src/components/providers/auth-provider.tsx:210`

---

## 09 · Test coverage

*4 findings*

### F-58 · The two most intricate modules have no tests *(was F-13)*

**High** · Proven · ⬜ Open

`firestore.ts` (2,154 lines — optimistic writes, revision conflicts, the mutation outbox, account-generation guards, cascade deletes) and `store.ts` (545 lines, including the tag-sync state machine with echo suppression and reschedule bookkeeping) have no unit tests.

The primitives underneath them *are* tested — outbox, keyed queue, verified storage, merge recovery — so this is specifically an orchestration gap, and orchestration is where this design's risk lives.

```
untested in src/lib:
firestore.ts (2154)   store.ts (545)   briefing-notifications.ts (648)
account-data.ts   account-storage.ts   dispatch-schedule.ts   fcm.ts
flight-retention.ts   toolbox-store.ts   calendar-access.ts   utils.ts
```

### F-59 · Abitur: the larger half of the score is untested *(was F-14)*

**High** · Proven · ⬜ Open

The suite covers `calculateBlockII`, `calculateSemesterPoints`, `calculateSeminarTotal`, `validateEinbringungen`, `validateExamCombination` and exclusivity — careful work, including a test that an unmodelled substitution rule is never presented as certified.

But `calculateBlockI` (the 40 semester results — roughly two-thirds of the total), `calculateAbitur` (the headline number), and `optimizeEinbringungen` (which decides *which* results are submitted) all have zero coverage. This is a tool a student makes real decisions from; it's the highest-consequence coverage gap in the repo.

```
tested:   calculateBlockII · calculateSemesterPoints · calculateSeminarTotal
          countAllEinbringungen · isEingebracht · totalPointsToGrade
          validateEinbringungen · validateExamCombination · selectSubjectWithExclusivity
untested: calculateBlockI · calculateAbitur · optimizeEinbringungen
          selectAllEinbringungen · calculateNeededAverage · calcSemesterStats
          checkFieldCoverage · pointsToGrade
```

### F-60 · Parser tests cover dates and tags, but not mentions or keyword stripping *(was F-56)*

**Medium** · Proven · ⬜ Open

`command-parser.test.ts` is five cases: leap days, impossible dates, year-less validation, and Unicode tags — all genuinely good edge cases. The `@` pattern and the title-mutating keyword pass have no tests at all, which is exactly why F-02 and F-04 survived.

`src/lib/command-parser.test.ts`

### F-61 · The 19 "skipped" tests are fine — worth knowing why *(was F-57)*

**Low** · Proven · ⬜ Open

`npm test` reports 19 skipped: that's the whole Firestore rules suite, gated on emulator availability. CI runs it in a dedicated `rules` job, so it is covered — but a local run looks like the security rules passed when they never executed.

`src/test/firebase-rules.test.ts:33` · `.github/workflows/ci.yml`

---

## 10 · The MCP server

*7 findings*

### M-01 · The Functions package does not compile — and that blocks deploying every function

**Critical** · Proven · ✅ Fixed

`new RpcValidationError(-32600 - 1, …)` produces the right JSON-RPC code (`-32601`, Method not found) but the arithmetic widens to `number`, which isn't assignable to the constructor's `-32600 | -32602` union.
`npm run build` exits 2.

This is committed on `main` in `c57dfb9`, so the CI `functions` job is red — and because `firebase.json` runs `npm --prefix functions run build` as a predeploy hook, a non-zero exit aborts the whole deploy. Right now you cannot ship a change to push notifications, item deletion, attachment upload/cleanup, hierarchy repair, or account export/deletion. Nothing to do with MCP is what's broken; MCP is just where the line is.

Fix: write `-32601` as a literal and add it to the union. One line each.

```
$ npm run build          # in functions/
src/mcp/server.ts(183,38): error TS2345:
  Argument of type 'number' is not assignable to parameter of type '-32600 | -32602'.
npm run build exit code: 2
```

`functions/src/mcp/server.ts:183, :107`

> **Status.** Literal `-32601` with a widened union; `npm run build` exits 0.

### M-02 · `htmlToPlainText` silently destroys plain-text content *(was M-03)*

**Critical** · Proven · ✅ Fixed

The function assumes `content` is Tiptap HTML — the same assumption `types.ts` documents and F-19 disproves. Because the editor is a `<textarea>` storing plain text, the tag-stripping pass (`/<[^>]{0,2000}>/g`) treats any `<` … `>` span as a tag and deletes everything between them.

For notes containing code, generics, comparisons, or bracketed email addresses, the LLM receives silently truncated text and reasons on it — with no signal that anything was removed. Genuine HTML is handled correctly, which is what makes this easy to miss.

```
htmlToPlainText(...)  — run against the compiled lib

"Fix: if (a < b) { return <result>; }"        → "Fix: if (a ; }"
"Email Mateo <mateo@example.com> about the PCB" → "Email Mateo about the PCB"
"Compare 5<10 and 20>15"                     → "Compare 5 15"
"Use Array<string> for the tags field"        → "Use Array for the tags field"
"Tom &amp; Jerry"                            → "Tom & Jerry"   // decoded, was literal
"<p>Real HTML</p><script>alert(1)</script>"    → "Real HTML"    // correct
```

`functions/src/mcp/dal.ts:484–498` · `src/lib/types.ts:37`

> **Status.** Wired via `sdk-server.ts` + `http.ts` on the official v2 SDK; deployed as `threadmapMcp`.

### M-03 · The server is complete but wired to nothing — and four pieces are still missing *(was M-02)*

**High** · Proven · ✅ Fixed

No file outside `functions/src/mcp/` imports it, and the only `onRequest` in `index.ts` is `consumeThreadmapScrapeQuota`. All 5,314 lines compile and deploy as unreachable modules. Consistent with the last commit message — but worth being precise about what "wiring" still needs, because two items aren't just routes:

The six `mcpOAuth*` collections aren't named in `firestore.rules` — that's correct, not a gap: they fall to the default-deny catch-all and the Admin SDK bypasses rules. Worth a comment so nobody "fixes" it later.

```
missing to ship:
1. POST /mcp JSON-RPC route
     bearer → authenticateAccessToken() → McpServerContext → server.handle()
2. OAuth routes: /authorize /token /register /revoke
     ThreadmapOAuthService has every method; no HTTP surface calls them
3. Discovery: /.well-known/oauth-authorization-server
              /.well-known/oauth-protected-resource
     metadata.ts builds both documents; nothing serves them
4. The consent page does not exist.
     THREADMAP_AUTHORIZATION_CONSENT_URL → https://threadmap.app/integrations/authorize
     src/app/integrations/  →  no such directory. The authorize redirect 404s.
5. No Firestore TTL policy.
     17 expireAt writes across oauth.ts/dal.ts expect Firestore to reap them;
     firestore.indexes.json has "fieldOverrides": [] and no TTL config.
     Expired codes, tokens and families would accumulate forever.
```

`functions/src/index.ts` · `functions/src/mcp/oauth.ts:32` · `firestore.indexes.json`

> **Status.** Detection gate plus an allowlisted tag-name pattern; plain text is left alone.

### M-04 · 357 lines of OAuth security tests that no CI job runs

**High** · Proven · ✅ Fixed

`oauth.test.ts` is written against `node:test`. Root vitest is scoped to `src/**/*.test.ts` and collects zero files from `functions/`; `functions/package.json` has no `test` script; the CI `functions` job runs only install, audit, and build.

I ran them by hand — 7/7 pass, and they cover exactly the right things, including the full authorization lifecycle end to end. This is the suite that should gate every change to the OAuth server, and nothing gates on it.

Two smaller things in the same area: `functions/` has no lint step at all while `src/` is linted, and the compiled `lib/mcp/oauth.test.js` ships inside the deploy bundle.

```
$ node --test lib/mcp/oauth.test.js
✔ PKCE S256 matches the RFC 7636 example and rejects an incorrect verifier
✔ redirect validation accepts only current platform callbacks or explicit configuration
✔ resource identifiers and scopes are exact and bounded
✔ metadata advertises DCR, PKCE S256, resource binding, and header bearer tokens
✔ configuration enforces a one-hour maximum access-token lifetime
✔ stable OAuth errors serialize without exposing unexpected exception details
✔ full DCR, consent, code, access, refresh rotation, and replay revocation flow
ℹ pass 7  fail 0
```

`functions/src/mcp/oauth.test.ts` · `vitest.config.mts:6` · `.github/workflows/ci.yml:74–99`

> **Status.** CI runs a dedicated Functions job; 38 tests.

### M-05 · `tools/list` advertises all 23 tools regardless of granted scope

**Medium** · Proven · ✅ Fixed

Scope enforcement itself is correct — `registry.call` checks the principal's scopes against each tool's `requiredScope` before running anything, then consumes a per-kind quota and writes an audit event. This is not a security hole.

But listing ignores scope entirely, so a `threadmap.read` token's client is told it can call `update_item`, `archive_item` and `confirm_delete_item`. The model discovers otherwise one `insufficient_scope` at a time, burning a turn each. Filter the list by `principal.scopes`.

`functions/src/mcp/server.ts:219` · `tools.ts:523, :533`

> **Status.** `sdk-server.ts` registers only tools the presented token’s scopes cover.

### M-06 · Required scope is derived from a field you also serialize to clients

**Medium** · Read · 🟡 Partially fixed

`securitySchemes` is a custom top-level key on each tool definition. It does double duty: `tools.ts:515` reads `tool.securitySchemes[0].scopes[0]` to decide the tool's required scope
*and* quota class, and the same object is sent to clients in
`tools/list`.

Deriving an authorization decision from the wire payload couples two things that should not move together — decide scope from a server-side map instead. Separately, worth checking the field against the `2025-11-25` spec you target: MCP tool definitions carry `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations` and `_meta`, and `_meta` is the sanctioned home for extensions. I haven't verified how a strict client handles the extra key.

`functions/src/mcp/tools.ts:44, :200, :515`

> **Status.** Enforcement is independent (`registry.call` re-checks) and the coupling is documented, but `tools.ts:515` still derives the required scope by reading `securitySchemes` back.

### M-07 · Tool descriptions say what each tool does, rarely when to reach for it

**Medium** · Read · ✅ Fixed

The descriptions are unusually good at the hard part — the contract and its exclusions ("URLs, paths, and file contents are never returned", "email, bio, tokens, and secrets are excluded"). `Get this when...` guidance has since been added so each tool explains when to use it.

`get_life_overview`, `get_agenda`, `list_items` and `search_items` now all include explicit guidance for the query patterns they are optimized for.

`functions/src/mcp/tools.ts:212–321`

> **Status.** Call-condition guidance is now included in tool descriptions.

---

## Found after the audit

Two further defects surfaced while wiring the MCP server to a real client. Both are fixed.

### M-08 · Over-broad registration scope refused the whole client

**Critical** · Proven · ✅ Fixed

Discovery advertises `scopes_supported` including `threadmap.delete`, while `MCP_DYNAMIC_CLIENT_SCOPES` deliberately withholds it. A host that requests what the server advertises — which Claude does — was refused outright with `invalid_client_metadata`, so the connector could not register at all.

Registration now grants the intersection with policy and reports it back (RFC 7591 §2, RFC 6749 §3.3), refusing only when nothing requested is grantable. `software_statement` is ignored rather than refused for the same reason.

`functions/src/mcp/oauth.ts` · commit `112decc`

### M-09 · The same defect one step later, at authorization

**Critical** · Proven · ✅ Fixed

After M-08, registration succeeded and authorization then failed with `invalid_scope`: a host granted a narrowed scope at registration still re-requests the full advertised set at the authorize endpoint. Claude reported `oauth_error=invalid_scope&oauth_error_subtype=provider_redirect`.

The authorize endpoint now narrows the same way. Every scope check downstream of it stays a strict subset test, because from that point the set has been validated and a mismatch is tampering rather than host variance.

`functions/src/mcp/oauth.ts:855` · commit `c133eb0`

> **Lesson.** Neither was reachable by unit tests or by my own curl probes, because both depended on what a *real* host sends. The audit’s own blind spot: it verified the server against itself.
