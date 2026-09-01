import { createHash, randomBytes } from 'node:crypto';
import { mergeAccountOwnedDocumentIfActive } from '../account-write-barrier';
import { securityAuditExpireAtMillis } from '../retention-policy';
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import type { OAuthPrincipal } from './oauth';

export const MCP_COLLECTIONS = Object.freeze({
  items: 'items',
  toolData: 'toolData',
  flightLogs: 'flightLogs',
  userSettings: 'userSettings',
  deletionJobs: 'accountDeletionJobs',
  idempotency: 'mcpIdempotency',
  quotas: 'mcpRateLimits',
  audits: 'mcpAuditLogs',
  deleteConfirmations: 'mcpDeleteConfirmations',
});

export const MCP_LIMITS = Object.freeze({
  pageSize: 50,
  searchScan: 250,
  aggregateScan: 1_000,
  title: 500,
  content: 200_000,
  outputContent: 12_000,
  summaryContent: 600,
  tags: 100,
  tag: 64,
  files: 50,
  linkedItems: 500,
  checklist: 100,
  checklistText: 500,
  outputBytes: 60_000,
  confirmationTtlMs: 5 * 60_000,
  idempotencyTtlMs: 7 * 24 * 60 * 60_000,
});

export const MCP_QUOTA_LIMITS = Object.freeze({
  read: 120,
  write: 30,
  delete: 5,
});

export type ItemType = 'task' | 'project' | 'habit' | 'event' | 'goal' | 'note';
export type ItemStatus = 'active' | 'waiting' | 'done' | 'archived';
export type QuotaKind = 'read' | 'write' | 'delete';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ThreadmapItem {
  id: string;
  userId: string;
  type: ItemType;
  title: string;
  content?: string;
  status: ItemStatus;
  createdAt: number;
  updatedAt: number;
  revision: number;
  completedAt?: number;
  dueDate?: string;
  priority?: string;
  assignee?: string;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  emoji?: string;
  color?: string;
  tier?: string;
  frequency?: string;
  customDays?: number[];
  habitTime?: string;
  completions?: Record<string, boolean>;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  googleCalendarId?: string;
  googleCalendarOrigin?: boolean;
  calendarSynced?: boolean;
  timeframe?: string;
  metric?: string;
  noteSubtype?: string;
  parentId?: string;
  linkedIds?: string[];
  tags?: string[];
  myDay?: string;
  files?: unknown[];
  [key: string]: unknown;
}

export interface ItemOutput {
  id: string;
  type: ItemType;
  title: string;
  content?: string;
  status: ItemStatus;
  createdAt: number;
  updatedAt: number;
  revision: number;
  completedAt?: number;
  dueDate?: string;
  priority?: string;
  assignee?: string;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  emoji?: string;
  color?: string;
  tier?: string;
  frequency?: string;
  customDays?: number[];
  habitTime?: string;
  completions?: Record<string, boolean>;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timeframe?: string;
  metric?: string;
  noteSubtype?: string;
  parentId?: string;
  linkedIds?: string[];
  tags?: string[];
  myDay?: string;
}

export interface ItemSummary {
  id: string;
  type: ItemType;
  title: string;
  content?: string;
  status: ItemStatus;
  updatedAt: number;
  revision: number;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  priority?: string;
  parentId?: string;
  tags?: string[];
  myDay?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
  partial?: boolean;
}

export function scanContinuation(input: {
  scanned: number;
  scanLimit: number;
  matched: number;
  pageLimit: number;
}): { hasMore: boolean; partial: boolean; boundary: 'selected' | 'last-scanned' } {
  const scanCapped = input.scanned === input.scanLimit;
  return {
    hasMore: input.matched > input.pageLimit || scanCapped,
    partial: scanCapped && input.matched < input.pageLimit,
    boundary: input.matched >= input.pageLimit ? 'selected' : 'last-scanned',
  };
}

export interface LifeOverviewResult {
  asOfDate: string;
  counts: Record<string, number>;
  today: ItemSummary[];
  overdue: ItemSummary[];
  activeProjects: ItemSummary[];
  activeGoals: ItemSummary[];
  activeHabits: ItemSummary[];
  partial: boolean;
}

export interface AgendaResult {
  startDate: string;
  endDate: string;
  timezone: string;
  tasks: ItemSummary[];
  events: ItemSummary[];
  habits: Array<ItemSummary & { scheduledDates: string[] }>;
  partial: boolean;
}

export interface CreateItemInput {
  type: ItemType;
  title: string;
  content?: string;
  status?: ItemStatus;
  dueDate?: string;
  priority?: string;
  assignee?: string;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  emoji?: string;
  color?: string;
  tier?: string;
  frequency?: string;
  customDays?: number[];
  habitTime?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timeframe?: string;
  metric?: string;
  noteSubtype?: string;
  parentId?: string;
  tags?: string[];
  myDay?: string;
}

export type UpdateItemPatch = Partial<Omit<CreateItemInput, 'type'>>;

export interface MutationResult {
  item: ItemOutput;
  replayed: boolean;
}

export interface LinkMutationResult {
  items: [ItemOutput, ItemOutput];
  replayed: boolean;
  changed: boolean;
}

export interface DeletePreviewResult {
  item: ItemSummary;
  impact: {
    childCount: number;
    linkedReferenceCount: number;
    attachmentCount: number;
  };
  expectedRevision: number;
  confirmationToken: string;
  expiresAt: number;
}

export interface DeleteResult {
  itemId: string;
  deleted: true;
  cleanupPending: boolean;
  replayed: boolean;
}

export interface DeleteItemRequest {
  userId: string;
  itemId: string;
  expectedRevision: number;
  clientRequestId: string;
}

export interface DeleteItemCallbackResult {
  deleted?: boolean;
  cleanupPending?: boolean;
}

export type DeleteItemCallback = (
  request: DeleteItemRequest
) => Promise<DeleteItemCallbackResult>;

export interface ThreadmapDalDependencies {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  deleteItem?: DeleteItemCallback;
  quotaLimits?: Partial<Record<QuotaKind, number>>;
}

export interface ListItemsInput {
  limit?: number;
  cursor?: string;
  types?: ItemType[];
  statuses?: ItemStatus[];
  tags?: string[];
  parentId?: string;
  updatedAfter?: number;
  updatedBefore?: number;
}

export interface SearchItemsInput extends ListItemsInput {
  query: string;
}

export interface AuditEvent {
  tool: string;
  kind: QuotaKind;
  success: boolean;
  resultCode: string;
  durationMs: number;
  requestId?: string;
  targetIds?: string[];
  changedFields?: string[];
}

export interface ThreadmapDataAccess {
  readonly principal: OAuthPrincipal;
  consumeQuota(kind: QuotaKind, weight?: number): Promise<void>;
  recordAudit(event: AuditEvent): Promise<void>;
  getLifeOverview(input: { date?: string; timezone?: string }): Promise<LifeOverviewResult>;
  getAgenda(input: { startDate: string; endDate: string; timezone?: string }): Promise<AgendaResult>;
  listItems(input: ListItemsInput): Promise<PageResult<ItemSummary>>;
  searchItems(input: SearchItemsInput): Promise<PageResult<ItemSummary>>;
  getItem(itemId: string): Promise<ItemOutput>;
  createItem(input: CreateItemInput, clientRequestId: string): Promise<MutationResult>;
  updateItem(itemId: string, expectedRevision: number, patch: UpdateItemPatch,
    clientRequestId: string): Promise<MutationResult>;
  completeItem(itemId: string, expectedRevision: number,
    clientRequestId: string): Promise<MutationResult>;
  archiveItem(itemId: string, expectedRevision: number,
    clientRequestId: string): Promise<MutationResult>;
  setHabitCompletion(itemId: string, expectedRevision: number, date: string,
    completed: boolean, clientRequestId: string): Promise<MutationResult>;
  linkItems(itemIdA: string, expectedRevisionA: number, itemIdB: string,
    expectedRevisionB: number, clientRequestId: string): Promise<LinkMutationResult>;
  unlinkItems(itemIdA: string, expectedRevisionA: number, itemIdB: string,
    expectedRevisionB: number, clientRequestId: string): Promise<LinkMutationResult>;
  listTags(): Promise<{ tags: string[]; partial: boolean }>;
  getSecondaryData(kind: SecondaryDataKind): Promise<JsonObject>;
  listFilesMetadata(itemId?: string, limit?: number): Promise<{
    files: FileMetadataOutput[];
    partial: boolean;
  }>;
  previewDeleteItem(itemId: string, expectedRevision: number): Promise<DeletePreviewResult>;
  confirmDeleteItem(itemId: string, expectedRevision: number, confirmationToken: string,
    clientRequestId: string): Promise<DeleteResult>;
}

export type SecondaryDataKind =
  | 'wishlist'
  | 'abitur'
  | 'flight'
  | 'briefing'
  | 'dispatch'
  | 'settings'
  | 'toolbox';

export interface FileMetadataOutput {
  itemId: string;
  itemTitle: string;
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt?: number;
}

export type DalErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'account_unavailable'
  | 'confirmation_invalid'
  | 'confirmation_expired'
  | 'confirmation_replayed'
  | 'delete_not_configured'
  | 'temporarily_unavailable';

export class DalError extends Error {
  readonly code: DalErrorCode;
  readonly retryable: boolean;
  readonly details?: JsonObject;

