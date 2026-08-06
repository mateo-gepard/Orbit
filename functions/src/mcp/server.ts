import type { Firestore } from 'firebase-admin/firestore';
import type { OAuthPrincipal } from './oauth';
import {
  ThreadmapDal,
  type ThreadmapDalDependencies,
  type ThreadmapDataAccess,
} from './dal';
import {
  THREADMAP_TOOL_DEFINITIONS,
  ThreadmapToolRegistry,
  UnknownMcpToolError,
  createThreadmapToolRegistry,
} from './tools';

export const MCP_PROTOCOL_VERSION = '2025-11-25';
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = Object.freeze([
  MCP_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
]);
export const MCP_TOOLS_LIST_PAGE_SIZE = 20;
export const MCP_MAX_REQUEST_BYTES = 256_000;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface McpServerContext {
  principal: OAuthPrincipal;
  /** Value from the MCP-Protocol-Version request header, if present. */
  protocolVersion?: string;
}

export interface McpDispatchResult {
  status: 200 | 202;
  headers: Readonly<Record<string, string>>;
  body?: JsonRpcResponse;
}

export interface McpServerInfo {
  name: string;
  title?: string;
  version: string;
}

export interface StatelessMcpServerOptions {
  createDataAccess: (principal: OAuthPrincipal) => ThreadmapDataAccess | Promise<ThreadmapDataAccess>;
  serverInfo?: McpServerInfo;
  instructions?: string;
}

export interface ThreadmapMcpServerOptions {
  dal?: ThreadmapDalDependencies;
  serverInfo?: McpServerInfo;
  instructions?: string;
}

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
});

const EMPTY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
});

const DEFAULT_SERVER_INFO: McpServerInfo = Object.freeze({
  name: 'threadmap',
  title: 'Threadmap',
  version: '1.0.0',
});

const DEFAULT_INSTRUCTIONS = [
  'Threadmap MCP is owner-scoped. Read current revisions before mutations.',
  'Every write requires a fresh client_request_id UUID and expected_revision where applicable.',
  'Deletion requires preview_delete_item followed by confirm_delete_item with the returned short-lived token.',
  'Item HTML is returned as plain text, and attachments are exposed as metadata only.',
].join(' ');

class RpcValidationError extends Error {
  constructor(readonly code: -32600 | -32602, message: string) {
    super(message);
    this.name = 'RpcValidationError';
  }
}

export class StatelessMcpServer {
  private readonly createDataAccess: StatelessMcpServerOptions['createDataAccess'];
  private readonly serverInfo: McpServerInfo;
  private readonly instructions: string;

  constructor(options: StatelessMcpServerOptions) {
    if (typeof options.createDataAccess !== 'function') {
      throw new Error('createDataAccess is required.');
    }
    this.createDataAccess = options.createDataAccess;
    this.serverInfo = validateServerInfo(options.serverInfo ?? DEFAULT_SERVER_INFO);
    this.instructions = validateInstructions(options.instructions ?? DEFAULT_INSTRUCTIONS);
  }

  async handle(message: unknown, context: McpServerContext): Promise<McpDispatchResult> {
    let request: JsonRpcRequest;
    try {
      assertRequestSize(message);
      request = parseJsonRpcRequest(message);
    } catch (error) {
      const validation = error instanceof RpcValidationError
        ? error : new RpcValidationError(-32600, 'Invalid JSON-RPC request.');
      return response(errorResponse(null, validation.code, validation.message));
    }

    const isNotification = !Object.prototype.hasOwnProperty.call(request, 'id');
    const id = request.id ?? null;
    if (isNotification) {
      await this.handleNotification(request, context);
      return { status: 202, headers: EMPTY_HEADERS };
    }

    try {
      if (request.method !== 'initialize') validateContextProtocolVersion(context.protocolVersion);
      const result = await this.executeRequest(request, context);
      return response({ jsonrpc: '2.0', id, result });
    } catch (error) {
      if (error instanceof RpcValidationError) {
        return response(errorResponse(id, error.code, error.message));
      }
      if (error instanceof UnknownMcpToolError) {
        return response(errorResponse(id, -32602, 'Unknown tool name.'));
      }
      return response(errorResponse(id, -32603, 'The MCP server could not complete the request.'));
    }
  }

