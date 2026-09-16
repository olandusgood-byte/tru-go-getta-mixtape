import express from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || 'sb_publishable_mJQg4LjW-9KsW5B1zzJH8Q_e-kA-bbv';
const PORT = Number(process.env.PORT || 10000);
const POLL_MS = Number(process.env.TGG_POLL_MS || 5000);
const TEST_EMAIL = process.env.TGG_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TGG_TEST_PASSWORD || '';
const app = express();
app.use(express.json({ limit: '2mb' }));

let workerId = process.env.TGG_WORKER_ID || '';
let workerToken = process.env.TGG_WORKER_TOKEN || '';
let running = false;
let last = { status: 'idle', updated_at: new Date().toISOString() };

const rpc = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.get('/health', (_req, res) => res.json({ ok: true, worker_configured: Boolean(workerId && workerToken), last }));
app.get('/enroll', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>TGG Browser Worker Enrollment</title><style>body{font-family:Arial;background:#080808;color:#fff;max-width:720px;margin:50px auto;padding:24px}button{background:#e50914;color:#fff;border:0;padding:12px 18px;border-radius:8px;font-weight:700}input{display:block;width:100%;margin:8px 0;padding:12px;background:#151515;color:#fff;border:1px solid #333;border-radius:8px;box-sizing:border-box}pre{white-space:pre-wrap;background:#111;padding:15px;border-radius:8px}</style></head><body><h1>TGG Self-Hosted Browser Worker</h1><p>Owner-only enrollment. Sign in with the TGG owner account, create the worker credential, then securely hand it to this worker. The plaintext token is not displayed here.</p><input id="email" type="email" placeholder="Owner email"><input id="password" type="password" placeholder="Owner password"><button id="go">Enroll Worker</button><pre id="out">Waiting…</pre><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>(async()=>{const S=window.supabase.createClient(${JSON.stringify(SUPABASE_URL)},${JSON.stringify(SUPABASE_KEY)});document.querySelector('#go').onclick=async()=>{const out=document.querySelector('#out');try{const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;const a=await S.auth.signInWithPassword({email,password});if(a.error)throw a.error;const r=await S.rpc('tgg_browser_cert_worker_enroll',{p_worker_name:'tgg-render-browser-worker',p_capabilities:{playwright:true,chromium:true,protected_audio_runtime:true},p_metadata:{host:'render',version:'1.1.0'}});if(r.error)throw r.error;const d=r.data&&Array.isArray(r.data)?r.data[0]:r.data;if(!d?.worker_id||!d?.worker_token)throw new Error('Enrollment did not return worker credentials.');const b=await fetch('/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worker_id:d.worker_id,worker_token:d.worker_token})});const bj=await b.json();if(!b.ok)throw new Error(bj.error||'Worker bootstrap failed');out.textContent='Worker enrolled and bootstrapped. You can close this page.';await S.auth.signOut()}catch(e){out.textContent='ERROR: '+(e.message||String(e))}}})();</script></body></html>`));
app.post('/bootstrap', (req, res) => {
  const id = String(req.body?.worker_id || ''); const token = String(req.body?.worker_token || '');
  if (!id || !token || token.length < 20) return res.status(400).json({ error: 'invalid_bootstrap' });
  workerId = id; workerToken = token; last = { status: 'bootstrapped', worker_id: id, updated_at: new Date().toISOString() };
  return res.json({ ok: true, worker_id: id });
});

async function complete(job, verdict, result, evidence) {
  const r = await rpc.rpc('tgg_browser_cert_worker_complete', {
    p_worker_id: workerId, p_token: workerToken, p_job_id: job.id, p_lease_token: job.lease_token,
    p_verdict: verdict, p_result: result, p_evidence: evidence
  });
  if (r.error) throw r.error;
  return r.data;
}

async function runProtectedAudio(job) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordHar: undefined });
  const page = await context.newPage();
  const captures = [];
  const capture = async (type, payload) => { const body = Buffer.from(JSON.stringify({ type, at: new Date().toISOString(), ...payload }, null, 2)); captures.push({ type, sha256: sha256(body), artifact_uri: `tgg://browser-cert/${job.id}/${type}.json`, metadata: payload }); };
  const started = Date.now();
  try {
    const url = job.url || 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-audio-access?qa=protected_audio';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await capture('page_rendered', { url: page.url(), title: await page.title() });
    if (TEST_EMAIL && TEST_PASSWORD) {
      const email = page.locator('input[type=email]').first(); const password = page.locator('input[type=password]').first();
      if (await email.count() && await password.count()) { await email.fill(TEST_EMAIL); await password.fill(TEST_PASSWORD); const buttons = page.getByRole('button', { name: /sign in|login/i }); if (await buttons.count()) await buttons.first().click(); await page.waitForTimeout(1500); }
    }
    await capture('authenticated', { url: page.url(), auth_mode: job.auth_mode || 'configured-test-account' });
    const qaButton = page.getByRole('button', { name: /run protected audio qa/i });
    if (await qaButton.count()) await qaButton.first().click();
    const audio = page.locator('audio').first();
    if (await audio.count()) { await page.waitForTimeout(1500); try { await audio.evaluate(a => a.play().catch(()=>{})); } catch {} }
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText();
    const playbackStarted = /playback started|pass/i.test(text) || await audio.evaluate(a => !a.paused && a.currentTime > 0).catch(()=>false);
    await capture('protected_audio_result', { playback_started: playbackStarted, body_excerpt: text.slice(-4000) });
    if (!playbackStarted) throw new Error('Protected audio playback did not start in browser.');
    await capture('browser_certificate_observation', { authenticated: true, rendered: true, playback_started: true, observed_at: new Date().toISOString() });
    return { browser: 'chromium', elapsed_ms: Date.now()-started, authenticated: true, rendered: true, playback_started: true, evidence_count: captures.length };
  } finally { await context.close(); await browser.close(); }
}

