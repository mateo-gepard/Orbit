<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# ORBIT — Personal Productivity OS

Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Firebase (Firestore + Auth) · Zustand 5

## Architecture

- **Universal Item**: Core entity is `OrbitItem` in `src/lib/types.ts` — one interface with a `type` field (`task | project | habit | event | goal | note`). All CRUD goes through `src/lib/firestore.ts` (`createItem`, `updateItem`, `deleteItem`, `subscribeToItems`).
- **Dual-mode persistence**: Firebase Firestore when authenticated, `localStorage` in demo mode. The app checks `isFirebaseAvailable()` — never assume one or the other.
- **Zustand stores**: Main store (`src/lib/store.ts`) holds items + UI state. Each tool has its own store (`abitur-store.ts`, `toolbox-store.ts`) using `persist` middleware with `localStorage` and cloud sync via `saveToolData`/`subscribeToToolData`.
- **Provider chain**: `layout.tsx` → `<Providers>` → `ThemeProvider` → `AuthProvider` → `DataProvider` → `AppShell`. The `DataProvider` (`src/components/providers/data-provider.tsx`) wires all Firestore subscriptions and sets `_setSyncUserId` on each store.
- **Toolbox pattern**: Tools live at `src/app/tools/{toolId}/page.tsx` as self-contained pages. They are registered in `TOOLS` array in `toolbox-store.ts`. Each tool has its own Zustand store with `_syncToCloud()` that calls `saveToolData(userId, toolId, data)`.

## Key Paths

| Purpose | Path |
|---------|------|
| Types | `src/lib/types.ts` |
| Main Zustand store | `src/lib/store.ts` |
| Firestore CRUD + subscriptions | `src/lib/firestore.ts` |
| Command bar parsing | `src/lib/command-parser.ts` |
| App shell (sidebar, detail panel, command bar) | `src/components/shell/` |
| Shared item components | `src/components/items/` |
| shadcn/ui primitives | `src/components/ui/` |
| Tool pages | `src/app/tools/{flight,dispatch,briefing,abitur}/` |
| API routes (server-side) | `src/app/api/` |

## Conventions

- **`'use client'`** on all interactive components — Next.js App Router requires it for hooks/state.
- **shadcn/ui** components imported from `@/components/ui/`. Use `cn()` from `@/lib/utils` for conditional classnames.
- **Optimistic updates with rollback** — UI updates instantly, Firestore writes async. On failure, rollback to previous state.
- **Dates as ISO strings** (`YYYY-MM-DD`) for due dates; timestamps as `number` (epoch ms) for `createdAt`/`updatedAt`.
- **Icons**: Lucide React only (`lucide-react`).
- **Fonts**: Geist Sans + Geist Mono via `next/font/google`.
- **Styling**: Tailwind v4 with CSS variables for theming (`--background`, `--foreground`, `--muted`, `--border`, etc. defined in `globals.css`). Neutral/monochrome palette — avoid loud colors. Use `bg-foreground text-background` for primary buttons.
- **Error handling**: Wrap all async ops in try/catch. Firebase errors fall back to demo mode. Console logs prefixed with `[ORBIT]`.
- **New tool pattern**: Create store in `src/lib/{tool}-store.ts` → register in `TOOLS` array → add `subscribeToToolData` call in `data-provider.tsx` → create page at `src/app/tools/{tool}/page.tsx`.

## Don'ts

- Don't use `getServerSideProps`/`getStaticProps` — this is App Router, not Pages Router.
- Don't import Firebase on the server — `firebase.ts` is client-only.
- Don't add new CSS frameworks — Tailwind v4 + shadcn/ui covers everything.
- Don't use `moment.js` — use `date-fns` for all date operations.
