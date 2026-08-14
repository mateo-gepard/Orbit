import {
  DalError,
  MCP_LIMITS,
  type AuditEvent,
  type CreateItemInput,
  type ItemStatus,
  type ItemType,
  type JsonObject,
  type JsonValue,
  type QuotaKind,
  type SecondaryDataKind,
  type ThreadmapDataAccess,
  type UpdateItemPatch,
  sanitizeJsonValue,
  validateClientRequestId,
  validateCreateItemInput,
  validateDate,
  validateItemId,
  validateRevision,
  validateTimezone,
  validateUpdateItemPatch,
} from './dal';

export const THREADMAP_MCP_SCOPES = Object.freeze({
  read: 'threadmap.read',
  write: 'threadmap.write',
  delete: 'threadmap.delete',
});

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  securitySchemes: Array<{ type: 'oauth2'; scopes: string[] }>;
  annotations: McpToolAnnotations;
}

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpToolCallResult {
  content: McpTextContent[];
  structuredContent: JsonObject;
  isError?: boolean;
}

export class UnknownMcpToolError extends Error {
  constructor(readonly toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = 'UnknownMcpToolError';
  }
}

export class McpToolArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolArgumentsError';
  }
}

interface ToolDescriptor {
  definition: McpToolDefinition;
  requiredScope: string;
  quotaKind: QuotaKind;
  handler: (argumentsValue: unknown) => Promise<unknown>;
}

const ITEM_ID_PATTERN = '^[A-Za-z0-9_-]{1,200}$';
const UUID_V4_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const TIME_PATTERN = '^(?:[01]\\d|2[0-3]):[0-5]\\d$';
const ITEM_TYPES: ItemType[] = ['task', 'project', 'habit', 'event', 'goal', 'note'];
const ITEM_STATUSES: ItemStatus[] = ['active', 'waiting', 'done', 'archived'];

type JsonSchema = Record<string, unknown>;

const STRING: JsonSchema = { type: 'string' };
const ITEM_ID_SCHEMA: JsonSchema = { type: 'string', pattern: ITEM_ID_PATTERN, maxLength: 200 };
const REVISION_SCHEMA: JsonSchema = { type: 'integer', minimum: 1 };
const REQUEST_ID_SCHEMA: JsonSchema = {
  type: 'string', pattern: UUID_V4_PATTERN, description: 'A fresh RFC 4122 version 4 UUID for idempotency.',
};
const DATE_SCHEMA: JsonSchema = { type: 'string', pattern: DATE_PATTERN, format: 'date' };
const TIME_SCHEMA: JsonSchema = { type: 'string', pattern: TIME_PATTERN };
const OUTPUT_OBJECT_SCHEMA: JsonSchema = { type: 'object', additionalProperties: true };

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

function nullable(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: 'null' }] };
}

const TAGS_SCHEMA: JsonSchema = {
  type: 'array',
  maxItems: MCP_LIMITS.tags,
  uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: MCP_LIMITS.tag },
};

const CHECKLIST_SCHEMA: JsonSchema = {
  type: 'array',
  maxItems: MCP_LIMITS.checklist,
  items: objectSchema({
    id: ITEM_ID_SCHEMA,
    text: { type: 'string', minLength: 1, maxLength: MCP_LIMITS.checklistText },
    done: { type: 'boolean' },
  }, ['id', 'text', 'done']),
};

const ITEM_MUTABLE_PROPERTIES: Record<string, JsonSchema> = {
  title: { type: 'string', minLength: 1, maxLength: MCP_LIMITS.title },
  content: { type: 'string', maxLength: MCP_LIMITS.content },
  status: { type: 'string', enum: ITEM_STATUSES },
  dueDate: DATE_SCHEMA,
  priority: { type: 'string', maxLength: 32 },
  assignee: { type: 'string', maxLength: 200 },
  checklist: CHECKLIST_SCHEMA,
  emoji: { type: 'string', maxLength: 32 },
  color: { type: 'string', maxLength: 64 },
  tier: { type: 'string', maxLength: 64 },
  frequency: { type: 'string', maxLength: 64 },
  customDays: {
    type: 'array', maxItems: 7, uniqueItems: true,
    items: { type: 'integer', minimum: 0, maximum: 6 },
  },
  habitTime: TIME_SCHEMA,
  startDate: DATE_SCHEMA,
  endDate: DATE_SCHEMA,
  startTime: TIME_SCHEMA,
  endTime: TIME_SCHEMA,
  timeframe: { type: 'string', maxLength: 100 },
  metric: { type: 'string', maxLength: 500 },
  noteSubtype: { type: 'string', maxLength: 64 },
  parentId: ITEM_ID_SCHEMA,
  tags: TAGS_SCHEMA,
  myDay: DATE_SCHEMA,
};

