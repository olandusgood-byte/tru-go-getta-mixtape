/**
 * TGG Artist HQ transport adapter.
 * Browser-safe, dependency-free bridge for the deployed Blogger dashboard.
 *
 * Usage:
 *   window.TGGArtistHQTransport.request('/v1/creator/dashboard')
 *
 * Supabase remains the caller's fallback; this module never exposes secrets.
 */
(function () {
  const CORE = 'https://tgg-core-api-production.up.railway.app';

  async function request(path, options) {
    const opts = options || {};
    const token = opts.accessToken || window.TGGAuth?.accessToken || '';
    const headers = new Headers(opts.headers || {});
    headers.set('Accept', 'application/json');
    if (opts.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) headers.set('Authorization', 'Bearer ' + token);

    const response = await fetch(CORE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined
        ? undefined
        : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)),
      credentials: 'omit'
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (!response.ok) {
      const error = new Error((data && data.error) || ('TGG_CORE_HTTP_' + response.status));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  window.TGGArtistHQTransport = Object.freeze({
    coreUrl: CORE,
    request
  });
})();
