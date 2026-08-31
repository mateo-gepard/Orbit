# Backend Setup

Threadmap works locally without a backend. Firebase is needed for real accounts, cross-device sync, file uploads, push notifications, browser Google Calendar sync, and the cloud Threadmap Secretary MCP.

## 1. Client Environment

Copy the example file and fill in values from your Firebase project settings.

```bash
cp .env.local.example .env.local
```

Required for auth and Firestore:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Required for file uploads:

- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

Required for push:

- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- `NEXT_PUBLIC_WEBPUSH_VAPID_KEY`

Optional integrations:

- `NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_CX`

Cloud Secretary Google Workspace source (Functions configuration, not browser configuration):

- `GOOGLE_WORKSPACE_CLIENT_ID` — Google OAuth Web application client id
- `GOOGLE_WORKSPACE_CLIENT_SECRET` — Firebase Functions secret
- `GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY` — Firebase Functions secret containing 32 random bytes encoded as base64

Server-only scraper protection:

- `SCRAPE_RATE_LIMIT_SHARED_SECRET` (the same random value must be configured
  in Vercel and Firebase Functions; never prefix it with `NEXT_PUBLIC_`)

## 2. Firebase Services

Enable these services in Firebase:

- Authentication: Google provider, plus email/password or email-link if desired.
- Firestore Database.
- Storage.
- Cloud Functions if you want scheduled notification briefings.

## 3. Rules

Deploy Firestore and Storage rules after reviewing them for your project.

```bash
firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
```

New file uploads use this Storage path:

```text
users/{userId}/projects/{projectId}/{fileName}
```

If a previous deployment stored files under `projects/{projectId}/...`, migrate those objects or add a temporary owner-checked legacy rule before publishing the new Storage rules.

## 4. Functions Secrets

Set VAPID secrets, the private scraper quota handshake, and the two Google Workspace Secretary
secrets before deploying Functions with the Google read tools enabled.

```bash
firebase functions:secrets:set VAPID_PUBLIC_KEY --project YOUR_PROJECT_ID
firebase functions:secrets:set VAPID_PRIVATE_KEY --project YOUR_PROJECT_ID
firebase functions:secrets:set SCRAPE_RATE_LIMIT_SHARED_SECRET --project YOUR_PROJECT_ID
firebase functions:secrets:set GOOGLE_WORKSPACE_CLIENT_SECRET --project YOUR_PROJECT_ID
firebase functions:secrets:set GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY --project YOUR_PROJECT_ID
firebase deploy --only functions --project YOUR_PROJECT_ID
```

The Google OAuth client must be a Web application with the exact callback
`https://YOUR_THREADMAP_ORIGIN/api/mcp/oauth/google/callback`. Enable Gmail, Google Calendar, and
Google Drive APIs, keep the app in testing mode for a personal deployment, and add the intended
Google account as a test user. See `MCP_SETUP.md` for the complete scope, consent, and deployment
contract.

Configure `SCRAPE_RATE_LIMIT_SHARED_SECRET` with the same value for Vercel's
Development, Preview, and Production environments. The value is used only by
server routes and must not be exposed to browser code.

Cloud Functions and the application target Node.js 22. `firebase.json` runs the functions TypeScript build as a predeploy gate.

## 5. Local Rules Verification

Firestore and Storage emulator tests require Java 21 or newer:

```bash
npm run test:rules
```

Deploy both rules and the committed composite indexes only after the emulator suite passes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project YOUR_PROJECT_ID
```

## 6. Deployment Host

Vercel is the production host for the Next.js application because it uses App Router server routes under `src/app/api`. Firebase Hosting is intentionally absent from `firebase.json`; Firebase remains the backend service platform.