  private async handleNotification(request: JsonRpcRequest, context: McpServerContext): Promise<void> {
    if (request.method !== 'initialize') {
      try { validateContextProtocolVersion(context.protocolVersion); } catch { return; }
    }
    // JSON-RPC notifications never receive a response. Known MCP notifications are intentionally
    // stateless; unknown notifications are ignored as required by JSON-RPC.
    if (request.method === 'notifications/initialized') {
      if (request.params !== undefined) assertEmptyParams(request.params);
    }
  }

  private async executeRequest(request: JsonRpcRequest, context: McpServerContext): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return this.initialize(request.params);
      case 'ping':
        if (request.params !== undefined) assertEmptyParams(request.params);
        return {};
      case 'tools/list':
        return this.listTools(request.params);
      case 'tools/call':
        return this.callTool(request.params, context);
      default:
        throw new RpcValidationError(-32600 - 1, 'Method not found.');
    }
  }

  private initialize(paramsValue: unknown): unknown {
    const params = requiredObject(paramsValue, 'initialize params');
    assertKeys(params, ['protocolVersion', 'capabilities', 'clientInfo', '_meta'],
      ['protocolVersion', 'capabilities', 'clientInfo']);
    const requestedVersion = boundedString(params.protocolVersion, 'protocolVersion', 32);
    const capabilities = requiredObject(params.capabilities, 'capabilities');
    assertPlainJsonSize(capabilities, 'capabilities', 64_000);
    const clientInfo = requiredObject(params.clientInfo, 'clientInfo');
    assertKeys(clientInfo, ['name', 'title', 'version'], ['name', 'version']);
    boundedString(clientInfo.name, 'clientInfo.name', 200);
    boundedString(clientInfo.version, 'clientInfo.version', 100);
    if (clientInfo.title !== undefined) boundedString(clientInfo.title, 'clientInfo.title', 200);
    const protocolVersion = SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requestedVersion)
      ? requestedVersion : MCP_PROTOCOL_VERSION;
    return {
      protocolVersion,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: this.serverInfo,
      instructions: this.instructions,
    };
  }

  private listTools(paramsValue: unknown): unknown {
    let cursorValue: unknown;
    if (paramsValue !== undefined) {
      const params = requiredObject(paramsValue, 'tools/list params');
      assertKeys(params, ['cursor', '_meta']);
      cursorValue = params.cursor;
    }
    const offset = decodeToolsCursor(cursorValue);
    const tools = THREADMAP_TOOL_DEFINITIONS.slice(offset, offset + MCP_TOOLS_LIST_PAGE_SIZE);
    const nextOffset = offset + tools.length;
    return {
      tools,
      ...(nextOffset < THREADMAP_TOOL_DEFINITIONS.length
        ? { nextCursor: encodeToolsCursor(nextOffset) } : {}),
    };
  }

  private async callTool(paramsValue: unknown, context: McpServerContext): Promise<unknown> {
    const params = requiredObject(paramsValue, 'tools/call params');
    assertKeys(params, ['name', 'arguments', '_meta'], ['name']);
    const name = boundedString(params.name, 'name', 128);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) {
      throw new RpcValidationError(-32602, 'Tool name is invalid.');
    }
    if (params.arguments !== undefined
        && (typeof params.arguments !== 'object' || params.arguments === null
          || Array.isArray(params.arguments))) {
      throw new RpcValidationError(-32602, 'Tool arguments must be an object.');
    }
    const dataAccess = await this.createDataAccess(context.principal);
    const registry: ThreadmapToolRegistry = createThreadmapToolRegistry(dataAccess);
    return registry.call(name, params.arguments);
  }
}

export function createStatelessMcpServer(options: StatelessMcpServerOptions): StatelessMcpServer {
  return new StatelessMcpServer(options);
}

