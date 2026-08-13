# Threadmap subprocessors

Last reviewed: 13 August 2026

This register records the external providers that process personal data to operate Threadmap. It complements the public Privacy Policy. Contract execution, transfer-impact analysis, and final legal approval remain owner and counsel responsibilities.

| Provider | Purpose | Data categories | Processing notes |
| --- | --- | --- | --- |
| Google Firebase and Google Cloud | Authentication, database, file storage, Cloud Functions, notifications, backups, and optional Google Calendar integration | Account identifiers, workspace records, uploaded files, device tokens, integration records, and operational metadata | Core Firestore, Storage, Functions, and backup resources are configured in EU regions. Firebase Authentication and some supporting services can involve global processing under Google's applicable DPA and transfer safeguards. |
| Vercel | Web hosting, application delivery, deployment, firewall, and operational logs | Request metadata, IP address, user agent, route, deployment metadata, and application responses | Edge delivery and operational processing can occur globally under Vercel's applicable DPA and transfer safeguards. |
| Resend | Transactional sign-in and account-security email delivery | Recipient email address, message content, delivery status, and delivery/security metadata | Workspace content is not included. Processing locations and international safeguards follow Resend's applicable DPA and current infrastructure disclosures. |

Optional MCP clients and Google Calendar process data only after a user authorizes the integration. User-selected clients and model providers are not Threadmap subprocessors unless Threadmap contracts and controls them separately.
