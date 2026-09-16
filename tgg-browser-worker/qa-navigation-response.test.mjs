import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTrustedQaNavigationResponse } from './qa-navigation-response.mjs';

test('trusted TGG QA response is rendered as HTML without CSP', () => {
  const result = prepareTrustedQaNavigationResponse({
    status: 200,
    headers: {
      'x-tgg-qa': 'protected-audio-browser-v2',
      'content-type': 'text/plain; charset=utf-8',
      'content-security-policy': "default-src 'none'",
      'content-length': '1234',
      'cache-control': 'no-store'
    },
    body: '<!doctype html><html><body><button id="run">Run</button><div id="status">Ready</div><audio id="audio"></audio></body></html>'
  });
  assert.equal(result.trusted, true);
  assert.equal(result.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(result.headers['x-tgg-qa'], 'protected-audio-browser-v2');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal('content-security-policy' in result.headers, false);
  assert.equal('content-length' in result.headers, false);
});

test('unmarked responses are not trusted', () => {
  const result = prepareTrustedQaNavigationResponse({
    status: 200,
    headers: {'content-type':'text/plain'},
    body: '<button id="run">Run</button><div id="status"></div><audio id="audio"></audio>'
  });
  assert.equal(result.trusted, false);
});
