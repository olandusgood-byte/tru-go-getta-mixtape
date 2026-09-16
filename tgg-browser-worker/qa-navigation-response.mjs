export function prepareTrustedQaNavigationResponse({ status, headers = {}, body = '' } = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) normalized[String(key).toLowerCase()] = String(value);
  const marker = normalized['x-tgg-qa'] || '';
  const trusted = Number(status) === 200 && marker === 'protected-audio-browser-v2' && /<button[^>]+id=["']run["']/i.test(body) && /id=["']status["']/i.test(body) && /<audio[^>]+id=["']audio["']/i.test(body);
  if (!trusted) return { trusted: false, status: Number(status) || 0, headers: normalized, body: String(body || '') };

  const safeHeaders = { ...normalized };
  delete safeHeaders['content-security-policy'];
  delete safeHeaders['content-security-policy-report-only'];
  delete safeHeaders['content-length'];
  delete safeHeaders['x-content-type-options'];
  safeHeaders['content-type'] = 'text/html; charset=utf-8';
  safeHeaders['cache-control'] = 'no-store';
  safeHeaders['x-tgg-qa'] = marker;
  return { trusted: true, status: 200, headers: safeHeaders, body: String(body || '') };
}
