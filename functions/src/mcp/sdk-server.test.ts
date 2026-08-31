import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { AuditEvent, ThreadmapDataAccess } from './dal';
import type { OAuthPrincipal } from './oauth';
import { THREADMAP_MCP_SCOPES, THREADMAP_TOOL_DEFINITIONS } from './tools';
import { buildThreadmapMcpServer, toolRequiredScope } from './sdk-server';

const ALL_SCOPES = [
  THREADMAP_MCP_SCOPES.read,
  THREADMAP_MCP_SCOPES.workspaceRead,
  THREADMAP_MCP_SCOPES.write,
  THREADMAP_MCP_SCOPES.delete,
];

interface Harness {
  client: Client;
  audits: AuditEvent[];
}

function unimplemented(name: string): () => never {
  return () => {
    throw new Error(`${name} is not stubbed for this test.`);
  };
}

/**
 * Only the members the exercised tools reach are implemented. Four DAL methods
 * (`completeItem`, `archiveItem`, `linkItems`, `unlinkItems`) are bound eagerly
 * when the registry is constructed, so they must exist even for tests that never
 * dispatch to them.
 */
function stubDataAccess(tokenScopes: readonly string[]): {
  dataAccess: ThreadmapDataAccess;
  audits: AuditEvent[];
} {
  const audits: AuditEvent[] = [];
  const principal: OAuthPrincipal = {
    userId: 'owner-uid',
    clientId: 'client-1',
    scopes: [...tokenScopes],
    resource: 'https://threadmap.app/mcp',
    expiresAt: Date.now() + 60_000,
    tokenId: 'token-id',
    tokenFamilyId: 'family-id',
  };
  const dataAccess = {
    principal,
    consumeQuota: async () => undefined,
    recordAudit: async (event: AuditEvent) => {
      audits.push(event);
    },
    listTags: async () => ({ tags: ['uni', 'openpulse'], partial: false }),
    // Bound eagerly by the registry constructor.
    completeItem: unimplemented('completeItem'),
    archiveItem: unimplemented('archiveItem'),
    linkItems: unimplemented('linkItems'),
    unlinkItems: unimplemented('unlinkItems'),
  } as unknown as ThreadmapDataAccess;
  return { dataAccess, audits };
}

/**
 * `grantedScopes` drives what the server advertises; `tokenScopes` drives what
 * the registry will actually authorize. They are separate parameters so a test
 * can prove enforcement does not depend on the advertising filter.
 */
async function connect(
  grantedScopes: readonly string[],
  tokenScopes: readonly string[] = grantedScopes,
): Promise<Harness> {
  const { dataAccess, audits } = stubDataAccess(tokenScopes);
  const server = buildThreadmapMcpServer({ dataAccess, grantedScopes });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'threadmap-test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, audits };
}

test('every catalog tool registers on the official SDK server', async () => {
  const { client } = await connect(ALL_SCOPES);
  const { tools } = await client.listTools();
  assert.equal(tools.length, THREADMAP_TOOL_DEFINITIONS.length);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    THREADMAP_TOOL_DEFINITIONS.map((definition) => definition.name),
    'tools/list must stay in catalog order so it is cacheable',
  );
});

test('tool metadata survives the round trip, including input schemas', async () => {
  const { client } = await connect(ALL_SCOPES);
  const { tools } = await client.listTools();
  const listTags = tools.find((tool) => tool.name === 'list_tags');
  assert.ok(listTags, 'list_tags is advertised');
  assert.equal(listTags.title, 'List tags');
  assert.match(listTags.description ?? '', /owner-scoped/);
  assert.equal(listTags.annotations?.readOnlyHint, true);

  const gmailSearch = tools.find((tool) => tool.name === 'search_gmail');
  assert.ok(gmailSearch, 'Google Workspace tools are advertised with their scope');
  assert.equal(gmailSearch.annotations?.readOnlyHint, true);
  assert.equal(gmailSearch.annotations?.openWorldHint, true);

  // The reused JSON Schema must cross the wire in full, nesting included —
  // create_item takes { item: {...}, client_request_id }, not flat item fields.
  const createItem = tools.find((tool) => tool.name === 'create_item');
  assert.ok(createItem, 'create_item is advertised');
  assert.equal(createItem.inputSchema.type, 'object');
  assert.deepEqual(Object.keys(createItem.inputSchema.properties ?? {}), ['item', 'client_request_id']);
  assert.deepEqual(createItem.inputSchema.required, ['item', 'client_request_id']);
  assert.equal(createItem.annotations?.readOnlyHint, false);

  const itemSchema = (createItem.inputSchema.properties as Record<string, {
    properties?: Record<string, unknown>;
    required?: string[];
  }>).item;
  assert.deepEqual(itemSchema.required, ['type', 'title']);
  assert.ok(itemSchema.properties?.type, 'the nested item type property crossed the wire');
  assert.ok(itemSchema.properties?.dueDate, 'nested optional properties crossed the wire too');
});

