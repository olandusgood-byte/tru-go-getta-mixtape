import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isTransientBrokerFailure, retryDelayMs, shouldDeferProbe, isTransientBrokerException } from './tgg-video-render-retry.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const BROKER_URL = `${SUPABASE_URL}/functions/v1/tgg-media-operations`;
const OIDC_AUDIENCE = 'tgg-video-render-worker';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const outputFile = process.env.GITHUB_OUTPUT;
const runnerTemp = process.env.RUNNER_TEMP || '/tmp';
const manifestFile = join(runnerTemp, 'tgg-render-manifest.json');
const BROKER_TIMEOUT_MS = 20000;

if (!oidcRequestUrl || !oidcRequestToken) throw new Error('GitHub OIDC runtime unavailable.');
if (!outputFile) throw new Error('GITHUB_OUTPUT unavailable.');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function token() {
  const sep = oidcRequestUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${oidcRequestUrl}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { Authorization: `bearer ${oidcRequestToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.value) throw new Error(`OIDC token request failed (${r.status}).`);
  return String(d.value);
}

async function broker(operation, args = {}) {
  const maxAttempts = operation === 'render_worker_register' ? 4 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let r;
    let d = {};
    try {
      r = await fetch(BROKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tgg-github-oidc': await token() },
        body: JSON.stringify({ operation, ...args }),
        signal: AbortSignal.timeout(BROKER_TIMEOUT_MS),
      });
      d = await r.json().catch(() => ({}));
    } catch (error) {
      const message = `Render broker ${operation} network failure: ${error?.message || String(error)}`;
      const transient = isTransientBrokerException(error);
      const canRetry = operation === 'render_worker_register' && transient && attempt < maxAttempts - 1;
      if (canRetry) {
        const delay = retryDelayMs(attempt);
        console.warn(`${message}. Safe registration retry ${attempt + 1}/${maxAttempts - 1} in ${delay}ms.`);
        await sleep(delay);
        continue;
      }
      if (['render_worker_register', 'render_worker_claim'].includes(operation) && transient) {
        console.warn(`${message}. Probe deferred; scheduled worker will retry without leasing or completing work.`);
        return { __deferred: true };
      }
      throw error;
    }

    if (r.ok && d.ok) return d.data;

    const message = `Render broker ${operation} failed (${r.status}): ${d.error || d.detail || 'unknown error'}`;
    const canRetry = operation === 'render_worker_register' && isTransientBrokerFailure(r.status, d) && attempt < maxAttempts - 1;
    if (canRetry) {
      const delay = retryDelayMs(attempt);
      console.warn(`${message}. Safe registration retry ${attempt + 1}/${maxAttempts - 1} in ${delay}ms.`);
      await sleep(delay);
      continue;
    }

    if (shouldDeferProbe(operation, r.status, d)) {
      console.warn(`${message}. Probe deferred; scheduled worker will retry without leasing or completing work.`);
      return { __deferred: true };
    }

    throw new Error(message);
  }

  throw new Error(`Render broker ${operation} failed after bounded retries.`);
}

const registration = await broker('render_worker_register', {
  phase: 'probe',
  job_id: null,
  progress: 1,
});

if (registration?.__deferred) {
  await writeFile(outputFile, 'has_work=false\nbroker_deferred=true\n', { flag: 'a' });
  console.log('TGG render probe deferred before registration because the broker/Data API is temporarily unavailable.');
} else {
  const claim = await broker('render_worker_claim');
  if (claim?.__deferred) {
    await writeFile(outputFile, 'has_work=false\nbroker_deferred=true\n', { flag: 'a' });
    console.log('TGG render probe deferred before claim completion because the broker/Data API is temporarily unavailable.');
  } else {
    const manifest = claim?.manifest || null;
    if (manifest) {
      await writeFile(manifestFile, JSON.stringify(manifest), { mode: 0o600 });
      await writeFile(outputFile, `has_work=true\nbroker_deferred=false\nmanifest_file=${manifestFile}\n`, { flag: 'a' });
      console.log(`TGG render probe claimed ${manifest.job?.id || 'job'}; heavy worker setup required.`);
    } else {
      await writeFile(outputFile, 'has_work=false\nbroker_deferred=false\n', { flag: 'a' });
      console.log('TGG render probe: queue empty; heavy FFmpeg setup skipped.');
    }
  }
}
