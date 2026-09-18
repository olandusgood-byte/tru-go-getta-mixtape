const CORE_URL = String(process.env.TGG_CORE_URL || '').replace(/\/$/, '');
const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || '';
const workerId = process.env.TGG_WORKER_ID || '';
const bootstrapSecret = process.env.TGG_WORKER_BOOTSTRAP_SECRET || '';
const existingWorkerToken = process.env.TGG_WORKER_TOKEN || '';

const normalizeBootstrap = (value) => Array.isArray(value) ? value[0] : value;

async function coreBootstrap() {
  if (!CORE_URL || !workerId || !bootstrapSecret) throw new Error('TGG_CORE_BOOTSTRAP_CONFIGURATION_MISSING');
  const response = await fetch(`${CORE_URL}/v1/workers/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tgg-bootstrap-secret': bootstrapSecret },
    body: JSON.stringify({ worker_id: workerId, metadata: { host: 'render', bootstrap: 'restart' } }),
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.text();
  let data = {};
  try { data = JSON.parse(body); } catch {}
  if (!response.ok) throw new Error(data.error || body.slice(0, 400) || `core_bootstrap_http_${response.status}`);
  return data;
}

async function supabaseBootstrap() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !workerId || !bootstrapSecret) {
    throw new Error('SUPABASE_BOOTSTRAP_CONFIGURATION_MISSING');
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tgg_browser_cert_worker_bootstrap`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      ...(SUPABASE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${SUPABASE_KEY}` }),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_worker_id: workerId, p_bootstrap_secret: bootstrapSecret }),
    signal: AbortSignal.timeout(8000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body.slice(0, 400) || `supabase_bootstrap_http_${response.status}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('supabase_bootstrap_invalid_json'); }
  return normalizeBootstrap(data);
}

if (workerId && bootstrapSecret && !existingWorkerToken) {
  try {
    let bootstrapData = null;
    let transport = 'tgg_core';

    if (CORE_URL) {
      try {
        bootstrapData = await coreBootstrap();
      } catch (error) {
        console.error(JSON.stringify({
          tgg_core_bootstrap: true,
          ok: false,
          reason: error?.message || 'core_bootstrap_exception'
        }));
      }
    }

    if (!bootstrapData?.worker_token && SUPABASE_KEY) {
      transport = 'supabase_fallback';
      try {
        bootstrapData = await supabaseBootstrap();
      } catch (error) {
        console.error(JSON.stringify({
          tgg_supabase_bootstrap_fallback: true,
          ok: false,
          reason: error?.message || 'supabase_bootstrap_exception'
        }));
      }
    }

    if (!bootstrapData?.worker_token) throw new Error('bootstrap_response_invalid');

    process.env.TGG_WORKER_TOKEN = bootstrapData.worker_token;
    globalThis.__TGG_WORKER_TOKEN = bootstrapData.worker_token;

    console.log(JSON.stringify({
      tgg_worker_bootstrap: true,
      ok: true,
      worker_id_configured: true,
      worker_token_configured: true,
      bootstrap_secret_configured: true,
      transport
    }));
  } catch (error) {
    console.error(JSON.stringify({
      tgg_worker_bootstrap: true,
      ok: false,
      worker_id_configured: true,
      bootstrap_secret_configured: true,
      reason: error?.message || 'bootstrap_exception',
      preserved_existing_worker_token: Boolean(existingWorkerToken)
    }));
  }
} else {
  console.log(JSON.stringify({
    tgg_worker_bootstrap: true,
    ok: Boolean(existingWorkerToken),
    worker_id_configured: Boolean(workerId),
    worker_token_configured: Boolean(existingWorkerToken),
    bootstrap_secret_configured: Boolean(bootstrapSecret),
    tgg_core_configured: Boolean(CORE_URL),
    supabase_fallback_configured: Boolean(SUPABASE_KEY),
    reason: existingWorkerToken ? 'existing_worker_token' : 'bootstrap_configuration_missing'
  }));
}
