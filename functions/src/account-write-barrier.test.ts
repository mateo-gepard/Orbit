import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { mergeAccountOwnedDocumentIfActive } from './account-write-barrier.js';
import { MemoryFirestore } from './mcp/memory-firestore.js';

test('post-I/O account writes update only an existing active-account document', async () => {
  const store = new MemoryFirestore();
  store.set('deletionJobs', 'job-one', { userId: 'user-one', status: 'pending' });

  const result = await mergeAccountOwnedDocumentIfActive(
    store as unknown as Firestore,
    'user-one',
    store.collection('deletionJobs').doc('job-one') as never,
    { status: 'retrying' },
  );

  assert.equal(result, 'updated');
  assert.equal(store.dump().deletionJobs['job-one'].status, 'retrying');
});

test('a deletion tombstone suppresses and removes a late post-I/O write', async () => {
  const store = new MemoryFirestore();
  store.set('deletionJobs', 'job-one', { userId: 'user-one', status: 'pending' });
  store.set('accountDeletionJobs', 'user-one', { status: 'deleting' });

  const result = await mergeAccountOwnedDocumentIfActive(
    store as unknown as Firestore,
    'user-one',
    store.collection('deletionJobs').doc('job-one') as never,
    { status: 'retrying' },
  );

  assert.equal(result, 'blocked');
  assert.equal(store.dump().deletionJobs?.['job-one'], undefined);
});

test('a target drained by deletion inventory is never recreated', async () => {
  const store = new MemoryFirestore();
  store.set('accountDeletionJobs', 'user-one', { status: 'cleanup' });

  const result = await mergeAccountOwnedDocumentIfActive(
    store as unknown as Firestore,
    'user-one',
    store.collection('deletionJobs').doc('already-drained') as never,
    { status: 'retrying' },
  );

  assert.equal(result, 'blocked');
  assert.equal(store.dump().deletionJobs, undefined);
});
