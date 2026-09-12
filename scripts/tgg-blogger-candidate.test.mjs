import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidate, sha256 } from './tgg-blogger-candidate.mjs';

function source(body = '') {
  return `<html><body><b:widget id='HTML6' type='HTML'/>${body}</body></html>`;
}

test('candidate input is locked to the expected source hash', () => {
  const input = source();
  assert.throws(
    () => buildCandidate({ source: input, expectedSha256: 'wrong' }),
    /Source SHA-256 mismatch/
  );
});

test('candidate scopes HTML6, fixes raw CDATA, and injects modules', () => {
  const input = source('<script><![CDATA[var ok=true;//]]></script>');
  const result = buildCandidate({
    source: input,
    expectedSha256: sha256(input),
    modules: [{ path: 'patches/example.js', content: '(function(){ return true; })();' }]
  });
  assert.match(result.candidate, /cond='data:view\.isHomepage'/);
  assert.match(result.candidate, /\/\/<!\[CDATA\[/);
  assert.match(result.candidate, /V5680 review module: patches\/example\.js/);
  assert.equal(result.manifest.decision, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.manifest.controls.overwrote_source, false);
});

test('candidate refuses an unknown source without HTML6', () => {
  const input = '<html><body></body></html>';
  assert.throws(
    () => buildCandidate({ source: input, expectedSha256: sha256(input) }),
    /HTML6 was not found/
  );
});

test('remaining source defects keep a generated candidate on HOLD', () => {
  const input = source('<audio id="tggAudio"></audio><audio id="tggAudio"></audio>');
  const result = buildCandidate({ source: input, expectedSha256: sha256(input) });
  assert.equal(result.manifest.decision, 'HOLD');
  assert.match(result.manifest.lint.errors.join(' '), /Duplicate DOM id tggAudio/);
});

test('candidate rejects modules containing a script boundary', () => {
  const input = source();
  assert.throws(
    () => buildCandidate({
      source: input,
      expectedSha256: sha256(input),
      modules: [{ path: 'unsafe.js', content: '</script>' }]
    }),
    /literal <\/script> boundary/
  );
});
