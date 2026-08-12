# Threadmap production readiness

**Reviewed:** 12 August 2026

This checklist is repository-specific. It complements `AUDIT.md` and is based on OWASP ASVS, the Firebase security and launch checklists, the Next.js and Vercel production checklists, GitHub supply-chain guidance, and EU GDPR transparency and data-subject-rights requirements.

## Implemented in the repository

- Deny-by-default Firestore and Storage rules with authenticated per-user ownership checks.
- Server-controlled item, attachment, and account deletion with durable cleanup jobs.
- Account export and deletion controls available in Settings.
- Upload type, size, count, ownership, immutable-path, and quota validation.
- Authenticated scraper endpoints with bounded input, response size, timeout, concurrency, per-IP, per-user, and distributed quotas.
- DNS-pinned SSRF protection that rejects local, reserved, credentialed, non-standard-port, and unsafe redirect targets.
- MCP OAuth with PKCE, short-lived authorization codes, hashed opaque tokens, refresh rotation/reuse detection, scoped authorization, rate limits, audit records, and tenant binding.
- Content Security Policy, clickjacking protection, MIME sniffing prevention, restricted browser capabilities, referrer policy, HSTS, origin isolation, and no-store handling for sensitive routes.
- CI gates for dependency audit, lint, type checking, unit tests, builds, Cloud Functions tests, and Firebase Rules emulator tests.
- Automated dependency update configuration for the app, functions, and GitHub Actions.
- Public Privacy, Terms, Security, and RFC 9116 `security.txt` pages.
- Zero known production dependency vulnerabilities from `npm audit --omit=dev` on the review date.
- Firebase App Check client support using reCAPTCHA Enterprise, ready for production registration and enforcement.
- A global Cloud Functions instance cap to reduce runaway cost and abuse blast radius.

## Release blockers requiring owner action

- [ ] **Configure App Check.** Register the production web app with reCAPTCHA Enterprise, set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` in Vercel, deploy the client, monitor verified-request metrics, then enforce App Check for Firestore, Storage, Authentication where available, and Cloud Functions. Set `ENFORCE_APP_CHECK=true` in the Functions deployment environment only after verified client traffic is healthy.
- [ ] **Create real legal identity values.** Set `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_POSTAL_ADDRESS`, and `SECURITY_CONTACT_EMAIL`. Ensure both inboxes exist and are monitored. Have qualified counsel validate the policies, controller identity, legal bases, age threshold, liability wording, retention, and required German/other translations.
- [ ] **Separate environments.** Use distinct Firebase and Vercel projects for development, staging, and production. Never point preview deployments at production Firestore by default.
- [ ] **Lock down cloud access.** Require MFA for Firebase, Google Cloud, GitHub, Vercel, and registrar accounts. Use least-privilege IAM, remove stale members and service-account keys, keep at least two recovery-capable owners, and configure essential contacts.
- [ ] **Restrict credentials.** Restrict Firebase and Google API keys by API and allowed web origins. Review OAuth consent-screen domains, redirect URIs, scopes, and test users. Rotate any secret ever copied into chat, logs, source control, or an unmanaged device.
- [ ] **Turn on financial guardrails.** Configure Firebase/Google Cloud budgets and alerts, Vercel spend alerts, quota alerts, and notification recipients. Budget alerts are not hard caps; document the emergency shutdown path.
- [ ] **Configure observability.** Enable Firebase alerts, Cloud Logging retention/alerts, Vercel runtime alerts or a log drain, uptime monitoring for `/api/health`, and client error reporting with redaction. Test that alerts reach a human.
- [ ] **Configure backups and recovery.** Enable Firestore point-in-time recovery or scheduled exports where available, define retention, secure the backup bucket, and perform a documented restore drill using non-production data.
- [ ] **Protect previews and the edge.** Enable Vercel Deployment Protection for previews. Stage WAF rules in log mode for exploit probes and generous `/api/scrape` rate limits, review real traffic, test blocking in preview, and only then enforce in production.
- [ ] **Harden Firebase Authentication.** Enable email-enumeration protection and an appropriate password policy, restrict authorized domains, review account-creation quotas, customize legitimate email templates, and verify password reset and email-link flows on another device.
- [ ] **Run the release preflight.** Populate production environment variables and run `npm run release:check`. Resolve every failure before promoting a production deployment.
- [ ] **Perform the release drill.** Test signup, login, password reset, cross-account isolation, offline/reconnect conflict handling, export, deletion, file upload/delete, Calendar connect/disconnect, MCP connect/revoke, mobile installation, and rollback from a production-like staging environment.

## Important follow-ups

- [ ] Replace production CSP `unsafe-inline` with nonce- or hash-based scripts after validating Google/Firebase authentication and App Check flows.
- [ ] Add malware scanning and quarantine if attachments become shareable, executable, or organization-managed.
- [ ] Commission an independent penetration test before storing regulated, highly sensitive, or business-critical data.
- [ ] Define an incident-response runbook with severity levels, evidence preservation, user notification ownership, credential rotation, rollback, and regulatory breach-assessment steps.
- [ ] Define and enforce exact retention periods for application logs, security audit logs, deleted-account jobs, backups, and inactive accounts.
- [ ] Review accessibility, Core Web Vitals, browser compatibility, and realistic load behavior before public marketing.

## Production environment keys

The app preflight requires the normal Firebase client keys plus:

```env
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
SCRAPE_RATE_LIMIT_SHARED_SECRET=
LEGAL_ENTITY_NAME=
LEGAL_CONTACT_EMAIL=
LEGAL_POSTAL_ADDRESS=
SECURITY_CONTACT_EMAIL=
```

The Functions deployment environment also needs:

```env
ENFORCE_APP_CHECK=true
```

Do not enable enforcement until the deployed client is producing healthy verified App Check traffic.
