import express from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || 'sb_publishable_mJQg4LjW-9KsW5B1zzJH8Q_e-kA-bbv';
const PORT = Number(process.env.PORT || 10000);
const POLL_MS = Number(process.env.TGG_POLL_MS || 5000);
const app = express();
app.use(express.json({ limit: '2mb' }));
let workerId = process.env.TGG_WORKER_ID || '';
let workerToken = process.env.TGG_WORKER_TOKEN || '';
let ownerSession = null;
let running = false;
let last = { status: 'idle', updated_at: new Date().toISOString() };
const rpc = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

app.get('/health', (_req, res) => res.json({ ok: true, worker_configured: Boolean(workerId && workerToken), session_bootstrapped: Boolean(ownerSession?.access_token), last }));
app.get('/enroll', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>TGG Browser Worker Enrollment</title><style>body{font-family:Arial;background:#080808;color:#fff;max-width:720px;margin:50px auto;padding:24px}button{background:#e50914;color:#fff;border:0;padding:12px 18px;border-radius:8px;font-weight:700}input{display:block;width:100%;margin:8px 0;padding:12px;background:#151515;color:#fff;border:1px solid #333;border-radius:8px;box-sizing:border-box}pre{white-space:pre-wrap;background:#111;padding:15px;border-radius:8px}</style></head><body><h1>TGG Self-Hosted Browser Worker</h1><p>Owner-only enrollment. Your authenticated Supabase session is handed directly to this worker in memory so the real browser can run the protected-audio QA. The session is never printed.</p><input id="email" type="email" placeholder="Owner email"><input id="password" type="password" placeholder="Owner password"><button id="go">Enroll Worker</button><pre id="out">Waiting…</pre><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>(async()=>{const S=window.supabase.createClient(${JSON.stringify(SUPABASE_URL)},${JSON.stringify(SUPABASE_KEY)});document.querySelector('#go').onclick=async()=>{const out=document.querySelector('#out');try{const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;const a=await S.auth.signInWithPassword({email,password});if(a.error)throw a.error;const sess=a.data?.session;if(!sess)throw new Error('No authenticated session returned.');const r=await S.rpc('tgg_browser_cert_worker_enroll',{p_worker_name:'tgg-render-browser-worker',p_capabilities:{playwright:true,chromium:true,protected_audio_runtime:true},p_metadata:{host:'render',version:'1.2.0'}});if(r.error)throw r.error;const d=r.data&&Array.isArray(r.data)?r.data[0]:r.data;if(!d?.worker_id||!d?.worker_token)throw new Error('Enrollment did not return worker credentials.');const b=await fetch('/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worker_id:d.worker_id,worker_token:d.worker_token,access_token:sess.access_token,refresh_token:sess.refresh_token})});const bj=await b.json();if(!b.ok)throw new Error(bj.error||'Worker bootstrap failed');out.textContent='Worker enrolled and browser session bootstrapped. You can close this page.';await S.auth.signOut()}catch(e){out.textContent='ERROR: '+(e.message||String(e))}}})();</script></body></html>`));
app.post('/bootstrap', (req, res) => {
  const id = String(req.body?.worker_id || ''); const token = String(req.body?.worker_token || '');
  const access = String(req.body?.access_token || ''); const refresh = String(req.body?.refresh_token || '');
  if (!id || !token || token.length < 20 || !access) return res.status(400).json({ error: 'invalid_bootstrap' });
  workerId = id; workerToken = token; ownerSession = { access_token: access, refresh_token: refresh };
  last = { status: 'bootstrapped', worker_id: id, updated_at: new Date().toISOString() };
  return res.json({ ok: true, worker_id: id });
});

async function complete(job, verdict, result, evidence) {
  const r = await rpc.rpc('tgg_browser_cert_worker_complete', { p_worker_id: workerId, p_token: workerToken, p_job_id: job.id, p_lease_token: job.lease_token, p_verdict: verdict, p_result: result, p_evidence: evidence });
  if (r.error) throw r.error;
  return r.data;
}

async function runProtectedAudio(job) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const captures = [];
  const capture = async (type, payload) => { const body = Buffer.from(JSON.stringify({ type, at: new Date().toISOString(), ...payload }, null, 2)); captures.push({ type, sha256: sha256(body), artifact_uri: `tgg://browser-cert/${job.id}/${type}.json`, metadata: payload }); };
  const started = Date.now();
  try {
    const url = job.url || 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-audio-access?qa=protected_audio';
    if (ownerSession?.access_token) {
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
      const storageKey = `sb-${ref}-auth-token`;
      const sessionPayload = { access_token: ownerSession.access_token, refresh_token: ownerSession.refresh_token, token_type:'bearer' };
      await context.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: sessionPayload });
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await capture('page_rendered', { url: page.url(), title: await page.title() });
    const textBefore = await page.locator('body').innerText().catch(()=> '');
    await capture('authenticated', { session_bootstrapped: Boolean(ownerSession?.access_token), body_excerpt: textBefore.slice(-1200) });
    const qaButton = page.getByRole('button', { name: /run protected audio qa/i });
    if (await qaButton.count()) await qaButton.first().click();
    const audio = page.locator('audio').first();
    if (await audio.count()) { try { await audio.evaluate(a => a.play().catch(()=>{})); } catch {} }
    await page.waitForTimeout(6000);
    const bodyText = await page.locator('body').innerText();
    const playbackStarted = await audio.count() ? await audio.evaluate(a => !a.paused && a.currentTime > 0).catch(()=>false) : false;
    const passText = /protected audio browser qa recorded|browser evidence/i.test(bodyText);
    await capture('protected_audio_result', { playback_started: playbackStarted, pass_text_observed: passText, body_excerpt: bodyText.slice(-4000) });
    if (!playbackStarted && !passText) throw new Error('Protected audio playback/evidence did not complete in browser.');
    await capture('browser_certificate_observation', { authenticated: Boolean(ownerSession?.access_token), rendered: true, playback_started: playbackStarted, pass_text_observed: passText, elapsed_ms: Date.now()-started });
    return { browser: 'chromium', elapsed_ms: Date.now()-started, authenticated: Boolean(ownerSession?.access_token), rendered: true, playback_started: playbackStarted, pass_text_observed: passText, evidence_count: captures.length, captures };
  } finally { await context.close(); await browser.close(); }
}

