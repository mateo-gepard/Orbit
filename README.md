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
- Includes optional Google Calendar sync, a cloud MCP Secretary with separately consented read-only Gmail/Calendar/Drive sources, and web scraping helpers for selected tools.

## Core Concepts

### Unified Items

Most of Threadmap revolves around a single `ThreadmapItem` shape (`OrbitItem` remains only as a temporary compatibility alias). Different item types share the same base lifecycle and can be linked together:

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
- npm 11.5.1 (pinned by `packageManager` and `engines`)

### Install

```bash
npm ci
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
npm run test:e2e         # Cold-load smoke tests: desktop Chromium, Android, iOS WebKit
npm run release:contract # Secret-free repository/configuration release contract
npm run release:check    # Production environment preflight (requires production values)
npm run audit:regions    # Firebase/Vercel region policy and runtime reference scan
npm run deploy:rules     # Deploy rules to staging (the safe default)
npm run deploy:functions # Deploy Functions to staging (the safe default)
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
src/service-worker      Deployment-revisioned worker template served at stable /sw.js
functions               Firebase Cloud Functions
public                  PWA manifest, icons, offline page, and static assets
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
- [STORAGE_CORS_SETUP.md](./STORAGE_CORS_SETUP.md): Storage CORS configuration.

## Firebase Deployment

The Firebase CLI default alias and unqualified npm deploy commands point to
`threadmap-staging-9e0b6`. Production uses `orbit-9e0b6` only through guarded commands that
require an exact clean `main` commit, an explicit confirmation, and a passing production
preflight:

```bash
npm run deploy:firebase:staging
```

Production deployment is normally performed by `.github/workflows/release.yml`. For an approved
manual recovery deployment, set both values to the exact release target before invoking a
production script:

```bash
export THREADMAP_RELEASE_SHA=<full-40-character-main-commit>
export THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=orbit-9e0b6
npm run deploy:firebase:production
```

Never use a bare `firebase deploy`; always pass an explicit project or use the guarded scripts.
See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for secrets, approvals, and manual gates.

## App Deployment

Vercel is the production host for the Next.js application. Firebase provides Auth, Firestore,
Storage, Messaging, and Functions; it is not configured as a static host. Vercel compute is pinned
to `fra1`; Firebase Functions are pinned independently to `europe-west1`. The repository targets
Node.js 22 and npm 11.5.1 in local development, CI, Vercel, and Cloud Functions.

Automatic production promotion from `main` is disabled in `vercel.json`. Production release is
currently unavailable: the checked-in workflow exits before credential use or mutation until a
true `threadmap-staging-9e0b6` Firebase deployment and staging-configured web artifact are exercised
in an upstream job, with a separate protected production job approved only after its evidence
exists. The retained downstream design deploys the compatible Firebase plane mandatorily and
promotes only the exact staged Vercel artifact after checks.

`GET /api/health` is non-cacheable and exposes liveness/readiness, full and short commit SHA,
deployment identity, executing/configured Vercel region, Firebase project, Firebase Functions
region, and configuration presence without exposing secret values. The package version (`0.1.0`)
is a product version; the full commit SHA is the release identity.

## Quality Checks

Run these before pushing application changes:

```bash
npm test
npm run lint
npm run typecheck
npm run test:rules
npm run test:e2e
npm run release:contract
npm run audit:regions
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