const CREATE_ITEM_SCHEMA = objectSchema({
  type: { type: 'string', enum: ITEM_TYPES },
  ...ITEM_MUTABLE_PROPERTIES,
}, ['type', 'title']);

const UPDATE_PATCH_SCHEMA = objectSchema(Object.fromEntries(
  Object.entries(ITEM_MUTABLE_PROPERTIES).map(([key, schema]) => [
    key,
    key === 'title' ? schema : nullable(schema),
  ])
));
(UPDATE_PATCH_SCHEMA as { minProperties?: number }).minProperties = 1;

const LIST_FILTER_PROPERTIES: Record<string, JsonSchema> = {
  limit: { type: 'integer', minimum: 1, maximum: MCP_LIMITS.pageSize, default: 25 },
  cursor: { type: 'string', minLength: 4, maxLength: 512 },
  types: { type: 'array', maxItems: ITEM_TYPES.length, uniqueItems: true,
    items: { type: 'string', enum: ITEM_TYPES } },
  statuses: { type: 'array', maxItems: ITEM_STATUSES.length, uniqueItems: true,
    items: { type: 'string', enum: ITEM_STATUSES } },
  tags: TAGS_SCHEMA,
  parent_id: ITEM_ID_SCHEMA,
  updated_after: { type: 'integer', minimum: 0 },
  updated_before: { type: 'integer', minimum: 0 },
};

/**
 * Every tool's required scope, recorded as the definitions are built. This is
 * the authority for enforcement; `securitySchemes` on the definition is only
 * what gets advertised.
 */
const TOOL_SCOPES = new Map<string, string>();

function definition(options: {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  scope: string;
  kind: QuotaKind;
  destructive?: boolean;
  idempotent?: boolean;
}): McpToolDefinition {
  TOOL_SCOPES.set(options.name, options.scope);
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: OUTPUT_OBJECT_SCHEMA,
    securitySchemes: [{ type: 'oauth2', scopes: [options.scope] }],
    annotations: {
      title: options.title,
      readOnlyHint: options.kind === 'read',
      destructiveHint: Boolean(options.destructive),
      idempotentHint: Boolean(options.idempotent),
      openWorldHint: false,
    },
  };
}

const SECONDARY: Array<{ name: string; title: string; kind: SecondaryDataKind; description: string }> = [
  { name: 'get_wishlist', title: 'Get wishlist', kind: 'wishlist',
    description: 'Read a bounded, typed projection of wishlist items and duel history. Call this only for questions about things the owner wants to buy or has ranked against each other.' },
  { name: 'get_abitur_profile', title: 'Get Abitur profile', kind: 'abitur',
    description: 'Read the bounded Abitur planning profile without account contact fields. Call this only for questions about the owner\u2019s German school-leaving exams — subjects, semester results, projected grade.' },
  { name: 'get_flight_logs', title: 'Get flight logs', kind: 'flight',
    description: 'Read up to 50 owner-scoped flight logs. Call this only for questions about focus or deep-work sessions; these are timed work sessions, not air travel.' },
  { name: 'get_briefing_journal', title: 'Get briefing journal', kind: 'briefing',
    description: 'Read a bounded projection of recent daily and weekly briefing records. Call this for questions about what past briefings said, not to build a new summary — use get_life_overview for that.' },
  { name: 'get_dispatch_plans', title: 'Get dispatch plans', kind: 'dispatch',
    description: 'Read up to 31 bounded dispatch plans. Call this for questions about how specific days were time-blocked.' },
  { name: 'get_settings', title: 'Get organizational settings', kind: 'settings',
    description: 'Read an allowlisted projection of organizational preferences; email, bio, tokens, and secrets are excluded. Call this when behaviour depends on the owner\u2019s configuration — week start, language, working hours — not to answer questions about them as a person.' },
  { name: 'get_toolbox', title: 'Get toolbox', kind: 'toolbox',
    description: 'Read enabled Threadmap toolbox feature flags. Call this to check whether a tool is switched on before suggesting it.' },
];

