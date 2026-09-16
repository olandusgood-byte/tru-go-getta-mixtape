import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProtectedAudioQaPage, shouldHydratePlainTextQaResponse, withQaCacheBust } from './qa-page-contract.mjs';

test('accepts only the real protected-audio QA page contract', () => {
  assert.deepEqual(
    assessProtectedAudioQaPage({ status: 200, marker: 'protected-audio-browser-v2', hasRunButton: true }),
    { ok: true, reason: null }
  );
});

test('rejects an HTML or gateway response that is missing the QA marker or run control', () => {
  assert.deepEqual(
    assessProtectedAudioQaPage({ status: 200, marker: '', hasRunButton: false }),
    { ok: false, reason: 'qa_marker_missing' }
  );
  assert.deepEqual(
    assessProtectedAudioQaPage({ status: 503, marker: 'protected-audio-browser-v2', hasRunButton: true }),
    { ok: false, reason: 'http_503' }
  );
});

test('hydrates trusted QA HTML mislabeled as text/plain', () => {
  assert.equal(shouldHydratePlainTextQaResponse({
    status: 200,
    marker: 'protected-audio-browser-v2',
    contentType: 'text/plain; charset=UTF-8',
    body: '<!doctype html><html><body><button id="run">Run Protected Audio QA</button></body></html>'
  }), true);
});

test('does not hydrate unmarked or non-HTML plain text', () => {
  assert.equal(shouldHydratePlainTextQaResponse({
    status: 200,
    marker: '',
    contentType: 'text/plain',
    body: '<html><button id="run">Run</button></html>'
  }), false);
  assert.equal(shouldHydratePlainTextQaResponse({
    status: 200,
    marker: 'protected-audio-browser-v2',
    contentType: 'text/plain',
    body: 'not html'
  }), false);
});

test('adds a cache-busting cert navigation token without removing the qa query', () => {
  const url = withQaCacheBust(
    'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-audio-access?qa=protected_audio',
    'attempt-6'
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('qa'), 'protected_audio');
  assert.equal(parsed.searchParams.get('cert_nav'), 'attempt-6');
});
