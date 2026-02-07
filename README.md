# ORBIT — Personal Productivity OS

> One system, one dashboard, everything connected.

ORBIT is a personal productivity system that unifies tasks, projects, habits, calendar, goals, notes and ideas into a single powerful web application.

## Features

- **📋 Universal Item System** — Everything is an item with a type (Task, Project, Habit, Event, Goal, Note)
- **🔗 Deep Linking** — Bidirectional links between any items + hierarchical parent-child relationships
- **⚡ Command Bar (⌘K)** — Quick capture with natural language parsing (dates, tags, priorities)
- **📊 Dashboard** — Daily overview with tasks, habits, events, projects, and goals
- **🎯 Habits Tracker** — Weekly grid with streak calculation (respects scheduled days)
- **📅 Calendar** — Month view with events and task due dates
- **🏷️ Tag System** — Life area tags (#tech, #uni, #career, #health, etc.)
- **🌙 Dark Mode** — System preference + manual toggle
- **📱 Responsive** — Mobile-friendly with adaptive layout

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui**
- **Firebase** (Firestore + Auth with Google Sign-In)
- **Zustand** for UI state management
- **date-fns** for date handling
- **Lucide React** for icons

## Getting Started

### 1. Clone & Install

```bash
npm install
```

### 2. Configure Firebase (Optional)

**ORBIT läuft sofort ohne Backend im Demo-Modus** (localStorage). Für Cloud-Sync:

#### Quick Setup (Interactive)
```bash
./scripts/setup-firebase.sh
```

#### Manuell
1. Erstelle Firebase-Projekt auf [console.firebase.google.com](https://console.firebase.google.com)
2. Aktiviere **Authentication** (Google Sign-In)
3. Aktiviere **Firestore Database**
4. Kopiere Firebase Config:
   ```bash
   cp .env.local.example .env.local
   # Füge deine Firebase Credentials ein
   ```
5. Setze **Firestore Security Rules** (siehe `firestore.rules`)

**📖 Detaillierte Anleitung:** Siehe [`BACKEND_SETUP.md`](./BACKEND_SETUP.md)

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard
│   ├── today/             # Today view
│   ├── inbox/             # Inbox processing
│   ├── projects/          # Projects grid
│   ├── habits/            # Habits weekly grid
│   ├── goals/             # Goals by timeframe
│   ├── notes/             # Notes with filters
│   ├── calendar/          # Calendar month view
│   └── archive/           # Archived items
├── components/
│   ├── providers/         # Auth, Data, Theme providers
│   ├── shell/             # App shell (Sidebar, CommandBar, DetailPanel)
│   ├── items/             # Reusable item components
│   └── ui/                # shadcn/ui components
└── lib/
    ├── types.ts           # TypeScript types
    ├── firebase.ts        # Firebase config
    ├── firestore.ts       # Firestore CRUD
    ├── store.ts           # Zustand store
    ├── command-parser.ts  # Natural language parser
    ├── habits.ts          # Streak & habit utilities
    └── utils.ts           # Utility functions
```

## Command Bar Syntax

| Input | Result |
|-------|--------|
| `Müll rausbringen #home morgen` | Task, tag: home, due: tomorrow |
| `/project Vulcano Rover #tech` | New project |
| `/event Wien 15.03` | Event on March 15 |
| `/habit Joggen` | New habit |
| `/goal Cambridge #career` | New goal |
| `/note #idea App für X` | Note with idea subtype |

## Deployment

Deploy to Vercel:

```bash
npx vercel
```

Set environment variables in Vercel dashboard.
