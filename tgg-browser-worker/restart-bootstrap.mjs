import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || '';
const workerId = process.env.TGG_WORKER_ID || '';
const bootstrapSecret = process.env.TGG_WORKER_BOOTSTRAP_SECRET || '';
const existingWorkerToken = process.env.TGG_WORKER_TOKEN || '';

const normalizeBootstrap = (value) => Array.isArray(value) ? value[0] : value;

async function probePostgrest() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(5000)
    });
    const body = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    console.log(JSON.stringify({
      tgg_bootstrap_postgrest_probe: true,
      ok: response.ok,
      status: response.status,
      code: parsed?.code || null,
      message: parsed?.message || null,
      details: parsed?.details || null,
      hint: parsed?.hint || null,
      body: body.slice(0, 500)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      tgg_bootstrap_postgrest_probe: true,
      ok: false,
      error: error?.message || String(error)
    }));
  }
}


async function directBootstrap() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tgg_browser_cert_worker_bootstrap`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_worker_id: workerId,
      p_bootstrap_secret: bootstrapSecret
    }),
    signal: AbortSignal.timeout(8000)
  });

  const body = await response.text();
  if (!response.ok) {
    let message = body.slice(0, 400) || `bootstrap_http_${response.status}`;
    try {
      const parsed = JSON.parse(body);
      message = parsed.message || parsed.error || message;
    } catch {}
    throw new Error(message);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('bootstrap_invalid_json');
  }
  return normalizeBootstrap(data);
}

if (workerId && bootstrapSecret && SUPABASE_KEY && !existingWorkerToken) {
  try {
    await probePostgrest();
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let bootstrapData = null;
    let primaryError = null;

    try {
      const { data, error } = await client.rpc('tgg_browser_cert_worker_bootstrap', {
        p_worker_id: workerId,
        p_bootstrap_secret: bootstrapSecret
      });
      bootstrapData = normalizeBootstrap(data);
      primaryError = error;
    } catch (error) {
      primaryError = error;
    }

    if (!bootstrapData?.ok || !bootstrapData?.worker_token) {
      console.log(JSON.stringify({
        tgg_worker_bootstrap_fallback: true,
        primary_ok: false,
        primary_reason: primaryError?.message || 'bootstrap_response_invalid'
      }));
      bootstrapData = await directBootstrap();
    }

    if (!bootstrapData?.ok || !bootstrapData?.worker_token) {
      throw new Error('bootstrap_response_invalid');
    }

    process.env.TGG_WORKER_TOKEN = bootstrapData.worker_token;
    globalThis.__TGG_WORKER_TOKEN = bootstrapData.worker_token;

    console.log(JSON.stringify({
      tgg_worker_bootstrap: true,
      ok: true,
      worker_id_configured: true,
      worker_token_configured: true,
      bootstrap_secret_configured: true,
      transport: primaryError ? 'rest_fallback' : 'supabase_client'
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
    supabase_key_configured: Boolean(SUPABASE_KEY),
    reason: existingWorkerToken ? 'existing_worker_token' : 'bootstrap_configuration_missing'
  }));
}
