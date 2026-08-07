# Threadmap Production Readiness

This is the practical checklist for taking Threadmap from local mode to a production deployment. Local/demo mode needs no backend account. The client has public defaults for the development Firebase project, but production must explicitly provide the complete `NEXT_PUBLIC_FIREBASE_*` configuration for the intended project.

## Implemented Locally

- CI workflow for install, lint, unit tests, app build, and functions build.
- Vitest unit tests for task bucket behavior and URL safety helpers.
- Explicit local mode instead of silent fallback to demo data.
- Centralized Firebase web configuration with explicit production environment overrides.
- Safer scrape endpoints with per-IP rate limits, URL validation, private-network blocking, redirect validation, and tighter query limits.
- Safer Storage pathing under `users/{userId}/projects/{projectId}/...`.
- Owner-scoped Storage rules with size and MIME checks.
- Baseline security headers through Next.js.
- A production CSP and popup-compatible COOP policy for Firebase, Google Identity/Calendar, Storage previews, and service workers.
- A versioned, bounded service-worker cache with an offline fallback and no embedded Firebase credentials.
- Node.js 22 alignment across the app, CI, Vercel, and Cloud Functions.
- Firebase Admin 14 and Firebase Functions 7 on their current Node 22-compatible releases.
- A Vercel health endpoint at `/api/health`.
- Next-managed Google Identity script loading.

## Required Before Production Launch

1. Create a real Firebase project and copy `.env.local.example` to `.env.local`.
2. Enable Firebase Authentication providers you want to support.
3. Enable Firestore and deploy `firestore.rules`.
4. Enable Storage and deploy `storage.rules`.
5. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `SCRAPE_RATE_LIMIT_SHARED_SECRET` as Firebase Functions secrets before deploying functions.
6. Configure deployment environment variables in Vercel, including the same server-only `SCRAPE_RATE_LIMIT_SHARED_SECRET` for shared scraper quotas.
7. Deploy the Next.js app to Vercel and verify `/api/health`; Firebase Hosting is intentionally not configured.
8. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:rules`, and `npm run build` under Node.js 22.

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
- Clean up remaining lint warnings across legacy UI and debug surfaces.
- Decide which experimental/debug tools should ship behind a feature flag.

## Known Upstream Tooling Advisories

As of 2026-08-06, the application production dependency audit is clean and both CI high-severity audit gates pass. A full audit still reports moderate transitive advisories under the latest `firebase-tools` development CLI and the latest Firebase Admin Storage dependency chain (`uuid` through Google Cloud libraries). npm offers only unsafe forced downgrades outside the supported dependency ranges, so these are documented pending upstream releases rather than overridden.
