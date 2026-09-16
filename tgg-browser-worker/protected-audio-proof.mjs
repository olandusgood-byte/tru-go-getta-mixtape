import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function protectedAudioPassObserved(bodyText) {
  return /PASS\s*·\s*Protected Audio browser QA recorded\./i.test(String(bodyText || ''));
}

export function buildProtectedAudioCertificateResult({ job, screenshotBuffer, html, bodyText, playbackStarted, elapsedMs }) {
  if (!protectedAudioPassObserved(bodyText)) throw new Error('PROTECTED_AUDIO_PAGE_PASS_NOT_OBSERVED');
  const challenge = String(job?.spec?.challenge || '');
  if (!challenge) throw new Error('BROWSER_CERT_CHALLENGE_MISSING');
  if (!Buffer.isBuffer(screenshotBuffer) || screenshotBuffer.length === 0) throw new Error('BROWSER_CERT_SCREENSHOT_MISSING');
  if (typeof html !== 'string' || html.length === 0) throw new Error('BROWSER_CERT_HTML_MISSING');
  return {
    browser: 'chromium',
    executed: true,
    browser_context: true,
    rendered: true,
    challenge_echo: challenge,
    screenshot_sha256: sha256(screenshotBuffer),
    html_sha256: sha256(Buffer.from(html)),
    protected_audio_page_pass: true,
    playback_started: Boolean(playbackStarted),
    pass_text_observed: true,
    elapsed_ms: Number(elapsedMs || 0)
  };
}
