import * as tus from 'tus-js-client';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const BROKER_URL = `${SUPABASE_URL}/functions/v1/tgg-media-operations`;
const STORAGE_TUS_URL = 'https://xsofowzvwetamhyuvlpj.storage.supabase.co/storage/v1/upload/resumable';
const OIDC_AUDIENCE = 'tgg-video-render-worker';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const preclaimedManifestFile = process.env.TGG_RENDER_MANIFEST_FILE || '';

if (!oidcRequestUrl || !oidcRequestToken) {
  console.error('GitHub OIDC runtime is unavailable. This worker must run in GitHub Actions with id-token: write.');
  process.exit(1);
}

const workerId = `github:${process.env.GITHUB_RUN_ID || 'manual'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
let jobId = null;
let leaseToken = null;
let tempDir = null;
let heartbeatTimer = null;
let latestProgress = 1;
let oidcCache = null;
let oidcCacheAt = 0;

function fail(message) {
  throw new Error(message);
}

async function oidcToken() {
  if (oidcCache && Date.now() - oidcCacheAt < 180_000) return oidcCache;
  const sep = oidcRequestUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${oidcRequestUrl}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { Authorization: `bearer ${oidcRequestToken}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.value) fail(`GitHub OIDC token request failed (${r.status}).`);
  oidcCache = String(d.value);
  oidcCacheAt = Date.now();
  return oidcCache;
}

async function broker(operation, args = {}) {
  const token = await oidcToken();
  const r = await fetch(BROKER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tgg-github-oidc': token,
    },
    body: JSON.stringify({ operation, ...args }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) fail(`Render broker ${operation} failed (${r.status}): ${d.error || d.detail || 'unknown error'}`);
  return d.data;
}

async function registerWorker(extra = {}) {
  return broker('render_worker_register', {
    phase: extra.phase || (jobId ? 'processing' : 'idle'),
    job_id: jobId,
    progress: latestProgress,
  });
}

async function probe(file) {
  return await new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      file,
    ]);
    let out = '';
    let err = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe failed (${code}): ${err.slice(-1200)}`));
      try {
        const j = JSON.parse(out || '{}');
        const s = Array.isArray(j.streams) ? j.streams[0] || {} : {};
        resolve({
          width: Number(s.width) || null,
          height: Number(s.height) || null,
          duration: Number(j.format?.duration) || null,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function targetEdge(preset) {
  if (preset === '720p') return 720;
  if (preset === '1080p') return 1080;
  if (preset === '2160p') return 2160;
  return null;
}

function scaleFilter(preset, width, height) {
  const edge = targetEdge(preset);
  if (!edge) return null;
  if (width && height && width < height) return `scale=${edge}:-2:flags=lanczos`;
  if (width && height && width === height) return `scale=${edge}:${edge}:flags=lanczos`;
  return `scale=-2:${edge}:flags=lanczos`;
}

function aspectRatio(projectAspect, width, height) {
  if (['16:9', '9:16', '1:1', '4:5'].includes(projectAspect)) return projectAspect;
  if (!width || !height) return '16:9';
  const r = width / height;
  const candidates = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5]];
  candidates.sort((a, b) => Math.abs(r - a[1]) - Math.abs(r - b[1]));
  return candidates[0][0];
}

async function heartbeat() {
  await registerWorker({ phase: jobId ? 'processing' : 'idle' });
  if (!jobId || !leaseToken) return;
  const r = await broker('render_worker_heartbeat', {
    job_id: jobId,
    lease_token: leaseToken,
    progress: Math.max(1, Math.min(98, latestProgress)),
  });
  if (r?.lease_valid === false) fail('Render lease expired or was revoked.');
}

async function transcode(inputFile, outputFile, preset, duration, sourceWidth, sourceHeight) {
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', inputFile, '-map', '0:v:0', '-map', '0:a:0?'];
  const vf = scaleFilter(preset, sourceWidth, sourceHeight);
  if (vf) args.push('-vf', vf);
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', preset === '2160p' ? '19' : '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    outputFile,
  );
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args);
    let stderr = '';
    let carry = '';
    p.stdout.on('data', d => {
      carry += d.toString();
      const lines = carry.split(/\r?\n/);
      carry = lines.pop() || '';
      for (const line of lines) {
        const [key, raw] = line.split('=', 2);
        if ((key === 'out_time_us' || key === 'out_time_ms') && duration) {
          const seconds = Number(raw) / 1_000_000;
          if (Number.isFinite(seconds)) latestProgress = Math.max(latestProgress, Math.min(98, Math.floor((seconds / duration) * 100)));
        }
      }
    });
    p.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-6000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${stderr}`)));
  });
}