const DEFINITION_SPECS = [
  definition({
    name: 'get_life_overview', title: 'Get life overview', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'Return bounded counts and current highlights across the authenticated owner’s Threadmap items. '
      + 'Call this first for open-ended questions about how things stand overall — "how am I doing", '
      + '"what should I focus on", "give me a summary". It answers in one call what would otherwise '
      + 'take several list_items calls. Do not use it to find a specific item.',
    inputSchema: objectSchema({ date: DATE_SCHEMA, timezone: { type: 'string', minLength: 1, maxLength: 100 } }),
  }),
  definition({
    name: 'get_agenda', title: 'Get agenda', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'Return tasks, events, and scheduled habits in an inclusive date range of at most 31 days. '
      + 'Call this for any question anchored to time — today, tomorrow, this week, a named date or a '
      + 'span. Prefer it over list_items whenever the user names a period, because it merges dated '
      + 'tasks, events and habit schedules that list_items returns separately.',
    inputSchema: objectSchema({ start_date: DATE_SCHEMA, end_date: DATE_SCHEMA,
      timezone: { type: 'string', minLength: 1, maxLength: 100 } }, ['start_date', 'end_date']),
  }),
  definition({
    name: 'list_items', title: 'List items', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'List owner-scoped items in reverse update order with opaque cursor pagination and optional filters. '
      + 'Call this to enumerate by structure rather than by words or dates: all items of a type, '
      + 'everything under a parent, everything with a tag or status. Use search_items when the user '
      + 'gave you words to match, and get_agenda when they gave you a date range.',
    inputSchema: objectSchema(LIST_FILTER_PROPERTIES),
  }),
  definition({
    name: 'search_items', title: 'Search items', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'Search a bounded owner-scoped item window by plain-text title, content, and tags. '
      + 'Call this when the user refers to something by name or subject rather than by structure — '
      + '"the note about the boiler", "anything mentioning Lisbon". It searches a bounded recent '
      + 'window, so use list_items with filters when you need exhaustive results.',
    inputSchema: objectSchema({ query: { type: 'string', minLength: 1, maxLength: 200 }, ...LIST_FILTER_PROPERTIES }, ['query']),
  }),
  definition({
    name: 'get_item', title: 'Get item', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'Get one owner-scoped item, including its full content, checklist and relationships. '
      + 'Call this once you have an item_id and need detail the list projections omit, and always '
      + 'before an update: the response carries the revision that update_item, complete_item, '
      + 'archive_item and preview_delete_item all require. File contents are excluded.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA }, ['item_id']),
  }),
  definition({
    name: 'create_item', title: 'Create item', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Create an owner-scoped Threadmap item with a deterministic id. Requires a unique idempotency UUID. '
      + 'Call this when the user asks to add, capture or note something down. Generate a fresh '
      + 'client_request_id per distinct creation and reuse it verbatim on a retry, so a repeat never '
      + 'produces a second item.',
    inputSchema: objectSchema({ item: CREATE_ITEM_SCHEMA, client_request_id: REQUEST_ID_SCHEMA }, ['item', 'client_request_id']),
  }),
  definition({
    name: 'update_item', title: 'Update item', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Update mutable item fields only when expected_revision matches. Null removes an optional field. '
      + 'Call this to change an item in place — retitle, reschedule, re-tag, edit content. Read the '
      + 'item first for its revision; a mismatch means someone else changed it, so re-read rather '
      + 'than retrying with the old value. Use complete_item to finish something and archive_item to '
      + 'put it away.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA, expected_revision: REVISION_SCHEMA,
      patch: UPDATE_PATCH_SCHEMA, client_request_id: REQUEST_ID_SCHEMA },
    ['item_id', 'expected_revision', 'patch', 'client_request_id']),
  }),
  definition({
    name: 'complete_item', title: 'Complete item', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Mark an item done when expected_revision matches. '
      + 'Call this whenever the user says something is finished, done or handled. Prefer it over '
      + 'update_item for completion: it also records the completion time. For a habit on a specific '
      + 'day use set_habit_completion instead.',
    inputSchema: revisionMutationSchema(),
  }),
  definition({
    name: 'archive_item', title: 'Archive item', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true, destructive: true,
    description: 'Archive an item when expected_revision matches. This is reversible in Threadmap. '
      + 'Call this when the user wants something out of the way but not gone — cancelled, no longer '
      + 'relevant, tidying up. Prefer it over deletion in every case where the user has not clearly '
      + 'asked for permanent removal.',
    inputSchema: revisionMutationSchema(),
  }),
  definition({
    name: 'set_habit_completion', title: 'Set habit completion', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Set or clear a date in a habit’s completion history with optimistic concurrency. '
      + 'Call this for any "did/didn\u2019t do my habit" statement, including about a past day. This is '
      + 'the only correct way to tick a habit — complete_item would end the habit itself rather than '
      + 'record one day of it.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA, expected_revision: REVISION_SCHEMA,
      date: DATE_SCHEMA, completed: { type: 'boolean' }, client_request_id: REQUEST_ID_SCHEMA },
    ['item_id', 'expected_revision', 'date', 'completed', 'client_request_id']),
  }),
  definition({
    name: 'link_items', title: 'Link items', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Atomically create a symmetric relationship between two owner-scoped items. '
      + 'Call this when the user says two things are related, or when you create something that '
      + 'belongs with an existing item. This makes a peer link; to place an item *under* a project or '
      + 'goal, set parent_id through create_item or update_item instead.',
    inputSchema: linkMutationSchema(),
  }),
  definition({
    name: 'unlink_items', title: 'Unlink items', kind: 'write', scope: THREADMAP_MCP_SCOPES.write,
    idempotent: true,
    description: 'Atomically remove a symmetric relationship between two owner-scoped items. '
      + 'Call this when a link is wrong or no longer meaningful. It removes only the relationship; '
      + 'both items survive untouched.',
    inputSchema: linkMutationSchema(),
  }),
  definition({
    name: 'list_tags', title: 'List tags', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'List bounded owner-scoped custom and in-use item tags. '
      + 'Call this before filtering or tagging, to use the vocabulary the owner already has rather '
      + 'than inventing a near-duplicate tag.',
    inputSchema: objectSchema({}),
  }),
  ...secondaryDefinitions(),
  definition({
    name: 'list_files_metadata', title: 'List file metadata', kind: 'read', scope: THREADMAP_MCP_SCOPES.read,
    description: 'Return attachment names, MIME types, sizes, and timestamps only. URLs, paths, and file contents '
      + 'are never returned. Call this to tell the user what is attached to an item; you cannot read '
      + 'or fetch the files themselves, so do not offer to summarise their contents.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA, limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }),
  }),
  definition({
    name: 'preview_delete_item', title: 'Preview item deletion', kind: 'delete', scope: THREADMAP_MCP_SCOPES.delete,
    destructive: false,
    description: 'Preview deletion impact and mint a short-lived, owner/client/revision-bound single-use confirmation '
      + 'token. Always call this before confirm_delete_item, and show the user what it reports — it '
      + 'names the children and links that would go with the item. Consider archive_item instead '
      + 'unless permanent removal was explicitly asked for.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA, expected_revision: REVISION_SCHEMA }, ['item_id', 'expected_revision']),
  }),
  definition({
    name: 'confirm_delete_item', title: 'Confirm item deletion', kind: 'delete', scope: THREADMAP_MCP_SCOPES.delete,
    destructive: true, idempotent: true,
    description: 'Permanently delete the exact previewed revision with its short-lived token and an idempotency UUID. '
      + 'Call this only after preview_delete_item and only once the user has confirmed the impact it '
      + 'reported. This cannot be undone; archive_item can.',
    inputSchema: objectSchema({ item_id: ITEM_ID_SCHEMA, expected_revision: REVISION_SCHEMA,
      confirmation_token: { type: 'string', pattern: '^tmdc_[A-Za-z0-9_-]{43}$', minLength: 48, maxLength: 48 },
      client_request_id: REQUEST_ID_SCHEMA },
    ['item_id', 'expected_revision', 'confirmation_token', 'client_request_id']),
  }),
] satisfies McpToolDefinition[];

