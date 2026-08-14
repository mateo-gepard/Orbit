# Threadmap incident response

**Reviewed:** 12 August 2026

This runbook covers security incidents, data-isolation failures, outages, credential exposure, abusive traffic, and failed releases affecting Threadmap production.

## Severity

- **SEV-1:** Confirmed or likely unauthorized access to user data, cross-tenant exposure, active credential compromise, destructive data loss, or a complete production outage.
- **SEV-2:** Material degradation, sustained abuse, failed background cleanup, partial data unavailability, or a security control failing without confirmed exposure.
- **SEV-3:** Low-impact defect, suspicious activity without demonstrated access, or a contained non-production event.

## First 15 minutes

1. Record the UTC detection time, reporter, affected systems, deployment IDs, commit SHA, and known symptoms.
2. Preserve Vercel runtime logs, Firebase/Cloud Logging entries, App Check metrics, GitHub audit events, and relevant screenshots before changing infrastructure.
3. Contain the incident. Options include rolling Vercel back, disabling a compromised integration, revoking a token or secret, enabling Vercel Attack Mode, or temporarily disabling an affected Function.
4. Do not delete accounts, logs, backups, or suspected malicious records until evidence is preserved.
5. Treat any potentially exposed credential as compromised. Rotate it, update consumers, revoke the old version, and verify that it no longer works.
6. For suspected cross-tenant access, stop the affected write/read path immediately and preserve both allowed and denied request evidence.

## Ownership and communication

- The Google Cloud essential contact and uptime notification recipient is the private owner email configured in the cloud console.
- GitHub private vulnerability reporting is enabled.
- `security@threadmap.app` and `privacy@threadmap.app` must not be treated as operational until MX records and monitored mailboxes exist.
- Only state verified facts. Track hypotheses separately from confirmed impact.
- Do not include access tokens, full request bodies, passwords, user content, or unnecessary personal data in tickets or chat.

## Containment playbooks

### Compromised secret

1. Create a new secret version in the owning platform.
2. Update production and staging consumers independently.
3. Redeploy only the consumers that require the secret.
4. Revoke or destroy the old version after successful verification.
5. Search Git history, Actions logs, Vercel logs, Cloud Logging, and local artifacts for exposure.

### Abusive traffic or denial of service

1. Inspect Vercel WAF and runtime anomaly data.
2. Tighten the existing rate-limit rule only after identifying a safe threshold.
3. For an active broad attack, use `vercel firewall attack-mode enable --duration 1h --yes` and reassess before extending it.
4. Verify `/api/health`, Auth, Firestore, callable Functions, and normal user navigation after mitigation.

### Bad release

1. Identify the last known-good Vercel deployment and Firebase deployment state.
2. Roll back the web deployment first if the client is the source of failure.
3. Keep App Check enforcement aligned with the deployed client; do not strand users on a client that cannot obtain tokens.
4. If Firebase Rules caused the incident, deploy the last reviewed rule set and rerun the emulator suite before reopening access.
5. Confirm health, headers, sign-in, App Check, Firestore reads/writes, and account deletion after rollback.

### Data loss or corruption

1. Stop the faulty writer before restoring data.
2. Determine the smallest affected time range and collections.
3. Prefer point-in-time recovery for recent production mistakes; use scheduled backups for older recovery points.
4. Restore into an isolated database or project when practical, compare records, and copy back only verified data.
5. Follow `RECOVERY_RUNBOOK.md`; never use real production user data for a routine drill.

## Regulatory assessment

1. Record when Threadmap became aware of a possible personal-data breach.
2. Determine data categories, number of people and records, likely consequences, containment, and residual risk.
3. Obtain qualified legal advice. If GDPR notification is required, the supervisory-authority deadline is generally 72 hours from awareness; a user notification may also be required for high risk.
4. Preserve the decision and reasoning even when notification is judged unnecessary.

## Recovery and closure

1. Verify all affected user journeys and security controls, not only the original symptom.
2. Monitor errors, latency, denial rates, App Check validity, and support reports through a stable observation window.
3. Write a blameless post-incident review with timeline, root cause, impact, detection gap, remediation owner, and due date.
4. Add a regression test or automated control for every preventable failure.
5. Close the incident only after temporary mitigations are removed or assigned permanent owners.
