import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import {
  DalError,
  MCP_LIMITS,
  ThreadmapDal,
  htmlToPlainText,
  isGoogleCalendarDerivedItem,
  scanContinuation,
} from './dal';
import type { OAuthPrincipal } from './oauth';
import { MemoryFirestore } from './memory-firestore';
import { SECURITY_AUDIT_RETENTION_MS } from '../retention-policy';

// Threadmap's editor stores note and project content as plain text; only legacy
// records hold Tiptap HTML. These cases pin both halves of that contract, because a
// tag-stripping pass that is too eager deletes everything between an unrelated '<'
// and the next '>' — silent corruption in the MCP read path.

test('plain-text content with angle brackets survives untouched', () => {
  const cases = [
    'Fix: if (a < b) { return <result>; }',
    'Email Mateo <mateo@example.com> about the PCB',
    'Compare 5<10 and 20>15',
    'Use Array<string> for the tags field',
    'Openpulse: VBAT < 3.4V triggers <shutdown> on the main PCB',
  ];
  for (const value of cases) {
    assert.equal(htmlToPlainText(value), value, value);
  }
});

test('literal entities are not decoded in plain-text content', () => {
  assert.equal(htmlToPlainText('Tom &amp; Jerry'), 'Tom &amp; Jerry');
  assert.equal(htmlToPlainText('Use &lt;br&gt; to break a line'), 'Use &lt;br&gt; to break a line');
});

test('legacy HTML content is still reduced to readable text', () => {
  assert.equal(htmlToPlainText('<p>Real HTML note</p>'), 'Real HTML note');
  assert.equal(htmlToPlainText('<p>One</p><p>Two</p>'), 'One\nTwo');
  assert.equal(htmlToPlainText('<div>A<br/>B</div>'), 'A\nB');
  assert.equal(htmlToPlainText('<ul><li>First</li><li>Second</li></ul>'), 'First\nSecond');
  assert.equal(htmlToPlainText('<p>Tom &amp; Jerry</p>'), 'Tom & Jerry');
});

test('script and style bodies are removed rather than flattened into text', () => {
  assert.equal(htmlToPlainText('<p>Note</p><script>alert(1)</script>'), 'Note');
  assert.equal(htmlToPlainText('<style>p{color:red}</style><p>Styled</p>'), 'Styled');
  assert.equal(
    htmlToPlainText('<script>var a = 1 < 2;</script><p>After</p>'),
    'After',
  );
});

test('non-strings and empty values return an empty string', () => {
  for (const value of [undefined, null, 0, false, {}, [], '']) {
    assert.equal(htmlToPlainText(value), '');
  }
});

test('output is truncated with an ellipsis at the configured maximum', () => {
  const long = 'x'.repeat(MCP_LIMITS.outputContent + 500);
  const result = htmlToPlainText(long);
  assert.equal(result.length, MCP_LIMITS.outputContent);
  assert.ok(result.endsWith('…'));

  assert.equal(htmlToPlainText('abcdefghij', 5), 'abcd…');
  assert.equal(htmlToPlainText('abcd', 5), 'abcd');
});

test('markup detection does not leak regex state between calls', () => {
  // A global regex used with .test() would advance lastIndex and make the second
  // call disagree with the first.
  const html = '<p>a</p><p>b</p>';
  assert.equal(htmlToPlainText(html), 'a\nb');
  assert.equal(htmlToPlainText(html), 'a\nb');
  assert.equal(htmlToPlainText('a < b'), 'a < b');
  assert.equal(htmlToPlainText(html), 'a\nb');
});

test('sparse filter and search scans always expose a continuation at the scan cap', () => {
  assert.deepEqual(scanContinuation({
    scanned: 250,
    scanLimit: 250,
    matched: 2,
    pageLimit: 50,
  }), {
    hasMore: true,
    partial: true,
    boundary: 'last-scanned',
  });
  assert.deepEqual(scanContinuation({
    scanned: 250,
    scanLimit: 250,
    matched: 50,
    pageLimit: 50,
  }), {
    hasMore: true,
    partial: false,
    boundary: 'selected',
  });
});

