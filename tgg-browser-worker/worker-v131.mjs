import express from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { authorizeBootstrap } from './bootstrap-guard.mjs';
import { scheduleBootstrapLoop } from './bootstrap-runtime.mjs';
import { extractClaimJob } from './claim-response.mjs';
import { buildProtectedAudioCertificateResult } from './protected-audio-proof.mjs';
import { assessProtectedAudioQaPage, withQaCacheBust } from './qa-page-contract.mjs';
import { buildStoredSupabaseSession } from './access-session.mjs';
import { protectedAudioBrowserFlow } from './protected-audio-browser-flow.mjs';
import { prepareTrustedQaNavigationResponse } from './qa-navigation-response.mjs';
import { runMultiFlowBrowser } from './multi-flow-browser-runner.mjs';
import { tggCoreEnabled, tggWorkerHeartbeat, tggWorkerClaim, tggWorkerComplete, tggStoreOwnerRefreshToken, tggRestoreOwnerRefreshToken } from './tgg-core-client.mjs';

const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || 'sb_publishable_mJQg4LjW-9KsW5B1zzJH8Q_e-kA-bbv';
const PORT = Number(process.env.PORT || 10000);
const POLL_MS = Number(process.env.TGG_POLL_MS || 5000);
const RUNTIME_VERSION = '1.3.2';
const app = express();
app.use(express.json({ limit: '2mb' }));
let workerId = process.env.TGG_WORKER_ID || globalThis.__TGG_WORKER_ID || '';
let workerToken = process.env.TGG_WORKER_TOKEN || globalThis.__TGG_WORKER_TOKEN || '';
const bootstrapSecret = process.env.TGG_WORKER_BOOTSTRAP_SECRET || '';
async function ensureWorkerToken(){ if(workerToken)return true; return false; }
let ownerSession = null;
let running = false;
let last = { status: 'idle', updated_at: new Date().toISOString() };
const rpcFetch = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
const rpc = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: rpcFetch } });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function verifyOwnerSession(accessToken) {
  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) return { ok: false, error: 'owner_auth_failed' };
    const { data, error } = await authClient.rpc('tgg_browser_cert_status', { p_flow_key: null });
    if (error) return { ok: false, error: 'owner_status_rpc_failed' };
    if (data === null || data === undefined) return { ok: false, error: 'owner_status_empty' };
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'owner_validation_exception' };
  }
}

async function verifyWorkerCredential(id, token) {
  if (tggCoreEnabled()) { try { await tggWorkerHeartbeat({ host:'render', version:RUNTIME_VERSION, bootstrap_validation:true }); return { ok:true }; } catch (_error) { return { ok:false, error:'tgg_core_worker_heartbeat_failed' }; } }

  try {
    const result = await rpc.rpc('tgg_browser_cert_worker_heartbeat', { p_worker_id: id, p_token: token, p_metadata: { host: 'render', version: RUNTIME_VERSION, bootstrap_validation: true } });
    if (result.error) return { ok: false, error: 'worker_heartbeat_failed' };
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'worker_heartbeat_exception' };
  }
}

async function persistOwnerRefreshToken(id, token, refresh) {
  if (!id || !token || !refresh) return;
  if(tggCoreEnabled()){ await tggStoreOwnerRefreshToken(id,refresh); return; }
  const result = await rpc.rpc('tgg_browser_cert_worker_session_store', { p_worker_id: id, p_token: token, p_refresh_token: refresh });
  if (result.error) throw result.error;
}

async function restoreOwnerSessionFromRefreshToken() {
  if (!workerId || !workerToken || ownerSession?.access_token) return Boolean(ownerSession?.access_token);
  try {
    const stored = tggCoreEnabled() ? await tggRestoreOwnerRefreshToken() : await rpc.rpc('tgg_browser_cert_worker_session_restore', { p_worker_id: workerId, p_token: workerToken });
    if (stored.error || !stored.data?.ok || !stored.data?.refresh_token) return false;
    const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const refreshed = await authClient.auth.refreshSession({ refresh_token: stored.data.refresh_token });
    if (refreshed.error || !refreshed.data?.session?.access_token) return false;
    ownerSession = { access_token: refreshed.data.session.access_token, refresh_token: refreshed.data.session.refresh_token || stored.data.refresh_token };
    await persistOwnerRefreshToken(workerId, workerToken, ownerSession.refresh_token);
    last = { status: 'session_restored', worker_id: workerId, updated_at: new Date().toISOString() };
    return true;
  } catch (_error) {
    return false;
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, version: RUNTIME_VERSION, worker_configured: Boolean(workerId && workerToken), session_bootstrapped: Boolean(ownerSession?.access_token), capabilities: { playwright:true, chromium:true, protected_audio_runtime:true, multi_flow_browser_runtime:true }, last }));