  constructor(code: DalErrorCode, message: string, options: {
    retryable?: boolean;
    details?: JsonObject;
  } = {}) {
    super(message);
    this.name = 'DalError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.details = options.details;
  }
}

const ITEM_TYPES = new Set<ItemType>(['task', 'project', 'habit', 'event', 'goal', 'note']);
const ITEM_STATUSES = new Set<ItemStatus>(['active', 'waiting', 'done', 'archived']);
const ITEM_ID = /^[A-Za-z0-9_-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_SAFE_JSON_DEPTH = 5;
const SENSITIVE_SECONDARY_KEYS = new Set([
  'url', 'downloadurl', 'storagepath', 'legacystoragepath', 'email', 'bio',
  'token', 'accesstoken', 'refreshtoken', 'authorization', 'secret', 'password',
]);

function ownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new DalError('invalid_input', `${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
}

function boundedString(value: unknown, minimum: number, maximum: number, label: string,
  trim = false): string {
  if (typeof value !== 'string') {
    throw new DalError('invalid_input', `${label} must be a string.`);
  }
  const result = trim ? value.trim() : value;
  if (result.length < minimum || result.length > maximum
      || /[\u0000\u000B\u000C]/.test(result)) {
    throw new DalError('invalid_input', `${label} must contain between ${minimum} and ${maximum} characters.`);
  }
  return result;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new DalError('invalid_input', `${label} contains unsupported fields: ${unknown.slice(0, 5).join(', ')}.`);
  }
}

export function validateItemId(value: unknown, label = 'item_id'): string {
  if (typeof value !== 'string' || !ITEM_ID.test(value)) {
    throw new DalError('invalid_input', `${label} is invalid.`);
  }
  return value;
}

export function validateClientRequestId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new DalError('invalid_input', 'client_request_id must be an RFC 4122 version 4 UUID.');
  }
  return value.toLowerCase();
}

export function validateRevision(value: unknown, label = 'expected_revision'): number {
  return finiteInteger(value, 1, Number.MAX_SAFE_INTEGER, label);
}

export function assertExpectedRevision(actual: unknown, expected: unknown): number {
  const current = finiteInteger(actual, 1, Number.MAX_SAFE_INTEGER, 'stored revision');
  const requested = validateRevision(expected);
  if (current !== requested) {
    throw new DalError('revision_conflict', 'The item changed after it was read.', {
      details: { currentRevision: current, expectedRevision: requested },
    });
  }
  return current;
}

export function validateDate(value: unknown, label: string): string {
  const date = boundedString(value, 10, 10, label);
  if (!DATE.test(date)) throw new DalError('invalid_input', `${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DalError('invalid_input', `${label} is not a calendar date.`);
  }
  return date;
}

export function validateTimezone(value: unknown): string {
  if (value === undefined) return 'UTC';
  const timezone = boundedString(value, 1, 100, 'timezone', true);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
  } catch {
    throw new DalError('invalid_input', 'timezone must be an IANA time zone identifier.');
  }
  return timezone;
}

export function dateInTimezone(epochMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeHtmlEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(value) && value > 0 && value <= 0x10ffff
      ? String.fromCodePoint(value) : '';
  }
  if (entity.startsWith('#')) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(value) && value > 0 && value <= 0x10ffff
      ? String.fromCodePoint(value) : '';
  }
  return named[entity.toLowerCase()] ?? '';
}

/**
 * Item content is plain text in current Threadmap builds; only legacy records hold
 * HTML. Markup stripping is therefore gated twice, because a single `<` in prose or
 * code must never swallow the text up to the next `>`:
 *   1. Tag matching is restricted to real HTML element names, so `<result>`,
 *      `Array<string>`, `5<10`, and `<name@example.com>` survive intact.
 *   2. The HTML passes run at all only when a recognized tag is present, which also
 *      keeps literal entities such as `&amp;` unchanged in plain-text notes.
 */
const HTML_TAG_NAMES = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'button', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd',
  'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins',
  'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span',
  'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul',
  'var', 'video', 'wbr',
].join('|');
const HTML_TAG_SOURCE = `</?(?:${HTML_TAG_NAMES})(?:\\s[^>]{0,2000})?\\s*/?>`;
/** Non-global so `.test()` cannot carry `lastIndex` between calls. */
const HTML_MARKUP_DETECTOR = new RegExp(HTML_TAG_SOURCE, 'i');
const HTML_TAG = new RegExp(HTML_TAG_SOURCE, 'gi');
const HTML_LINE_BREAK_TAG = /<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\s*\/?>/gi;

function stripHtmlMarkup(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(HTML_LINE_BREAK_TAG, '\n')
    .replace(HTML_TAG, ' ')
    .replace(/&([A-Za-z]+|#\d+|#x[0-9A-Fa-f]+);/g, (_match, entity: string) => decodeHtmlEntity(entity));
}

export function htmlToPlainText(value: unknown, maximum: number = MCP_LIMITS.outputContent): string {
  if (typeof value !== 'string' || !value) return '';
  const plain = (HTML_MARKUP_DETECTOR.test(value) ? stripHtmlMarkup(value) : value)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain.length <= maximum ? plain : `${plain.slice(0, Math.max(0, maximum - 1))}…`;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DalError('invalid_input', 'The request contains a non-finite number.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (ownRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  throw new DalError('invalid_input', 'The request contains a value that cannot be serialized.');
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createRequestFingerprint(tool: string, payload: unknown): string {
  return createHash('sha256').update(`${tool}\n${stableJsonStringify(payload)}`, 'utf8').digest('base64url');
}

function hashIdentifier(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000'), 'utf8').digest('base64url');
}

interface CursorPayload {
  updatedAt: number;
  id: string;
}

export function encodePageCursor(value: CursorPayload): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodePageCursor(value: unknown): CursorPayload | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 4 || value.length > 512
      || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new DalError('invalid_input', 'cursor is invalid.');
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!ownRecord(parsed) || Object.keys(parsed).length !== 2) throw new Error('shape');
    const updatedAt = finiteInteger(parsed.updatedAt, 0, Number.MAX_SAFE_INTEGER, 'cursor.updatedAt');
    const id = validateItemId(parsed.id, 'cursor.id');
    return { updatedAt, id };
  } catch (error) {
    if (error instanceof DalError) throw error;
    throw new DalError('invalid_input', 'cursor is invalid.');
  }
}

function safeJsonInternal(value: unknown, depth: number, stringLimit: number,
  arrayLimit: number, keyLimit: number, parentKey = ''): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const normalized = parentKey === 'content' || parentKey === 'notes'
      ? htmlToPlainText(value, stringLimit) : value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    return normalized.length <= stringLimit ? normalized : `${normalized.slice(0, stringLimit - 1)}…`;
  }
  if (depth >= MAX_SAFE_JSON_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const array: JsonValue[] = [];
    for (const member of value.slice(0, arrayLimit)) {
      const safe = safeJsonInternal(member, depth + 1, stringLimit, arrayLimit, keyLimit, parentKey);
      if (safe !== undefined) array.push(safe);
    }
    return array;
  }
  if (ownRecord(value)) {
    const object: JsonObject = {};
    for (const [key, member] of Object.entries(value).slice(0, keyLimit)) {
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
      if (SENSITIVE_SECONDARY_KEYS.has(normalizedKey)) continue;
      const safe = safeJsonInternal(member, depth + 1, stringLimit, arrayLimit, keyLimit, key);
      if (safe !== undefined) object[key.slice(0, 100)] = safe;
    }
    return object;
  }
  if (typeof (value as { toMillis?: unknown })?.toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : undefined;
  }
  return undefined;
}

export function sanitizeJsonValue(value: unknown, options: {
  stringLimit?: number;
  arrayLimit?: number;
  keyLimit?: number;
} = {}): JsonValue {
  return safeJsonInternal(
    value,
    0,
    Math.max(32, Math.min(options.stringLimit ?? 2_000, 8_000)),
    Math.max(1, Math.min(options.arrayLimit ?? 100, 500)),
    Math.max(1, Math.min(options.keyLimit ?? 100, 500))
  ) ?? null;
}