export const THREADMAP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = Object.freeze(DEFINITION_SPECS);

/**
 * The authorization record for each tool, built on the server from the same
 * `scope:` field the definitions are built from.
 *
 * The registry used to derive a tool's required scope by reading
 * `tool.securitySchemes[0].scopes[0]` — the very object that is also serialized
 * to clients. Deriving an authorization decision from the wire payload couples
 * two things that should be free to move independently: a change to what is
 * advertised should never be able to change what is enforced.
 */
export interface ToolAuthorization {
  requiredScope: string;
  quotaKind: QuotaKind;
}

function quotaKindForScope(scope: string): QuotaKind {
  if (scope === THREADMAP_MCP_SCOPES.delete) return 'delete';
  if (scope === THREADMAP_MCP_SCOPES.write) return 'write';
  return 'read';
}

export const THREADMAP_TOOL_AUTHORIZATION: ReadonlyMap<string, ToolAuthorization> = new Map(
  DEFINITION_SPECS.map((tool) => {
    const requiredScope = TOOL_SCOPES.get(tool.name);
    if (!requiredScope) throw new Error(`Missing scope for ${tool.name}.`);
    return [tool.name, { requiredScope, quotaKind: quotaKindForScope(requiredScope) }];
  })
);

/** The scope a tool requires, from the server-side map. */
export function requiredScopeFor(toolName: string): string | undefined {
  return THREADMAP_TOOL_AUTHORIZATION.get(toolName)?.requiredScope;
}

