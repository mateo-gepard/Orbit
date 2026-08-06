# Orbit

Last audited: 2026-07-06

## What it is

Next.js personal productivity OS. It unifies tasks, projects, habits, events, goals, notes, files, settings, command capture, cloud sync, PWA behavior, and toolbox apps such as flight focus sessions, dispatch, briefing, Abitur tracker, and wishlist.

## Stack and important files

- `src/app/` contains App Router pages and API routes.
- `src/components/` contains shell, item, provider, files, notes, mobile, and UI components.
- `src/lib/` contains stores, Firebase/Firestore, command parser, habits, links, badges, tools, PWA, storage, settings, i18n, and utilities.
- `functions/` contains Firebase Functions for server-side work such as push notifications.
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `deploy:rules`.
- Dependencies include Next.js, React, Firebase, Zustand, Tiptap, React Flow, shadcn-style UI, and date-fns.

## How to run or verify

```bash
npm install
npm run lint
npm run build
npm run dev
```

Firebase functions:

```bash
cd functions
npm install
npm run build
```

## Current state from audit

- Git head found: `b20b21c` from 2026-03-15.
- Git worktree is dirty: Firestore/storage rules, providers, Firebase setup, habits, store/storage logic, and a new error boundary are in progress.
- README is dense and already contains strong architecture documentation.

## Next checks

- Resolve current Firebase/security-rule changes carefully before deploy.
- Test both demo/localStorage mode and signed-in Firebase sync mode.
