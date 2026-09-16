import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeBootstrap } from './bootstrap-guard.mjs';

const validPayload = {
  worker_id: '11111111-1111-1111-1111-111111111111',
  worker_token: 'a'.repeat(64),
  access_token: 'owner.jwt.token',
  refresh_token: 'refresh-token'
};

test('rejects malformed bootstrap before credential verification', async () => {
  let calls = 0;
  const result = await authorizeBootstrap({ worker_id: '', worker_token: 'short', access_token: '' }, {
    verifyOwner: async () => { calls++; return true; },
    verifyWorker: async () => { calls++; return true; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_bootstrap');
  assert.equal(calls, 0);
});

test('rejects bootstrap when access token is not an owner session', async () => {
  const result = await authorizeBootstrap(validPayload, {
    verifyOwner: async () => false,
    verifyWorker: async () => true
  });
  assert.deepEqual(result, { ok: false, error: 'bootstrap_unauthorized' });
});

test('rejects bootstrap when worker id/token do not validate', async () => {
  const result = await authorizeBootstrap(validPayload, {
    verifyOwner: async () => true,
    verifyWorker: async () => false
  });
  assert.deepEqual(result, { ok: false, error: 'bootstrap_unauthorized' });
});

test('accepts bootstrap only after owner and worker validation', async () => {
  const result = await authorizeBootstrap(validPayload, {
    verifyOwner: async () => true,
    verifyWorker: async () => true
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.worker_id, validPayload.worker_id);
  assert.equal(result.value.worker_token, validPayload.worker_token);
  assert.equal(result.value.access_token, validPayload.access_token);
});