function toMillis(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (ownRecord(value) && typeof value.toMillis === 'function') {
    try {
      const millis = (value.toMillis as () => number)();
      return Number.isFinite(millis) ? Math.max(0, Math.trunc(millis)) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function stringField(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.length <= maximum ? value : undefined;
}

function stringArray(value: unknown, maximumCount: number, maximumLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .slice(0, maximumCount)
    .filter((member): member is string => typeof member === 'string' && member.length <= maximumLength);
  return [...new Set(values)];
}

export function coerceOwnedItem(id: string, data: unknown, ownerUid: string): ThreadmapItem {
  if (!ownRecord(data) || data.userId !== ownerUid || !ITEM_TYPES.has(data.type as ItemType)
      || typeof data.title !== 'string' || !ITEM_STATUSES.has(data.status as ItemStatus)) {
    throw new DalError('not_found', 'The requested item was not found.');
  }
  const revision = typeof data.revision === 'number' && Number.isInteger(data.revision)
    && data.revision >= 1 ? data.revision : 1;
  return {
    ...data,
    id,
    userId: ownerUid,
    type: data.type as ItemType,
    title: data.title.slice(0, MCP_LIMITS.title),
    status: data.status as ItemStatus,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    revision,
  };
}

/**
 * Google Workspace data is outside the launch MCP contract. Treat both the
 * durable provenance bit and either legacy live-sync marker as derived data,
 * so older records and disconnected imports fail closed.
 */
export function isGoogleCalendarDerivedItem(data: unknown): boolean {
  if (!ownRecord(data)) return false;
  return data.googleCalendarOrigin === true
    || data.calendarSynced === true
    || (typeof data.googleCalendarId === 'string' && data.googleCalendarId.trim().length > 0);
}

function coerceMcpVisibleOwnedItem(id: string, data: unknown, ownerUid: string): ThreadmapItem {
  const item = coerceOwnedItem(id, data, ownerUid);
  if (isGoogleCalendarDerivedItem(item)) {
    // Use the same response as a missing/cross-account item. MCP callers must
    // not be able to enumerate Calendar-derived record identities either.
    throw new DalError('not_found', 'The requested item was not found.');
  }
  return item;
}

function assertHierarchyParentAllowed(childType: ItemType, parent: ThreadmapItem): void {
  const allowed = parent.status !== 'archived'
    && ((childType === 'goal' && parent.type === 'project')
      || (['task', 'event', 'note', 'habit'] as ItemType[]).includes(childType)
        && (parent.type === 'project' || parent.type === 'goal'));
  if (!allowed) {
    throw new DalError('invalid_input', `A ${parent.type} cannot be the parent of a ${childType}.`);
  }
}

function optionalCommonFields(item: ThreadmapItem, includeParentId = false): Omit<ItemOutput,
  'id' | 'type' | 'title' | 'status' | 'createdAt' | 'updatedAt' | 'revision'> {
  const result: Omit<ItemOutput,
    'id' | 'type' | 'title' | 'status' | 'createdAt' | 'updatedAt' | 'revision'> = {};
  const strings: Array<keyof ItemOutput> = [
    'dueDate', 'priority', 'assignee', 'emoji', 'color', 'tier', 'frequency',
    'habitTime', 'startDate', 'endDate', 'startTime', 'endTime', 'timeframe',
    'metric', 'noteSubtype', 'myDay',
  ];
  for (const key of strings) {
    const value = stringField(item[key], 500);
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  if (includeParentId) {
    const parentId = stringField(item.parentId, 200);
    if (parentId !== undefined) result.parentId = parentId;
  }
  if (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)) {
    result.completedAt = Math.trunc(item.completedAt);
  }
  const tags = stringArray(item.tags, MCP_LIMITS.tags, MCP_LIMITS.tag);
  if (tags) result.tags = tags;
  // Linked IDs remain omitted. A native item may still point at a
  // Calendar-derived linked record, and returning that opaque identifier would
  // undermine the non-enumeration boundary. Parent IDs are emitted only after
  // the caller verifies that the referenced parent is MCP-visible.
  if (Array.isArray(item.customDays)) {
    result.customDays = [...new Set(item.customDays.filter((day): day is number =>
      Number.isInteger(day) && day >= 0 && day <= 6))].slice(0, 7);
  }
  if (Array.isArray(item.checklist)) {
    result.checklist = item.checklist.slice(0, MCP_LIMITS.checklist).flatMap((entry) => {
      if (!ownRecord(entry) || typeof entry.id !== 'string' || !ITEM_ID.test(entry.id)
          || typeof entry.text !== 'string' || typeof entry.done !== 'boolean') return [];
      return [{ id: entry.id, text: htmlToPlainText(entry.text, MCP_LIMITS.checklistText), done: entry.done }];
    });
  }
  if (ownRecord(item.completions)) {
    const completions: Record<string, boolean> = {};
    for (const [date, complete] of Object.entries(item.completions).slice(0, 3_660)) {
      if (DATE.test(date) && typeof complete === 'boolean') completions[date] = complete;
    }
    result.completions = completions;
  }
  return result;
}

export function itemForOutput(item: ThreadmapItem, summary = false,
  includeParentId = false): ItemOutput | ItemSummary {
  const common = optionalCommonFields(item, includeParentId);
  if (summary) {
    const result: ItemSummary = {
      id: item.id,
      type: item.type,
      title: htmlToPlainText(item.title, MCP_LIMITS.title),
      status: item.status,
      updatedAt: item.updatedAt,
      revision: item.revision,
    };
    const content = htmlToPlainText(item.content, MCP_LIMITS.summaryContent);
    if (content) result.content = content;
    for (const key of ['dueDate', 'startDate', 'endDate', 'priority', 'parentId', 'tags', 'myDay'] as const) {
      const value = common[key];
      if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
    }
    return result;
  }
  const result: ItemOutput = {
    id: item.id,
    type: item.type,
    title: htmlToPlainText(item.title, MCP_LIMITS.title),
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    revision: item.revision,
    ...common,
  };
  const content = htmlToPlainText(item.content, MCP_LIMITS.outputContent);
  if (content) result.content = content;
  return result;
}

function validateTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MCP_LIMITS.tags) {
    throw new DalError('invalid_input', `tags must be an array with at most ${MCP_LIMITS.tags} entries.`);
  }
  const tags = value.map((tag, index) => boundedString(tag, 1, MCP_LIMITS.tag, `tags[${index}]`, true));
  if (new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length) {
    throw new DalError('invalid_input', 'tags must not contain duplicates.');
  }
  return tags;
}

function validateChecklist(value: unknown): Array<{ id: string; text: string; done: boolean }> {
  if (!Array.isArray(value) || value.length > MCP_LIMITS.checklist) {
    throw new DalError('invalid_input', `checklist must contain at most ${MCP_LIMITS.checklist} entries.`);
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!ownRecord(entry)) throw new DalError('invalid_input', `checklist[${index}] must be an object.`);
    assertAllowedKeys(entry, new Set(['id', 'text', 'done']), `checklist[${index}]`);
    const id = validateItemId(entry.id, `checklist[${index}].id`);
    if (ids.has(id)) throw new DalError('invalid_input', 'checklist entry ids must be unique.');
    ids.add(id);
    return {
      id,
      text: boundedString(entry.text, 1, MCP_LIMITS.checklistText, `checklist[${index}].text`, true),
      done: entry.done === true,
    };
  });
}

const CREATE_KEYS = new Set([
  'type', 'title', 'content', 'status', 'dueDate', 'priority', 'assignee', 'checklist',
  'emoji', 'color', 'tier', 'frequency', 'customDays', 'habitTime', 'startDate', 'endDate',
  'startTime', 'endTime', 'timeframe', 'metric', 'noteSubtype', 'parentId', 'tags', 'myDay',
]);
const UPDATE_KEYS = new Set([...CREATE_KEYS].filter((key) => key !== 'type'));
const OPTIONAL_TEXT_LIMITS: Record<string, number> = {
  priority: 32, assignee: 200, emoji: 32, color: 64, tier: 64, frequency: 64,
  timeframe: 100, metric: 500, noteSubtype: 64,
};

function validateOptionalField(key: string, value: unknown, allowNull: boolean): unknown {
  if (value === null && allowNull) return null;
  if (key === 'content') return boundedString(value, 0, MCP_LIMITS.content, key);
  if (key === 'status') {
    if (typeof value !== 'string' || !ITEM_STATUSES.has(value as ItemStatus)) {
      throw new DalError('invalid_input', 'status is invalid.');
    }
    return value;
  }
  if (key === 'dueDate' || key === 'startDate' || key === 'endDate' || key === 'myDay') {
    return validateDate(value, key);
  }
  if (key === 'startTime' || key === 'endTime' || key === 'habitTime') {
    const time = boundedString(value, 5, 5, key);
    if (!TIME.test(time)) throw new DalError('invalid_input', `${key} must use HH:MM.`);
    return time;
  }
  if (key === 'parentId') return validateItemId(value, key);
  if (key === 'tags') return validateTags(value);
  if (key === 'checklist') return validateChecklist(value);
  if (key === 'customDays') {
    if (!Array.isArray(value) || value.length > 7 || value.some((day) =>
      !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)) {
      throw new DalError('invalid_input', 'customDays must contain unique weekday numbers from 0 through 6.');
    }
    const days = [...new Set(value as number[])];
    if (days.length !== value.length) throw new DalError('invalid_input', 'customDays must not contain duplicates.');
    return days;
  }
  return boundedString(value, 0, OPTIONAL_TEXT_LIMITS[key] ?? 500, key, true);
}

export function validateCreateItemInput(value: unknown): CreateItemInput {
  if (!ownRecord(value)) throw new DalError('invalid_input', 'item must be an object.');
  assertAllowedKeys(value, CREATE_KEYS, 'item');
  if (typeof value.type !== 'string' || !ITEM_TYPES.has(value.type as ItemType)) {
    throw new DalError('invalid_input', 'type is invalid.');
  }
  const result: CreateItemInput = {
    type: value.type as ItemType,
    title: boundedString(value.title, 1, MCP_LIMITS.title, 'title', true),
  };
  for (const [key, member] of Object.entries(value)) {
    if (key === 'type' || key === 'title' || member === undefined) continue;
    (result as unknown as Record<string, unknown>)[key] = validateOptionalField(key, member, false);
  }
  return result;
}