function revisionMutationSchema(): JsonSchema {
  return objectSchema({ item_id: ITEM_ID_SCHEMA, expected_revision: REVISION_SCHEMA,
    client_request_id: REQUEST_ID_SCHEMA }, ['item_id', 'expected_revision', 'client_request_id']);
}

function linkMutationSchema(): JsonSchema {
  return objectSchema({
    item_id_a: ITEM_ID_SCHEMA,
    expected_revision_a: REVISION_SCHEMA,
    item_id_b: ITEM_ID_SCHEMA,
    expected_revision_b: REVISION_SCHEMA,
    client_request_id: REQUEST_ID_SCHEMA,
  }, ['item_id_a', 'expected_revision_a', 'item_id_b', 'expected_revision_b', 'client_request_id']);
}

function secondaryDefinitions(): McpToolDefinition[] {
  return SECONDARY.map((item) => definition({
    name: item.name,
    title: item.title,
    kind: 'read',
    scope: THREADMAP_MCP_SCOPES.read,
    description: item.description,
    inputSchema: objectSchema({}),
  }));
}

function argumentsObject(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  const args = value === undefined ? {} : value;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new McpToolArgumentsError('arguments must be an object.');
  }
  const record = args as Record<string, unknown>;
  const allowedSet = new Set(allowed);
  const extras = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (extras.length) throw new McpToolArgumentsError(`Unsupported argument fields: ${extras.slice(0, 5).join(', ')}.`);
  const missing = required.filter((key) => record[key] === undefined);
  if (missing.length) throw new McpToolArgumentsError(`Missing required argument fields: ${missing.join(', ')}.`);
  return record;
}

function optionalInteger(value: unknown, label: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new McpToolArgumentsError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
}

function optionalString(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new McpToolArgumentsError(`${label} must be a non-empty string no longer than ${maximum} characters.`);
  }
  return value;
}

function optionalEnumArray<T extends string>(value: unknown, label: string,
  allowed: readonly T[]): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > allowed.length
      || value.some((member) => typeof member !== 'string' || !allowed.includes(member as T))) {
    throw new McpToolArgumentsError(`${label} contains an invalid value.`);
  }
  if (new Set(value).size !== value.length) throw new McpToolArgumentsError(`${label} must not contain duplicates.`);
  return value as T[];
}

function optionalTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const probe = validateCreateItemInput({ type: 'task', title: 'probe', tags: value });
  return probe.tags;
}

function listInput(args: Record<string, unknown>) {
  const updatedAfter = optionalInteger(args.updated_after, 'updated_after', 0, Number.MAX_SAFE_INTEGER);
  const updatedBefore = optionalInteger(args.updated_before, 'updated_before', 0, Number.MAX_SAFE_INTEGER);
  if (updatedAfter !== undefined && updatedBefore !== undefined && updatedAfter > updatedBefore) {
    throw new McpToolArgumentsError('updated_after must not be later than updated_before.');
  }
  return {
    limit: optionalInteger(args.limit, 'limit', 1, MCP_LIMITS.pageSize),
    cursor: optionalString(args.cursor, 'cursor', 512),
    types: optionalEnumArray(args.types, 'types', ITEM_TYPES),
    statuses: optionalEnumArray(args.statuses, 'statuses', ITEM_STATUSES),
    tags: optionalTags(args.tags),
    parentId: args.parent_id === undefined ? undefined : validateItemId(args.parent_id, 'parent_id'),
    updatedAfter,
    updatedBefore,
  };
}

function targetIdsFromArguments(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return ['item_id', 'item_id_a', 'item_id_b'].flatMap((key) => {
    const member = record[key];
    return typeof member === 'string' && new RegExp(ITEM_ID_PATTERN).test(member) ? [member] : [];
  });
}

function changedFieldsFromArguments(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const patch = (value as Record<string, unknown>).patch;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return [];
  return Object.keys(patch as Record<string, unknown>).filter((key) => /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key));
}

function requestIdFromArguments(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const member = (value as Record<string, unknown>).client_request_id;
  try { return member === undefined ? undefined : validateClientRequestId(member); } catch { return undefined; }
}

