import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.TGG_SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const SUPABASE_KEY = process.env.TGG_SUPABASE_KEY || '';
const workerId = process.env.TGG_WORKER_ID || '';
const bootstrapSecret = process.env.TGG_WORKER_BOOTSTRAP_SECRET || '';
const existingWorkerToken = process.env.TGG_WORKER_TOKEN || '';

if (workerId && bootstrapSecret && SUPABASE_KEY) {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await client.rpc('tgg_browser_cert_worker_bootstrap', {
      p_worker_id: workerId,
      p_bootstrap_secret: bootstrapSecret
    });
    if (error || !data?.ok || !data?.worker_token) {
      console.error(JSON.stringify({
        tgg_worker_bootstrap: true,
        ok: false,
        worker_id_configured: true,
        bootstrap_secret_configured: true,
        reason: error?.message || 'bootstrap_response_invalid'
      }));
    } else {
      process.env.TGG_WORKER_TOKEN = data.worker_token;
      console.log(JSON.stringify({
        tgg_worker_bootstrap: true,
        ok: true,
        worker_id_configured: true,
        worker_token_configured: true,
        bootstrap_secret_configured: true
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      tgg_worker_bootstrap: true,
      ok: false,
      worker_id_configured: true,
      bootstrap_secret_configured: true,
      reason: error?.message || 'bootstrap_exception'
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
