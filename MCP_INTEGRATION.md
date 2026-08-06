# MCP Integration Guide

This guide lists the Threadmap MCP endpoints, required scopes, and environment settings.

## MCP endpoints

Replace `https://your-threadmap-host` with your deployed host (for local development, use your local emulator/host).

- OAuth Authorization Server Metadata: `https://your-threadmap-host/.well-known/oauth-authorization-server`
- OAuth Protected Resource Metadata: `https://your-threadmap-host/.well-known/oauth-protected-resource`
- Authorization endpoint: `https://your-threadmap-host/authorize`
- Token endpoint: `https://your-threadmap-host/token`
- Registration endpoint: `https://your-threadmap-host/register`
- Revocation endpoint: `https://your-threadmap-host/revoke`
- Authorization consent URL: `https://your-threadmap-host/integrations/authorize`

In this implementation, metadata endpoint roots are built from runtime/optional environment values so the app stays valid on custom domains and staging paths.

## Supported scopes

- `threadmap.read`: read access to tasks, habits, notes, projects, goals, and events.
- `threadmap.write`: write/update access for MCP clients that request corresponding grants.
- `offline_access`: optional for refresh-token capable clients.

## Required settings

- `MCP_DISCOVERY_ORIGIN`  
  Optional override for metadata endpoints (`issuer`, `resource`, `/.well-known/*`, OAuth endpoints).
- `MCP_CONSENT_ORIGIN`  
  Optional override for the user approval route (`/integrations/authorize`) when deployed behind a different domain than the function request origin.
- `MCP_OWNER_UID`  
  Account UID that is allowed to approve/revoke MCP clients and sessions from settings.

If not set, Threadmap falls back to safe defaults.

## Setup checklist

1. Configure and deploy the Functions/Firestore rules set as documented in the main project docs.
2. Add one of: ChatGPT or Claude as an MCP client and complete DCR (dynamic client registration) against:
   - `https://your-threadmap-host/register`
3. Configure the client to point to:
   - `authorization_endpoint`: `/authorize`
   - `token_endpoint`: `/token`
   - `revocation_endpoint`: `/revoke`
   - `resource`: the value reported by metadata, usually `https://your-threadmap-host` or `https://your-threadmap-host/mcp` depending on your deployment path.
4. Configure consent/redirect callback handling in your MCP client to use `/integrations/authorize` for user approvals.
5. In Threadmap Settings → Integrations, confirm clients and sessions are visible and revoke as needed.

## Troubleshooting

- If consent never appears, confirm `threadmap` client owner is signed in and not in demo mode.
- If discovery metadata is wrong, verify `MCP_DISCOVERY_ORIGIN` and `MCP_CONSENT_ORIGIN`.
- If clients are not manageable from settings, check Firestore Rules + callable permissions and confirm you are signed in as the configured owner.
