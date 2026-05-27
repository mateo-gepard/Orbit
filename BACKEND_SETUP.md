# Backend Setup

Threadmap works locally without a backend. Firebase is only needed for real accounts, cross-device sync, file uploads, push notifications, and Google Calendar integration.

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

Set VAPID secrets before deploying functions.

```bash
firebase functions:secrets:set VAPID_PUBLIC_KEY --project YOUR_PROJECT_ID
firebase functions:secrets:set VAPID_PRIVATE_KEY --project YOUR_PROJECT_ID
firebase deploy --only functions --project YOUR_PROJECT_ID
```

## 5. Deployment Host

Vercel is the simplest target for the current Next.js app because it uses App Router server routes under `src/app/api`. Firebase Hosting needs an SSR adapter or a static-export redesign.
