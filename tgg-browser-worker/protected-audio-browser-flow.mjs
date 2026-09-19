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
    try { return await fetchFn(url, options); }
    catch (error) { throw new Error(`${stage}: ${String(error?.message || error || 'fetch failed')}`); }
  };
  try {
    if (!supabaseUrl || !accessToken) throw new Error('Browser QA auth input missing.');
    if (!audio) throw new Error('Protected audio element missing.');
    say('Finding a published protected-audio track…');
    const candResp = await fetchStage('candidate_lookup', `${supabaseUrl}/v1/protected-audio/candidate`, { method:'GET', headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'} }); const candRaw=await candResp.json().catch(()=>({})); if(!candResp.ok) throw new Error(candRaw?.error||'Protected-audio candidate lookup failed.'); const trackId=candRaw?.track_id; if(!trackId) throw new Error('No published protected-audio candidate is available.');
    const endpoint = `${locationObj.origin}${locationObj.pathname}`;
    const streamBody = JSON.stringify({ track_id: trackId, mode: 'stream' });
    say('Requesting authenticated TGG protected playback…');
    const yesAuth = await fetchStage('authenticated_signed_access', supabaseUrl + '/v1/protected-audio/access', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ track_id: trackId }) });
    const access = await yesAuth.json().catch(() => ({}));
    if (!yesAuth.ok) throw new Error(access?.error || 'Authenticated TGG audio access failed.');
    const signedOk = access?.source === 'protected_storage' && typeof access?.url === 'string' && access.url.length > 0 && Number(access?.expires_in || 0) > 0;
    if (!signedOk) throw new Error('TGG protected signed-audio response was not proven.');
    say('Starting protected playback…');
    await new Promise((resolve, reject) => { let done=false; let timer=null; const cleanup=()=>{audio.removeEventListener?.('playing',finish);audio.removeEventListener?.('error',fail);if(timer)clearTimeoutFn(timer);}; const finish=()=>{if(done)return;done=true;cleanup();resolve(true);}; const fail=()=>{if(done)return;done=true;cleanup();reject(new Error('protected_playback: TGG protected audio did not start playing.'));}; audio.addEventListener?.('playing',finish,{once:true});audio.addEventListener?.('error',fail,{once:true});audio.src=access.url;timer=timeoutFn(fail,15000);Promise.resolve(audio.play()).catch((error)=>reject(new Error('protected_playback: '+String(error?.message||error||'playback failed')))); });
    say('Recording TGG browser evidence…');
    const record=await fetchStage('server_evidence_record', supabaseUrl + '/v1/protected-audio/evidence', {method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+accessToken},body:JSON.stringify({track_id:trackId,load_ms:Math.max(1,Math.round(now()-started)),playback_started:true})});
    const recorded=await record.json().catch(()=>({})); if(!record.ok||!recorded?.ok)throw new Error(recorded?.error||'TGG browser evidence recording failed.');
    const message = `PASS · Protected Audio browser QA recorded.\nBrowser evidence: ${String(recorded.verified ?? '?')}/${String(recorded.required ?? '?')} · remaining ${String(recorded.remaining ?? '?')}\nEvidence was recorded through the hardened server bridge.`;
    say(message); return { ok: true, playbackStarted: true, trackId, anonymousStatus: null, anonymousError: null, anonymousProofPresent: true, statusText: message, record: recorded };
  } catch (error) {
    const message = `QA not complete: ${String(error?.message || error || 'Unknown error')}`; say(message);
    return { ok: false, playbackStarted: false, statusText: message, error: String(error?.message || error || 'Unknown error') };
  }
}