test('Google Calendar provenance detection fails closed across current and legacy markers', () => {
  assert.equal(isGoogleCalendarDerivedItem({ googleCalendarOrigin: true }), true);
  assert.equal(isGoogleCalendarDerivedItem({ googleCalendarId: 'google-event' }), true);
  assert.equal(isGoogleCalendarDerivedItem({ calendarSynced: true }), true);
  assert.equal(isGoogleCalendarDerivedItem({ googleCalendarId: '   ', calendarSynced: false }), false);
  assert.equal(isGoogleCalendarDerivedItem({ googleCalendarOrigin: false }), false);
});

const TEST_PRINCIPAL: OAuthPrincipal = {
  userId: 'user-one',
  clientId: 'tmc_client-that-is-long-enough',
  scopes: ['threadmap.read', 'threadmap.write', 'threadmap.delete'],
  resource: 'https://threadmap.test/mcp',
  expiresAt: Date.now() + 60_000,
  tokenId: 'token-id',
  tokenFamilyId: 'tmf_family-that-is-long-enough',
};

class DeletionBarrierFirestore extends MemoryFirestore {
  private injected = false;

  override async runTransaction<T>(
    callback: Parameters<MemoryFirestore['runTransaction']>[0],
  ): Promise<T> {
    if (!this.injected) {
      this.injected = true;
      this.set('accountDeletionJobs', TEST_PRINCIPAL.userId, { status: 'deleting' });
    }
    return super.runTransaction(callback) as Promise<T>;
  }
}

