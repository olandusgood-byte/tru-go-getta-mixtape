import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleBootstrapLoop } from './bootstrap-runtime.mjs';

test('successful bootstrap schedules the worker loop immediately', async () => {
  let calls = 0;
  scheduleBootstrapLoop(async () => { calls += 1; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});
