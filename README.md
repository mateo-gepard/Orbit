# Threadmap

Threadmap is a local-first personal productivity system for turning connected intent into action.

It brings tasks, projects, habits, goals, notes, calendar work, files, and focused tools into one shared item graph instead of treating them as separate apps. A task can belong to a project, reference a note, support a goal, appear on the calendar, and stay available from the same command surface.

The app can run in an explicit local/demo profile without a backend. Signed-in profiles use Firebase for cross-device sync, file storage, push notifications, and account workflows.

## What It Does

- Captures tasks, projects, habits, events, goals, and notes through one unified item model.
- Links items together with parent-child relationships, peer links, reverse links, and a visual graph.
- Provides dashboard, task, project, habit, goal, note, calendar, file, archive, and toolbox views.
- Supports natural-language command capture for fast entry.
- Works as an installable PWA with iOS-friendly mobile navigation and safe-area handling.
- Runs in local mode with browser storage when Firebase is not configured.
- Enables cloud mode with Firebase Auth, Firestore, Storage, Messaging, and Functions.
- Includes optional Google Calendar sync and web scraping helpers for selected tools.

## Core Concepts

### Unified Items

Most of Threadmap revolves around a single `OrbitItem` shape. Different item types share the same base lifecycle and can be linked together:

- `task`
- `project`
- `habit`
- `event`
- `goal`
- `note`

This keeps workflows composable. A project can contain tasks and goals, a note can reference a project, and a task can carry due dates, tags, priority, checklist data, and relationships without switching systems.

### Local-First Runtime

Threadmap can be used immediately in local mode. Local mode stores data in the browser and is meant for zero-config development, demos, and personal use on one device.

Authenticated users get realtime cloud sync. The repository includes public web identifiers for its default Firebase project, while production deployments should set every `NEXT_PUBLIC_FIREBASE_*` value explicitly for the intended project. Local/demo mode remains available when cloud services are unavailable or not wanted.

### Connected Workflow

Threadmap is built around the idea that productivity data should not be isolated. Relationships are first-class:

- Parent-child hierarchy for projects, goals, and tasks.
- Peer links between related items.
- Reverse links so relationships are discoverable from both sides.
- Link graph view for exploring connected work.
- Command capture that can create, tag, prioritize, schedule, and link items.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand
- Radix UI primitives
- Firebase Auth, Firestore, Storage, Messaging, and Functions
- Vitest
- ESLint

## Getting Started

### Prerequisites

- Node.js 22 (see `.nvmrc`)
- npm

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

To use the app without backend setup, choose local mode on the sign-in screen.

## Environment Setup

Copy the example environment file when you want cloud features:

```bash
cp .env.local.example .env.local
```

For production, set the full Firebase web configuration explicitly even though the repository has public defaults for its development project. Users can still choose the isolated local/demo profile.

### Required For Cloud Auth And Sync

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### Required For File Uploads

```text
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
```

### Required For Push Notifications

```text
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
NEXT_PUBLIC_WEBPUSH_VAPID_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
SCRAPE_RATE_LIMIT_SHARED_SECRET=
```

### Optional Integrations

```text
NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
```

For the full backend checklist, see [BACKEND_SETUP.md](./BACKEND_SETUP.md) and [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md).

## Scripts

```bash
npm run dev              # Start the Next.js development server
npm run build            # Build the production app
npm run start            # Start the production server after build
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript without emitting files
npm test                 # Run unit tests with Vitest
npm run test:watch       # Run Vitest in watch mode
npm run test:rules       # Run Firestore and Storage rules tests in emulators
npm run deploy:rules     # Deploy Firestore rules/indexes and Storage rules
npm run deploy:functions # Deploy Firebase Cloud Functions
```

Cloud Functions have their own package:

```bash
cd functions
npm install
npm run build
```

## Project Structure

```text
src/app                 App Router pages, layouts, and API routes
src/components          Shared UI, shell, item, mobile, file, and tool components
src/lib                 Store, data access, Firebase, parsing, links, settings, utilities
src/lib/hooks           Reusable React hooks
functions               Firebase Cloud Functions
public                  PWA manifest, service worker, icons, and static assets
firestore.rules         Firestore security rules
storage.rules           Firebase Storage security rules
```

## Important Documents

Start here:

- [DOCUMENTATION.md](./DOCUMENTATION.md): how the system is built — data model, sync, routes, MCP, testing, deployment.
- [AUDIT.md](./AUDIT.md): the 70-finding codebase audit, with what is fixed and what is open.
- [HANDOFF.md](./HANDOFF.md): current state, recent changes, and what to pick up next.

Reference:

- [MCP_SETUP.md](./MCP_SETUP.md): operating the MCP server and its OAuth endpoints.
- [ARCHITECTURE.md](./ARCHITECTURE.md): system architecture and local/cloud data flow.
- [LINKING_SYSTEM.md](./LINKING_SYSTEM.md): item relationships, graph utilities, and link APIs.
- [BACKEND_SETUP.md](./BACKEND_SETUP.md): Firebase, Storage, Functions, push, and deployment setup.
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md): production launch checklist.
- [BADGE_SYSTEM.md](./BADGE_SYSTEM.md): badge and achievement system notes.
- [STORAGE_CORS_SETUP.md](./STORAGE_CORS_SETUP.md): Storage CORS configuration.

## Firebase Deployment

Deploy rules after reviewing the project and environment:

```bash
firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
```

Set VAPID secrets before deploying functions:

```bash
firebase functions:secrets:set VAPID_PUBLIC_KEY --project YOUR_PROJECT_ID
firebase functions:secrets:set VAPID_PRIVATE_KEY --project YOUR_PROJECT_ID
firebase functions:secrets:set SCRAPE_RATE_LIMIT_SHARED_SECRET --project YOUR_PROJECT_ID
firebase deploy --only functions --project YOUR_PROJECT_ID
```

## App Deployment

Vercel is the production host for the Next.js application. Firebase provides Auth, Firestore, Storage, Messaging, and Functions; it is not configured as a static host. The repository targets Node.js 22 in local development, CI, Vercel, and Cloud Functions.

```bash
npm run build
npx vercel
```

After deployment, verify `GET /api/health` returns `status: "ok"`, then exercise sign-in, sync, uploads, push, and Google Calendar from the production origin.

## Quality Checks

Run these before pushing application changes:

```bash
npm test
npm run lint
npm run typecheck
npm run test:rules
npm run build
```

## Design Principles

- Local-first: usable without setup or external services.
- Connected: tasks, notes, projects, goals, habits, and events are part of one graph.
- Fast capture: command entry should make adding and linking work feel immediate.
- Graceful fallback: missing Firebase configuration should not break the app.
- Mobile-native: the PWA should feel comfortable on iOS, including safe areas and bottom navigation.
- Quiet interface: the UI should stay focused, calm, and useful rather than decorative.

## License

Private project.