export function validateUpdateItemPatch(value: unknown): UpdateItemPatch {
  if (!ownRecord(value)) throw new DalError('invalid_input', 'patch must be an object.');
  assertAllowedKeys(value, UPDATE_KEYS, 'patch');
  if (!Object.keys(value).length) throw new DalError('invalid_input', 'patch must contain at least one field.');
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) {
    if (key === 'title') {
      if (member === null) throw new DalError('invalid_input', 'title cannot be removed.');
      result.title = boundedString(member, 1, MCP_LIMITS.title, 'title', true);
    } else {
      result[key] = validateOptionalField(key, member, true);
    }
  }
  return result as UpdateItemPatch;
}

function validateListInput(input: ListItemsInput): Required<Pick<ListItemsInput, 'limit'>> & ListItemsInput {
  const limit = input.limit === undefined ? 25 : finiteInteger(input.limit, 1, MCP_LIMITS.pageSize, 'limit');
  if (input.types && (!Array.isArray(input.types) || input.types.length > ITEM_TYPES.size
      || input.types.some((type) => !ITEM_TYPES.has(type)))) {
    throw new DalError('invalid_input', 'types contains an invalid item type.');
  }
  if (input.statuses && (!Array.isArray(input.statuses) || input.statuses.length > ITEM_STATUSES.size
      || input.statuses.some((status) => !ITEM_STATUSES.has(status)))) {
    throw new DalError('invalid_input', 'statuses contains an invalid item status.');
  }
  if (input.tags) validateTags(input.tags);
  if (input.parentId !== undefined) validateItemId(input.parentId, 'parent_id');
  if (input.updatedAfter !== undefined) finiteInteger(input.updatedAfter, 0, Number.MAX_SAFE_INTEGER, 'updated_after');
  if (input.updatedBefore !== undefined) finiteInteger(input.updatedBefore, 0, Number.MAX_SAFE_INTEGER, 'updated_before');
  if (input.updatedAfter !== undefined && input.updatedBefore !== undefined
      && input.updatedAfter > input.updatedBefore) {
    throw new DalError('invalid_input', 'updated_after must not be later than updated_before.');
  }
  decodePageCursor(input.cursor);
  return { ...input, limit };
}

function documentData(snapshot: DocumentSnapshot): unknown {
  return snapshot.data();
}

function deleteFieldSentinel(): unknown {
  return FieldValue.delete();
}

interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

function safeResultForStorage(value: unknown): JsonValue {
  return sanitizeJsonValue(value, { stringLimit: 12_000, arrayLimit: 500, keyLimit: 500 });
}

export class ThreadmapDal implements ThreadmapDataAccess {
  readonly principal: OAuthPrincipal;
  private readonly db: Firestore;
  private readonly now: () => number;
  private readonly random: (size: number) => Buffer;
  private readonly deleteItem?: DeleteItemCallback;
  private readonly quotaLimits: Record<QuotaKind, number>;

  constructor(db: Firestore, principal: OAuthPrincipal, dependencies: ThreadmapDalDependencies = {}) {
    this.db = db;
    this.principal = principal;
    this.now = dependencies.now ?? Date.now;
    this.random = dependencies.randomBytes ?? randomBytes;
    this.deleteItem = dependencies.deleteItem;
    this.quotaLimits = {
      read: dependencies.quotaLimits?.read ?? MCP_QUOTA_LIMITS.read,
      write: dependencies.quotaLimits?.write ?? MCP_QUOTA_LIMITS.write,
      delete: dependencies.quotaLimits?.delete ?? MCP_QUOTA_LIMITS.delete,
    };
    for (const [kind, limit] of Object.entries(this.quotaLimits)) {
      finiteInteger(limit, 1, 10_000, `quotaLimits.${kind}`);
    }
  }

  private deletionRef() {
    return this.db.collection(MCP_COLLECTIONS.deletionJobs).doc(this.principal.userId);
  }

  private itemRef(itemId: string) {
    return this.db.collection(MCP_COLLECTIONS.items).doc(itemId);
  }

  private async assertAccountActive(): Promise<void> {
    const snapshot = await this.deletionRef().get();
    if (snapshot.exists) {
      throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
    }
  }

  async consumeQuota(kind: QuotaKind, weight = 1): Promise<void> {
    const maximum = this.quotaLimits[kind];
    finiteInteger(weight, 1, maximum, 'quota weight');
    const now = this.now();
    const bucket = Math.floor(now / 60_000);
    const id = hashIdentifier(this.principal.userId, this.principal.clientId, kind, String(bucket));
    const ref = this.db.collection(MCP_COLLECTIONS.quotas).doc(id);
    await this.db.runTransaction(async (transaction) => {
      const [deletion, quota] = await Promise.all([
        transaction.get(this.deletionRef()),
        transaction.get(ref),
      ]);
      if (deletion.exists) {
        throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      }
      const currentData = quota.data();
      const current = ownRecord(currentData) && typeof currentData.count === 'number'
        && Number.isFinite(currentData.count) ? currentData.count : 0;
      if (current + weight > maximum) {
        throw new DalError('rate_limited', 'The shared MCP quota has been reached. Retry after the current minute.', {
          retryable: true,
          details: { retryAfterMs: Math.max(1, ((bucket + 1) * 60_000) - now) },
        });
      }
      transaction.set(ref, {
        userId: this.principal.userId,
        clientId: this.principal.clientId,
        kind,
        bucket,
        count: current + weight,
        updatedAt: now,
        expireAt: new Date((bucket + 2) * 60_000),
      });
    });
  }

  async recordAudit(event: AuditEvent): Promise<void> {
    const now = this.now();
    const id = `${now.toString(36)}_${this.random(12).toString('base64url')}`;
    const ref = this.db.collection(MCP_COLLECTIONS.audits).doc(id);
    const targetIds = (event.targetIds ?? []).filter((idValue) => ITEM_ID.test(idValue)).slice(0, 20);
    const changedFields = (event.changedFields ?? [])
      .filter((field) => /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(field)).slice(0, 50);
    const audit = {
      userId: this.principal.userId,
      clientId: this.principal.clientId,
      tool: event.tool.slice(0, 100),
      kind: event.kind,
      success: event.success,
      resultCode: event.resultCode.slice(0, 100),
      durationMs: Math.max(0, Math.min(Math.trunc(event.durationMs), 3_600_000)),
      ...(event.requestId && UUID.test(event.requestId) ? { requestId: event.requestId.toLowerCase() } : {}),
      ...(targetIds.length ? { targetIds } : {}),
      ...(changedFields.length ? { changedFields } : {}),
      createdAt: now,
      expireAt: new Date(securityAuditExpireAtMillis(now)),
    };
    await this.db.runTransaction(async (transaction) => {
      const deletion = await transaction.get(this.deletionRef());
      if (deletion.exists) {
        throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      }
      transaction.create(ref, audit);
    });
  }

  private async ownedSnapshot(itemId: string): Promise<{ snapshot: DocumentSnapshot; item: ThreadmapItem }> {
    validateItemId(itemId);
    await this.assertAccountActive();
    const snapshot = await this.itemRef(itemId).get();
    return {
      snapshot,
      item: coerceMcpVisibleOwnedItem(itemId, documentData(snapshot), this.principal.userId),
    };
  }

  private itemFromSnapshot(snapshot: QueryDocumentSnapshot | DocumentSnapshot): ThreadmapItem {
    return coerceMcpVisibleOwnedItem(snapshot.id, snapshot.data(), this.principal.userId);
  }

  private async ownedItems(maximum: number): Promise<{ items: ThreadmapItem[]; partial: boolean }> {
    await this.assertAccountActive();
    const query = this.db.collection(MCP_COLLECTIONS.items)
      .where('userId', '==', this.principal.userId)
      .limit(maximum + 1);
    const snapshot = await query.get();
    const items = snapshot.docs.slice(0, maximum).flatMap((document) => {
      try {
        return [this.itemFromSnapshot(document)];
      } catch {
        return [];
      }
    });
    return { items, partial: snapshot.docs.length > maximum };
  }

  private async visibleParentIds(items: readonly ThreadmapItem[]): Promise<Set<string>> {
    const parentIds = [...new Set(items.flatMap((item) =>
      typeof item.parentId === 'string' && ITEM_ID.test(item.parentId) ? [item.parentId] : []))];
    const visible = new Set<string>();
    const snapshots = await Promise.all(parentIds.map((parentId) => this.itemRef(parentId).get()));
    for (const snapshot of snapshots) {
      try {
        visible.add(this.itemFromSnapshot(snapshot).id);
      } catch {
        // Missing, cross-account, and Google-derived parents remain redacted.
      }
    }
    return visible;
  }

