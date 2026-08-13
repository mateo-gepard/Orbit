# Threadmap production readiness

**Reviewed:** 13 August 2026

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
- Firebase App Check using reCAPTCHA Enterprise, enforced for Authentication, Firestore, Storage, and callable Functions.
- A global Cloud Functions instance cap to reduce runaway cost and abuse blast radius.

## Live platform controls completed on 12 August 2026

- Production Firebase browser credentials are restricted to approved Threadmap, Firebase, and local-development origins while preserving Firebase API restrictions.
- Production App Check is registered and enforced. A tokenless account-creation request and a tokenless callable request both returned HTTP 401; the same authenticated browser flow succeeded with App Check and was deleted afterward.
- Firestore delete protection and point-in-time recovery are enabled. Daily backups retain 7 days and weekly backups retain 28 days.
- A synthetic staging export/delete/import recovery drill passed. See `RECOVERY_RUNBOOK.md`.
- Vercel previews and development use the isolated `threadmap-staging-9e0b6` Firebase project. Production remains on `orbit-9e0b6`.
- Staging has separate Firebase, App Check, reCAPTCHA, browser API, VAPID, scraper-secret, Auth, Firestore, Storage, Rules, and Functions resources.
- Preview deployments require Vercel SSO and use Git fork protection. A monitoring-only WAF rule logs clients exceeding 120 `/api/` requests per minute.
- Vercel 5xx and usage-anomaly alerts, a multi-region Google uptime check, a 30-day Cloud Logging retention period, and private operational email alerts are configured.
- The existing EUR 10 production budget remains active, and staging has an isolated EUR 5 budget.
- Firebase Authentication has improved email privacy and a 12-character password policy without forcing existing users to upgrade immediately.
- GitHub has secret scanning, push protection, extended pattern and validity checks, Dependabot security updates, CodeQL, read-only workflow permissions, branch protection, and four required checks.
- Production and staging have no user-managed service-account keys. The production IAM audit found one human owner and only expected Google service agents/editors.
- CI, CodeQL, application tests, Firebase Rules tests, Functions tests, type checking, lint, and production builds pass.
- Root-domain forwarding and the authenticated `auth.threadmap.app` Resend sending domain are configured. SPF, DKIM, and DMARC checks pass, and the branded passwordless sign-in function is deployed.
- Google OAuth branding is verified and published as Threadmap. The Calendar `calendar.events.owned` data-access request, scope rationale, and demo video were submitted for Google review.
- A complete production gate passed on 13 August 2026: environment preflight, production dependency audits, license and EU-region policies, lint, type checking, 461 application tests, 19 Firestore/Storage Rules tests, 49 Functions/MCP tests, and the Next.js production build. Production deployment evidence remains in Vercel rather than embedding a deployment ID that becomes stale after every release; `threadmap.app` is live.

## Release blockers requiring owner action

- [ ] **Replace the pre-release legal identity.** All four legal environment variables are configured across Vercel environments, but `LEGAL_ENTITY_NAME` and `LEGAL_POSTAL_ADDRESS` deliberately contain pre-release pending values. Replace them with the real controller/operator identity and address. Forwarding and authenticated sending are operational. Have qualified counsel validate the policies, legal bases, age threshold, liability wording, retention, and required translations.
- [ ] **Secure provider-owner accounts.** Confirm phishing-resistant MFA and recovery codes for Google Cloud/Firebase, GitHub, Vercel, and the domain registrar. Add a second recovery-capable owner; the cloud project currently has one human owner.
- [ ] **Close provider-facing identity review.** Google branding is published and Calendar verification is submitted; monitor `support@threadmap.app` and the developer mailbox and respond to Google until approval. Run one final second-device passwordless sign-in and recovery-email drill before public launch.
- [ ] **Run the remaining human release drill.** Verify cross-account isolation with two real test users, offline/reconnect conflict handling, files, Calendar connect/disconnect, MCP connect/revoke, mobile install, notification delivery, rollback ownership, and alert delivery to a human.
- [ ] **Choose client error reporting.** Select a privacy-reviewed provider and retention period before adding browser error telemetry. Server/runtime, uptime, CI, and cloud alerts are already active.
- [ ] **Decide ownership of legacy Google API keys.** `OrbitApiKey` and `API-Schlüssel 2` are unrestricted and were not found in Vercel production or tracked source. Confirm external consumers before restricting or deleting them. `EduVids` appears unrelated and was left untouched.
- [ ] **Observe before blocking at the WAF.** Review the monitoring-only API burst rule after representative traffic, then choose a blocking threshold. This is deliberately not enforced blindly.
- [ ] **Upgrade Vercel to a paid organizational plan.** The adopted Revision 3 gate prohibits Hobby for real services/data. Skew Protection and historical WAF rule metrics are also unavailable on the current plan.
- [ ] **Track the upstream development advisory.** Production dependency audits pass with zero findings. The current Firebase CLI development graph uses `@google-cloud/pubsub` 5.x and `@opentelemetry/core` 1.30.1, which is affected by moderate advisory `GHSA-8988-4f7v-96qf`. The patched chain requires Pub/Sub 6.x while Firebase CLI declares 5.x, so no unsafe forced major override was applied.
- [x] **Complete the technical production preflight.** `npm run release:check` and the complete technical gate pass with explicit pre-release legal values. This does not replace the real legal identity or owner approvals above.

## Important follow-ups

- [ ] Replace production CSP `unsafe-inline` with nonce- or hash-based scripts after validating Google/Firebase authentication and App Check flows.
- [ ] Add malware scanning and quarantine if attachments become shareable, executable, or organization-managed.
- [ ] Commission an independent penetration test before storing regulated, highly sensitive, or business-critical data.
- [x] Define an incident-response runbook with severity levels, evidence preservation, containment, credential rotation, rollback, and regulatory breach-assessment steps. See `INCIDENT_RESPONSE.md`.
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
