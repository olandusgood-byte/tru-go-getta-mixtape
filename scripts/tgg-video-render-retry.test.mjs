import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientBrokerFailure, retryDelayMs, shouldDeferProbe } from './tgg-video-render-retry.mjs';

test('retries Supabase schema-cache and connection availability failures', () => {
  assert.equal(isTransientBrokerFailure(400, { error: 'Could not query the database for the schema cache. Retrying.' }), true);
  assert.equal(isTransientBrokerFailure(503, { error: 'runtime unavailable' }), true);
  assert.equal(isTransientBrokerFailure(400, { error: 'Connection terminated due to connection timeout' }), true);
});

test('does not retry authorization or validation failures', () => {
  assert.equal(isTransientBrokerFailure(403, { error: 'github_oidc_repository_invalid' }), false);
  assert.equal(isTransientBrokerFailure(400, { error: 'worker_source_invalid' }), false);
});

test('uses bounded backoff delays', () => {
  assert.deepEqual([0, 1, 2, 3].map(retryDelayMs), [1000, 2500, 5000, 8000]);
});

test('defers probe on transient register or claim failures', () => {
  assert.equal(shouldDeferProbe('render_worker_register', 400, { error: 'Could not query the database for the schema cache. Retrying.' }), true);
  assert.equal(shouldDeferProbe('render_worker_claim', 503, { error: 'connection unavailable' }), true);
});

test('does not defer auth, validation, or processing operations', () => {
  assert.equal(shouldDeferProbe('render_worker_register', 403, { error: 'github_oidc_repository_invalid' }), false);
  assert.equal(shouldDeferProbe('render_worker_claim', 400, { error: 'worker_source_invalid' }), false);
  assert.equal(shouldDeferProbe('render_worker_complete', 503, { error: 'connection unavailable' }), false);
});