const QA_API_KEY = process.env.TGG_QA_API_KEY || '';

function qaAuthorized(req) {
  const presented = String(req.headers['x-tgg-qa-key'] || '');
  if (!QA_API_KEY || !presented) return false;
  const a = Buffer.from(QA_API_KEY);
  const b = Buffer.from(presented);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function allowedGameTarget(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!/^tru-go-getta-world(?:-v\d+(?:-rc|-staging)?)?\.onrender\.com$/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function runGameSmokeTarget(target) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const started = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResources = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
    });
    page.on('pageerror', err => pageErrors.push(String(err?.message || err).slice(0, 500)));
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() });
    });

    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    const title = await page.title();
    const releaseQa = await page.evaluate(() => {
      try {
        if (window.TGGReleaseQA && typeof window.TGGReleaseQA.run === 'function') {
          return window.TGGReleaseQA.run();
        }
        return null;
      } catch (error) {
        return { passed: false, error: error?.message || String(error), checks: [] };
      }
    });

    const foundationQa = await page.evaluate(() => {
      try {
        if (window.TGGQA && typeof window.TGGQA.run === 'function') return window.TGGQA.run();
        return window.TGGQA || null;
      } catch (error) {
        return { passed: false, error: error?.message || String(error) };
      }
    });

    const dom = await page.evaluate(() => ({
      title: document.title,
      menu: Boolean(document.getElementById('menu')),
      createPlayer: Boolean(document.getElementById('newGame')),
      gameScreen: Boolean(document.getElementById('game')),
      businessBoard: Boolean(document.getElementById('businessBoard')),
      businessApi: Boolean(window.TGGBusiness),
      worldSyncApi: Boolean(window.TGGWorldSync)
    }));

    const gameplay = await page.evaluate(() => {
      const checks = [];
      const record = (name, pass, detail='') => checks.push({ name, pass: Boolean(pass), detail });
      const active = id => document.getElementById(id)?.classList.contains('active') === true;
      const click = id => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.click();
        return true;
      };
      const moveKey = key => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

      try {
        localStorage.removeItem('tgg-game-v1');
        window.TGGGame?.show?.('menu');

        record('menu-active', active('menu'));
        record('create-player-control', click('newGame'));
        const creatorOpened = active('creator');
        record('create-player-opens-creator', creatorOpened);

        if (creatorOpened) {
          const stage = document.getElementById('stageName');
          const style = document.getElementById('styleChoice');
          if (stage) stage.value = 'TGG QA PLAYER';
          if (style) style.value = 'Rapper';

          record('start-game-control', click('startGame'));
          const gameOpened = active('game');
          record('start-game-enters-city', gameOpened);
          record('hud-player-name', document.getElementById('hudName')?.textContent === 'TGG QA PLAYER');

          if (gameOpened && window.TGGGame?.getState) {
            const beforeMove = Number(window.TGGGame.getState()?.x);
            moveKey('ArrowRight');
            const afterMove = Number(window.TGGGame.getState()?.x);
            record('keyboard-movement', afterMove > beforeMove, `${beforeMove}->${afterMove}`);

            click('saveBtn');
            record('save-persistence', Boolean(localStorage.getItem('tgg-game-v1')));

            const beforePause = Number(window.TGGGame.getState()?.x);
            click('pauseBtn');
            const paused = active('pause');
            record('pause-opens', paused);
            moveKey('ArrowRight');
            const afterPauseMove = Number(window.TGGGame.getState()?.x);
            record('pause-freezes-movement', paused && afterPauseMove === beforePause, `${beforePause}->${afterPauseMove}`);

            click('resumeBtn');
            record('resume-returns-city', active('game'));

            window.TGGGame.show('menu');
            click('continueGame');
            record('continue-restores-city', active('game'));
            record('continue-keeps-player', document.getElementById('hudName')?.textContent === 'TGG QA PLAYER');

            window.TGGGame.show('game');
            click('missionBtn');
            click('missionBtn');
            const missionAccepted = window.TGGGame.getState()?.accepted === true;
            record('mission-accept', missionAccepted);
            if (missionAccepted) {
              const s = window.TGGGame.getState();
              s.x = 72;
              s.y = 36;
              window.TGGGame.refresh?.();
              const cashBefore = Number(s.cash || 0);
              click('missionBtn');
              const s2 = window.TGGGame.getState();
              record('mission-complete', s2?.mission === null && s2?.accepted === false && Number(s2?.cash || 0) >= cashBefore + 250);
            } else {
              record('mission-complete', false, 'mission was not accepted');
            }

            click('businessBtn');
            record('business-opens', active('businessBoard'));
            record('business-grid-visible', Boolean(document.querySelector('#businessBoard .business-grid')));
          }
        }
      } catch (error) {
        record('gameplay-exception', false, error?.message || String(error));
      }

      return { passed: checks.length > 0 && checks.every(check => check.pass), checks };
    });

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    await context.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobile.newPage();
    const mobileResponse = await mobilePage.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForTimeout(700);
    const mobileLayout = await mobilePage.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth + 1
    }));
    await mobile.close();

    const releasePassed = releaseQa?.passed === true;
    const pass =
      (response?.status() || 0) >= 200 &&
      (response?.status() || 0) < 400 &&
      (mobileResponse?.status() || 0) >= 200 &&
      (mobileResponse?.status() || 0) < 400 &&
      releasePassed &&
      gameplay?.passed === true &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0 &&
      failedResources.length === 0 &&
      mobileLayout.overflowX === false &&
      dom.menu && dom.createPlayer && dom.gameScreen && dom.businessBoard && dom.businessApi && dom.worldSyncApi;

    return {
      ok: pass,
      target,
      version: RUNTIME_VERSION,
      http_status: response?.status() || 0,
      mobile_http_status: mobileResponse?.status() || 0,
      title,
      release_qa_passed: releasePassed,
      release_qa_failed_checks: Array.isArray(releaseQa?.checks) ? releaseQa.checks.filter(x => !x.pass).slice(0, 20) : [],
      foundation_qa: foundationQa,
      gameplay,
      dom,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      failed_resources: failedResources.slice(0, 20),
      mobile: mobileLayout,
      screenshot_sha256: sha256(screenshot),
      elapsed_ms: Date.now() - started
    };
  } finally {
    await browser.close();
  }
}

