<div align="center"># ORBIT**Personal Productivity OS**One system. One dashboard. Everything connected.[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)[![Firebase](https://img.shields.io/badge/Firebase-Firestore+Auth-FFCA28?logo=firebase)](https://firebase.google.com)</div>---ORBIT is a personal productivity system that unifies tasks, projects, habits, events, goals, and notes into a single, opinionated web application. It works offline out of the box (localStorage) and syncs across devices when signed in with Firebase.## ✦ Core Features### Universal Item SystemEverything in ORBIT is an **OrbitItem** — a single entity with a `type` field (`task`, `project`, `habit`, `event`, `goal`, `note`). One data model, one CRUD layer, one search, one command bar.### Command Bar (`⌘K`)Natural language quick capture. Type `Groceries #home tomorrow` to create a task tagged "home" due tomorrow. Supports `/project`, `/event`, `/habit`, `/goal`, `/note` prefixes, date parsing, priority flags, and tags.### Deep Linking & Knowledge GraphBidirectional links between any items. Parent-child hierarchies for projects. Visual force-directed link graph. Everything connects to everything.### DashboardDaily overview: today's tasks, active habits, upcoming events, project progress, and goals — all on one screen.### HabitsWeekly grid tracker with real streak calculation that respects scheduled days (e.g., Mon/Wed/Fri). Streak badges and completion animations.### CalendarMonth view with events, task due dates, and Google Calendar two-way sync.### Inbox → Process → ArchiveGTD-inspired flow. Items land in Inbox, get processed (activate, schedule, delegate), and eventually archive. Swipe gestures on mobile.### Files & AttachmentsUpload files to projects. PDF, images, documents — stored in Firebase Storage with per-user isolation.### Badges & AchievementsTiered achievement system (Bronze → Diamond) across categories: tasks completed, streaks maintained, projects finished, focus hours logged.### SettingsFull settings page: theme, language (EN/DE), date/time formats, notification preferences, accessibility options, focus session defaults, and privacy controls. All cloud-synced.### i18nEnglish and German with a fun "Hockey Mode" easter egg that turns the entire UI into sports commentary + medical terminology.### Push NotificationsMorning and evening briefings via browser notifications. Smart, context-aware summaries of your day — what's ahead and what you accomplished.### PWAInstallable as a Progressive Web App with offline support, app manifest, and service worker.---## ✦ ToolboxSelf-contained tools that live alongside the core system. Each tool has its own Zustand store, Firestore sync, and dedicated page.| Tool | Description ||------|-------------|| **✈️ Cleared for Takeoff** | Deep-work focus sessions modeled as flights. Routes, boarding passes, turbulence events, a logbook, and a cockpit UI with real-time phase tracking. || **🗺️ Dispatch** | Day planner that turns tasks + calendar events into a realistic route. Schedule focus flights and re-route when plans change. || **📊 Briefing** | Day and week briefs. Start with priorities, end with reflection. Weekly overviews for the bigger picture. || **🎓 Abitur Tracker** | Full Bavarian G9 Abitur calculator. Semester grades, exam scores, Block I/II points, deficit warnings, projected final grade. || **💎 The Vault** | Wishlist as a private gallery. Add pieces via URL (auto-scrapes title, image, price), run Elo-rated head-to-head auctions, track acquisitions. Category wings, rarity badges, ranking confidence. |---## ✦ Tech Stack| Layer | Technology ||-------|------------|| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) || UI | [React 19](https://react.dev) · [TypeScript 5](https://typescriptlang.org) || Styling | [Tailwind CSS v4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) || State | [Zustand 5](https://zustand.docs.pmnd.rs) with `persist` middleware || Backend | [Firebase](https://firebase.google.com) (Firestore, Auth, Storage) || Dates | [date-fns](https://date-fns.org) || Icons | [Lucide React](https://lucide.dev) || Fonts | Geist Sans + Geist Mono via `next/font/google` || Rich Text | [Tiptap](https://tiptap.dev) (notes editor) || Graphs | [React Flow](https://reactflow.dev) (link graph visualization) |---## ✦ Architecture```Browser  │  ├── UI Layer ──────── Next.js App Router pages (src/app/)  │                     shadcn/ui components (src/components/ui/)  │                     Shell: Sidebar, CommandBar, DetailPanel  │  ├── State Layer ───── Zustand stores (src/lib/store.ts, *-store.ts)  │                     persist middleware → localStorage  │                     Cloud sync via scheduleSave / _setFromCloud  │  ├── Data Layer ────── firestore.ts: CRUD, subscriptions, retry logic  │                     Dual-mode: Firebase when auth'd, localStorage in demo  │                     Optimistic updates with rollback  │  └── Providers ─────── AuthProvider → DataProvider → ThemeProvider                        Wires Firestore subscriptions                        Rehydrates persisted stores on sign-in```