function fitStructuredOutput(value: unknown): JsonObject {
  const attempts = [
    { stringLimit: 12_000, arrayLimit: 500, keyLimit: 500 },
    { stringLimit: 2_000, arrayLimit: 100, keyLimit: 200 },
    { stringLimit: 500, arrayLimit: 30, keyLimit: 100 },
    { stringLimit: 200, arrayLimit: 10, keyLimit: 50 },
  ];
  for (const attempt of attempts) {
    const candidate = sanitizeJsonValue(value, attempt);
    const object = isJsonObject(candidate) ? candidate : { value: candidate };
    if (Buffer.byteLength(JSON.stringify(object), 'utf8') <= MCP_LIMITS.outputBytes) return object;
  }
  return {
    truncated: true,
    message: 'The result exceeded the MCP output limit. Narrow the query or use pagination.',
  };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function successResult(value: unknown): McpToolCallResult {
  const structuredContent = fitStructuredOutput(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function errorResult(error: unknown): McpToolCallResult {
  let code = 'internal_error';
  let message = 'The tool could not complete the request.';
  let retryable = false;
  let details: JsonValue | undefined;
  if (error instanceof DalError) {
    code = error.code;
    message = error.message;
    retryable = error.retryable;
    details = error.details;
  } else if (error instanceof McpToolArgumentsError) {
    code = 'invalid_input';
    message = error.message;
  }
  const structuredContent = fitStructuredOutput({
    error: {
      code,
      message: message.slice(0, 1_000),
      retryable,
      ...(details !== undefined ? { details } : {}),
    },
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

function requiredScopeError(scope: string): McpToolCallResult {
  return errorResult(new McpToolArgumentsError(`The access token is missing the required ${scope} scope.`));
}

export class ThreadmapToolRegistry {
  private readonly descriptors: Map<string, ToolDescriptor>;

  constructor(private readonly data: ThreadmapDataAccess) {
    const handlers = createHandlers(data);
    this.descriptors = new Map(THREADMAP_TOOL_DEFINITIONS.map((tool) => {
      const handler = handlers.get(tool.name);
      if (!handler) throw new Error(`Missing handler for ${tool.name}.`);
      // From the server-side map, not from the object we serialize to clients.
      const authorization = THREADMAP_TOOL_AUTHORIZATION.get(tool.name);
      if (!authorization) throw new Error(`Missing authorization for ${tool.name}.`);
      return [tool.name, {
        definition: tool,
        requiredScope: authorization.requiredScope,
        quotaKind: authorization.quotaKind,
        handler,
      }];
    }));
  }

  list(): readonly McpToolDefinition[] {
    return THREADMAP_TOOL_DEFINITIONS;
  }

  async call(name: string, argumentsValue: unknown): Promise<McpToolCallResult> {
    const descriptor = this.descriptors.get(name);
    if (!descriptor) throw new UnknownMcpToolError(name);
    const startedAt = Date.now();
    let resultCode = 'ok';
    let success = false;
    try {
      if (!this.data.principal.scopes.includes(descriptor.requiredScope)) {
        resultCode = 'insufficient_scope';
        return requiredScopeError(descriptor.requiredScope);
      }
      await this.data.consumeQuota(descriptor.quotaKind);
      const value = await descriptor.handler(argumentsValue);
      success = true;
      return successResult(value);
    } catch (error) {
      resultCode = error instanceof DalError ? error.code
        : error instanceof McpToolArgumentsError ? 'invalid_input' : 'internal_error';
      return errorResult(error);
    } finally {
      const event: AuditEvent = {
        tool: name,
        kind: descriptor.quotaKind,
        success,
        resultCode,
        durationMs: Date.now() - startedAt,
        requestId: requestIdFromArguments(argumentsValue),
        targetIds: targetIdsFromArguments(argumentsValue),
        changedFields: changedFieldsFromArguments(argumentsValue),
      };
      try { await this.data.recordAudit(event); } catch { /* Audit failure must not expose or duplicate user mutations. */ }
    }
  }
}

export function createThreadmapToolRegistry(data: ThreadmapDataAccess): ThreadmapToolRegistry {
  return new ThreadmapToolRegistry(data);
}

type ToolHandler = (argumentsValue: unknown) => Promise<unknown>;

function createHandlers(data: ThreadmapDataAccess): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set('get_life_overview', async (value) => {
    const args = argumentsObject(value, ['date', 'timezone']);
    return data.getLifeOverview({
      date: args.date === undefined ? undefined : validateDate(args.date, 'date'),
      timezone: args.timezone === undefined ? undefined : validateTimezone(args.timezone),
    });
  });
  handlers.set('get_agenda', async (value) => {
    const args = argumentsObject(value, ['start_date', 'end_date', 'timezone'], ['start_date', 'end_date']);
    return data.getAgenda({
      startDate: validateDate(args.start_date, 'start_date'),
      endDate: validateDate(args.end_date, 'end_date'),
      timezone: args.timezone === undefined ? undefined : validateTimezone(args.timezone),
    });
  });
  handlers.set('list_items', async (value) => {
    const args = argumentsObject(value, Object.keys(LIST_FILTER_PROPERTIES));
    return data.listItems(listInput(args));
  });
  handlers.set('search_items', async (value) => {
    const args = argumentsObject(value, ['query', ...Object.keys(LIST_FILTER_PROPERTIES)], ['query']);
    if (typeof args.query !== 'string' || args.query.trim().length < 1 || args.query.length > 200) {
      throw new McpToolArgumentsError('query must contain between 1 and 200 characters.');
    }
    return data.searchItems({ query: args.query.trim(), ...listInput(args) });
  });
  handlers.set('get_item', async (value) => {
    const args = argumentsObject(value, ['item_id'], ['item_id']);
    return data.getItem(validateItemId(args.item_id));
  });
  handlers.set('create_item', async (value) => {
    const args = argumentsObject(value, ['item', 'client_request_id'], ['item', 'client_request_id']);
    const item: CreateItemInput = validateCreateItemInput(args.item);
    return data.createItem(item, validateClientRequestId(args.client_request_id));
  });
  handlers.set('update_item', async (value) => {
    const args = argumentsObject(value, ['item_id', 'expected_revision', 'patch', 'client_request_id'],
      ['item_id', 'expected_revision', 'patch', 'client_request_id']);
    const patch: UpdateItemPatch = validateUpdateItemPatch(args.patch);
    return data.updateItem(validateItemId(args.item_id), validateRevision(args.expected_revision), patch,
      validateClientRequestId(args.client_request_id));
  });
  handlers.set('complete_item', revisionMutationHandler(data.completeItem.bind(data)));
  handlers.set('archive_item', revisionMutationHandler(data.archiveItem.bind(data)));
  handlers.set('set_habit_completion', async (value) => {
    const args = argumentsObject(value,
      ['item_id', 'expected_revision', 'date', 'completed', 'client_request_id'],
      ['item_id', 'expected_revision', 'date', 'completed', 'client_request_id']);
    if (typeof args.completed !== 'boolean') throw new McpToolArgumentsError('completed must be boolean.');
    return data.setHabitCompletion(validateItemId(args.item_id), validateRevision(args.expected_revision),
      validateDate(args.date, 'date'), args.completed, validateClientRequestId(args.client_request_id));
  });
  handlers.set('link_items', linkMutationHandler(data.linkItems.bind(data)));
  handlers.set('unlink_items', linkMutationHandler(data.unlinkItems.bind(data)));
  handlers.set('list_tags', async (value) => {
    argumentsObject(value, []);
    return data.listTags();
  });
  for (const item of SECONDARY) {
    handlers.set(item.name, async (value) => {
      argumentsObject(value, []);
      return data.getSecondaryData(item.kind);
    });
  }
  handlers.set('list_files_metadata', async (value) => {
    const args = argumentsObject(value, ['item_id', 'limit']);
    return data.listFilesMetadata(
      args.item_id === undefined ? undefined : validateItemId(args.item_id),
      optionalInteger(args.limit, 'limit', 1, 100)
    );
  });
  handlers.set('preview_delete_item', async (value) => {
    const args = argumentsObject(value, ['item_id', 'expected_revision'], ['item_id', 'expected_revision']);
    return data.previewDeleteItem(validateItemId(args.item_id), validateRevision(args.expected_revision));
  });
  handlers.set('confirm_delete_item', async (value) => {
    const args = argumentsObject(value,
      ['item_id', 'expected_revision', 'confirmation_token', 'client_request_id'],
      ['item_id', 'expected_revision', 'confirmation_token', 'client_request_id']);
    if (typeof args.confirmation_token !== 'string') {
      throw new McpToolArgumentsError('confirmation_token must be a string.');
    }
    return data.confirmDeleteItem(validateItemId(args.item_id), validateRevision(args.expected_revision),
      args.confirmation_token, validateClientRequestId(args.client_request_id));
  });

  return handlers;
}

function revisionMutationHandler(callback: (itemId: string, expectedRevision: number,
  clientRequestId: string) => Promise<unknown>): ToolHandler {
  return async (value) => {
    const args = argumentsObject(value, ['item_id', 'expected_revision', 'client_request_id'],
      ['item_id', 'expected_revision', 'client_request_id']);
    return callback(validateItemId(args.item_id), validateRevision(args.expected_revision),
      validateClientRequestId(args.client_request_id));
  };
}

function linkMutationHandler(callback: (itemIdA: string, expectedRevisionA: number,
  itemIdB: string, expectedRevisionB: number, clientRequestId: string) => Promise<unknown>): ToolHandler {
  return async (value) => {
    const args = argumentsObject(value,
      ['item_id_a', 'expected_revision_a', 'item_id_b', 'expected_revision_b', 'client_request_id'],
      ['item_id_a', 'expected_revision_a', 'item_id_b', 'expected_revision_b', 'client_request_id']);
    return callback(
      validateItemId(args.item_id_a, 'item_id_a'),
      validateRevision(args.expected_revision_a, 'expected_revision_a'),
      validateItemId(args.item_id_b, 'item_id_b'),
      validateRevision(args.expected_revision_b, 'expected_revision_b'),
      validateClientRequestId(args.client_request_id)
    );
  };
}