  async getLifeOverview(input: { date?: string; timezone?: string }): Promise<LifeOverviewResult> {
    const timezone = validateTimezone(input.timezone);
    const asOfDate = input.date === undefined ? dateInTimezone(this.now(), timezone) : validateDate(input.date, 'date');
    const { items, partial } = await this.ownedItems(MCP_LIMITS.aggregateScan);
    const visibleParentIds = new Set(items.map((item) => item.id));
    const output = (item: ThreadmapItem) => itemForOutput(
      item,
      true,
      typeof item.parentId === 'string' && visibleParentIds.has(item.parentId),
    ) as ItemSummary;
    const active = items.filter((item) => item.status === 'active' || item.status === 'waiting');
    const today = active.filter((item) => item.dueDate === asOfDate || item.myDay === asOfDate)
      .sort(compareAgendaItems).slice(0, 20).map(output);
    const overdue = active.filter((item) => item.type === 'task' && typeof item.dueDate === 'string'
      && item.dueDate < asOfDate).sort(compareAgendaItems).slice(0, 20)
      .map(output);
    const byType = (type: ItemType) => active.filter((item) => item.type === type)
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
      .map(output);
    const counts: Record<string, number> = { total: items.length };
    for (const type of ITEM_TYPES) counts[type] = items.filter((item) => item.type === type).length;
    for (const status of ITEM_STATUSES) counts[status] = items.filter((item) => item.status === status).length;
    counts.today = active.filter((item) => item.dueDate === asOfDate || item.myDay === asOfDate).length;
    counts.overdue = active.filter((item) => item.type === 'task' && typeof item.dueDate === 'string'
      && item.dueDate < asOfDate).length;
    return {
      asOfDate,
      counts,
      today,
      overdue,
      activeProjects: byType('project'),
      activeGoals: byType('goal'),
      activeHabits: byType('habit'),
      partial,
    };
  }

  async getAgenda(input: { startDate: string; endDate: string; timezone?: string }): Promise<AgendaResult> {
    const startDate = validateDate(input.startDate, 'start_date');
    const endDate = validateDate(input.endDate, 'end_date');
    if (startDate > endDate || daysBetween(startDate, endDate) > 31) {
      throw new DalError('invalid_input', 'Agenda range must be ordered and no longer than 31 days.');
    }
    const timezone = validateTimezone(input.timezone);
    const { items, partial } = await this.ownedItems(MCP_LIMITS.aggregateScan);
    const visibleParentIds = new Set(items.map((item) => item.id));
    const output = (item: ThreadmapItem) => itemForOutput(
      item,
      true,
      typeof item.parentId === 'string' && visibleParentIds.has(item.parentId),
    ) as ItemSummary;
    const active = items.filter((item) => item.status === 'active' || item.status === 'waiting');
    const tasks = active.filter((item) => item.type === 'task'
      && ((typeof item.dueDate === 'string' && inDateRange(item.dueDate, startDate, endDate))
        || (typeof item.myDay === 'string' && inDateRange(item.myDay, startDate, endDate))))
      .sort(compareAgendaItems).slice(0, 100).map(output);
    const events = active.filter((item) => item.type === 'event' && typeof item.startDate === 'string'
      && item.startDate <= endDate && (typeof item.endDate === 'string' ? item.endDate : item.startDate) >= startDate)
      .sort(compareAgendaItems).slice(0, 100).map(output);
    const dates = enumerateDates(startDate, endDate);
    const habits = active.filter((item) => item.type === 'habit').slice(0, 100).map((item) => ({
      ...output(item),
      scheduledDates: dates.filter((date) => habitScheduledOn(item, date)),
    })).filter((item) => item.scheduledDates.length > 0);
    return { startDate, endDate, timezone, tasks, events, habits, partial };
  }

  async listItems(input: ListItemsInput): Promise<PageResult<ItemSummary>> {
    const normalized = validateListInput(input);
    await this.assertAccountActive();
    if (normalized.parentId) await this.ownedSnapshot(normalized.parentId);
    const cursor = decodePageCursor(normalized.cursor);
    let query: Query = this.db.collection(MCP_COLLECTIONS.items)
      .where('userId', '==', this.principal.userId)
      .orderBy('updatedAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor.updatedAt, cursor.id);
    const scanLimit = Math.min(MCP_LIMITS.searchScan, Math.max(normalized.limit * 5, normalized.limit + 1));
    const snapshot = await query.limit(scanLimit).get();
    const filtered: ThreadmapItem[] = [];
    let lastScanned: CursorPayload | undefined;
    for (const document of snapshot.docs) {
      const raw = document.data();
      lastScanned = { updatedAt: toMillis(raw?.updatedAt), id: document.id };
      let item: ThreadmapItem;
      try { item = this.itemFromSnapshot(document); } catch { continue; }
      if (!matchesListFilters(item, normalized)) continue;
      filtered.push(item);
      if (filtered.length > normalized.limit) break;
    }
    const continuation = scanContinuation({
      scanned: snapshot.docs.length,
      scanLimit,
      matched: filtered.length,
      pageLimit: normalized.limit,
    });
    const selected = filtered.slice(0, normalized.limit);
    const boundary = continuation.boundary === 'selected'
      ? selected.length > 0
        ? { updatedAt: selected[selected.length - 1].updatedAt, id: selected[selected.length - 1].id }
        : undefined
      : lastScanned;
    const visibleParentIds = await this.visibleParentIds(selected);
    return {
      items: selected.map((item) => itemForOutput(
        item,
        true,
        typeof item.parentId === 'string' && visibleParentIds.has(item.parentId),
      ) as ItemSummary),
      ...(continuation.hasMore && boundary
        ? { nextCursor: encodePageCursor({ updatedAt: boundary.updatedAt, id: boundary.id }) }
        : {}),
      ...(continuation.partial ? { partial: true } : {}),
    };
  }

  async searchItems(input: SearchItemsInput): Promise<PageResult<ItemSummary>> {
    const queryText = boundedString(input.query, 1, 200, 'query', true).toLocaleLowerCase();
    const normalized = validateListInput(input);
    await this.assertAccountActive();
    if (normalized.parentId) await this.ownedSnapshot(normalized.parentId);
    const cursor = decodePageCursor(normalized.cursor);
    let query: Query = this.db.collection(MCP_COLLECTIONS.items)
      .where('userId', '==', this.principal.userId)
      .orderBy('updatedAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor.updatedAt, cursor.id);
    const snapshot = await query.limit(MCP_LIMITS.searchScan).get();
    const matches: ThreadmapItem[] = [];
    let lastScanned: CursorPayload | undefined;
    for (const document of snapshot.docs) {
      const raw = document.data();
      lastScanned = { updatedAt: toMillis(raw?.updatedAt), id: document.id };
      let item: ThreadmapItem;
      try { item = this.itemFromSnapshot(document); } catch { continue; }
      if (!matchesListFilters(item, normalized)) continue;
      const haystack = `${htmlToPlainText(item.title, MCP_LIMITS.title)}\n${htmlToPlainText(item.content, 8_000)}\n${(item.tags ?? []).join(' ')}`.toLocaleLowerCase();
      if (haystack.includes(queryText)) matches.push(item);
      if (matches.length > normalized.limit) break;
    }
    const continuation = scanContinuation({
      scanned: snapshot.docs.length,
      scanLimit: MCP_LIMITS.searchScan,
      matched: matches.length,
      pageLimit: normalized.limit,
    });
    const selected = matches.slice(0, normalized.limit);
    const boundary = continuation.boundary === 'selected'
      ? selected.length > 0
        ? { updatedAt: selected[selected.length - 1].updatedAt, id: selected[selected.length - 1].id }
        : undefined
      : lastScanned;
    const visibleParentIds = await this.visibleParentIds(selected);
    return {
      items: selected.map((item) => itemForOutput(
        item,
        true,
        typeof item.parentId === 'string' && visibleParentIds.has(item.parentId),
      ) as ItemSummary),
      ...(continuation.hasMore && boundary
        ? { nextCursor: encodePageCursor({ updatedAt: boundary.updatedAt, id: boundary.id }) }
        : {}),
      ...(snapshot.docs.length === MCP_LIMITS.searchScan ? { partial: true } : {}),
    };
  }

  async getItem(itemId: string): Promise<ItemOutput> {
    const { item } = await this.ownedSnapshot(itemId);
    const visibleParentIds = await this.visibleParentIds([item]);
    return itemForOutput(
      item,
      false,
      typeof item.parentId === 'string' && visibleParentIds.has(item.parentId),
    ) as ItemOutput;
  }

  private idempotencyRef(tool: string, requestId: string) {
    return this.db.collection(MCP_COLLECTIONS.idempotency).doc(
      hashIdentifier(this.principal.userId, this.principal.clientId, tool, requestId)
    );
  }

  private async idempotentMutation<T extends JsonValue>(tool: string, requestIdValue: string,
    payload: unknown, execute: (transaction: Transaction, now: number) => Promise<T>): Promise<IdempotentResult<T>> {
    const requestId = validateClientRequestId(requestIdValue);
    const fingerprint = createRequestFingerprint(tool, payload);
    const ref = this.idempotencyRef(tool, requestId);
    return this.db.runTransaction(async (transaction) => {
      const [deletion, existing] = await Promise.all([
        transaction.get(this.deletionRef()),
        transaction.get(ref),
      ]);
      if (deletion.exists) {
        throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      }
      if (existing.exists) {
        const data = existing.data();
        if (!ownRecord(data) || data.fingerprint !== fingerprint) {
          throw new DalError('idempotency_conflict', 'client_request_id was already used for a different request.');
        }
        if (data.status === 'succeeded' && data.result !== undefined) {
          return { value: data.result as T, replayed: true };
        }
        throw new DalError('temporarily_unavailable', 'The original request is still being resolved.', {
          retryable: true,
        });
      }
      const now = this.now();
      const value = await execute(transaction, now);
      transaction.create(ref, {
        userId: this.principal.userId,
        clientId: this.principal.clientId,
        tool,
        requestId,
        fingerprint,
        status: 'succeeded',
        result: safeResultForStorage(value),
        createdAt: now,
        updatedAt: now,
        expireAt: new Date(now + MCP_LIMITS.idempotencyTtlMs),
      });
      return { value, replayed: false };
    });
  }

  async createItem(inputValue: CreateItemInput, clientRequestId: string): Promise<MutationResult> {
    const input = validateCreateItemInput(inputValue);
    const requestId = validateClientRequestId(clientRequestId);
    const id = `mcp_${hashIdentifier(this.principal.userId, this.principal.clientId, requestId).slice(0, 32)}`;
    const result = await this.idempotentMutation<JsonObject>('create_item', requestId, input,
      async (transaction, now) => {
        const itemRef = this.itemRef(id);
        const reads: Promise<DocumentSnapshot>[] = [transaction.get(itemRef)];
        if (input.parentId) reads.push(transaction.get(this.itemRef(input.parentId)));
        const snapshots = await Promise.all(reads);
        if (snapshots[0].exists) {
          throw new DalError('idempotency_conflict', 'The deterministic item id is already in use.');
        }
        if (input.parentId) {
          const parent = coerceMcpVisibleOwnedItem(
            input.parentId,
            snapshots[1].data(),
            this.principal.userId,
          );
          assertHierarchyParentAllowed(input.type, parent);
        }
        const item: ThreadmapItem = {
          ...input,
          id,
          userId: this.principal.userId,
          status: input.status ?? 'active',
          createdAt: now,
          updatedAt: now,
          revision: 1,
          tags: input.tags ?? [],
          linkedIds: [],
        };
        transaction.create(itemRef, withoutId(item));
        return itemForOutput(item, false, Boolean(input.parentId)) as unknown as JsonObject;
      });
    return { item: result.value as unknown as ItemOutput, replayed: result.replayed };
  }

  async updateItem(itemIdValue: string, expectedRevisionValue: number, patchValue: UpdateItemPatch,
    clientRequestId: string): Promise<MutationResult> {
    const itemId = validateItemId(itemIdValue);
    const expectedRevision = validateRevision(expectedRevisionValue);
    const patch = validateUpdateItemPatch(patchValue);
    const result = await this.idempotentMutation<JsonObject>('update_item', clientRequestId,
      { itemId, expectedRevision, patch }, async (transaction, now) => {
        const itemSnapshot = await transaction.get(this.itemRef(itemId));
        const item = coerceMcpVisibleOwnedItem(itemId, itemSnapshot.data(), this.principal.userId);
        assertExpectedRevision(item.revision, expectedRevision);
        if (patch.parentId && patch.parentId === itemId) {
          throw new DalError('invalid_input', 'An item cannot be its own parent.');
        }
        let parentSnapshot: DocumentSnapshot | undefined;
        if (typeof patch.parentId === 'string') {
          parentSnapshot = await transaction.get(this.itemRef(patch.parentId));
          const parent = coerceMcpVisibleOwnedItem(
            patch.parentId,
            parentSnapshot.data(),
            this.principal.userId,
          );
          assertHierarchyParentAllowed(item.type, parent);
        }
        const updates: Record<string, unknown> = { updatedAt: now, revision: item.revision + 1 };
        const next: ThreadmapItem = { ...item, updatedAt: now, revision: item.revision + 1 };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) {
            updates[key] = deleteFieldSentinel();
            delete next[key];
          } else {
            updates[key] = value;
            next[key] = value;
          }
        }
        transaction.update(this.itemRef(itemId), updates);
        return itemForOutput(next, false, typeof patch.parentId === 'string') as unknown as JsonObject;
      });
    return { item: result.value as unknown as ItemOutput, replayed: result.replayed };
  }

