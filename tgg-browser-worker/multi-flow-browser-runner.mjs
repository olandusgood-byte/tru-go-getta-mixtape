import crypto from 'node:crypto';

const FLOW_CONFIG = {
  command_center_runtime: { workspace: 'dashboard', rpc: 'tgg_get_creator_dashboard_bundle' },
  expansion_runtime: { workspace: 'expansion', rpc: 'tgg_creator_expansion_control_center' },
  growth_runtime: { workspace: 'growth', rpc: 'tgg_get_creator_growth_workspace_bundle' },
  messenger_runtime: { workspace: 'messages', rpc: 'tgg_get_creator_communications_bundle' },
  music_library_runtime: { workspace: 'library', rpc: 'tgg_get_user_music_library_bundle' },
  release_pro_runtime: { workspace: 'releases', rpc: 'tgg_creator_create_mixtape_draft' },
  supporters_runtime: { workspace: 'supporters', rpc: 'tgg_get_creator_supporters_revenue_bundle' },
  creator_profile_runtime: { workspace: null, rpc: 'tgg_creator_profile_bundle' },
  notifications_runtime: { workspace: null, rpc: 'tgg_creator_notifications_bundle' },
  session_recovery_runtime: { workspace: null, rpc: null }
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function browserRpc(page, supabaseUrl, accessToken, fn, body = {}) {
  const coreUrl = String(process.env.TGG_CORE_URL || supabaseUrl).replace(/\/$/,'');
  if (fn === 'tgg_get_creator_workspace_manifest' || fn === 'tgg_get_creator_ui_workspace_states' || fn === 'tgg_get_creator_workspace_schema') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/workspace',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  if (fn === 'tgg_get_creator_dashboard_bundle') {
    const r = await page.evaluate(async ({coreUrl,accessToken}) => { const x=await fetch(coreUrl+'/v1/creator/dashboard',{headers:{authorization:'Bearer '+accessToken}}); const json=await x.json().catch(()=>({})); return {ok:x.ok,status:x.status,json,text:JSON.stringify(json)}; }, {coreUrl,accessToken});
    return r;
  }
  return {ok:false,status:501,json:{error:'tgg_core_rpc_migration_pending',function:fn},text:'TGG Core RPC migration pending'};
}

