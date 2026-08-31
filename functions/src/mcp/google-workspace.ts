import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { DalError, htmlToPlainText, type JsonObject } from './dal';
import { generateOpaqueToken, hashOpaqueToken } from './security';

export const GOOGLE_WORKSPACE_MCP_SCOPE = 'workspace.read';

export const GOOGLE_WORKSPACE_PATHS = Object.freeze({
  authorize: '/api/mcp/oauth/google/authorize',
  callback: '/api/mcp/oauth/google/callback',
  status: '/api/mcp/oauth/google/status',
  disconnect: '/api/mcp/oauth/google/disconnect',
  settings: '/integrations/google-workspace',
});

export const GOOGLE_WORKSPACE_PROVIDER_SCOPES = Object.freeze([
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]);

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_API_ORIGIN = 'https://www.googleapis.com';
const CONNECTION_COLLECTION = 'googleWorkspaceConnections';
const STATE_COLLECTION = 'googleWorkspaceOAuthStates';
const STATE_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const ACCESS_TOKEN_SAFETY_MS = 60_000;
const MAX_ACCESS_TOKEN_CACHE_ENTRIES = 100;
const MAX_GMAIL_BODY_CHARACTERS = 4_000;
const MAX_DRIVE_DOWNLOAD_BYTES = 128_000;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+\/-]{20,8192}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

export interface GoogleWorkspaceConfiguration {
  origin: string;
  clientId?: string;
  clientSecret?: string;
  tokenEncryptionKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
  random?: (size: number) => Buffer;
}

export interface GoogleWorkspaceStatus {
  configured: boolean;
  connected: boolean;
  connectionUrl: string;
  email?: string;
  scopes?: string[];
  connectedAt?: number;
  updatedAt?: number;
  needsReauthorization?: boolean;
  reason?: string;
}

export interface GmailSearchInput {
  query: string;
  maxResults?: number;
  pageToken?: string;
}

export interface GmailThreadInput {
  threadId: string;
  maxMessages?: number;
}

export interface CalendarEventInput {
  startTime: string;
  endTime: string;
  calendarId?: string;
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface DriveSearchInput {
  query: string;
  maxResults?: number;
  pageToken?: string;
}

export interface DriveFileInput {
  fileId: string;
  maxCharacters?: number;
}

export interface GoogleWorkspaceAccess {
  getStatus(): Promise<GoogleWorkspaceStatus>;
  searchGmail(input: GmailSearchInput): Promise<JsonObject>;
  getGmailThread(input: GmailThreadInput): Promise<JsonObject>;
  listCalendars(): Promise<JsonObject>;
  listCalendarEvents(input: CalendarEventInput): Promise<JsonObject>;
  searchDrive(input: DriveSearchInput): Promise<JsonObject>;
  getDriveFile(input: DriveFileInput): Promise<JsonObject>;
}

export class GoogleWorkspaceOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'GoogleWorkspaceOAuthError';
  }
}

interface EncryptedToken {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  tag: string;
}

interface ConnectionRecord {
  userId: string;
  status: 'active' | 'reauthorization_required';
  email?: string;
  googleSubject?: string;
  scopes: string[];
  encryptedRefreshToken: EncryptedToken;
  connectedAt: number;
  createdAt: number;
  updatedAt: number;
}

interface StateRecord {
  userId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
  expireAt: Date;
  consumedAt?: number;
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

interface GoogleTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
  error?: unknown;
  error_description?: unknown;
}

function ownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, maximum = 10_000): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, maximum)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown, maximum = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(0, maximum);
}

function sanitizeHeaderValue(value: unknown, maximum = 1_000): string | undefined {
  const candidate = stringValue(value, maximum);
  return candidate?.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim() || undefined;
}

function boundedPlainText(value: unknown, maximum: number): string {
  return htmlToPlainText(value, maximum).replace(/\s+\n/g, '\n').trim();
}

function configurationKey(raw: string | undefined): Buffer | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  let decoded: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    decoded = Buffer.from(value, 'hex');
  } else {
    try {
      decoded = Buffer.from(value, 'base64');
    } catch {
      return undefined;
    }
  }
  return decoded.length === 32 ? decoded : undefined;
}

