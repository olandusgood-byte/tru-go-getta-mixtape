export function assessProtectedAudioQaPage({ status, marker, hasRunButton }) {
  if (Number(status) !== 200) return { ok: false, reason: `http_${Number(status) || 0}` };
  if (marker !== 'protected-audio-browser-v2') return { ok: false, reason: 'qa_marker_missing' };
  if (!hasRunButton) return { ok: false, reason: 'qa_run_button_missing' };
  return { ok: true, reason: null };
}

export function withQaCacheBust(url, token) {
  const parsed = new URL(url);
  parsed.searchParams.set('cert_nav', String(token));
  return parsed.toString();
}
