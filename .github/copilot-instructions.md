<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# ORBIT — Personal Productivity OS

This is a Next.js 14 (App Router) project using TypeScript, Tailwind CSS, shadcn/ui, Firebase (Firestore + Auth), and Zustand.

## Architecture
- **Universal Item**: Everything is an `OrbitItem` with a `type` field (task, project, habit, event, goal, note)
- **Firebase Firestore** for persistence with real-time subscriptions
- **Zustand** for UI state management
- **Command Bar** (⌘K) for quick item creation with natural language parsing

## Key Files
- `src/lib/types.ts` — All TypeScript types
- `src/lib/store.ts` — Zustand store
- `src/lib/firestore.ts` — Firestore CRUD operations
- `src/lib/command-parser.ts` — Natural language command parsing
- `src/lib/habits.ts` — Streak calculation and habit utilities
- `src/components/shell/` — App shell (sidebar, command bar, detail panel)
- `src/components/items/` — Reusable item display components

## Conventions
- Use `'use client'` for all interactive components
- Use shadcn/ui components from `@/components/ui/`
- Use `cn()` from `@/lib/utils` for conditional classnames
- Optimistic updates — UI should feel instant
- All dates stored as ISO strings (YYYY-MM-DD)