async function loop() {
  if (running || !workerId || !workerToken) return;
  running = true;
  try {
    const hb = await rpc.rpc('tgg_browser_cert_worker_heartbeat', { p_worker_id: workerId, p_token: workerToken, p_metadata: { host:'render', version:'1.2.0', session_bootstrapped:Boolean(ownerSession?.access_token) } });
    if (hb.error) throw hb.error;
    const claim = await rpc.rpc('tgg_browser_cert_worker_claim', { p_worker_id: workerId, p_token: workerToken, p_lease_seconds: 300 });
    if (claim.error) throw claim.error;
    const job = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (!job?.id) { last = { status:'idle', updated_at:new Date().toISOString() }; return; }
    last = { status:'running', flow_key:job.flow_key, job_id:job.id, updated_at:new Date().toISOString() };
    if (job.flow_key !== 'protected_audio_runtime') { await complete(job,'blocked',{reason:'Unsupported flow_key for this worker.'},[]); return; }
    try {
      const result = await runProtectedAudio(job);
      await complete(job,'passed',result,result.captures);
      last = { status:'passed', flow_key:job.flow_key, job_id:job.id, updated_at:new Date().toISOString() };
    } catch (e) {
      const failure = { error:e.message||String(e), real_browser_attempt:true, at:new Date().toISOString() };
      await complete(job,'failed',failure,[{type:'browser_failure',sha256:sha256(JSON.stringify(failure)),artifact_uri:`tgg://browser-cert/${job.id}/failure.json`,metadata:failure}]);
      last = { status:'failed', flow_key:job.flow_key, job_id:job.id, error:e.message||String(e), updated_at:new Date().toISOString() };
    }
  } catch (e) { last = { status:'worker_error', error:e.message||String(e), updated_at:new Date().toISOString() }; }
  finally { running = false; }
}

app.listen(PORT, () => { console.log(`TGG browser worker listening on ${PORT}`); setInterval(loop, POLL_MS); loop(); });