async function tusUpload(fileBuffer, ticket) {
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(fileBuffer, {
      endpoint: STORAGE_TUS_URL,
      uploadSize: fileBuffer.length,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { 'x-signature': ticket.token },
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: ticket.bucket,
        objectName: ticket.path,
        contentType: 'video/mp4',
        cacheControl: '3600',
        metadata: JSON.stringify({ source: 'github.ffmpeg.v1', transport: 'tus-signed' }),
      },
      onError: reject,
      onProgress(done, total) {
        if (total) latestProgress = Math.max(latestProgress, Math.min(99, 95 + Math.floor((done / total) * 4)));
      },
      onSuccess: resolve,
    });
    upload.start();
  });
}

async function loadManifest() {
  if (!preclaimedManifestFile) {
    const claim = await broker('render_worker_claim');
    return claim?.manifest || null;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(preclaimedManifestFile, 'utf8'));
  } catch (e) {
    fail(`Preclaimed render manifest could not be read: ${e?.message || String(e)}`);
  }
  if (!parsed?.job?.id || !parsed?.lease_token) fail('Preclaimed render manifest is invalid.');
  return parsed;
}

async function main() {
  await registerWorker({ phase: preclaimedManifestFile ? 'resuming' : 'starting' });
  const manifest = await loadManifest();
  if (!manifest) {
    await registerWorker({ phase: 'idle' });
    console.log('TGG render worker: no queued server transcode jobs.');
    return;
  }

  const job = manifest.job || {};
  const payload = job.request_payload || {};
  jobId = job.id;
  leaseToken = manifest.lease_token;
  if (!jobId || !leaseToken) fail('Render manifest is missing its job or lease token.');
  if (payload.mode !== 'master_transcode') fail(`Unsupported worker job mode: ${payload.mode || 'unknown'}`);

  const preset = String(job.output_preset || '1080p').toLowerCase();
  if (!['720p', '1080p', '2160p', 'source'].includes(preset)) fail(`Unsupported output preset: ${preset}`);

  tempDir = await mkdtemp(join(tmpdir(), 'tgg-render-'));
  const inputFile = join(tempDir, 'source');
  const outputFile = join(tempDir, `master-${preset}.mp4`);

  console.log(`Claimed ${jobId} · ${preset} · revision ${job.source_revision}`);
  const dl = await broker('render_worker_download_url', { job_id: jobId, lease_token: leaseToken });
  const sourceResponse = await fetch(dl.signed_url);
  if (!sourceResponse.ok) fail(`Private source download failed (${sourceResponse.status}).`);
  await writeFile(inputFile, Buffer.from(await sourceResponse.arrayBuffer()));

  const sourceProbe = await probe(inputFile);
  const duration = Number(payload.source_duration_seconds) || sourceProbe.duration || null;
  heartbeatTimer = setInterval(() => { heartbeat().catch(e => console.warn('Heartbeat warning:', e?.message || String(e))); }, 60_000);
  await heartbeat();
  await transcode(inputFile, outputFile, preset, duration, sourceProbe.width, sourceProbe.height);
  latestProgress = 95;
  await heartbeat();

  const outputProbe = await probe(outputFile);
  const outputStat = await stat(outputFile);
  const ticket = await broker('render_worker_upload_ticket', { job_id: jobId, lease_token: leaseToken });
  const bytes = await readFile(outputFile);
  await tusUpload(bytes, ticket);
  latestProgress = 99;
  await heartbeat();

  const width = outputProbe.width || sourceProbe.width;
  const height = outputProbe.height || sourceProbe.height;
  const finalDuration = outputProbe.duration || duration;
  const projectAspect = manifest.project?.aspect_ratio || null;
  const completion = await broker('render_worker_complete', {
    job_id: jobId,
    lease_token: leaseToken,
    storage_path: ticket.path,
    aspect_ratio: aspectRatio(projectAspect, width, height),
    resolution: width && height ? `${width}x${height}` : preset,
    duration_seconds: finalDuration,
    metadata: {
      title: `${manifest.project?.title || 'TGG Video'} · Server MP4 ${preset}`,
      mime_type: 'video/mp4',
      width,
      height,
      file_size_bytes: outputStat.size,
      preset,
      worker: 'github.ffmpeg.v1',
      source_asset_id: payload.source_asset_id || null,
      source_storage_path: payload.source_storage_path,
    },
  });
  if (!completion?.ok) fail(`Render completion rejected: ${JSON.stringify(completion)}`);
  const completedJob = jobId;
  jobId = null;
  leaseToken = null;
  latestProgress = 100;
  await registerWorker({ phase: 'idle' });
  console.log(`Completed ${completedJob} -> ${ticket.path}`);
}

try {
  await main();
} catch (e) {
  const message = e?.message || String(e);
  console.error(message);
  if (jobId && leaseToken) {
    try {
      await broker('render_worker_fail', {
        job_id: jobId,
        lease_token: leaseToken,
        error: message.slice(0, 1900),
        retryable: !/Unsupported worker job mode|missing|Unsupported output preset/.test(message),
      });
    } catch (failError) {
      console.error('Could not record worker failure:', failError?.message || String(failError));
    }
  }
  process.exitCode = 1;
} finally {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
