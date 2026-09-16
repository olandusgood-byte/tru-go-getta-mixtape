import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQaStatus } from './qa-status.mjs';

test('classifies protected-audio PASS', () => {
  assert.deepEqual(classifyQaStatus('PASS · Protected Audio browser QA recorded.\nBrowser evidence: 11/11'), { done: true, passed: true });
});

test('classifies explicit QA failure', () => {
  assert.deepEqual(classifyQaStatus('QA not complete: Protected audio did not start playing.'), { done: true, passed: false });
});

test('leaves progress text pending', () => {
  assert.deepEqual(classifyQaStatus('Starting protected playback…'), { done: false, passed: false });
});