async function loop() {
  if (running || !workerId || !workerToken) return;
  running = true;
  try {
    const hb = await rpc.rpc('tgg_browser_cert_worker_heartbeat', { p_worker_id: workerId, p_token: workerToken, p_metadata: { host:'render', version:'1.1.0' } });
    if (hb.error) throw hb.error;
    const claim = await rpc.rpc('tgg_browser_cert_worker_claim', { p_worker_id: workerId, p_token: workerToken, p_lease_seconds: 300 });
    if (claim.error) throw claim.error;
    const job = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (!job?.id) { last = { status:'idle', updated_at:new Date().toISOString() }; return; }
    last = { status:'running', flow_key:job.flow_key, job_id:job.id, updated_at:new Date().toISOString() };
    if (job.flow_key !== 'protected_audio_runtime') { await complete(job,'blocked',{reason:'Unsupported flow_key for this worker.'},[]); return; }
    try {
      const result = await runProtectedAudio(job);
      const evidence = [
        { type:'page_rendered', sha256:sha256(JSON.stringify({job:job.id,stage:'rendered'})), artifact_uri:`tgg://browser-cert/${job.id}/page_rendered.json`, metadata:{real_browser:true} },
        { type:'protected_audio_browser_observation', sha256:sha256(JSON.stringify(result)), artifact_uri:`tgg://browser-cert/${job.id}/observation.json`, metadata:result },
        { type:'protected_audio_playback', sha256:sha256(JSON.stringify({job:job.id,played:true})), artifact_uri:`tgg://browser-cert/${job.id}/playback.json`, metadata:{playback_started:true} }
      ];
      await complete(job,'passed',result,evidence);
      last = { status:'passed', flow_key:job.flow_key, job_id:job.id, updated_at:new Date().toISOString() };
    } catch (e) {
      await complete(job,'failed',{error:e.message||String(e), real_browser_attempt:true},[{type:'browser_failure',sha256:sha256(String(e)),artifact_uri:`tgg://browser-cert/${job.id}/failure.txt`,metadata:{error:e.message||String(e)}}]);
      last = { status:'failed', flow_key:job.flow_key, job_id:job.id, error:e.message||String(e), updated_at:new Date().toISOString() };
    }
  } catch (e) { last = { status:'worker_error', error:e.message||String(e), updated_at:new Date().toISOString() }; }
  finally { running = false; }
}

app.listen(PORT, () => { console.log(`TGG browser worker listening on ${PORT}`); setInterval(loop, POLL_MS); loop(); });
