# Threadmap

Last audited: 2026-08-06

## What it is

Threadmap is a Next.js personal productivity system that connects tasks, projects, habits, events, goals, notes, files, settings, command capture, cloud sync, PWA behavior, and focused tools such as Flight, Dispatch, Briefing, Abitur, and Wishlist.

## Stack and important files

- `src/app/` contains App Router pages and API routes, including `/api/health`.
- `src/components/` contains the shell, providers, item surfaces, files, notes, mobile UI, and shared components.
- `src/lib/` contains stores, account-scoped persistence, Firebase/Firestore, commands, habits, links, settings, integrations, and PWA utilities.
- `functions/` contains Firebase Functions for scheduled push notifications and account operations.
- `firestore.rules`, `storage.rules`, and `firestore.indexes.json` are the backend access and query contract.
- Vercel hosts the Next.js application; Firebase provides Auth, Firestore, Storage, Messaging, and Functions.

## How to run or verify

Use Node.js 22 (`nvm use` reads `.nvmrc`), then:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

With Java installed, also run the Firebase rules suite:

```bash
npm run test:rules
```

Firebase Functions:

```bash
cd functions
npm ci
npm run build
```

## Release notes

- Keep local/demo and signed-in account data strictly scoped; test switching accounts in the same browser.
- Verify Firebase rules and indexes in emulators before any deploy.
- Treat Wishlist scrape helpers, uploads, Calendar OAuth, push, export, and deletion as authenticated production workflows.
- Verify `/api/health`, sign-in popups, Storage previews, service-worker updates, offline fallback, and notification clicks on the deployed Vercel origin.
- Do not add Firebase static Hosting unless the runtime architecture is deliberately redesigned.