test('per-tool auth metadata travels in _meta, not as a top-level field', async () => {
  const { client } = await connect(ALL_SCOPES);
  const { tools } = await client.listTools();
  const deleteTool = tools.find((tool) => tool.name === 'confirm_delete_item');
  assert.ok(deleteTool);
  assert.equal((deleteTool as Record<string, unknown>).securitySchemes, undefined);
  assert.deepEqual(deleteTool._meta?.securitySchemes, [
    { type: 'oauth2', scopes: [THREADMAP_MCP_SCOPES.delete] },
  ]);
});

test('a read-only token is offered no write or delete tools', async () => {
  const { client } = await connect([THREADMAP_MCP_SCOPES.read]);
  const { tools } = await client.listTools();

  assert.ok(tools.length > 0, 'read tools are still advertised');
  const advertised = new Set(tools.map((tool) => tool.name));
  for (const definition of THREADMAP_TOOL_DEFINITIONS) {
    const readOnly = toolRequiredScope(definition) === THREADMAP_MCP_SCOPES.read;
    assert.equal(
      advertised.has(definition.name),
      readOnly,
      `${definition.name} advertised=${advertised.has(definition.name)} readOnly=${readOnly}`,
    );
  }
  assert.equal(advertised.has('create_item'), false);
  assert.equal(advertised.has('confirm_delete_item'), false);
});

test('a tool call reaches the registry and returns structured content', async () => {
  const { client, audits } = await connect(ALL_SCOPES);
  const result = await client.callTool({ name: 'list_tags', arguments: {} });

  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, { tags: ['uni', 'openpulse'], partial: false });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tool, 'list_tags');
});

test('scope enforcement is server-side, not a function of what was advertised', async () => {
  // Advertise the write tools, but hand the registry a read-only token. The
  // registry must still refuse — `tools/list` filtering is a UX affordance, and
  // this proves it is not the security boundary.
  const { client } = await connect(ALL_SCOPES, [THREADMAP_MCP_SCOPES.read]);
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'archive_item'), 'the tool was advertised');

  const result = await client.callTool({
    name: 'archive_item',
    arguments: {
      item_id: 'item-1',
      expected_revision: 1,
      client_request_id: '11111111-1111-4111-8111-111111111111',
    },
  });
  assert.equal(result.isError, true);
  const text = (result.content as Array<{ type: string; text?: string }>)
    .map((block) => block.text ?? '')
    .join(' ');
  assert.match(text, /scope/i);
});

test('an unknown tool name is rejected', async () => {
  const { client } = await connect(ALL_SCOPES);
  await assert.rejects(
    () => client.callTool({ name: 'definitely_not_a_tool', arguments: {} }),
    /not_a_tool|Unknown|not found/i,
  );
});

test('invalid arguments are rejected before the call reaches the DAL', async () => {
  const { client, audits } = await connect(ALL_SCOPES);
  // create_item requires both `item` and `client_request_id`. The schema is the
  // same JSON Schema the hand-rolled server used, now enforced by the SDK ahead
  // of dispatch — so the registry never runs and writes no audit record.
  let failed = false;
  try {
    const result = await client.callTool({
      name: 'create_item',
      arguments: { item: { title: 'missing the type field' } },
    });
    failed = result.isError === true;
  } catch {
    failed = true;
  }
  assert.ok(failed, 'a schema-invalid call must not succeed');
  assert.deepEqual(audits, [], 'nothing was dispatched, so nothing was audited');
});
