import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT,
  accountDeletionFixedDocumentPaths,
  accountDeletionPageSize,
  accountDeletionSweepDecision,
} from './account-deletion-policy.js';

test('fixed account deletion inventory includes legacy singleton data', () => {
  assert.ok(accountDeletionFixedDocumentPaths('user-one').includes(
    'toolData/user-one_flightLogs',
  ));
});

test('fixed account deletion inventory removes the encrypted Google credential', () => {
  assert.ok(accountDeletionFixedDocumentPaths('user-one').includes(
    'googleWorkspaceConnections/user-one',
  ));
});

test('account deletion sweep keeps every in-memory page bounded', () => {
  assert.equal(accountDeletionPageSize(0), 200);
  assert.equal(accountDeletionPageSize(1_950), 50);
  assert.equal(accountDeletionPageSize(ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT), 0);
});

test('a partial page proves the current query drained', () => {
  assert.equal(accountDeletionSweepDecision({
    deleted: 150,
    requestedPageSize: 200,
    returnedDocuments: 150,
    deletedDocuments: 150,
  }), 'query-drained');
});

test('a full page continues until an empty/partial page proves completion', () => {
  assert.equal(accountDeletionSweepDecision({
    deleted: 200,
    requestedPageSize: 200,
    returnedDocuments: 200,
    deletedDocuments: 200,
  }), 'continue-query');
});

test('an exact budget boundary yields conservatively to the next invocation', () => {
  assert.equal(accountDeletionSweepDecision({
    deleted: ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT,
    requestedPageSize: 200,
    returnedDocuments: 200,
    deletedDocuments: 200,
  }), 'attempt-budget-exhausted');
});

test('a page that cannot delete any returned document is a hard stall', () => {
  assert.equal(accountDeletionSweepDecision({
    deleted: 0,
    requestedPageSize: 200,
    returnedDocuments: 1,
    deletedDocuments: 0,
  }), 'stalled');
});
