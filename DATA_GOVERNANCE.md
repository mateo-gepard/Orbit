# Threadmap data governance and AI flow

Last reviewed: 31 August 2026
Classification: confidential personal workspace data; not approved for regulated/GxP records or intentionally collected special-category data.

## Data classes

| Class | Examples | Primary location | Retention |
| --- | --- | --- | --- |
| Identity | Email, display name, profile image, provider IDs, MFA factors | Firebase Authentication | Account lifetime; removed by account deletion |
| Workspace | Tasks, notes, goals, habits, projects, events, tags, links, settings | EU Firestore | Account lifetime; user-controlled deletion |
| Attachments | User-uploaded file content and metadata | EU Cloud Storage | Account lifetime; user-controlled deletion |
| Notifications | Push token, timezone, schedule, device label | Firestore/FCM | Until device removal or account deletion |
| Calendar | Calendar identifiers, sync cursor/state, user-authorized event data | Browser, Firestore, Google Calendar | Until disconnect, deletion, or provider retention |
| Google Workspace Secretary | Connected-account email, granted scopes, AES-256-GCM-encrypted refresh credential, short-lived access tokens, on-demand Gmail/Calendar/Drive results | EU Firestore/Functions and Google APIs; access tokens cached only in Functions memory; results returned to the authorized MCP caller | Credential until disconnect/deletion; OAuth state 10 minutes; access token/provider result only for the request/process cache |
| MCP authorization | OAuth client/grant records, scopes, short-lived authorization and deletion tokens | EU Firestore/Functions | Grant lifetime; short-lived requests/tokens expire; removed on revocation/deletion |
| Operations | IP, request metadata, error/security events, audit metadata | Vercel and Google Cloud logs | Normally 30 days |
| Recovery | Encrypted Firestore exports | EU backup storage | Daily 7 days; weekly 28 days |

Users can type arbitrary text into a workspace. Product copy and contracts must not imply that Threadmap is approved for medical, regulated, or other special-category records until a separate assessment supports that use.

## Processors and transfer review

| Provider | Purpose | Data involved | Status requiring human evidence |
| --- | --- | --- | --- |
| Google Firebase / Google Cloud | Identity, database, files, functions, notifications, logs, backups | All service data as needed | Billing enabled; EU data services configured; DPA/SCC and Identity Platform residency wording require Legal filing |
| Vercel | Hosting, CDN, request/security telemetry | Web requests, IP/user agent, rendered application assets | Active Hobby plan violates Revision 3; paid plan and DPA/SCC evidence required |
| Google Workspace | Optional browser calendar sync and separately consented Secretary source access | User-selected calendar/event data; on-demand Gmail, Calendar, and Drive records; OAuth grants | User opt-in; read-only Secretary scopes; Google verification, terms/DPA, and OAuth consent configuration require owner review |
| User-selected MCP client/model provider | Optional model-driven reads and actions | Only records requested through granted MCP scopes | User opt-in; provider, destination, retention, and transfer terms are chosen outside Threadmap |

No first-party OpenAI, Anthropic, Gemini, advertising, or behavioral analytics SDK is present in the production dependency set as of this review.

## MCP and AI data flow

1. The user starts OAuth from an MCP client and sees Threadmap's authorization screen.
2. The user grants separate Threadmap read/write/delete scopes and an optional `workspace.read` scope; tools outside the grant are not registered.
3. A verified access token constructs an owner-scoped data-access layer. The caller cannot select another owner ID.
4. Read tools return bounded structured projections. Attachment contents and storage URLs are not exposed through Threadmap item tools. Google tools work only after a second provider consent, mint access tokens server-side, and never return OAuth credentials.
5. Writes require fresh idempotency IDs and expected revisions where applicable.
6. Permanent deletion requires a preview, an owner/client/revision-bound short-lived token, destructive tool metadata, and a second confirmation call.
7. Text returned from Threadmap, Gmail, Calendar, or Drive is marked as untrusted user data, not instructions for the model.

The MCP client and its model provider can process data returned by a user-approved tool call. Their retention and training policies are not controlled by Threadmap, so users must choose a suitable provider and avoid connecting regulated data.

## Rights, deletion, and recovery

- Settings provides a durable export and server-controlled account deletion.
- Account deletion removes owned Firestore records, files, push registrations, integration grants, pending Google OAuth state, the encrypted Google refresh credential, and the Firebase Authentication account.
- Protected backups can retain deleted data until the 28-day rotation finishes; restore procedures must never overwrite live production blindly.
- Privacy, deletion, and portability requests use the contact configured on the public legal pages.

## Human approvals still required

- Confirm controller identity, lawful bases, contact details, and final privacy/terms wording.
- Execute and file DPAs/SCCs and maintain the subprocessor register.
- Confirm Vercel and Identity Platform transfer/residency language against the intended customer contract.
- Decide whether special-category or regulated data is prohibited contractually or supported through a future assessment.