  private async statusMutation(tool: 'complete_item' | 'archive_item', itemIdValue: string,
    expectedRevisionValue: number, clientRequestId: string): Promise<MutationResult> {
    const itemId = validateItemId(itemIdValue);
    const expectedRevision = validateRevision(expectedRevisionValue);
    const result = await this.idempotentMutation<JsonObject>(tool, clientRequestId,
      { itemId, expectedRevision }, async (transaction, now) => {
        const snapshot = await transaction.get(this.itemRef(itemId));
        const item = coerceMcpVisibleOwnedItem(itemId, snapshot.data(), this.principal.userId);
        assertExpectedRevision(item.revision, expectedRevision);
        const status: ItemStatus = tool === 'complete_item' ? 'done' : 'archived';
        const next: ThreadmapItem = {
          ...item,
          status,
          updatedAt: now,
          revision: item.revision + 1,
          ...(tool === 'complete_item' ? { completedAt: now } : {}),
        };
        transaction.update(this.itemRef(itemId), {
          status,
          updatedAt: now,
          revision: next.revision,
          ...(tool === 'complete_item' ? { completedAt: now } : {}),
        });
        return itemForOutput(next, false) as unknown as JsonObject;
      });
    return { item: result.value as unknown as ItemOutput, replayed: result.replayed };
  }

  async completeItem(itemId: string, expectedRevision: number,
    clientRequestId: string): Promise<MutationResult> {
    return this.statusMutation('complete_item', itemId, expectedRevision, clientRequestId);
  }

  async archiveItem(itemId: string, expectedRevision: number,
    clientRequestId: string): Promise<MutationResult> {
    return this.statusMutation('archive_item', itemId, expectedRevision, clientRequestId);
  }

  async setHabitCompletion(itemIdValue: string, expectedRevisionValue: number, dateValue: string,
    completed: boolean, clientRequestId: string): Promise<MutationResult> {
    const itemId = validateItemId(itemIdValue);
    const expectedRevision = validateRevision(expectedRevisionValue);
    const date = validateDate(dateValue, 'date');
    if (typeof completed !== 'boolean') throw new DalError('invalid_input', 'completed must be boolean.');
    const result = await this.idempotentMutation<JsonObject>('set_habit_completion', clientRequestId,
      { itemId, expectedRevision, date, completed }, async (transaction, now) => {
        const snapshot = await transaction.get(this.itemRef(itemId));
        const item = coerceMcpVisibleOwnedItem(itemId, snapshot.data(), this.principal.userId);
        assertExpectedRevision(item.revision, expectedRevision);
        if (item.type !== 'habit') throw new DalError('invalid_input', 'Habit completion can only be changed on a habit.');
        const completions: Record<string, boolean> = ownRecord(item.completions)
          ? Object.fromEntries(Object.entries(item.completions)
            .filter(([key, value]) => DATE.test(key) && typeof value === 'boolean')) : {};
        if (completed) completions[date] = true;
        else delete completions[date];
        if (Object.keys(completions).length > 3_660) {
          throw new DalError('invalid_input', 'The habit completion history has reached its supported limit.');
        }
        const next: ThreadmapItem = { ...item, completions, updatedAt: now, revision: item.revision + 1 };
        transaction.update(this.itemRef(itemId), { completions, updatedAt: now, revision: next.revision });
        return itemForOutput(next, false) as unknown as JsonObject;
      });
    return { item: result.value as unknown as ItemOutput, replayed: result.replayed };
  }

  private async changeLink(linked: boolean, itemIdAValue: string, expectedRevisionAValue: number,
    itemIdBValue: string, expectedRevisionBValue: number, clientRequestId: string): Promise<LinkMutationResult> {
    const itemIdA = validateItemId(itemIdAValue, 'item_id_a');
    const itemIdB = validateItemId(itemIdBValue, 'item_id_b');
    if (itemIdA === itemIdB) throw new DalError('invalid_input', 'An item cannot link to itself.');
    const expectedRevisionA = validateRevision(expectedRevisionAValue, 'expected_revision_a');
    const expectedRevisionB = validateRevision(expectedRevisionBValue, 'expected_revision_b');
    const tool = linked ? 'link_items' : 'unlink_items';
    const result = await this.idempotentMutation<JsonObject>(tool, clientRequestId,
      { itemIdA, expectedRevisionA, itemIdB, expectedRevisionB }, async (transaction, now) => {
        const [snapshotA, snapshotB] = await Promise.all([
          transaction.get(this.itemRef(itemIdA)),
          transaction.get(this.itemRef(itemIdB)),
        ]);
        const itemA = coerceMcpVisibleOwnedItem(itemIdA, snapshotA.data(), this.principal.userId);
        const itemB = coerceMcpVisibleOwnedItem(itemIdB, snapshotB.data(), this.principal.userId);
        assertExpectedRevision(itemA.revision, expectedRevisionA);
        assertExpectedRevision(itemB.revision, expectedRevisionB);
        const linksA = new Set(stringArray(itemA.linkedIds, MCP_LIMITS.linkedItems, 200) ?? []);
        const linksB = new Set(stringArray(itemB.linkedIds, MCP_LIMITS.linkedItems, 200) ?? []);
        const already = linked ? linksA.has(itemIdB) && linksB.has(itemIdA)
          : !linksA.has(itemIdB) && !linksB.has(itemIdA);
        if (already) {
          return {
            items: [itemForOutput(itemA, false), itemForOutput(itemB, false)],
            changed: false,
          } as unknown as JsonObject;
        }
        if (linked) {
          linksA.add(itemIdB);
          linksB.add(itemIdA);
        } else {
          linksA.delete(itemIdB);
          linksB.delete(itemIdA);
        }
        if (linksA.size > MCP_LIMITS.linkedItems || linksB.size > MCP_LIMITS.linkedItems) {
          throw new DalError('invalid_input', 'One of the items has reached the linked item limit.');
        }
        const nextA: ThreadmapItem = {
          ...itemA, linkedIds: [...linksA], updatedAt: now, revision: itemA.revision + 1,
        };
        const nextB: ThreadmapItem = {
          ...itemB, linkedIds: [...linksB], updatedAt: now, revision: itemB.revision + 1,
        };
        transaction.update(this.itemRef(itemIdA), {
          linkedIds: nextA.linkedIds, updatedAt: now, revision: nextA.revision,
        });
        transaction.update(this.itemRef(itemIdB), {
          linkedIds: nextB.linkedIds, updatedAt: now, revision: nextB.revision,
        });
        return {
          items: [itemForOutput(nextA, false), itemForOutput(nextB, false)],
          changed: true,
        } as unknown as JsonObject;
      });
    const stored = result.value as unknown as { items: [ItemOutput, ItemOutput]; changed: boolean };
    return { ...stored, replayed: result.replayed };
  }

