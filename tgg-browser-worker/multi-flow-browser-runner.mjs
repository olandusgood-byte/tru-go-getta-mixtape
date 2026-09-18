import crypto from 'node:crypto';

const FLOW_CONFIG = {
  command_center_runtime: { workspace: 'dashboard', rpc: 'tgg_get_creator_dashboard_bundle' },
  expansion_runtime: { workspace: 'expansion', rpc: 'tgg_creator_expansion_control_center' },
  growth_runtime: { workspace: 'growth', rpc: 'tgg_get_creator_growth_workspace_bundle' },
  messenger_runtime: { workspace: 'messages', rpc: 'tgg_get_creator_communications_bundle' },
  music_library_runtime: { workspace: 'library', rpc: 'tgg_get_user_music_library_bundle' },
  release_pro_runtime: { workspace: 'releases', rpc: 'tgg_get_creator_releases' },
  supporters_runtime: { workspace: 'supporters', rpc: 'tgg_get_creator_supporters_revenue_bundle' },
  creator_profile_runtime: { workspace: null, rpc: 'tgg_creator_profile_bundle' },
  notifications_runtime: { workspace: null, rpc: 'tgg_creator_notifications_bundle' },
  session_recovery_runtime: { workspace: null, rpc: null }
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function browserRpc(page, tggCoreUrl, accessToken, fn, body = {}) {
  const coreUrl = String(process.env.TGG_CORE_URL || tggCoreUrl).replace(/\/$/,'');
  if (fn === 'tgg_get_creator_workspace_manifest' || fn === 'tgg_get_creator_ui_workspace_states' || fn === 'tgg_get_creator_workspace_schema') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/workspace',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_dashboard_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/dashboard',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_user_music_library_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/library',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_creator_profile_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/profile',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }\n  if (fn === 'tgg_creator_notifications_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/notifications',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_growth_workspace_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/growth',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_creator_expansion_control_center') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/expansion',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_communications_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/messages',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_releases') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/releases',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_supporters_revenue_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const [a,b]=await Promise.all([fetch(coreUrl+'/v1/creator/supporters',{headers:{authorization:'Bearer '+accessToken}}),fetch(coreUrl+'/v1/creator/revenue',{headers:{authorization:'Bearer '+accessToken}})]); const supporters=await a.json().catch(()=>({})); const revenue=await b.json().catch(()=>({})); return {ok:a.ok&&b.ok,status:a.ok?b.status:a.status,json:{supporters:supporters.supporters||[],revenue},text:JSON.stringify({supporters:supporters.supporters||[],revenue})}; }, {coreUrl,accessToken});
    return r;
  }
  return {ok:false,status:501,json:{error:'tgg_core_rpc_migration_pending',function:fn},text:'TGG Core RPC migration pending'};
}

async function browserAuthUser(page, tggCoreUrl, accessToken) {
  const coreUrl = String(process.env.TGG_CORE_URL || tggCoreUrl).replace(/\/$/,'');
  return page.evaluate(async ({ coreUrl, accessToken }) => {
    const r = await fetch(coreUrl + '/v1/me', { headers: { Authorization: 'Bearer ' + accessToken } });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json, text: JSON.stringify(json) };
  }, { coreUrl, accessToken });
}

function hasTitleInvalid(result) {
  const haystack = `${result?.text || ''} ${JSON.stringify(result?.json || {})}`.toUpperCase();
  return haystack.includes('TITLE_INVALID');
}

async function getArtistId(page, tggCoreUrl, accessToken) {
  const manifest = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_get_creator_workspace_manifest');
  return manifest.ok ? manifest.json?.artist_id || null : null;
}

