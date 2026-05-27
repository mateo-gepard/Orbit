# ORBIT Production Readiness

This is the practical checklist for taking ORBIT from local mode to a production deployment. The codebase now runs without Firebase credentials by default; cloud sign-in and sync only activate when real `NEXT_PUBLIC_FIREBASE_*` values are present.

## Implemented Locally

- CI workflow for install, lint, unit tests, app build, and functions build.
- Vitest unit tests for task bucket behavior and URL safety helpers.
- Explicit local mode instead of silent fallback to demo data.
- No Firebase placeholder credentials in the client runtime.
- Safer scrape endpoints with per-IP rate limits, URL validation, private-network blocking, redirect validation, and tighter query limits.
- Safer Storage pathing under `users/{userId}/projects/{projectId}/...`.
- Owner-scoped Storage rules with size and MIME checks.
- Baseline security headers through Next.js.
- Next-managed Google Identity script loading.

## Required Before Production Launch

1. Create a real Firebase project and copy `.env.local.example` to `.env.local`.
2. Enable Firebase Authentication providers you want to support.
3. Enable Firestore and deploy `firestore.rules`.
4. Enable Storage and deploy `storage.rules`.
5. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as Firebase Functions secrets before deploying functions.
6. Configure deployment environment variables in Vercel or your chosen host.
7. Decide whether hosting is Vercel or Firebase Hosting. The current Next app is built for Vercel-style server routes; Firebase Hosting would need an SSR adapter or a static-export plan.

## Firebase Tasks Not Done Here

These require console or project access:

- Deploying Firestore and Storage rules.
- Creating OAuth client IDs and adding authorized domains.
- Enabling Google sign-in, email/password, and email-link auth.
- Creating Google Custom Search keys for wishlist scraping.
- Setting Firebase Functions secrets.
- Validating existing Storage files. New uploads use `users/{userId}/projects/...`; old `projects/...` files need migration or temporary legacy read rules before deploying the new rules.

## Remaining Engineering Work

- Add integration tests for auth, sync, item CRUD, settings, and offline recovery.
- Replace the in-memory rate limiter with a shared limiter before horizontal scaling.
- Add error reporting and structured telemetry for production incidents.
- Add a privacy policy, support contact, data export, and account deletion copy.
- Add Firestore rule tests using the Firebase emulator.
- Clean up remaining lint warnings across legacy UI and debug surfaces.
- Decide which experimental/debug tools should ship behind a feature flag.