### Key Paths

```
src/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── today/                      # Today view
│   ├── inbox/                      # Inbox processing
│   ├── tasks/ projects/ habits/    # Type views
│   ├── goals/ notes/ calendar/     # More views
│   ├── archive/                    # Archive
│   ├── files/                      # File manager
│   ├── settings/                   # Settings page
│   ├── toolbox/                    # Tool launcher
│   ├── tools/
│   │   ├── flight/                 # Focus sessions
│   │   ├── dispatch/               # Day planner
│   │   ├── briefing/               # Day/week briefs
│   │   ├── abitur/                 # Grade calculator
│   │   └── wishlist/               # The Vault
│   └── api/
│       └── scrape/                 # URL metadata + image/price search
├── components/
│   ├── providers/                  # Auth, Data, Theme, PWA, Settings
│   ├── shell/                      # App shell (sidebar, command bar, detail panel)
│   ├── items/                      # Reusable item components, link graph
│   ├── notes/                      # Tiptap note editor
│   ├── files/                      # File upload/viewer
│   ├── mobile/                     # Pull-to-refresh, swipeable rows
│   └── ui/                         # shadcn/ui primitives
└── lib/
    ├── types.ts                    # OrbitItem, ItemType, etc.
    ├── store.ts                    # Main Zustand store
    ├── firestore.ts                # All Firestore CRUD + subscriptions
    ├── firebase.ts                 # Firebase client init
    ├── command-parser.ts           # Natural language parser
    ├── habits.ts                   # Streak calculation
    ├── links.ts                    # Bidirectional linking utilities
    ├── badges.ts                   # Achievement system
    ├── flight.ts                   # Focus session engine
    ├── i18n.ts                     # Translations (EN/DE + Hockey Mode)
    ├── settings-store.ts           # Settings Zustand store
    ├── toolbox-store.ts            # Tool registry + enabled state
    ├── wishlist-store.ts           # The Vault store (Elo, auctions)
    ├── abitur-store.ts             # Abitur calculator store
    ├── storage.ts                  # Firebase Storage (file uploads)
    ├── google-calendar.ts          # Google Calendar API
    ├── briefing-notifications.ts   # Push notification briefings
    ├── mobile.ts                   # Mobile detection utilities
    ├── pwa.ts                      # PWA / service worker
    └── utils.ts                    # cn(), date helpers, etc.
```

---

## ✦ Getting Started

### 1. Install

```bash
git clone https://github.com/mateo-gepard/Orbit.git
cd Orbit
npm install
```

### 2. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). ORBIT runs immediately in **demo mode** using localStorage — no backend required.

### 3. Enable Cloud Sync (Optional)

For multi-device sync and authentication:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Google Sign-In)
3. Enable **Firestore Database**
4. Enable **Storage** (for file uploads)
5. Copy your Firebase config:

```bash
cp .env.local.example .env.local
# Fill in your Firebase credentials
```

6. Deploy Firestore security rules:

```bash
npm run deploy:rules
```

See [`BACKEND_SETUP.md`](./BACKEND_SETUP.md) for detailed instructions.

---

## ✦ Command Bar Syntax

| Input | Result |
|-------|--------|
| `Groceries #home tomorrow` | Task, tag: home, due: tomorrow |
| `Meeting with Alex 15.03 14:00` | Event on March 15 at 2pm |
| `/project Vulcano Rover #tech` | New project |
| `/habit Jogging` | New habit |
| `/goal Cambridge #career` | New goal |
| `/note #idea App concept` | Note with idea subtype |

---

## ✦ Deployment

Deploy to Vercel:

```bash
npx vercel
```

Set environment variables (`NEXT_PUBLIC_FIREBASE_*`) in the Vercel dashboard.

---

## ✦ License

Private project.
