import assert from 'node:assert/strict';
import test from 'node:test';

import { privateModeEnabled, privateOwnerAuthorized } from './private-access';

test('private mode is enabled only by an explicit true value', () => {
  assert.equal(privateModeEnabled({ THREADMAP_PRIVATE_MODE: 'true' }), true);
  assert.equal(privateModeEnabled({ THREADMAP_PRIVATE_MODE: 'false' }), false);
  assert.equal(privateModeEnabled({}), false);
});

test('private mode requires the exact owner claim', () => {
  const environment = { THREADMAP_PRIVATE_MODE: 'true' };
  assert.equal(privateOwnerAuthorized({ threadmapOwner: true }, environment), true);
  assert.equal(privateOwnerAuthorized({ threadmapOwner: false }, environment), false);
  assert.equal(privateOwnerAuthorized({}, environment), false);
  assert.equal(privateOwnerAuthorized(undefined, environment), false);
});

test('non-private environments retain the existing authenticated-user behavior', () => {
  assert.equal(privateOwnerAuthorized(undefined, { THREADMAP_PRIVATE_MODE: 'false' }), true);
});
