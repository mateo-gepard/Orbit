# ORBIT

Personal productivity OS for tasks, projects, habits, calendar work, notes, goals, files, and focused planning.

ORBIT runs locally out of the box with localStorage. Firebase is optional and only turns on when real `NEXT_PUBLIC_FIREBASE_*` environment variables are configured.

## Features

- Unified item model for tasks, projects, habits, events, goals, and notes.
- Dashboard with due work, overdue work, habits, upcoming events, projects, and goals.
- Natural-language command capture.
- Project file uploads with Firebase Storage when cloud mode is configured.
- Calendar views and optional Google Calendar sync.
- PWA metadata and browser notification support.
- Toolbox apps including focus sessions, dispatch planning, briefing, Abitur tracking, wishlist, and social habit circles.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand
- Firebase Auth, Firestore, Storage, Functions
- Vitest

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and choose local mode to use ORBIT without a backend.

## Scripts

```bash
npm run dev              # local development
npm run lint             # eslint
npm test                 # unit tests
npm run build            # production build
npm run deploy:rules     # deploy Firestore and Storage rules
npm run deploy:functions # deploy Cloud Functions
```

Cloud Functions are built separately:

```bash
cd functions
npm install
npm run build
```

## Backend Setup

Copy `.env.local.example` to `.env.local` and fill in Firebase values when you want cloud accounts, sync, Storage, push, or Google Calendar.

```bash
cp .env.local.example .env.local
```

See `BACKEND_SETUP.md` and `PRODUCTION_READINESS.md` for the full launch checklist.

## Deployment

The app currently fits Vercel best because it uses Next.js App Router API routes. Firebase Hosting would need an SSR adapter or a static-export redesign.

## License

Private project.