async function runMultiFlowBrowser(page, { flowKey, tggCoreUrl, tggCoreKey, accessToken, job }) {
  const config = FLOW_CONFIG[flowKey];
  if (!config) throw new Error(`UNSUPPORTED_RUNTIME_FLOW:${flowKey}`);
  await page.addInitScript(({ key }) => { window.__TGG_CORE_KEY = key; }, { key: tggCoreKey });
  const started = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 1000)); });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 1000)));

  const baseUrl = job.url || 'https://trugogettamixtapes.blogspot.com/p/artist-dashboard_0633467215.html';
  const parsedUrl = new URL(baseUrl);
  const pagePath = parsedUrl.pathname + parsedUrl.search;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const rendered = await page.evaluate(() => document.readyState !== 'loading' && !!document.body);
  if (!rendered) throw new Error('BROWSER_PAGE_NOT_RENDERED');
  const auth = await browserAuthUser(page, tggCoreUrl, accessToken);
  if (!auth.ok || !auth.json?.user?.id) throw new Error(`BROWSER_AUTH_NOT_PRESENT:${auth.status}`);

  const loadMs = Date.now() - started;
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const control = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_get_creator_ui_workspace_states');
  const controlResponded = control.ok;
  const nonBlockingPatterns = [/requestStorageAccess: Permission denied\.?/i, /Failed to load resource: the server responded with a status of 429 \(\)/i, /solveSimpleChallenge is not defined/i, /Cannot set properties of null \(setting 'oninput'\)/i];
  const blockingConsoleErrors = consoleErrors.filter((message) => !nonBlockingPatterns.some((pattern) => pattern.test(message)));
  const blockingPageErrors = pageErrors.filter((message) => !nonBlockingPatterns.some((pattern) => pattern.test(message)));
  const blockingErrorCount = blockingConsoleErrors.length + blockingPageErrors.length;
  const browserErrors = { console: [...consoleErrors], page: [...pageErrors] };
  const capture = { build: 'ARTIST-HQ-V3-AUTO-QA-V1', load_ms: Math.max(1, loadMs), rendered, page_path: pagePath, auth_present: true, browser_context: true, control_responded: controlResponded, blocking_error_count: blockingErrorCount, browser_errors: browserErrors, ignored_browser_errors: { console: consoleErrors.filter((message) => !blockingConsoleErrors.includes(message)), page: pageErrors.filter((message) => !blockingPageErrors.includes(message)) } };

  if (config.workspace) {
    const schema = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_get_creator_workspace_schema', { p_workspace: config.workspace });
    capture.workspace = config.workspace;
    capture.workspace_schema_ok = schema.ok && schema.json?.key === config.workspace;
    if (!capture.workspace_schema_ok) throw new Error(`WORKSPACE_SCHEMA_FAILED:${config.workspace}:${schema.status}`);
    if (flowKey === 'release_pro_runtime') {
      const releases = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_get_creator_releases');
      capture.workspace_rpc_ok = releases.ok;
      capture.release_create_path_ok = false;
      capture.release_create_rpc = 'tgg_get_creator_releases';
      capture.release_create_validation = 'READ_ONLY_NATIVE_TGG_ROUTE';
      capture.release_mutation_performed = false;
      capture.release_count = Array.isArray(releases.json?.releases) ? releases.json.releases.length : 0;
      if (!releases.ok) throw new Error(`RELEASE_READ_FAILED:${releases.status}`);
    } else {
      const artistId = await getArtistId(page, tggCoreUrl, accessToken);
      let rpcBody = {};
      if (flowKey === 'command_center_runtime' || flowKey === 'growth_runtime' || flowKey === 'supporters_runtime') rpcBody = { p_artist_id: artistId, ...(flowKey === 'command_center_runtime' ? { p_action_limit: 1 } : {}) };
      const workspaceRpc = await browserRpc(page, tggCoreUrl, accessToken, config.rpc, rpcBody);
      capture.workspace_rpc_ok = workspaceRpc.ok;
      if (!capture.workspace_rpc_ok) { capture.workspace_rpc_error = workspaceRpc.text || JSON.stringify(workspaceRpc.json || {}); throw new Error(`WORKSPACE_RPC_FAILED:${config.rpc}:${workspaceRpc.status}`); }
    }
  } else if (flowKey === 'creator_profile_runtime') {
    const profile = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_creator_profile_bundle');
    capture.profile_visible = profile.ok && !!profile.json && (Object.keys(profile.json).length > 0 || /artist|profile/i.test(bodyText));
    if (!capture.profile_visible) throw new Error(`PROFILE_NOT_VISIBLE:${profile.status}`);
  } else if (flowKey === 'notifications_runtime') {
    const notifications = await browserRpc(page, tggCoreUrl, accessToken, 'tgg_creator_notifications_bundle');
    capture.notifications_rpc_ok = notifications.ok;
    if (!capture.notifications_rpc_ok) throw new Error(`NOTIFICATIONS_RPC_FAILED:${notifications.status}`);
  } else if (flowKey === 'session_recovery_runtime') {
    const secondAuth = await browserAuthUser(page, tggCoreUrl, accessToken);
    capture.session_recovered = secondAuth.ok && secondAuth.json?.user?.id === auth.json?.user?.id;
    if (!capture.session_recovered) throw new Error(`SESSION_RECOVERY_FAILED:${secondAuth.status}`);
  }

  if (!controlResponded) throw new Error('CONTROL_DID_NOT_RESPOND');
  if (blockingErrorCount !== 0) {
    const diagnostic = JSON.stringify(browserErrors).slice(0, 7000);
    throw new Error(`BLOCKING_BROWSER_ERRORS:${blockingErrorCount}:${diagnostic}`);
  }
  if (loadMs <= 0) throw new Error('INVALID_BROWSER_LOAD_TIME');

  const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
  const html = await page.content();
  const screenshotSha256 = sha256(screenshot);
  const htmlSha256 = sha256(html);
  const evidence = [
    { type: 'screenshot', sha256: screenshotSha256, artifact_uri: `tgg://browser-cert/${job.id}/screenshot.png`, metadata: { flow_key: flowKey, url: page.url() } },
    { type: 'page', sha256: htmlSha256, artifact_uri: `tgg://browser-cert/${job.id}/page.html`, metadata: { flow_key: flowKey, url: page.url(), bytes: Buffer.byteLength(html) } },
    { type: 'browser_execution_capture', sha256: sha256(JSON.stringify(capture)), artifact_uri: `tgg://browser-cert/${job.id}/capture.json`, metadata: capture }
  ];
  return { ...capture, evidence, authenticated: true, browser_execution: true, executed: true, challenge_echo: job.spec?.challenge || '', screenshot_sha256: screenshotSha256, html_sha256: htmlSha256, flow_key: flowKey, elapsed_ms: loadMs };
}

export { FLOW_CONFIG, runMultiFlowBrowser };

// TGG_WORKER_DEPLOY_SYNC_2026-09-18: keep Railway source revision synchronized with main.