  async linkItems(itemIdA: string, expectedRevisionA: number, itemIdB: string,
    expectedRevisionB: number, clientRequestId: string): Promise<LinkMutationResult> {
    return this.changeLink(true, itemIdA, expectedRevisionA, itemIdB, expectedRevisionB, clientRequestId);
  }

  async unlinkItems(itemIdA: string, expectedRevisionA: number, itemIdB: string,
    expectedRevisionB: number, clientRequestId: string): Promise<LinkMutationResult> {
    return this.changeLink(false, itemIdA, expectedRevisionA, itemIdB, expectedRevisionB, clientRequestId);
  }

  async listTags(): Promise<{ tags: string[]; partial: boolean }> {
    const [{ items, partial }, settingsSnapshot] = await Promise.all([
      this.ownedItems(MCP_LIMITS.aggregateScan),
      this.db.collection(MCP_COLLECTIONS.userSettings).doc(this.principal.userId).get(),
    ]);
    const tags = new Map<string, string>();
    for (const item of items) {
      for (const tag of stringArray(item.tags, MCP_LIMITS.tags, MCP_LIMITS.tag) ?? []) {
        tags.set(tag.toLocaleLowerCase(), tag);
      }
    }
    const settings = settingsSnapshot.data();
    if (ownRecord(settings) && settings.userId === this.principal.userId && Array.isArray(settings.customTags)) {
      for (const tag of stringArray(settings.customTags, MCP_LIMITS.tags, MCP_LIMITS.tag) ?? []) {
        tags.set(tag.toLocaleLowerCase(), tag);
      }
    }
    return { tags: [...tags.values()].sort((a, b) => a.localeCompare(b)).slice(0, 200), partial };
  }

  async getSecondaryData(kind: SecondaryDataKind): Promise<JsonObject> {
    await this.assertAccountActive();
    if (kind === 'flight') return this.readFlightData();
    const toolId: Record<Exclude<SecondaryDataKind, 'flight'>, string> = {
      wishlist: 'wishlist',
      abitur: 'abitur',
      briefing: 'briefing-journal',
      dispatch: 'dispatch-plans',
      settings: 'settings',
      toolbox: 'toolbox',
    };
    const snapshot = await this.db.collection(MCP_COLLECTIONS.toolData)
      .doc(`${this.principal.userId}_${toolId[kind]}`).get();
    const data = snapshot.data();
    if (!snapshot.exists || !ownRecord(data)
        || (data.userId !== undefined && data.userId !== this.principal.userId)) {
      return { kind, found: false };
    }
    return projectSecondary(kind, data);
  }

  private async readFlightData(): Promise<JsonObject> {
    const snapshot = await this.db.collection(MCP_COLLECTIONS.flightLogs)
      .where('userId', '==', this.principal.userId).limit(51).get();
    const logs = snapshot.docs.slice(0, 50).map((document) => {
      const data = document.data();
      return sanitizeJsonValue({ id: document.id, ...data }, {
        stringLimit: 1_000, arrayLimit: 50, keyLimit: 50,
      });
    });
    return { kind: 'flight', found: logs.length > 0, logs, partial: snapshot.docs.length > 50 };
  }

  async listFilesMetadata(itemIdValue?: string, limitValue = 50): Promise<{
    files: FileMetadataOutput[];
    partial: boolean;
  }> {
    const limit = finiteInteger(limitValue, 1, 100, 'limit');
    let items: ThreadmapItem[];
    let sourcePartial = false;
    if (itemIdValue !== undefined) {
      const { item } = await this.ownedSnapshot(validateItemId(itemIdValue));
      items = [item];
    } else {
      const result = await this.ownedItems(MCP_LIMITS.aggregateScan);
      items = result.items;
      sourcePartial = result.partial;
    }
    const files: FileMetadataOutput[] = [];
    for (const item of items) {
      if (!Array.isArray(item.files)) continue;
      for (const raw of item.files.slice(0, MCP_LIMITS.files)) {
        if (!ownRecord(raw) || typeof raw.id !== 'string' || !ITEM_ID.test(raw.id)
            || typeof raw.name !== 'string' || typeof raw.type !== 'string'
            || typeof raw.size !== 'number' || !Number.isFinite(raw.size)) continue;
        files.push({
          itemId: item.id,
          itemTitle: htmlToPlainText(item.title, MCP_LIMITS.title),
          id: raw.id,
          name: htmlToPlainText(raw.name, 500),
          size: Math.max(0, Math.trunc(raw.size)),
          type: raw.type.slice(0, 200),
          ...(typeof raw.uploadedAt === 'number' && Number.isFinite(raw.uploadedAt)
            ? { uploadedAt: Math.trunc(raw.uploadedAt) } : {}),
        });
      }
    }
    files.sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    return { files: files.slice(0, limit), partial: sourcePartial || files.length > limit };
  }

  async previewDeleteItem(itemIdValue: string, expectedRevisionValue: number): Promise<DeletePreviewResult> {
    const itemId = validateItemId(itemIdValue);
    const expectedRevision = validateRevision(expectedRevisionValue);
    const { item } = await this.ownedSnapshot(itemId);
    assertExpectedRevision(item.revision, expectedRevision);
    const [children, linked] = await Promise.all([
      this.db.collection(MCP_COLLECTIONS.items).where('userId', '==', this.principal.userId)
        .where('parentId', '==', itemId).limit(501).get(),
      this.db.collection(MCP_COLLECTIONS.items).where('userId', '==', this.principal.userId)
        .where('linkedIds', 'array-contains', itemId).limit(501).get(),
    ]);
    const visibleCount = (documents: QueryDocumentSnapshot[]): number => documents.filter((document) => {
      try {
        this.itemFromSnapshot(document);
        return true;
      } catch {
        return false;
      }
    }).length;
    const now = this.now();
    const expiresAt = now + MCP_LIMITS.confirmationTtlMs;
    const confirmationToken = `tmdc_${this.random(32).toString('base64url')}`;
    const tokenHash = createHash('sha256').update(confirmationToken, 'utf8').digest('base64url');
    const confirmationRef = this.db.collection(MCP_COLLECTIONS.deleteConfirmations).doc(tokenHash);
    await this.db.runTransaction(async (transaction) => {
      const deletion = await transaction.get(this.deletionRef());
      if (deletion.exists) {
        throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      }
      transaction.create(confirmationRef, {
      userId: this.principal.userId,
      clientId: this.principal.clientId,
      itemId,
      expectedRevision,
      status: 'active',
      createdAt: now,
      expiresAt,
      expireAt: new Date(expiresAt),
      });
    });
    return {
      item: itemForOutput(item, true) as ItemSummary,
      impact: {
        childCount: Math.min(visibleCount(children.docs), 500),
        linkedReferenceCount: Math.min(visibleCount(linked.docs), 500),
        attachmentCount: Array.isArray(item.files) ? Math.min(item.files.length, MCP_LIMITS.files) : 0,
      },
      expectedRevision,
      confirmationToken,
      expiresAt,
    };
  }

