import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProtectedAudioCertificateResult, protectedAudioPassObserved } from './protected-audio-proof.mjs';

const job = { spec: { challenge: '4aab44f3c7355870f7aa1817a6c7bc1d693f' } };

test('does not accept playback before hardened server PASS is visible', () => {
  assert.equal(protectedAudioPassObserved('Starting protected playback…'), false);
  assert.throws(() => buildProtectedAudioCertificateResult({ job, screenshotBuffer: Buffer.from('shot'), html: '<html></html>', bodyText: 'Starting protected playback…', playbackStarted: true, elapsedMs: 1000 }), /PROTECTED_AUDIO_PAGE_PASS_NOT_OBSERVED/);
});

test('builds certificate contract from real page artifacts after PASS', () => {
  const result = buildProtectedAudioCertificateResult({
    job,
    screenshotBuffer: Buffer.from('real-screenshot-bytes'),
    html: '<html><body>PASS</body></html>',
    bodyText: 'PASS · Protected Audio browser QA recorded.\nBrowser evidence: 11/11 · remaining 0',
    playbackStarted: true,
    elapsedMs: 4200
  });
  assert.equal(result.executed, true);
  assert.equal(result.browser_context, true);
  assert.equal(result.rendered, true);
  assert.equal(result.challenge_echo, job.spec.challenge);
  assert.match(result.screenshot_sha256, /^[0-9a-f]{64}$/);
  assert.match(result.html_sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.protected_audio_page_pass, true);
});
