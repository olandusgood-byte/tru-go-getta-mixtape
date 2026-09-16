import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionRestoreInput } from './qa-session.mjs';

test('builds a restore input only from both owner tokens', () => {
  assert.deepEqual(buildSessionRestoreInput({ access_token: 'a', refresh_token: 'r' }), { access_token: 'a', refresh_token: 'r' });
  assert.equal(buildSessionRestoreInput({ access_token: 'a', refresh_token: '' }), null);
  assert.equal(buildSessionRestoreInput(null), null);
});