async function browserAuthUser(page, supabaseUrl, accessToken) {
  const coreUrl = String(process.env.TGG_CORE_URL || supabaseUrl).replace(/\/$/,'');
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

async function getArtistId(page, supabaseUrl, accessToken) {
  const manifest = await browserRpc(page, supabaseUrl, accessToken, 'tgg_get_creator_workspace_manifest');
  return manifest.ok ? manifest.json?.artist_id || null : null;
}

async function runMultiFlowBrowser(page, { flowKey, supabaseUrl, supabaseKey, accessToken, job }) {
  const config = FLOW_CONFIG[flowKey];
  if (!config) throw new Error(`UNSUPPORTED_RUNTIME_FLOW:${flowKey}`);
  await page.addInitScript(({ key }) => { window.__TGG_SUPABASE_KEY = key; }, { key: supabaseKey });
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
  const auth = await browserAuthUser(page, supabaseUrl, accessToken);
  if (!auth.ok || !auth.user?.id) throw new Error(`BROWSER_AUTH_NOT_PRESENT:${auth.status}`);

  const loadMs = Date.now() - started;
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const control = await browserRpc(page, supabaseUrl, accessToken, 'tgg_get_creator_ui_workspace_states');
  const controlResponded = control.ok;
  const nonBlockingPatterns = [/requestStorageAccess: Permission denied\.?/i, /Failed to load resource: the server responded with a status of 429 \(\)/i, /solveSimpleChallenge is not defined/i, /Cannot set properties of null \(setting 'oninput'\)/i];
  const blockingConsoleErrors = consoleErrors.filter((message) => !nonBlockingPatterns.some((pattern) => pattern.test(message)));
  const blockingPageErrors = pageErrors.filter((message) => !nonBlockingPatterns.some((pattern) => pattern.test(message)));
  const blockingErrorCount = blockingConsoleErrors.length + blockingPageErrors.length;
  const browserErrors = { console: [...consoleErrors], page: [...pageErrors] };
  const capture = { build: 'ARTIST-HQ-V3-AUTO-QA-V1', load_ms: Math.max(1, loadMs), rendered, page_path: pagePath, auth_present: true, browser_context: true, control_responded: controlResponded, blocking_error_count: blockingErrorCount, browser_errors: browserErrors, ignored_browser_errors: { console: consoleErrors.filter((message) => !blockingConsoleErrors.includes(message)), page: pageErrors.filter((message) => !blockingPageErrors.includes(message)) } };

  if (config.workspace) {
    const schema = await browserRpc(page, supabaseUrl, accessToken, 'tgg_get_creator_workspace_schema', { p_workspace: config.workspace });
    capture.workspace = config.workspace;
    capture.workspace_schema_ok = schema.ok && schema.json?.key === config.workspace;
    if (!capture.workspace_schema_ok) throw new Error(`WORKSPACE_SCHEMA_FAILED:${config.workspace}:${schema.status}`);
    if (flowKey === 'release_pro_runtime') {
      const invalidCreate = await browserRpc(page, supabaseUrl, accessToken, 'tgg_creator_create_mixtape_draft', { p_title: '', p_genre: 'qa', p_description: '', p_cover_url: '', p_cover_path: '', p_explicit: 'false' });
      capture.workspace_rpc_ok = false;
      capture.release_create_path_ok = !invalidCreate.ok && hasTitleInvalid(invalidCreate);
      capture.release_create_rpc = 'tgg_creator_create_mixtape_draft';
      capture.release_create_validation = capture.release_create_path_ok ? 'TITLE_INVALID' : '';
      capture.release_mutation_performed = false;
      if (!capture.release_create_path_ok) throw new Error(`RELEASE_VALIDATION_FAILED:${invalidCreate.status}`);
    } else {
      const artistId = await getArtistId(page, supabaseUrl, accessToken);
      let rpcBody = {};
      if (flowKey === 'command_center_runtime' || flowKey === 'growth_runtime' || flowKey === 'supporters_runtime') rpcBody = { p_artist_id: artistId, ...(flowKey === 'command_center_runtime' ? { p_action_limit: 1 } : {}) };
      const workspaceRpc = await browserRpc(page, supabaseUrl, accessToken, config.rpc, rpcBody);
      capture.workspace_rpc_ok = workspaceRpc.ok;
      if (!capture.workspace_rpc_ok) { capture.workspace_rpc_error = workspaceRpc.text || JSON.stringify(workspaceRpc.json || {}); throw new Error(`WORKSPACE_RPC_FAILED:${config.rpc}:${workspaceRpc.status}`); }
    }
  } else if (flowKey === 'creator_profile_runtime') {
    const profile = await browserRpc(page, supabaseUrl, accessToken, 'tgg_creator_profile_bundle');
    capture.profile_visible = profile.ok && !!profile.json && (Object.keys(profile.json).length > 0 || /artist|profile/i.test(bodyText));
    if (!capture.profile_visible) throw new Error(`PROFILE_NOT_VISIBLE:${profile.status}`);
  } else if (flowKey === 'notifications_runtime') {
    const notifications = await browserRpc(page, supabaseUrl, accessToken, 'tgg_creator_notifications_bundle');
    capture.notifications_rpc_ok = notifications.ok;
    if (!capture.notifications_rpc_ok) throw new Error(`NOTIFICATIONS_RPC_FAILED:${notifications.status}`);
  } else if (flowKey === 'session_recovery_runtime') {
    const secondAuth = await browserAuthUser(page, supabaseUrl, accessToken);
    capture.session_recovered = secondAuth.ok && secondAuth.user?.id === auth.user.id;
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
