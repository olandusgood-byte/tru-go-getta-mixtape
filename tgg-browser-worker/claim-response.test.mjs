import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClaimJob } from './claim-response.mjs';

test('unwraps the nested job returned by the browser cert claim RPC', () => {
  const job = { id: 'job-1', flow_key: 'protected_audio_runtime' };
  assert.deepEqual(extractClaimJob({ ok: true, job }), job);
});

test('preserves a legacy direct job response', () => {
  const job = { id: 'job-2', flow_key: 'protected_audio_runtime' };
  assert.deepEqual(extractClaimJob(job), job);
});

test('returns null when the claim response contains no job', () => {
  assert.equal(extractClaimJob({ ok: true, job: null }), null);
});
