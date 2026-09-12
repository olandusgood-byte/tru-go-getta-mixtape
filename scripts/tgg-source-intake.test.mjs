import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { evaluateSourceIntake, parseChecksumFile } from './tgg-source-intake.mjs';

const validSource = `<?xml version="1.0"?><html xmlns:b="http://www.google.com/2005/gml/b"><head><b:skin><![CDATA[body{}]]></b:skin></head><body><b:widget id="HTML6" type="HTML"/></body></html>`;
const hash = createHash('sha256').update(validSource).digest('hex');

function evaluate(overrides = {}) {
  return evaluateSourceIntake({
    content: validSource,
    expectedSha256: hash,
    expectedFilename: 'TRU_GO_GETTA_CANONICAL.xml',
    actualFilename: 'TRU_GO_GETTA_CANONICAL.xml',
    minBytes: 1,
    maxBytes: 10000,
    ...overrides
  });
}

test('valid source is accepted for candidate generation', () => {
  assert.equal(evaluate().decision, 'ACCEPTED_FOR_CANDIDATE');
});

test('checksum parser binds the hash to a filename', () => {
  assert.deepEqual(parseChecksumFile(`${hash}  TRU_GO_GETTA_CANONICAL.xml\n`), {
    sha256: hash,
    filename: 'TRU_GO_GETTA_CANONICAL.xml'
  });
  assert.throws(() => parseChecksumFile(hash), /Checksum file must contain/);
});

test('hash or filename drift holds intake', () => {
  const result = evaluate({ expectedSha256: '0'.repeat(64), expectedFilename: 'other.xml' });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /filename does not match/);
  assert.match(result.reasons.join(' '), /companion SHA-256/);
});

test('truncated canonical source is rejected', () => {
  const result = evaluate({ minBytes: 10000 });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /canonical-source floor/);
});

test('missing Blogger markers are rejected', () => {
  const content = '<html><body></body></html>';
  const result = evaluate({
    content,
    expectedSha256: createHash('sha256').update(content).digest('hex')
  });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /Blogger namespace/);
  assert.match(result.reasons.join(' '), /Blogger skin/);
  assert.match(result.reasons.join(' '), /HTML6/);
});

test('server secrets in theme source fail closed', () => {
  const content = validSource.replace('</body>', '<script>const key="sk_live_secret";</script></body>');
  const result = evaluate({
    content,
    expectedSha256: createHash('sha256').update(content).digest('hex')
  });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /Stripe live secret key/);
});