export function encryptGoogleRefreshToken(token: string, rawKey: string, nonce?: Buffer): EncryptedToken {
  if (!TOKEN_PATTERN.test(token)) throw new Error('The Google refresh token is invalid.');
  const key = configurationKey(rawKey);
  if (!key) throw new Error('The Google Workspace encryption key must contain exactly 32 bytes.');
  const iv = nonce ?? randomBytes(12);
  if (iv.length !== 12) throw new Error('AES-GCM requires a 12-byte nonce.');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptGoogleRefreshToken(value: unknown, rawKey: string): string {
  if (!ownRecord(value) || value.version !== 1 || value.algorithm !== 'aes-256-gcm'
      || typeof value.iv !== 'string' || typeof value.ciphertext !== 'string'
      || typeof value.tag !== 'string') {
    throw new Error('The stored Google Workspace credential is invalid.');
  }
  const key = configurationKey(rawKey);
  if (!key) throw new Error('The Google Workspace encryption key must contain exactly 32 bytes.');
  const iv = Buffer.from(value.iv, 'base64url');
  const ciphertext = Buffer.from(value.ciphertext, 'base64url');
  const tag = Buffer.from(value.tag, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
    throw new Error('The stored Google Workspace credential is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const token = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  if (!TOKEN_PATTERN.test(token)) throw new Error('The decrypted Google refresh token is invalid.');
  return token;
}

function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function safeReason(error: unknown): string {
  if (error instanceof GoogleWorkspaceOAuthError) return error.code;
  return 'provider_error';
}

function sourceEnvelope(source: string, now: number): JsonObject {
  return { source, fetchedAt: now };
}

function gmailHeaders(message: Record<string, unknown>): Record<string, string> {
  const payload = ownRecord(message.payload) ? message.payload : {};
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!ownRecord(header) || typeof header.name !== 'string' || typeof header.value !== 'string') continue;
    const key = header.name.toLowerCase();
    if (!['subject', 'from', 'to', 'cc', 'date', 'message-id'].includes(key)) continue;
    const value = sanitizeHeaderValue(header.value);
    if (value) result[key] = value;
  }
  return result;
}

function decodeGmailBody(data: unknown): string {
  if (typeof data !== 'string' || data.length < 1) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function gmailBodyPart(payload: unknown): { text: string; html: string } {
  if (!ownRecord(payload)) return { text: '', html: '' };
  const mimeType = stringValue(payload.mimeType, 200)?.toLowerCase();
  const body = ownRecord(payload.body) ? payload.body : {};
  const decoded = decodeGmailBody(body.data);
  let text = mimeType === 'text/plain' ? decoded : '';
  let html = mimeType === 'text/html' ? decoded : '';
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts.slice(0, 100)) {
      const child = gmailBodyPart(part);
      text += child.text ? `\n${child.text}` : '';
      html += child.html ? `\n${child.html}` : '';
    }
  }
  return { text, html };
}

function gmailMessageProjection(value: unknown): JsonObject | undefined {
  if (!ownRecord(value)) return undefined;
  const id = stringValue(value.id, 300);
  if (!id) return undefined;
  const headers = gmailHeaders(value);
  const bodyParts = gmailBodyPart(value.payload);
  const body = boundedPlainText(bodyParts.text || bodyParts.html, MAX_GMAIL_BODY_CHARACTERS);
  return {
    id,
    ...(stringValue(value.threadId, 300) ? { threadId: stringValue(value.threadId, 300)! } : {}),
    ...(headers.subject ? { subject: headers.subject } : {}),
    ...(headers.from ? { from: headers.from } : {}),
    ...(headers.to ? { to: headers.to } : {}),
    ...(headers.cc ? { cc: headers.cc } : {}),
    ...(headers.date ? { date: headers.date } : {}),
    ...(headers['message-id'] ? { messageId: headers['message-id'] } : {}),
    ...(stringValue(value.snippet, 1_000) ? { snippet: boundedPlainText(value.snippet, 1_000) } : {}),
    ...(body ? { body } : {}),
  };
}

function driveQueryLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseContentDispositionName(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /filename\*?=(?:UTF-8''|\")?([^";]+)/i.exec(value);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1].replace(/^"|"$/g, '')).slice(0, 500);
  } catch {
    return match[1].replace(/^"|"$/g, '').slice(0, 500);
  }
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!response.body) return { bytes: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      const remaining = maximumBytes - total;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(chunk.subarray(0, remaining));
      total += Math.min(chunk.length, remaining);
      if (chunk.length > remaining) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { bytes: Buffer.concat(chunks, total), truncated };
}

export class GoogleWorkspaceService {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly tokenEncryptionKey?: string;
  private readonly encryptionKeyValid: boolean;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly random: (size: number) => Buffer;
  private readonly origin: string;
  private readonly accessTokens = new Map<string, CachedAccessToken>();

