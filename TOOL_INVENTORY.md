# Threadmap tool inventory

Last reviewed: 12 August 2026

| Field | Value |
| --- | --- |
| Tool | Threadmap |
| Purpose | Personal workspace for tasks, projects, goals, habits, notes, calendar events, files, and user-authorized MCP access |
| Technical owner | Mateo Mamaladze |
| Release authority | Product owner; legal launch approval remains separate |
| Audience | External/public signup, with private authenticated workspaces |
| Quality tier | T4: external plus personal/customer data |
| Production URL | `https://threadmap.app` |
| Source | GitHub repository `mateomamaladze/orbit` |
| Web platform | Next.js on Vercel |
| Identity and data | Firebase Authentication with Identity Platform, Firestore, Cloud Storage, Cloud Functions |
| Production project | `orbit-9e0b6` |
| Staging project | `threadmap-staging-9e0b6` |
| Primary data region | European Union for Firestore, Storage, and Functions |
| Authentication | Email/password, email link, Google, optional TOTP MFA |
| Integrations | Optional Google Calendar and user-authorized MCP clients |
| Incident runbook | `INCIDENT_RESPONSE.md` |
| Recovery runbook | `RECOVERY_RUNBOOK.md` |
| Data register | `DATA_GOVERNANCE.md` |
| Security review | `SECURITY_BOUNDARY_REVIEW.md` |

## Inventory actions

- Register this entry in the organization-wide inventory once its system of record is selected.
- Confirm a second human cloud/GitHub owner and an incident escalation contact.
- Upgrade the Vercel team from Hobby before handling real user data under Revision 3.
