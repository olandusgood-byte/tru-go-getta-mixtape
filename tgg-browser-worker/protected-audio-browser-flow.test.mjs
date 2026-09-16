import test from 'node:test';
import assert from 'node:assert/strict';
import { protectedAudioBrowserFlow } from './protected-audio-browser-flow.mjs';

test('runs protected audio QA directly in browser context without page click handler', async () => {
  const calls = [];
  const status = { textContent: '' };
  const audio = {
    paused: true,
    currentTime: 0,
    listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    removeEventListener(name) { delete this.listeners[name]; },
    set src(v) { this._src = v; },
    async play() {
      this.paused = false;
      this.currentTime = 1;
      queueMicrotask(() => this.listeners.playing?.());
    }
  };
  const document = { getElementById: (id) => id === 'status' ? status : id === 'audio' ? audio : null };
  const location = { origin: 'https://xsofowzvwetamhyuvlpj.supabase.co', pathname: '/functions/v1/tgg-audio-access', search: '?qa=protected_audio&tgg_qa=test' };
  const fetchFn = async (url, opts={}) => {
    calls.push({url:String(url), opts});
    if (String(url).includes('/rest/v1/rpc/tgg_browser_qa_protected_audio_candidate_v1')) return { ok:true, json:async()=>({track_id:'f75ca67a-95c9-40bb-8dfd-38e729d2d74d'}) };
    if (opts.headers?.authorization && opts.body?.includes('qa_record_protected_audio')) return { ok:true, json:async()=>({ok:true,verified:11,required:11,remaining:0}) };
    if (!opts.headers?.authorization && opts.body?.includes('"mode":"stream"')) return { ok:false, status:403, json:async()=>({error:'ACCOUNT_REQUIRED',qa_denial_proof:'proof-main'}) };
    if (opts.headers?.authorization && opts.body?.includes('"mode":"stream"')) return { ok:true, json:async()=>({source:'protected_storage',url:'https://signed.example/audio.mp3',expires_in:300}) };
    throw new Error('unexpected fetch '+url);
  };

  const result = await protectedAudioBrowserFlow({
    supabaseUrl:'https://xsofowzvwetamhyuvlpj.supabase.co',
    apiKey:'publishable',
    accessToken:'owner-access-token',
    fetchFn, documentObj:document, locationObj:location, now:()=>1000,
    timeoutFn:()=>1, clearTimeoutFn:()=>{}
  });

  assert.equal(result.ok, true);
  assert.equal(result.playbackStarted, true);
  assert.match(status.textContent, /PASS · Protected Audio browser QA recorded/);
  assert.equal(calls.length, 4);
  assert.ok(calls.some(c => c.url.includes('/rest/v1/rpc/tgg_browser_qa_protected_audio_candidate_v1')));
});

test('labels the network stage when browser fetch fails', async () => {
  const status = { textContent:'' };
  const documentObj = { getElementById: (id) => id === 'status' ? status : id === 'audio' ? {} : null };
  const result = await protectedAudioBrowserFlow({
    supabaseUrl:'https://xsofowzvwetamhyuvlpj.supabase.co',
    apiKey:'publishable',
    accessToken:'owner-token',
    documentObj,
    locationObj:{origin:'https://xsofowzvwetamhyuvlpj.supabase.co',pathname:'/functions/v1/tgg-audio-access',search:'?qa=protected_audio'},
    fetchFn: async () => { throw new TypeError('Failed to fetch'); }
  });
  assert.equal(result.ok,false);
  assert.match(result.error,/candidate_lookup: Failed to fetch/);
});

test('anonymous denial failure reports status and backend error code', async () => {
  const status = { textContent: '' };
  const audio = {};
  const documentObj = { getElementById: (id) => id === 'status' ? status : id === 'audio' ? audio : null };
  const locationObj = { origin:'https://xsofowzvwetamhyuvlpj.supabase.co', pathname:'/functions/v1/tgg-audio-access', search:'?qa=protected_audio' };
  let call = 0;
  const fetchFn = async () => {
    call += 1;
    if (call === 1) return { ok:true, json:async()=>({track_id:'f75ca67a-95c9-40bb-8dfd-38e729d2d74d'}) };
    if (call === 2) return { ok:false, status:401, json:async()=>({error:'MISSING_AUTH_HEADER'}) };
    throw new Error('unexpected fetch');
  };
  const result = await protectedAudioBrowserFlow({
    supabaseUrl:'https://xsofowzvwetamhyuvlpj.supabase.co', apiKey:'publishable', accessToken:'owner',
    fetchFn, documentObj, locationObj, now:()=>1, timeoutFn:()=>1, clearTimeoutFn:()=>{}
  });
  assert.equal(result.ok,false);
  assert.match(result.error,/status=401/);
  assert.match(result.error,/MISSING_AUTH_HEADER/);
});

test('forwards server-signed anonymous denial proof into evidence record', async () => {
  const calls = [];
  const status = { textContent: '' };
  const audio = {
    listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    removeEventListener(name) { delete this.listeners[name]; },
    set src(v) { this._src = v; },
    async play() { queueMicrotask(() => this.listeners.playing?.()); }
  };
  const documentObj = { getElementById: (id) => id === 'status' ? status : id === 'audio' ? audio : null };
  const locationObj = { origin:'https://xsofowzvwetamhyuvlpj.supabase.co', pathname:'/functions/v1/tgg-audio-access', search:'?qa=protected_audio&cert_nav=test' };
  const fetchFn = async (url, opts={}) => {
    calls.push({ url:String(url), opts });
    if (String(url).includes('/rest/v1/rpc/tgg_browser_qa_protected_audio_candidate_v1')) return { ok:true, json:async()=>({track_id:'f75ca67a-95c9-40bb-8dfd-38e729d2d74d'}) };
    if (!opts.headers?.authorization && opts.body?.includes('"mode":"stream"')) return { ok:false, status:403, json:async()=>({error:'ACCOUNT_REQUIRED',qa_denial_proof:'signed-proof-123'}) };
    if (opts.headers?.authorization && opts.body?.includes('"mode":"stream"')) return { ok:true, json:async()=>({source:'protected_storage',url:'https://signed.example/audio.mp3',expires_in:300}) };
    if (opts.headers?.authorization && opts.body?.includes('qa_record_protected_audio')) return { ok:true, json:async()=>({ok:true,verified:11,required:11,remaining:0}) };
    throw new Error('unexpected fetch '+url);
  };
  const result = await protectedAudioBrowserFlow({
    supabaseUrl:'https://xsofowzvwetamhyuvlpj.supabase.co', apiKey:'publishable', accessToken:'owner',
    fetchFn, documentObj, locationObj, now:()=>1000, timeoutFn:()=>1, clearTimeoutFn:()=>{}
  });
  assert.equal(result.ok, true);
  const recordCall = calls.find(c => c.opts.body?.includes('qa_record_protected_audio'));
  const body = JSON.parse(recordCall.opts.body);
  assert.equal(body.qa_denial_proof, 'signed-proof-123');
});
