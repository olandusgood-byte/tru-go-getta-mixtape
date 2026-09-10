import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const BROKER_URL = `${SUPABASE_URL}/functions/v1/tgg-media-operations`;
const OIDC_AUDIENCE = 'tgg-video-render-worker';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const outputFile = process.env.GITHUB_OUTPUT;
const runnerTemp = process.env.RUNNER_TEMP || '/tmp';
const manifestFile = join(runnerTemp, 'tgg-render-manifest.json');
const workerId = `github:${process.env.GITHUB_RUN_ID || 'manual'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}`;

if (!oidcRequestUrl || !oidcRequestToken) throw new Error('GitHub OIDC runtime unavailable.');
if (!outputFile) throw new Error('GITHUB_OUTPUT unavailable.');

async function token() {
  const sep = oidcRequestUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${oidcRequestUrl}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { Authorization: `bearer ${oidcRequestToken}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.value) throw new Error(`OIDC token request failed (${r.status}).`);
  return String(d.value);
}

async function broker(operation, args = {}) {
  const r = await fetch(BROKER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tgg-github-oidc': await token() },
    body: JSON.stringify({ operation, ...args }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(`Render broker ${operation} failed (${r.status}): ${d.error || d.detail || 'unknown error'}`);
  return d.data;
}

await broker('render_worker_register', {
  phase: 'probe',
  job_id: null,
  progress: 1,
});

const claim = await broker('render_worker_claim');
const manifest = claim?.manifest || null;
if (manifest) {
  await writeFile(manifestFile, JSON.stringify(manifest), { mode: 0o600 });
  await writeFile(outputFile, `has_work=true\nmanifest_file=${manifestFile}\n`, { flag: 'a' });
  console.log(`TGG render probe claimed ${manifest.job?.id || 'job'}; heavy worker setup required.`);
} else {
  await writeFile(outputFile, 'has_work=false\n', { flag: 'a' });
  console.log('TGG render probe: queue empty; heavy FFmpeg setup skipped.');
}
