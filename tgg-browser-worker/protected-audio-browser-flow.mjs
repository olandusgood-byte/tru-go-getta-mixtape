export async function protectedAudioBrowserFlow(input = {}) {
  const fetchFn = input.fetchFn || globalThis.fetch.bind(globalThis);
  const documentObj = input.documentObj || globalThis.document;
  const locationObj = input.locationObj || globalThis.location;
  const now = input.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const timeoutFn = input.timeoutFn || globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn = input.clearTimeoutFn || globalThis.clearTimeout.bind(globalThis);
  const supabaseUrl = input.supabaseUrl;
  const apiKey = input.apiKey;
  const accessToken = input.accessToken;
  const status = documentObj?.getElementById?.('status');
  const audio = documentObj?.getElementById?.('audio');
  const say = (message) => { if (status) status.textContent = message; };
  const started = now();
  const fetchStage = async (stage, url, options) => {
    try {
      return await fetchFn(url, options);
    } catch (error) {
      throw new Error(`${stage}: ${String(error?.message || error || 'fetch failed')}`);
    }
  };

  try {
    if (!supabaseUrl || !apiKey || !accessToken) throw new Error('Browser QA auth input missing.');
    if (!audio) throw new Error('Protected audio element missing.');

    say('Finding a published protected-audio track…');
    const candResp = await fetchStage('candidate_lookup', `${supabaseUrl}/rest/v1/rpc/tgg_browser_qa_protected_audio_candidate_v1`, {
      method: 'POST',
      headers: { apikey: apiKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: '{}'
    });
    const candRaw = await candResp.json().catch(() => ({}));
    if (!candResp.ok) throw new Error(candRaw?.message || candRaw?.error || 'Protected-audio candidate lookup failed.');
    const cand = Array.isArray(candRaw) ? candRaw[0] : candRaw;
    const trackId = cand?.track_id;
    if (!trackId) throw new Error('No published protected-audio candidate is available.');

    const endpoint = `${locationObj.origin}${locationObj.pathname}`;
    const streamBody = JSON.stringify({ track_id: trackId, mode: 'stream' });

    say('Verifying anonymous access is denied…');
    const noAuth = await fetchStage('anonymous_denial', endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: streamBody });
    const noAuthJson = await noAuth.json().catch(() => ({}));
    const unauthorizedDenied = noAuth.status === 403 && ['ACCOUNT_REQUIRED', 'VERIFIED_EMAIL_REQUIRED'].includes(String(noAuthJson?.error || ''));
    if (!unauthorizedDenied) {
      const code = String(noAuthJson?.error || noAuthJson?.code || 'UNKNOWN');
      throw new Error(`Unauthorized protected-audio denial was not proven. status=${noAuth.status} error=${code}`);
    }

    say('Requesting authenticated signed playback…');
    const yesAuth = await fetchStage('authenticated_signed_access', endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: streamBody
    });
    const access = await yesAuth.json().catch(() => ({}));
    if (!yesAuth.ok) throw new Error(access?.error || 'Authenticated audio access failed.');
    const signedOk = access?.source === 'protected_storage' && typeof access?.url === 'string' && access.url.startsWith('https://') && Number(access?.expires_in || 0) > 0;
    if (!signedOk) throw new Error('Protected signed-audio response was not proven.');

    say('Starting protected playback…');
    await new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const cleanup = () => {
        audio.removeEventListener?.('playing', finish);
        audio.removeEventListener?.('error', fail);
        if (timer) clearTimeoutFn(timer);
      };
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      };
      const fail = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('protected_playback: Protected audio did not start playing.'));
      };
      audio.addEventListener?.('playing', finish, { once: true });
      audio.addEventListener?.('error', fail, { once: true });
      audio.src = access.url;
      timer = timeoutFn(fail, 15000);
      Promise.resolve(audio.play()).catch((error) => reject(new Error(`protected_playback: ${String(error?.message || error || 'playback failed')}`)));
    });

    say('Server-verifying and recording browser evidence…');
    const record = await fetchStage('server_evidence_record', endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        action: 'qa_record_protected_audio',
        track_id: trackId,
        page_path: `${locationObj.pathname}${locationObj.search}`,
        load_ms: Math.max(1, Math.round(now() - started)),
        playback_started: true
      })
    });
    const recorded = await record.json().catch(() => ({}));
    if (!record.ok || !recorded?.ok) throw new Error(recorded?.error || 'Server evidence recording failed.');

    const message = `PASS · Protected Audio browser QA recorded.\nBrowser evidence: ${String(recorded.verified ?? '?')}/${String(recorded.required ?? '?')} · remaining ${String(recorded.remaining ?? '?')}\nEvidence was recorded through the hardened server bridge.`;
    say(message);
    return { ok: true, playbackStarted: true, trackId, statusText: message, record: recorded };
  } catch (error) {
    const message = `QA not complete: ${String(error?.message || error || 'Unknown error')}`;
    say(message);
    return { ok: false, playbackStarted: false, statusText: message, error: String(error?.message || error || 'Unknown error') };
  }
}