export function createThreadmapMcpServer(firestore: Firestore,
  options: ThreadmapMcpServerOptions = {}): StatelessMcpServer {
  return createStatelessMcpServer({
    createDataAccess: (principal) => new ThreadmapDal(firestore, principal, options.dal),
    serverInfo: options.serverInfo,
    instructions: options.instructions,
  });
}

function response(body: JsonRpcResponse): McpDispatchResult {
  return { status: 200, headers: JSON_HEADERS, body };
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RpcValidationError(-32600, 'JSON-RPC request must be an object.');
  }
  const request = value as Record<string, unknown>;
  assertKeys(request, ['jsonrpc', 'id', 'method', 'params']);
  if (request.jsonrpc !== '2.0') throw new RpcValidationError(-32600, 'jsonrpc must equal 2.0.');
  if (typeof request.method !== 'string' || request.method.length < 1 || request.method.length > 200) {
    throw new RpcValidationError(-32600, 'method is invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(request, 'id') && !validRequestId(request.id)) {
    throw new RpcValidationError(-32600, 'id must be a string, integer, or null.');
  }
  return request as unknown as JsonRpcRequest;
}

function validRequestId(value: unknown): value is JsonRpcId {
  return value === null || (typeof value === 'string' && value.length <= 200)
    || (typeof value === 'number' && Number.isSafeInteger(value));
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RpcValidationError(-32602, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertEmptyParams(value: unknown): void {
  const params = requiredObject(value, 'params');
  assertKeys(params, ['_meta']);
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[],
  required: readonly string[] = []): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    throw new RpcValidationError(-32602, 'Request parameters contain unsupported fields.');
  }
  if (required.some((key) => record[key] === undefined)) {
    throw new RpcValidationError(-32602, 'Request parameters are missing required fields.');
  }
}

function boundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
      || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new RpcValidationError(-32602, `${label} is invalid.`);
  }
  return value;
}

function validateContextProtocolVersion(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(value)) {
    throw new RpcValidationError(-32600, 'Unsupported MCP-Protocol-Version header.');
  }
}

function assertRequestSize(value: unknown): void {
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MCP_MAX_REQUEST_BYTES) {
      throw new RpcValidationError(-32600, 'JSON-RPC request is too large.');
    }
  } catch (error) {
    if (error instanceof RpcValidationError) throw error;
    throw new RpcValidationError(-32600, 'JSON-RPC request is not serializable.');
  }
}

function assertPlainJsonSize(value: unknown, label: string, maximum: number): void {
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maximum) {
      throw new RpcValidationError(-32602, `${label} is too large.`);
    }
  } catch (error) {
    if (error instanceof RpcValidationError) throw error;
    throw new RpcValidationError(-32602, `${label} is invalid.`);
  }
}

function encodeToolsCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeToolsCursor(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || value.length < 4 || value.length > 100
      || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RpcValidationError(-32602, 'cursor is invalid.');
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
        || Object.keys(parsed).length !== 1
        || !Number.isInteger((parsed as { offset?: unknown }).offset)) {
      throw new Error('shape');
    }
    const offset = (parsed as { offset: number }).offset;
    if (offset < 0 || offset >= THREADMAP_TOOL_DEFINITIONS.length
        || offset % MCP_TOOLS_LIST_PAGE_SIZE !== 0) {
      throw new Error('range');
    }
    return offset;
  } catch {
    throw new RpcValidationError(-32602, 'cursor is invalid.');
  }
}

function validateServerInfo(value: McpServerInfo): McpServerInfo {
  const name = boundedString(value.name, 'serverInfo.name', 200);
  const version = boundedString(value.version, 'serverInfo.version', 100);
  const title = value.title === undefined ? undefined : boundedString(value.title, 'serverInfo.title', 200);
  return { name, version, ...(title ? { title } : {}) };
}

function validateInstructions(value: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4_000) {
    throw new Error('instructions must contain between 1 and 4,000 characters.');
  }
  return value;
}
