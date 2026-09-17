console.log(JSON.stringify({
  tgg_worker_launcher: true,
  worker_id_configured: Boolean(process.env.TGG_WORKER_ID),
  worker_token_configured: Boolean(process.env.TGG_WORKER_TOKEN),
  supabase_key_configured: Boolean(process.env.TGG_SUPABASE_KEY),
  browser_backend: process.env.TGG_BROWSER_BACKEND || 'local'
}));
await import('./restart-bootstrap.mjs');
console.log(JSON.stringify({
  tgg_worker_launcher_ready: true,
  worker_id_configured: Boolean(process.env.TGG_WORKER_ID),
  worker_token_configured: Boolean(process.env.TGG_WORKER_TOKEN),
  browser_backend: process.env.TGG_BROWSER_BACKEND || 'local'
}));
await import('./steel-entry.mjs');