  constructor(
    private readonly db: Firestore,
    configuration: GoogleWorkspaceConfiguration,
  ) {
    this.origin = new URL(configuration.origin).origin;
    this.clientId = configuration.clientId?.trim() || undefined;
    this.clientSecret = configuration.clientSecret?.trim() || undefined;
    this.tokenEncryptionKey = configuration.tokenEncryptionKey?.trim() || undefined;
    this.encryptionKeyValid = Boolean(configurationKey(this.tokenEncryptionKey));
    this.fetcher = configuration.fetch ?? fetch;
    this.now = configuration.now ?? Date.now;
    this.random = configuration.random ?? randomBytes;
  }

  get callbackUrl(): string {
    return `${this.origin}${GOOGLE_WORKSPACE_PATHS.callback}`;
  }

  get connectionUrl(): string {
    return `${this.origin}${GOOGLE_WORKSPACE_PATHS.settings}`;
  }

  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.tokenEncryptionKey && this.encryptionKeyValid);
  }

  private configurationReason(): string | undefined {
    if (!this.clientId || !this.clientSecret || !this.tokenEncryptionKey) return 'server_not_configured';
    if (!this.encryptionKeyValid) return 'invalid_encryption_key';
    return undefined;
  }

  private requireConfiguration(): {
    clientId: string;
    clientSecret: string;
    tokenEncryptionKey: string;
  } {
    if (!this.configured) {
      throw new GoogleWorkspaceOAuthError(
        this.configurationReason() ?? 'server_not_configured',
        'Google Workspace is not configured on this Threadmap deployment.',
        503,
      );
    }
    return {
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      tokenEncryptionKey: this.tokenEncryptionKey!,
    };
  }

  private connectionRef(userId: string) {
    return this.db.collection(CONNECTION_COLLECTION).doc(userId);
  }

  private deletionRef(userId: string) {
    return this.db.collection('accountDeletionJobs').doc(userId);
  }

  private stateRef(rawState: string) {
    return this.db.collection(STATE_COLLECTION).doc(hashOpaqueToken(rawState));
  }

  private async assertAccountActive(userId: string): Promise<void> {
    if ((await this.deletionRef(userId).get()).exists) {
      throw new GoogleWorkspaceOAuthError(
        'account_unavailable',
        'This Threadmap account is being deleted and cannot connect Google Workspace.',
        409,
      );
    }
  }

  async getStatus(userId: string): Promise<GoogleWorkspaceStatus> {
    if (!this.configured) {
      return {
        configured: false,
        connected: false,
        connectionUrl: this.connectionUrl,
        reason: this.configurationReason() ?? 'server_not_configured',
      };
    }
    const snapshot = await this.connectionRef(userId).get();
    const value = snapshot.data();
    if (!snapshot.exists || !ownRecord(value)) {
      return { configured: true, connected: false, connectionUrl: this.connectionUrl };
    }
    const status = value.status === 'active' ? 'active' : 'reauthorization_required';
    return {
      configured: true,
      connected: status === 'active',
      connectionUrl: this.connectionUrl,
      ...(typeof value.email === 'string' ? { email: value.email.slice(0, 320) } : {}),
      scopes: stringArray(value.scopes, 20),
      ...(numberValue(value.connectedAt) !== undefined ? { connectedAt: numberValue(value.connectedAt)! } : {}),
      ...(numberValue(value.updatedAt) !== undefined ? { updatedAt: numberValue(value.updatedAt)! } : {}),
      ...(status !== 'active' ? { needsReauthorization: true } : {}),
    };
  }

  accessFor(userId: string): GoogleWorkspaceAccess {
    return {
      getStatus: () => this.getStatus(userId),
      searchGmail: (input) => this.searchGmail(userId, input),
      getGmailThread: (input) => this.getGmailThread(userId, input),
      listCalendars: () => this.listCalendars(userId),
      listCalendarEvents: (input) => this.listCalendarEvents(userId, input),
      searchDrive: (input) => this.searchDrive(userId, input),
      getDriveFile: (input) => this.getDriveFile(userId, input),
    };
  }

  async beginAuthorization(userId: string): Promise<{ location: string }> {
    const configuration = this.requireConfiguration();
    await this.assertAccountActive(userId);
    const state = generateOpaqueToken('tmgs_', 32);
    const verifier = this.random(48).toString('base64url');
    const now = this.now();
    const record: StateRecord = {
      userId,
      codeVerifier: verifier,
      redirectUri: this.callbackUrl,
      createdAt: now,
      expiresAt: now + STATE_TTL_MS,
      expireAt: new Date(now + STATE_TTL_MS),
    };
    await this.db.runTransaction(async (transaction) => {
      const deletion = await transaction.get(this.deletionRef(userId));
      if (deletion.exists) {
        throw new GoogleWorkspaceOAuthError(
          'account_unavailable',
          'This Threadmap account is being deleted and cannot connect Google Workspace.',
          409,
        );
      }
      transaction.create(this.stateRef(state), record);
    });

    const location = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    location.searchParams.set('client_id', configuration.clientId);
    location.searchParams.set('redirect_uri', this.callbackUrl);
    location.searchParams.set('response_type', 'code');
    location.searchParams.set('scope', GOOGLE_WORKSPACE_PROVIDER_SCOPES.join(' '));
    location.searchParams.set('access_type', 'offline');
    location.searchParams.set('include_granted_scopes', 'true');
    location.searchParams.set('prompt', 'consent');
    location.searchParams.set('state', state);
    location.searchParams.set('code_challenge', createPkceChallenge(verifier));
    location.searchParams.set('code_challenge_method', 'S256');
    return { location: location.toString() };
  }

  async completeAuthorization(parameters: URLSearchParams): Promise<{ location: string }> {
    const configuration = this.requireConfiguration();
    const providerError = parameters.get('error');
    if (providerError) {
      throw new GoogleWorkspaceOAuthError(
        providerError === 'access_denied' ? 'access_denied' : 'provider_error',
        'Google did not authorize the requested connection.',
      );
    }
    const rawState = parameters.get('state');
    const code = parameters.get('code');
    if (!rawState || !/^tmgs_[A-Za-z0-9_-]{43}$/.test(rawState) || !code || code.length > 4_096) {
      throw new GoogleWorkspaceOAuthError('invalid_callback', 'The Google authorization response is invalid.');
    }

    const stateRef = this.stateRef(rawState);
    const now = this.now();
    const state = await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      const value = snapshot.data();
      if (!snapshot.exists || !ownRecord(value)) {
        throw new GoogleWorkspaceOAuthError('invalid_state', 'The Google authorization request is invalid or expired.');
      }
      if (typeof value.userId !== 'string' || typeof value.codeVerifier !== 'string'
          || value.redirectUri !== this.callbackUrl || Number(value.expiresAt || 0) <= now
          || value.consumedAt !== undefined) {
        throw new GoogleWorkspaceOAuthError('invalid_state', 'The Google authorization request is invalid or expired.');
      }
      const deletion = await transaction.get(this.deletionRef(value.userId));
      if (deletion.exists) {
        throw new GoogleWorkspaceOAuthError('account_unavailable', 'The Threadmap account is unavailable.', 409);
      }
      transaction.update(stateRef, { consumedAt: now });
      return value as unknown as StateRecord;
    });

    const tokenResponse = await this.fetchForm<GoogleTokenResponse>(GOOGLE_TOKEN_ENDPOINT, {
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      code_verifier: state.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: this.callbackUrl,
    });
    const accessToken = this.requireProviderToken(tokenResponse.access_token, 'access token');
    const refreshToken = this.requireProviderToken(tokenResponse.refresh_token, 'refresh token');
    const grantedScopes = typeof tokenResponse.scope === 'string'
      ? tokenResponse.scope.split(/\s+/).filter(Boolean)
      : [...GOOGLE_WORKSPACE_PROVIDER_SCOPES];
    const missingScopes = GOOGLE_WORKSPACE_PROVIDER_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length > 0) {
      throw new GoogleWorkspaceOAuthError(
        'insufficient_google_scope',
        'Google did not grant every read-only Workspace permission Threadmap requested.',
      );
    }

    const userInfo = await this.fetchJson(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const email = ownRecord(userInfo) ? stringValue(userInfo.email, 320) : undefined;
    const subject = ownRecord(userInfo) ? stringValue(userInfo.sub, 300) : undefined;
    const current = await this.connectionRef(state.userId).get();
    const createdAt = numberValue(current.data()?.createdAt) ?? now;
    const connection: ConnectionRecord = {
      userId: state.userId,
      status: 'active',
      ...(email ? { email } : {}),
      ...(subject ? { googleSubject: subject } : {}),
      scopes: grantedScopes.slice(0, 20),
      encryptedRefreshToken: encryptGoogleRefreshToken(
        refreshToken,
        configuration.tokenEncryptionKey,
        this.random(12),
      ),
      createdAt,
      connectedAt: now,
      updatedAt: now,
    };
    await this.db.runTransaction(async (transaction) => {
      const deletion = await transaction.get(this.deletionRef(state.userId));
      if (deletion.exists) {
        throw new GoogleWorkspaceOAuthError('account_unavailable', 'The Threadmap account is unavailable.', 409);
      }
      transaction.set(this.connectionRef(state.userId), connection);
      transaction.delete(stateRef);
    });
    const expiresIn = Number(tokenResponse.expires_in || 0);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      this.cacheAccessToken(state.userId, accessToken, now + (expiresIn * 1_000));
    }
    return { location: `${this.connectionUrl}?status=connected` };
  }

  callbackFailureLocation(error: unknown): string {
    return `${this.connectionUrl}?status=error&reason=${encodeURIComponent(safeReason(error))}`;
  }

  async disconnect(userId: string): Promise<{ disconnected: true; providerRevoked: boolean }> {
    this.requireConfiguration();
    const snapshot = await this.connectionRef(userId).get();
    const value = snapshot.data();
    let providerRevoked = false;
    if (snapshot.exists && ownRecord(value)) {
      try {
        const refreshToken = decryptGoogleRefreshToken(
          value.encryptedRefreshToken,
          this.tokenEncryptionKey!,
        );
        const response = await this.fetcher(GOOGLE_REVOCATION_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }).toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        providerRevoked = response.ok;
      } catch {
        providerRevoked = false;
      }
    }
    await this.db.runTransaction(async (transaction) => {
      transaction.delete(this.connectionRef(userId));
    });
    this.accessTokens.delete(userId);
    return { disconnected: true, providerRevoked };
  }

  private requireProviderToken(value: unknown, label: string): string {
    if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
      throw new GoogleWorkspaceOAuthError('provider_token_error', `Google did not return a valid ${label}.`, 502);
    }
    return value;
  }

  private async fetchForm<T>(url: string, fields: Record<string, string>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new GoogleWorkspaceOAuthError('provider_unavailable', 'Google could not be reached.', 502);
    }
    const body = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      throw new GoogleWorkspaceOAuthError('provider_rejected', 'Google rejected the authorization request.', 502);
    }
    return body as T;
  }

  private async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new GoogleWorkspaceOAuthError('provider_unavailable', 'Google could not be reached.', 502);
    }
    const body = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      throw new GoogleWorkspaceOAuthError('provider_rejected', 'Google rejected the request.', 502);
    }
    return body;
  }

  private cacheAccessToken(userId: string, token: string, expiresAt: number): void {
    this.accessTokens.delete(userId);
    this.accessTokens.set(userId, { token, expiresAt });
    while (this.accessTokens.size > MAX_ACCESS_TOKEN_CACHE_ENTRIES) {
      const oldest = this.accessTokens.keys().next().value;
      if (!oldest) break;
      this.accessTokens.delete(oldest);
    }
  }

  private async accessToken(userId: string): Promise<string> {
    const configuration = this.requireConfiguration();
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt - ACCESS_TOKEN_SAFETY_MS > this.now()) return cached.token;
    const snapshot = await this.connectionRef(userId).get();
    const value = snapshot.data();
    if (!snapshot.exists || !ownRecord(value) || value.status !== 'active') {
      throw new DalError('temporarily_unavailable', 'Google Workspace is not connected for this Threadmap account.', {
        details: { connectionUrl: this.connectionUrl },
      });
    }
    let refreshToken: string;
    try {
      refreshToken = decryptGoogleRefreshToken(value.encryptedRefreshToken, configuration.tokenEncryptionKey);
    } catch {
      throw new DalError('temporarily_unavailable', 'The Google Workspace connection must be reauthorized.', {
        details: { connectionUrl: this.connectionUrl },
      });
    }

    let response: Response;
    try {
      response = await this.fetcher(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new DalError('temporarily_unavailable', 'Google Workspace did not respond in time.', { retryable: true });
    }
    const tokenResponse = await response.json().catch(() => ({})) as GoogleTokenResponse;
    if (!response.ok) {
      if (tokenResponse.error === 'invalid_grant') {
        await this.connectionRef(userId).set({
          status: 'reauthorization_required',
          updatedAt: this.now(),
        }, { merge: true });
        this.accessTokens.delete(userId);
        throw new DalError('temporarily_unavailable', 'The Google Workspace connection expired and must be reauthorized.', {
          details: { connectionUrl: this.connectionUrl },
        });
      }
      throw new DalError('temporarily_unavailable', 'Google Workspace temporarily refused the connection.', {
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    let token: string;
    try {
      token = this.requireProviderToken(tokenResponse.access_token, 'access token');
    } catch {
      throw new DalError('temporarily_unavailable', 'Google Workspace returned an invalid access credential.');
    }
    const expiresIn = Math.max(60, Math.min(86_400, Number(tokenResponse.expires_in || 3_600)));
    this.cacheAccessToken(userId, token, this.now() + (expiresIn * 1_000));
    return token;
  }

  private async googleJson(userId: string, path: string, query: Record<string, string | undefined> = {}): Promise<unknown> {
    const token = await this.accessToken(userId);
    const url = new URL(path, GOOGLE_API_ORIGIN);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new DalError('temporarily_unavailable', 'Google Workspace did not respond in time.', { retryable: true });
    }
    const body = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      throw new DalError('temporarily_unavailable', 'Google Workspace could not complete the read.', {
        retryable: response.status >= 500 || response.status === 429,
        details: { providerStatus: response.status },
      });
    }
    return body;
  }

  private async searchGmail(userId: string, input: GmailSearchInput): Promise<JsonObject> {
    const listing = await this.googleJson(userId, '/gmail/v1/users/me/threads', {
      q: input.query,
      maxResults: String(input.maxResults ?? 10),
      pageToken: input.pageToken,
    });
    const rawThreads = ownRecord(listing) && Array.isArray(listing.threads)
      ? listing.threads.slice(0, input.maxResults ?? 10)
      : [];
    const threads = await Promise.all(rawThreads.map(async (entry) => {
      if (!ownRecord(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) return undefined;
      const thread = await this.googleJson(
        userId,
        `/gmail/v1/users/me/threads/${encodeURIComponent(entry.id)}`,
        {
          format: 'metadata',
        },
      );
      if (!ownRecord(thread)) return undefined;
      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      const first = messages.find(ownRecord);
      const last = [...messages].reverse().find(ownRecord);
      const firstHeaders = first ? gmailHeaders(first) : {};
      const lastHeaders = last ? gmailHeaders(last) : {};
      return {
        threadId: entry.id,
        ...(firstHeaders.subject ? { subject: firstHeaders.subject } : {}),
        ...(firstHeaders.from ? { from: firstHeaders.from } : {}),
        ...(lastHeaders.to ? { to: lastHeaders.to } : {}),
        ...(lastHeaders.date ? { latestDate: lastHeaders.date } : {}),
        snippet: boundedPlainText(thread.snippet ?? entry.snippet, 1_000),
        messageCount: messages.length,
        webUrl: `https://mail.google.com/mail/u/0/#all/${entry.id}`,
      };
    }));
    return {
      ...sourceEnvelope('google:gmail', this.now()),
      query: input.query,
      threads: threads.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
      ...(ownRecord(listing) && typeof listing.nextPageToken === 'string'
        ? { nextPageToken: listing.nextPageToken.slice(0, 2_048) }
        : {}),
      ...(ownRecord(listing) && Number.isFinite(Number(listing.resultSizeEstimate))
        ? { resultSizeEstimate: Number(listing.resultSizeEstimate) }
        : {}),
    };
  }

  private async getGmailThread(userId: string, input: GmailThreadInput): Promise<JsonObject> {
    const raw = await this.googleJson(
      userId,
      `/gmail/v1/users/me/threads/${encodeURIComponent(input.threadId)}`,
      { format: 'full' },
    );
    if (!ownRecord(raw)) throw new DalError('not_found', 'The Gmail thread was not found.');
    const allMessages = Array.isArray(raw.messages) ? raw.messages : [];
    const maximum = input.maxMessages ?? 10;
    const selected = allMessages.slice(Math.max(0, allMessages.length - maximum));
    const messages = selected.flatMap((message) => {
      const projected = gmailMessageProjection(message);
      return projected ? [projected] : [];
    });
    return {
      ...sourceEnvelope('google:gmail', this.now()),
      threadId: input.threadId,
      messages,
      messageCount: allMessages.length,
      partial: allMessages.length > selected.length,
      webUrl: `https://mail.google.com/mail/u/0/#all/${input.threadId}`,
    };
  }

  private async listCalendars(userId: string): Promise<JsonObject> {
    const raw = await this.googleJson(userId, '/calendar/v3/users/me/calendarList', {
      maxResults: '100',
      minAccessRole: 'reader',
      showDeleted: 'false',
      showHidden: 'false',
    });
    const calendars = ownRecord(raw) && Array.isArray(raw.items)
      ? raw.items.slice(0, 100).flatMap((entry) => {
        if (!ownRecord(entry) || typeof entry.id !== 'string') return [];
        return [{
          id: entry.id.slice(0, 300),
          name: sanitizeHeaderValue(entry.summary, 500) ?? entry.id.slice(0, 300),
          ...(stringValue(entry.description, 1_000)
            ? { description: boundedPlainText(entry.description, 1_000) }
            : {}),
          ...(typeof entry.primary === 'boolean' ? { primary: entry.primary } : {}),
          ...(typeof entry.selected === 'boolean' ? { selected: entry.selected } : {}),
          ...(typeof entry.timeZone === 'string' ? { timeZone: entry.timeZone.slice(0, 100) } : {}),
          ...(typeof entry.accessRole === 'string' ? { accessRole: entry.accessRole.slice(0, 50) } : {}),
        }];
      })
      : [];
    return { ...sourceEnvelope('google:calendar', this.now()), calendars };
  }

  private async listCalendarEvents(userId: string, input: CalendarEventInput): Promise<JsonObject> {
    const calendarId = input.calendarId ?? 'primary';
    const raw = await this.googleJson(
      userId,
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        timeMin: input.startTime,
        timeMax: input.endTime,
        maxResults: String(input.maxResults ?? 25),
        pageToken: input.pageToken,
        q: input.query,
        singleEvents: 'true',
        orderBy: 'startTime',
        showDeleted: 'false',
      },
    );
    const events = ownRecord(raw) && Array.isArray(raw.items)
      ? raw.items.slice(0, input.maxResults ?? 25).flatMap((entry) => {
        if (!ownRecord(entry) || typeof entry.id !== 'string') return [];
        const start = ownRecord(entry.start) ? entry.start : {};
        const end = ownRecord(entry.end) ? entry.end : {};
        const attendees = Array.isArray(entry.attendees) ? entry.attendees.slice(0, 25) : [];
        return [{
          id: entry.id.slice(0, 300),
          title: sanitizeHeaderValue(entry.summary, 500) ?? '(untitled event)',
          status: stringValue(entry.status, 50) ?? 'confirmed',
          start: stringValue(start.dateTime, 100) ?? stringValue(start.date, 20) ?? '',
          end: stringValue(end.dateTime, 100) ?? stringValue(end.date, 20) ?? '',
          ...(stringValue(start.timeZone, 100) ? { startTimeZone: stringValue(start.timeZone, 100)! } : {}),
          ...(stringValue(end.timeZone, 100) ? { endTimeZone: stringValue(end.timeZone, 100)! } : {}),
          ...(stringValue(entry.description, 2_000)
            ? { description: boundedPlainText(entry.description, 2_000) }
            : {}),
          ...(stringValue(entry.location, 500) ? { location: sanitizeHeaderValue(entry.location, 500)! } : {}),
          ...(stringValue(entry.htmlLink, 2_048) ? { webUrl: stringValue(entry.htmlLink, 2_048)! } : {}),
          ...(ownRecord(entry.organizer) && typeof entry.organizer.email === 'string'
            ? { organizer: entry.organizer.email.slice(0, 320) }
            : {}),
          attendees: attendees.flatMap((attendee) => {
            if (!ownRecord(attendee) || typeof attendee.email !== 'string') return [];
            return [{
              email: attendee.email.slice(0, 320),
              ...(typeof attendee.displayName === 'string'
                ? { name: attendee.displayName.slice(0, 300) }
                : {}),
              ...(typeof attendee.responseStatus === 'string'
                ? { responseStatus: attendee.responseStatus.slice(0, 50) }
                : {}),
              ...(attendee.self === true ? { self: true } : {}),
            }];
          }),
        }];
      })
      : [];
    return {
      ...sourceEnvelope('google:calendar', this.now()),
      calendarId,
      startTime: input.startTime,
      endTime: input.endTime,
      events,
      ...(ownRecord(raw) && typeof raw.nextPageToken === 'string'
        ? { nextPageToken: raw.nextPageToken.slice(0, 2_048) }
        : {}),
    };
  }

  private async searchDrive(userId: string, input: DriveSearchInput): Promise<JsonObject> {
    const escaped = driveQueryLiteral(input.query);
    const raw = await this.googleJson(userId, '/drive/v3/files', {
      q: `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`,
      pageSize: String(input.maxResults ?? 20),
      pageToken: input.pageToken,
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,size,description,owners(displayName,emailAddress))',
    });
    const files = ownRecord(raw) && Array.isArray(raw.files)
      ? raw.files.slice(0, input.maxResults ?? 20).flatMap((entry) => {
        if (!ownRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') return [];
        const owners = Array.isArray(entry.owners) ? entry.owners.slice(0, 10) : [];
        return [{
          id: entry.id.slice(0, 300),
          name: sanitizeHeaderValue(entry.name, 500) ?? '(untitled file)',
          mimeType: stringValue(entry.mimeType, 200) ?? 'application/octet-stream',
          ...(stringValue(entry.modifiedTime, 100) ? { modifiedTime: stringValue(entry.modifiedTime, 100)! } : {}),
          ...(stringValue(entry.createdTime, 100) ? { createdTime: stringValue(entry.createdTime, 100)! } : {}),
          ...(stringValue(entry.webViewLink, 2_048) ? { webUrl: stringValue(entry.webViewLink, 2_048)! } : {}),
          ...(stringValue(entry.description, 1_000)
            ? { description: boundedPlainText(entry.description, 1_000) }
            : {}),
          ...(stringValue(entry.size, 30) ? { sizeBytes: stringValue(entry.size, 30)! } : {}),
          owners: owners.flatMap((owner) => ownRecord(owner) ? [{
            ...(typeof owner.displayName === 'string' ? { name: owner.displayName.slice(0, 300) } : {}),
            ...(typeof owner.emailAddress === 'string' ? { email: owner.emailAddress.slice(0, 320) } : {}),
          }] : []),
        }];
      })
      : [];
    return {
      ...sourceEnvelope('google:drive', this.now()),
      query: input.query,
      files,
      ...(ownRecord(raw) && typeof raw.nextPageToken === 'string'
        ? { nextPageToken: raw.nextPageToken.slice(0, 2_048) }
        : {}),
    };
  }

  private async getDriveFile(userId: string, input: DriveFileInput): Promise<JsonObject> {
    const metadataRaw = await this.googleJson(
      userId,
      `/drive/v3/files/${encodeURIComponent(input.fileId)}`,
      { fields: 'id,name,mimeType,modifiedTime,createdTime,webViewLink,size,description,owners(displayName,emailAddress)' },
    );
    if (!ownRecord(metadataRaw) || typeof metadataRaw.id !== 'string') {
      throw new DalError('not_found', 'The Google Drive file was not found.');
    }
    const mimeType = stringValue(metadataRaw.mimeType, 200) ?? 'application/octet-stream';
    let path = `/drive/v3/files/${encodeURIComponent(input.fileId)}`;
    const query: Record<string, string> = {};
    let readable = true;
    if (mimeType === 'application/vnd.google-apps.document'
        || mimeType === 'application/vnd.google-apps.presentation') {
      path += '/export';
      query.mimeType = 'text/plain';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      path += '/export';
      query.mimeType = 'text/csv';
    } else if (mimeType.startsWith('text/')
        || ['application/json', 'application/xml', 'application/javascript'].includes(mimeType)) {
      query.alt = 'media';
    } else {
      readable = false;
    }

    const metadata: JsonObject = {
      id: metadataRaw.id.slice(0, 300),
      name: sanitizeHeaderValue(metadataRaw.name, 500) ?? '(untitled file)',
      mimeType,
      ...(stringValue(metadataRaw.modifiedTime, 100) ? { modifiedTime: stringValue(metadataRaw.modifiedTime, 100)! } : {}),
      ...(stringValue(metadataRaw.createdTime, 100) ? { createdTime: stringValue(metadataRaw.createdTime, 100)! } : {}),
      ...(stringValue(metadataRaw.webViewLink, 2_048) ? { webUrl: stringValue(metadataRaw.webViewLink, 2_048)! } : {}),
      ...(stringValue(metadataRaw.description, 1_000)
        ? { description: boundedPlainText(metadataRaw.description, 1_000) }
        : {}),
    };
    if (!readable) {
      return {
        ...sourceEnvelope('google:drive', this.now()),
        file: metadata,
        contentAvailable: false,
        reason: 'unsupported_binary_type',
      };
    }

    const token = await this.accessToken(userId);
    const url = new URL(path, GOOGLE_API_ORIGIN);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: `bytes=0-${MAX_DRIVE_DOWNLOAD_BYTES - 1}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new DalError('temporarily_unavailable', 'Google Drive did not respond in time.', { retryable: true });
    }
    if (!response.ok) {
      throw new DalError('temporarily_unavailable', 'Google Drive could not read the requested file.', {
        retryable: response.status >= 500 || response.status === 429,
        details: { providerStatus: response.status },
      });
    }
    const bounded = await readBoundedResponse(response, MAX_DRIVE_DOWNLOAD_BYTES);
    const bytes = bounded.bytes;
    const maximum = input.maxCharacters ?? 12_000;
    const content = boundedPlainText(bytes.toString('utf8'), maximum);
    const providerFilename = parseContentDispositionName(response.headers.get('content-disposition'));
    return {
      ...sourceEnvelope('google:drive', this.now()),
      file: { ...metadata, ...(providerFilename ? { exportedName: providerFilename } : {}) },
      contentAvailable: true,
      content,
      truncated: bounded.truncated || content.length >= maximum,
    };
  }
}