app.post('/qa/game-smoke', async (req, res) => {
  if (!qaAuthorized(req)) return res.status(403).json({ ok: false, error: 'qa_auth_required' });
  const target = allowedGameTarget(req.body?.target);
  if (!target) return res.status(400).json({ ok: false, error: 'target_not_allowed' });
  try {
    const result = await runGameSmokeTarget(target);
    last = { status: result.ok ? 'game_smoke_passed' : 'game_smoke_failed', target, updated_at: new Date().toISOString() };
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    const failure = { ok: false, error: error?.message || String(error), target, updated_at: new Date().toISOString() };
    last = { status: 'game_smoke_error', ...failure };
    return res.status(500).json(failure);
  }
});

app.get('/enroll', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>TGG Browser Worker Enrollment</title><style>body{font-family:Arial;background:#080808;color:#fff;max-width:720px;margin:50px auto;padding:24px}button{background:#e50914;color:#fff;border:0;padding:12px 18px;border-radius:8px;font-weight:700}input{display:block;width:100%;margin:8px 0;padding:12px;background:#151515;color:#fff;border:1px solid #333;border-radius:8px;box-sizing:border-box}pre{white-space:pre-wrap;background:#111;padding:15px;border-radius:8px}</style></head><body><h1>TGG Self-Hosted Browser Worker</h1><p>Owner-only enrollment. The authenticated Supabase session is handed directly to this worker and its refresh session is securely persisted for worker restarts.</p><input id="email" type="email" placeholder="Owner email"><input id="password" type="password" placeholder="Owner password"><button id="go">Enroll Worker</button><pre id="out">Waiting…</pre><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>(async()=>{const S=window.supabase.createClient(${JSON.stringify(SUPABASE_URL)},${JSON.stringify(SUPABASE_KEY)});document.querySelector('#go').onclick=async()=>{const out=document.querySelector('#out');try{const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;const a=await S.auth.signInWithPassword({email,password});if(a.error)throw a.error;const sess=a.data?.session;if(!sess)throw new Error('No authenticated session returned.');const r=await S.rpc('tgg_browser_cert_worker_enroll',{p_worker_name:'tgg-render-browser-worker',p_capabilities:{playwright:true,chromium:true,protected_audio_runtime:true,multi_flow_browser_runtime:true,command_center_runtime:true,creator_profile_runtime:true,expansion_runtime:true,growth_runtime:true,messenger_runtime:true,music_library_runtime:true,notifications_runtime:true,release_pro_runtime:true,session_recovery_runtime:true,supporters_runtime:true},p_metadata:{host:'render',version:${JSON.stringify(RUNTIME_VERSION)}}});if(r.error)throw r.error;const d=r.data&&Array.isArray(r.data)?r.data[0]:r.data;if(!d?.worker_id||!d?.worker_token)throw new Error('Enrollment did not return worker credentials.');const b=await fetch('/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worker_id:d.worker_id,worker_token:d.worker_token,access_token:sess.access_token,refresh_token:sess.refresh_token})});const bj=await b.json();if(!b.ok)throw new Error(bj.error||'Worker bootstrap failed');out.textContent='Worker enrolled and browser session bootstrapped. Refresh session persisted. TGG certification started.'}catch(e){out.textContent='ERROR: '+(e.message||String(e))}}})();</script></body></html>`));
app.post('/bootstrap', async (req, res) => { const authz = await authorizeBootstrap(req.body, { verifyOwner: verifyOwnerSession, verifyWorker: verifyWorkerCredential }); if (!authz.ok) return res.status(authz.error === 'invalid_bootstrap' ? 400 : 403).json({ error: authz.error }); const { worker_id:id, worker_token:token, access_token:access, refresh_token:refresh }=authz.value; workerId=id; workerToken=token; ownerSession={access_token:access,refresh_token:refresh}; try { await persistOwnerRefreshToken(id,token,refresh); } catch (_error) { return res.status(500).json({ error:'owner_session_persist_failed' }); } last={status:'bootstrapped',worker_id:id,updated_at:new Date().toISOString()}; scheduleBootstrapLoop(loop); return res.json({ok:true,worker_id:id,version:RUNTIME_VERSION,certification_started:true,session_persisted:true}); });
async function complete(job, verdict, result, evidence) { if(tggCoreEnabled()) return (await tggWorkerComplete(job.id,job.lease_token,verdict,result,evidence)).job; const r=await rpc.rpc('tgg_browser_cert_worker_complete',{p_worker_id:workerId,p_token:workerToken,p_job_id:job.id,p_lease_token:job.lease_token,p_verdict:verdict,p_result:result,p_evidence:evidence}); if(r.error)throw r.error; return r.data; }
async function restoreBrowserOwnerSession(context) { if(!ownerSession?.access_token)throw new Error('OWNER_SESSION_RESTORE_INPUT_MISSING'); const {data,error}=await rpc.auth.getUser(ownerSession.access_token); if(error||!data?.user)throw new Error('OWNER_SESSION_ACCESS_TOKEN_INVALID'); const sessionPayload=buildStoredSupabaseSession({accessToken:ownerSession.access_token,refreshToken:ownerSession.refresh_token,user:data.user}); if(!sessionPayload)throw new Error('OWNER_SESSION_RESTORE_FAILED'); const ref=new URL(SUPABASE_URL).hostname.split('.')[0]; const storageKey=`sb-${ref}-auth-token`; await context.addInitScript(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));},{key:storageKey,value:sessionPayload}); }
async function installTrustedQaRoute(page){ await page.route(/\/functions\/v1\/tgg-audio-access\?qa=protected_audio(?:&.*)?$/,async(route)=>{const upstream=await route.fetch();const status=upstream.status();const headers=upstream.headers();const body=await upstream.text();const prepared=prepareTrustedQaNavigationResponse({status,headers,body});if(!prepared.trusted){await route.fulfill({status,headers,body});return;}await route.fulfill({status:prepared.status,headers:prepared.headers,body:prepared.body});}); }
async function navigateProtectedAudioQa(page,baseUrl,job){await installTrustedQaRoute(page);let lastDiagnostic=null;for(let navigationAttempt=1;navigationAttempt<=3;navigationAttempt+=1){const navToken=`${job.id}-${job.attempt_count||0}-${navigationAttempt}-${Date.now()}`;const navUrl=withQaCacheBust(baseUrl,navToken);const response=await page.goto(navUrl,{waitUntil:'domcontentloaded',timeout:45000});const status=response?.status()||0;const headers=response?.headers()||{};const marker=String(headers['x-tgg-qa']||'');const contentType=String(headers['content-type']||'');const runButton=page.locator('#run');const hasRunButton=(await runButton.count().catch(()=>0))>0;const assessment=assessProtectedAudioQaPage({status,marker,hasRunButton});if(assessment.ok)return{runButton,navUrl,status,marker,contentType,trusted_navigation:/^text\/html\b/i.test(contentType)};lastDiagnostic={navigationAttempt,status,marker,contentType,title:await page.title().catch(()=>''),url:page.url(),reason:assessment.reason};if(navigationAttempt<3)await page.waitForTimeout(750*navigationAttempt);}throw new Error(`PROTECTED_AUDIO_QA_PAGE_INVALID:${JSON.stringify(lastDiagnostic||{reason:'unknown_navigation_failure'})}`);}
async function runProtectedAudio(job){const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const captures=[];const capture=async(type,payload)=>{const body=Buffer.from(JSON.stringify({type,at:new Date().toISOString(),...payload},null,2));captures.push({type,sha256:sha256(body),artifact_uri:`tgg://browser-cert/${job.id}/${type}.json`,metadata:payload});};const started=Date.now();try{const url=job.url||`${SUPABASE_URL}/functions/v1/tgg-audio-access?qa=protected_audio`;await restoreBrowserOwnerSession(context);const navigation=await navigateProtectedAudioQa(page,url,job);await capture('page_rendered',{url:page.url(),title:await page.title(),http_status:navigation.status,qa_marker:navigation.marker,content_type:navigation.contentType,trusted_navigation:navigation.trusted_navigation});const textBefore=await page.locator('body').innerText().catch(()=> '');await capture('authenticated',{session_bootstrapped:true,body_excerpt:textBefore.slice(-1200)});const qaRun=await page.evaluate(protectedAudioBrowserFlow,{supabaseUrl:SUPABASE_URL,apiKey:SUPABASE_KEY,accessToken:ownerSession.access_token});if(!qaRun?.ok)throw new Error(`PROTECTED_AUDIO_QA_PAGE_FAILED:${String(qaRun?.statusText||qaRun?.error||'Unknown browser QA failure').slice(0,1000)}`);const bodyText=await page.locator('body').innerText();const playbackStarted=qaRun.playbackStarted===true;const screenshotBuffer=await page.screenshot({fullPage:true,type:'png'});const html=await page.content();const result=buildProtectedAudioCertificateResult({job,screenshotBuffer,html,bodyText,playbackStarted,elapsedMs:Date.now()-started});captures.push({type:'screenshot',sha256:result.screenshot_sha256,artifact_uri:`tgg://browser-cert/${job.id}/screenshot.png`,metadata:{url:page.url(),bytes:screenshotBuffer.length,server_pass_observed:true}});captures.push({type:'page',sha256:result.html_sha256,artifact_uri:`tgg://browser-cert/${job.id}/page.html`,metadata:{url:page.url(),bytes:Buffer.byteLength(html),title:await page.title(),server_pass_observed:true}});await capture('protected_audio_result',{playback_started:playbackStarted,pass_text_observed:true,body_excerpt:bodyText.slice(-4000),track_id:qaRun.trackId||null});await capture('browser_certificate_observation',{authenticated:true,rendered:true,playback_started:playbackStarted,pass_text_observed:true,elapsed_ms:result.elapsed_ms,challenge_echo:result.challenge_echo});return{...result,authenticated:true,evidence_count:captures.length,captures};}finally{await context.close();await browser.close();}}
async function runGeneric(job){const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext({viewport:{width:1440,height:1000}});try{await restoreBrowserOwnerSession(context);const page=await context.newPage();return await runMultiFlowBrowser(page,{flowKey:job.flow_key,supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_KEY,accessToken:ownerSession.access_token,job});}finally{await context.close();await browser.close();}}
async function refreshWorkerToken(){const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');if(!workerId||!secret)return false;const res=await rpc.rpc('tgg_browser_cert_worker_bootstrap',{p_worker_id:workerId,p_bootstrap_secret:secret});if(res.error||!res.data?.worker_token){console.error(JSON.stringify({tgg_worker_token_refresh_failed:true,error:res.error?.message||'bootstrap_response_invalid'}));return false;}workerToken=res.data.worker_token;console.log(JSON.stringify({tgg_worker_token_refreshed:true,worker_id_configured:true}));return true;} async function loop(){
  console.log(JSON.stringify({tgg_loop_enter:true,running,worker_id_configured:Boolean(workerId),worker_token_configured:Boolean(workerToken),supabase_url_configured:Boolean(SUPABASE_URL)}));
  if(running)return;
  if(!workerId)return;
  try{
    const probe=await fetch(SUPABASE_URL+'/rest/v1/',{
      method:'GET',
      headers:{apikey:SUPABASE_KEY},
      signal:AbortSignal.timeout(5000)
    });
    const probeBody=await probe.text();
    let parsed=null;
    try{parsed=JSON.parse(probeBody);}catch{}
    console.log(JSON.stringify({
      tgg_postgrest_prebootstrap_probe:true,
      ok:probe.ok,
      status:probe.status,
      code:parsed?.code||null,
      message:parsed?.message||null,
      details:parsed?.details||null,
      hint:parsed?.hint||null,
      body:probeBody.slice(0,500)
    }));
  }catch(e){
    console.error(JSON.stringify({
      tgg_postgrest_prebootstrap_probe:true,
      ok:false,
      error:e?.message||String(e)
    }));
  }
  if(!workerToken && !(await ensureWorkerToken()))return;running=true;try{console.log(JSON.stringify({tgg_heartbeat_start:true}));let hb={data:null,error:null};try{const rr=await fetch(SUPABASE_URL+'/rest/v1/rpc/tgg_browser_cert_worker_heartbeat',{method:'POST',headers:{apikey:SUPABASE_KEY,...(SUPABASE_KEY.startsWith('sb_')?{}:{Authorization:'Bearer '+SUPABASE_KEY}),'Content-Type':'application/json'},body:JSON.stringify({p_worker_id:workerId,p_token:workerToken,p_metadata:{host:'render',version:RUNTIME_VERSION,session_bootstrapped:Boolean(ownerSession?.access_token),multi_flow_browser_runtime:true}}),signal:AbortSignal.timeout(5000)});const body=await rr.text();console.log(JSON.stringify({tgg_heartbeat_rest:true,status:rr.status,ok:rr.ok,body:body.slice(0,300)}));if(rr.ok){try{hb.data=JSON.parse(body);}catch{hb.error=new Error('heartbeat_invalid_json');}}else{let msg=body.slice(0,300);try{const parsed=JSON.parse(body);msg=parsed.message||parsed.error||msg;}catch{}hb.error=new Error(msg);}}catch(e){hb.error=e;}if(hb.error?.message==='WORKER_AUTH_FAILED'){console.error(JSON.stringify({tgg_worker_auth_recovery:true,reason:'worker_token_invalid',bootstrap_available:Boolean(process.env.TGG_WORKER_BOOTSTRAP_SECRET)}));const secret=process.env.TGG_WORKER_BOOTSTRAP_SECRET||'';if(!secret){workerToken='';last={status:'awaiting_owner_enrollment',updated_at:new Date().toISOString()};return;}const boot=await rpc.rpc('tgg_browser_cert_worker_bootstrap',{p_worker_id:workerId,p_bootstrap_secret:secret});if(boot.error||!boot.data?.worker_token){console.error(JSON.stringify({tgg_worker_rebootstrap:true,ok:false,error:boot.error?.message||'bootstrap_response_invalid'}));workerToken='';last={status:'awaiting_owner_enrollment',updated_at:new Date().toISOString()};return;}workerToken=boot.data.worker_token;hb=await rpc.rpc('tgg_browser_cert_worker_heartbeat',{p_worker_id:workerId,p_token:workerToken,p_metadata:{host:'render',version:RUNTIME_VERSION,session_bootstrapped:Boolean(ownerSession?.access_token),multi_flow_browser_runtime:true,rebootstrapped:true}});if(hb.error)throw hb.error;console.log(JSON.stringify({tgg_worker_rebootstrap:true,ok:true}));}if(hb.error){console.error(JSON.stringify({tgg_heartbeat_error:true,error:hb.error.message||String(hb.error)}));throw hb.error;}console.log(JSON.stringify({tgg_heartbeat_ok:true}));if(!ownerSession?.access_token){const restored=await restoreOwnerSessionFromRefreshToken();if(!restored){last={status:'awaiting_owner_session',updated_at:new Date().toISOString()};return;}}console.log(JSON.stringify({tgg_claim_start:true,session_present:Boolean(ownerSession?.access_token)}));const claim=await Promise.race([tggCoreEnabled()?tggWorkerClaim():rpc.rpc('tgg_browser_cert_worker_claim',{p_worker_id:workerId,p_token:workerToken,p_lease_seconds:300}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('WORKER_CLAIM_TIMEOUT')),15000))]);console.log(JSON.stringify({tgg_claim_result:true,ok:!claim?.error,has_data:Boolean(claim?.data)}));if(claim.error)throw claim.error;const job=tggCoreEnabled()?claim?.job:extractClaimJob(claim.data);console.log(JSON.stringify({tgg_claim_job:true,has_job:Boolean(job),job_id_present:Boolean(job?.id),flow_key:job?.flow_key||null}));if(!job?.id){last={status:'idle',updated_at:new Date().toISOString()};return;}last={status:'running',flow_key:job.flow_key,job_id:job.id,updated_at:new Date().toISOString()};try{const result=await Promise.race([job.flow_key==='protected_audio_runtime'?runProtectedAudio(job):runGeneric(job),new Promise((_,reject)=>setTimeout(()=>reject(new Error('BROWSER_FLOW_TIMEOUT')),90000))]);await complete(job,'passed',result,result.evidence||result.captures||[]);last={status:'passed',flow_key:job.flow_key,job_id:job.id,updated_at:new Date().toISOString()};}catch(e){const failure={error:e.message||String(e),real_browser_attempt:true,at:new Date().toISOString()};await complete(job,'failed',failure,[{type:'browser_failure',sha256:sha256(JSON.stringify(failure)),artifact_uri:`tgg://browser-cert/${job.id}/failure.json`,metadata:failure}]);last={status:'failed',flow_key:job.flow_key,job_id:job.id,error:failure.error,updated_at:new Date().toISOString()};}}catch(e){last={status:'worker_error',error:e.message||String(e),updated_at:new Date().toISOString()};}finally{running=false;}}
app.listen(PORT,()=>{console.log(`TGG browser worker ${RUNTIME_VERSION} listening on ${PORT}`);setInterval(loop,POLL_MS);void loop().catch(e=>console.error(JSON.stringify({tgg_initial_loop_error:true,error:e?.message||String(e)})));const smokeTarget=allowedGameTarget(process.env.TGG_GAME_SMOKE_TARGET||'');if(smokeTarget){void runGameSmokeTarget(smokeTarget).then(result=>{last={status:result.ok?'game_smoke_passed':'game_smoke_failed',target:smokeTarget,updated_at:new Date().toISOString()};console.log(JSON.stringify({tgg_game_smoke:true,...result}));}).catch(error=>{last={status:'game_smoke_error',target:smokeTarget,error:error?.message||String(error),updated_at:new Date().toISOString()};console.error(JSON.stringify({tgg_game_smoke:true,ok:false,target:smokeTarget,error:error?.message||String(error)}));});}});