  async confirmDeleteItem(itemIdValue: string, expectedRevisionValue: number,
    confirmationTokenValue: string, clientRequestIdValue: string): Promise<DeleteResult> {
    if (!this.deleteItem) {
      throw new DalError('delete_not_configured', 'Deletion is not available on this MCP deployment.', {
        retryable: true,
      });
    }
    const itemId = validateItemId(itemIdValue);
    const expectedRevision = validateRevision(expectedRevisionValue);
    const requestId = validateClientRequestId(clientRequestIdValue);
    const confirmationToken = boundedString(confirmationTokenValue, 40, 200, 'confirmation_token');
    if (!/^tmdc_[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
      throw new DalError('confirmation_invalid', 'The deletion confirmation is invalid.');
    }
    const tokenHash = createHash('sha256').update(confirmationToken, 'utf8').digest('base64url');
    const confirmationRef = this.db.collection(MCP_COLLECTIONS.deleteConfirmations).doc(tokenHash);
    const idempotencyRef = this.idempotencyRef('confirm_delete_item', requestId);
    const fingerprint = createRequestFingerprint('confirm_delete_item', {
      itemId, expectedRevision, confirmationHash: tokenHash,
    });
    const reservation = await this.db.runTransaction(async (transaction) => {
      const [deletion, confirmation, idempotency, itemSnapshot] = await Promise.all([
        transaction.get(this.deletionRef()),
        transaction.get(confirmationRef),
        transaction.get(idempotencyRef),
        transaction.get(this.itemRef(itemId)),
      ]);
      if (deletion.exists) throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      if (idempotency.exists) {
        const data = idempotency.data();
        if (!ownRecord(data) || data.fingerprint !== fingerprint) {
          throw new DalError('idempotency_conflict', 'client_request_id was already used for a different request.');
        }
        if (data.status === 'succeeded' && ownRecord(data.result)) {
          return { execute: false, result: data.result as unknown as DeleteResult };
        }
        if (data.status === 'executing' && typeof data.leaseUntil === 'number'
            && data.leaseUntil > this.now()) {
          throw new DalError('temporarily_unavailable', 'The deletion request is still being resolved.', { retryable: true });
        }
      }
      const confirmationData = confirmation.data();
      const isSameRetry = idempotency.exists && ownRecord(idempotency.data())
        && idempotency.data()?.fingerprint === fingerprint;
      if (!isSameRetry) {
        if (!confirmation.exists || !ownRecord(confirmationData)
            || confirmationData.userId !== this.principal.userId
            || confirmationData.clientId !== this.principal.clientId
            || confirmationData.itemId !== itemId
            || confirmationData.expectedRevision !== expectedRevision) {
          throw new DalError('confirmation_invalid', 'The deletion confirmation is invalid.');
        }
        if (typeof confirmationData.expiresAt !== 'number' || confirmationData.expiresAt <= this.now()) {
          throw new DalError('confirmation_expired', 'The deletion confirmation expired.');
        }
        if (confirmationData.status !== 'active') {
          throw new DalError('confirmation_replayed', 'The deletion confirmation was already used.');
        }
        const item = coerceMcpVisibleOwnedItem(itemId, itemSnapshot.data(), this.principal.userId);
        assertExpectedRevision(item.revision, expectedRevision);
        transaction.update(confirmationRef, {
          status: 'consumed', consumedAt: this.now(), consumedByRequestId: requestId,
        });
      }
      const now = this.now();
      transaction.set(idempotencyRef, {
        userId: this.principal.userId,
        clientId: this.principal.clientId,
        tool: 'confirm_delete_item',
        requestId,
        fingerprint,
        status: 'executing',
        leaseUntil: now + 30_000,
        confirmationHash: tokenHash,
        createdAt: idempotency.exists && ownRecord(idempotency.data())
          ? idempotency.data()?.createdAt ?? now : now,
        updatedAt: now,
        expireAt: new Date(now + MCP_LIMITS.idempotencyTtlMs),
      });
      return { execute: true };
    });
    if (!reservation.execute && reservation.result) {
      return { ...reservation.result, replayed: true };
    }
    let callbackResult: DeleteItemCallbackResult;
    try {
      callbackResult = await this.deleteItem({
        userId: this.principal.userId,
        itemId,
        expectedRevision,
        clientRequestId: requestId,
      });
    } catch {
      const finalization = await mergeAccountOwnedDocumentIfActive(
        this.db,
        this.principal.userId,
        idempotencyRef,
        {
        status: 'retryable',
        leaseUntil: 0,
        updatedAt: this.now(),
        lastErrorCode: 'delete_callback_failed',
        },
      );
      if (finalization === 'blocked') {
        throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
      }
      throw new DalError('temporarily_unavailable', 'Deletion could not be completed. Retry with the same client_request_id.', {
        retryable: true,
      });
    }
    const result: DeleteResult = {
      itemId,
      deleted: true,
      cleanupPending: Boolean(callbackResult.cleanupPending),
      replayed: false,
    };
    const finalization = await mergeAccountOwnedDocumentIfActive(
      this.db,
      this.principal.userId,
      idempotencyRef,
      {
        status: 'succeeded',
        result: { ...result, replayed: false },
        leaseUntil: 0,
        updatedAt: this.now(),
      },
    );
    if (finalization === 'blocked') {
      throw new DalError('account_unavailable', 'This account is being deleted and cannot use MCP tools.');
    }
    return result;
  }
}

function withoutId(item: ThreadmapItem): Record<string, unknown> {
  const data = { ...item } as Record<string, unknown>;
  delete data.id;
  return data;
}

function inDateRange(value: string, start: string, end: string): boolean {
  return value >= start && value <= end;
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

function enumerateDates(start: string, end: string): string[] {
  const result: string[] = [];
  let current = Date.parse(`${start}T00:00:00.000Z`);
  const last = Date.parse(`${end}T00:00:00.000Z`);
  while (current <= last && result.length <= 31) {
    result.push(new Date(current).toISOString().slice(0, 10));
    current += 86_400_000;
  }
  return result;
}

function habitScheduledOn(item: ThreadmapItem, date: string): boolean {
  const frequency = typeof item.frequency === 'string' ? item.frequency.toLocaleLowerCase() : 'daily';
  if (frequency === 'daily') return true;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  if (frequency === 'custom') return Array.isArray(item.customDays) && item.customDays.includes(weekday);
  if (frequency === 'weekdays') return weekday >= 1 && weekday <= 5;
  if (frequency === 'weekends') return weekday === 0 || weekday === 6;
  if (frequency === 'weekly') {
    return Array.isArray(item.customDays) && item.customDays.length
      ? item.customDays.includes(weekday) : weekday === 1;
  }
  return true;
}

function compareAgendaItems(a: ThreadmapItem, b: ThreadmapItem): number {
  const dateA = a.dueDate ?? a.startDate ?? a.myDay ?? '9999-12-31';
  const dateB = b.dueDate ?? b.startDate ?? b.myDay ?? '9999-12-31';
  return dateA.localeCompare(dateB) || (a.startTime ?? '').localeCompare(b.startTime ?? '')
    || b.updatedAt - a.updatedAt;
}

function matchesListFilters(item: ThreadmapItem, input: ListItemsInput): boolean {
  if (input.types?.length && !input.types.includes(item.type)) return false;
  if (input.statuses?.length && !input.statuses.includes(item.status)) return false;
  if (input.parentId !== undefined && item.parentId !== input.parentId) return false;
  if (input.updatedAfter !== undefined && item.updatedAt <= input.updatedAfter) return false;
  if (input.updatedBefore !== undefined && item.updatedAt >= input.updatedBefore) return false;
  if (input.tags?.length) {
    const tags = new Set((item.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
    if (!input.tags.every((tag) => tags.has(tag.toLocaleLowerCase()))) return false;
  }
  return true;
}

function projectSecondary(kind: Exclude<SecondaryDataKind, 'flight'>,
  data: Record<string, unknown>): JsonObject {
  if (kind === 'wishlist') {
    return {
      kind,
      found: true,
      items: sanitizeJsonValue(Array.isArray(data.items) ? data.items.slice(0, 50) : [], {
        stringLimit: 1_000, arrayLimit: 50, keyLimit: 40,
      }),
      duels: sanitizeJsonValue(Array.isArray(data.duels) ? data.duels.slice(0, 50) : [], {
        stringLimit: 500, arrayLimit: 50, keyLimit: 30,
      }),
      partial: (Array.isArray(data.items) && data.items.length > 50)
        || (Array.isArray(data.duels) && data.duels.length > 50),
    };
  }
  if (kind === 'briefing') {
    return {
      kind,
      found: true,
      dailyRecords: sanitizeJsonValue(Array.isArray(data.dailyRecords)
        ? data.dailyRecords.slice(0, 30) : [], { stringLimit: 4_000, arrayLimit: 30, keyLimit: 50 }),
      weeklyRecords: sanitizeJsonValue(Array.isArray(data.weeklyRecords)
        ? data.weeklyRecords.slice(0, 12) : [], { stringLimit: 4_000, arrayLimit: 12, keyLimit: 50 }),
      partial: (Array.isArray(data.dailyRecords) && data.dailyRecords.length > 30)
        || (Array.isArray(data.weeklyRecords) && data.weeklyRecords.length > 12),
    };
  }
  if (kind === 'dispatch') {
    return {
      kind,
      found: true,
      plans: sanitizeJsonValue(Array.isArray(data.plans) ? data.plans.slice(0, 31) : [], {
        stringLimit: 2_000, arrayLimit: 100, keyLimit: 100,
      }),
      partial: Array.isArray(data.plans) && data.plans.length > 31,
    };
  }
  if (kind === 'settings') {
    const source = ownRecord(data.settings) ? data.settings : data;
    const allow = [
      'timezone', 'weekStart', 'dateFormat', 'timeFormat', 'confirmBeforeDelete',
      'confirmBeforeArchive', 'focusDuration', 'calendarView', 'calendarDisplay',
      'calendarSyncEnabled', 'defaultPriority', 'defaultItemType', 'theme', 'language',
    ];
    const settings: JsonObject = {};
    for (const key of allow) {
      if (source[key] !== undefined) settings[key] = sanitizeJsonValue(source[key], {
        stringLimit: 200, arrayLimit: 20, keyLimit: 20,
      });
    }
    return { kind, found: true, settings };
  }
  if (kind === 'toolbox') {
    const source = ownRecord(data.enabledTools) ? data.enabledTools : data.enabledTools;
    return {
      kind,
      found: true,
      enabledTools: sanitizeJsonValue(source ?? {}, { stringLimit: 100, arrayLimit: 20, keyLimit: 20 }),
    };
  }
  return {
    kind,
    found: true,
    profile: sanitizeJsonValue(data.profile ?? {}, { stringLimit: 2_000, arrayLimit: 100, keyLimit: 100 }),
  };
}