test('the MCP launch boundary excludes Google-derived items from every item surface', async () => {
  const store = new MemoryFirestore();
  store.set('items', 'native-item', {
    userId: TEST_PRINCIPAL.userId,
    type: 'task',
    title: 'Native visible task',
    content: 'Only native content may leave Threadmap.',
    status: 'active',
    createdAt: 1,
    updatedAt: 10,
    revision: 1,
    dueDate: '2026-08-20',
    parentId: 'google-by-origin',
    linkedIds: ['google-by-id'],
    tags: ['native-tag'],
    files: [{
      id: 'native-file',
      name: 'native.txt',
      size: 6,
      type: 'text/plain',
      uploadedAt: 10,
    }],
  });
  const googleItems = [
    ['google-by-origin', { googleCalendarOrigin: true }],
    ['google-by-id', { googleCalendarId: 'external-event-id' }],
    ['google-by-sync', { calendarSynced: true }],
  ] as const;
  for (const [id, marker] of googleItems) {
    store.set('items', id, {
      userId: TEST_PRINCIPAL.userId,
      type: 'event',
      title: `Secret Google event ${id}`,
      content: 'Google-derived confidential description',
      status: 'active',
      createdAt: 2,
      updatedAt: 20,
      revision: 1,
      startDate: '2026-08-20',
      tags: ['google-secret-tag'],
      files: [{
        id: `file-${id}`,
        name: 'google-secret.txt',
        size: 20,
        type: 'text/plain',
      }],
      ...marker,
    });
  }

  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL, {
    randomBytes: (size) => Buffer.alloc(size, 4),
  });
  const list = await dal.listItems({ limit: 10 });
  assert.deepEqual(list.items.map((item) => item.id), ['native-item']);
  const search = await dal.searchItems({ query: 'Google-derived', limit: 10 });
  assert.deepEqual(search.items, []);
  const agenda = await dal.getAgenda({ startDate: '2026-08-20', endDate: '2026-08-20' });
  assert.deepEqual(agenda.events, []);
  assert.deepEqual(agenda.tasks.map((item) => item.id), ['native-item']);
  const overview = await dal.getLifeOverview({ date: '2026-08-20' });
  assert.equal(overview.counts.total, 1);
  assert.deepEqual((await dal.listTags()).tags, ['native-tag']);
  assert.deepEqual((await dal.listFilesMetadata()).files.map((file) => file.itemId), ['native-item']);

  const native = await dal.getItem('native-item');
  assert.equal(native.parentId, undefined);
  assert.equal(native.linkedIds, undefined);
  for (const [id] of googleItems) {
    await assert.rejects(
      dal.getItem(id),
      (error) => error instanceof DalError && error.code === 'not_found',
    );
  }
  await assert.rejects(
    dal.listItems({ parentId: 'google-by-origin' }),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
  await assert.rejects(
    dal.updateItem(
      'google-by-id',
      1,
      { title: 'Attempted disclosure' },
      '00000000-0000-4000-8000-000000000031',
    ),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
  await assert.rejects(
    dal.createItem(
      { type: 'task', title: 'Child probe', parentId: 'google-by-origin' },
      '00000000-0000-4000-8000-000000000032',
    ),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
  await assert.rejects(
    dal.linkItems(
      'native-item',
      1,
      'google-by-id',
      1,
      '00000000-0000-4000-8000-000000000033',
    ),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
  await assert.rejects(
    dal.previewDeleteItem('google-by-sync', 1),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
  await assert.rejects(
    dal.listFilesMetadata('google-by-origin'),
    (error) => error instanceof DalError && error.code === 'not_found',
  );
});

test('audit creation cannot land after an account deletion barrier', async () => {
  const store = new DeletionBarrierFirestore();
  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL);
  await assert.rejects(
    dal.recordAudit({
      tool: 'list_items',
      kind: 'read',
      success: true,
      resultCode: 'ok',
      durationMs: 5,
    }),
    (error) => error instanceof DalError && error.code === 'account_unavailable',
  );
  assert.deepEqual(store.dump().mcpAuditLogs, undefined);
});

test('MCP audit metadata expires after the shared 30-day security-log retention', async () => {
  const store = new MemoryFirestore();
  const now = Date.UTC(2026, 7, 20);
  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL, {
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, 5),
  });
  await dal.recordAudit({
    tool: 'list_items',
    kind: 'read',
    success: true,
    resultCode: 'ok',
    durationMs: 5,
  });
  const [audit] = Object.values(store.dump().mcpAuditLogs);
  assert.ok(audit.expireAt instanceof Date);
  assert.equal(audit.expireAt.getTime(), now + SECURITY_AUDIT_RETENTION_MS);
});

test('delete preview cannot create a confirmation after deletion starts', async () => {
  const store = new DeletionBarrierFirestore();
  store.set('items', 'item-one', {
    userId: TEST_PRINCIPAL.userId,
    type: 'task',
    title: 'Owned task',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL);
  await assert.rejects(
    dal.previewDeleteItem('item-one', 1),
    (error) => error instanceof DalError && error.code === 'account_unavailable',
  );
  assert.deepEqual(store.dump().mcpDeleteConfirmations, undefined);
});

test('the confirmed delete flow invokes the configured server orchestration idempotently', async () => {
  const store = new MemoryFirestore();
  store.set('items', 'item-one', {
    userId: TEST_PRINCIPAL.userId,
    type: 'task',
    title: 'Owned task',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  let callbackCalls = 0;
  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL, {
    randomBytes: (size) => Buffer.alloc(size, 7),
    deleteItem: async (request) => {
      callbackCalls += 1;
      assert.equal(request.userId, TEST_PRINCIPAL.userId);
      assert.equal(request.itemId, 'item-one');
      assert.equal(request.expectedRevision, 1);
      return { deleted: true, cleanupPending: true };
    },
  });
  const preview = await dal.previewDeleteItem('item-one', 1);
  const requestId = '00000000-0000-4000-8000-000000000001';
  const first = await dal.confirmDeleteItem(
    'item-one',
    1,
    preview.confirmationToken,
    requestId,
  );
  const replay = await dal.confirmDeleteItem(
    'item-one',
    1,
    preview.confirmationToken,
    requestId,
  );
  assert.equal(first.cleanupPending, true);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(callbackCalls, 1);
});

test('confirmed delete finalization cannot recreate idempotency state after account deletion', async () => {
  const store = new MemoryFirestore();
  store.set('items', 'item-one', {
    userId: TEST_PRINCIPAL.userId,
    type: 'task',
    title: 'Owned task',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  const dal = new ThreadmapDal(store as unknown as Firestore, TEST_PRINCIPAL, {
    randomBytes: (size) => Buffer.alloc(size, 9),
    deleteItem: async () => {
      // Model the account inventory draining the reservation while the
      // external deletion orchestration is in flight.
      for (const id of Object.keys(store.dump().mcpIdempotency || {})) {
        store.delete('mcpIdempotency', id);
      }
      store.set('accountDeletionJobs', TEST_PRINCIPAL.userId, { status: 'deleting' });
      return { deleted: true, cleanupPending: true };
    },
  });
  const preview = await dal.previewDeleteItem('item-one', 1);

  await assert.rejects(
    dal.confirmDeleteItem(
      'item-one',
      1,
      preview.confirmationToken,
      '00000000-0000-4000-8000-000000000002',
    ),
    (error) => error instanceof DalError && error.code === 'account_unavailable',
  );
  assert.equal(Object.keys(store.dump().mcpIdempotency || {}).length, 0);
});
