console.log(JSON.stringify({
  tgg_worker_launcher: true,
  worker_id_configured: Boolean(process.env.TGG_WORKER_ID),
  worker_token_configured: Boolean(process.env.TGG_WORKER_TOKEN),
  supabase_key_configured: Boolean(process.env.TGG_SUPABASE_KEY),
  browser_backend: process.env.TGG_BROWSER_BACKEND || 'local'
}));
await import('./restart-bootstrap.mjs');
globalThis.__TGG_WORKER_TOKEN = process.env.TGG_WORKER_TOKEN || '';
globalThis.__TGG_WORKER_ID = process.env.TGG_WORKER_ID || '';
console.log(JSON.stringify({
  tgg_worker_launcher_ready: true,
  worker_id_configured: Boolean(process.env.TGG_WORKER_ID),
  worker_token_configured: Boolean(process.env.TGG_WORKER_TOKEN),
  browser_backend: process.env.TGG_BROWSER_BACKEND || 'local'
}));
await import('./steel-entry.mjs');
