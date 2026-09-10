import { createClient } from '@supabase/supabase-js';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.log('TGG render worker inactive: Supabase server credential is not configured.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const workerId = `github:${process.env.GITHUB_RUN_ID || 'manual'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
let jobId = null;
let leaseToken = null;
let tempDir = null;
let heartbeatTimer = null;
let latestProgress = 1;

function fail(message) {
  throw new Error(message);
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
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

function targetHeight(preset) {
  if (preset === '720p') return 720;
  if (preset === '1080p') return 1080;
  if (preset === '2160p') return 2160;
  return null;
}

function aspectRatio(projectAspect, width, height) {
  if (['16:9', '9:16', '1:1', '4:5'].includes(projectAspect)) return projectAspect;
  if (!width || !height) return '16:9';
  const r = width / height;
  const candidates = [
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1:1', 1],
    ['4:5', 4 / 5],
  ];
  candidates.sort((a, b) => Math.abs(r - a[1]) - Math.abs(r - b[1]));
  return candidates[0][0];
}

async function heartbeat() {
  if (!jobId || !leaseToken) return;
  try {
    const r = await rpc('tgg_video_render_worker_heartbeat', {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_progress: Math.max(1, Math.min(98, latestProgress)),
      p_lease_seconds: 900,
    });
    if (r?.lease_valid === false) fail('Render lease expired or was revoked.');
  } catch (e) {
    console.warn('Heartbeat warning:', e?.message || String(e));
  }
}

async function transcode(inputFile, outputFile, preset, duration) {
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', inputFile, '-map', '0:v:0', '-map', '0:a:0?'];
  const h = targetHeight(preset);
  if (h) args.push('-vf', `scale=-2:${h}:flags=lanczos`);
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

async function main() {
  const claim = await rpc('tgg_video_render_worker_claim', {
    p_worker_id: workerId,
    p_provider_key: 'github.ffmpeg.v1',
    p_lease_seconds: 900,
  });
  const manifest = claim?.manifest;
  if (!manifest) {
    console.log('TGG render worker: no queued server transcode jobs.');
    return;
  }

  const job = manifest.job || {};
  const payload = job.request_payload || {};
  jobId = job.id;
  leaseToken = manifest.lease_token;
  if (!jobId || !leaseToken) fail('Render manifest is missing its job or lease token.');
  if (payload.mode !== 'master_transcode') fail(`Unsupported worker job mode: ${payload.mode || 'unknown'}`);
  if (!payload.source_storage_path) fail('Master transcode source path is missing.');

  const bucket = payload.storage_bucket || 'creator-media';
  const preset = String(job.output_preset || '1080p').toLowerCase();
  if (!['720p', '1080p', '2160p', 'source'].includes(preset)) fail(`Unsupported output preset: ${preset}`);

  tempDir = await mkdtemp(join(tmpdir(), 'tgg-render-'));
  const inputFile = join(tempDir, 'source');
  const outputFile = join(tempDir, `master-${preset}.mp4`);

  console.log(`Claimed ${jobId} · ${preset} · revision ${job.source_revision}`);
  const dl = await supabase.storage.from(bucket).download(payload.source_storage_path);
  if (dl.error || !dl.data) throw dl.error || new Error('Source master download failed.');
  await writeFile(inputFile, Buffer.from(await dl.data.arrayBuffer()));

  const sourceProbe = await probe(inputFile);
  const duration = Number(payload.source_duration_seconds) || sourceProbe.duration || null;
  heartbeatTimer = setInterval(() => { heartbeat().catch(() => {}); }, 60_000);
  await heartbeat();
  await transcode(inputFile, outputFile, preset, duration);
  latestProgress = 99;
  await heartbeat();

  const outputProbe = await probe(outputFile);
  const outputStat = await stat(outputFile);
  const outputPrefix = manifest.output_storage_prefix;
  if (!outputPrefix) fail('Render output storage prefix is missing.');
  const outputPath = `${outputPrefix}master-${preset}-${Date.now()}.mp4`;
  const bytes = await readFile(outputFile);
  const up = await supabase.storage.from(bucket).upload(outputPath, bytes, {
    contentType: 'video/mp4',
    cacheControl: '3600',
    upsert: false,
  });
  if (up.error) throw up.error;

  const width = outputProbe.width || sourceProbe.width;
  const height = outputProbe.height || sourceProbe.height;
  const finalDuration = outputProbe.duration || duration;
  const projectAspect = manifest.project?.aspect_ratio || null;
  const completion = await rpc('tgg_video_render_worker_complete', {
    p_job_id: jobId,
    p_lease_token: leaseToken,
    p_storage_path: outputPath,
    p_format: 'mp4',
    p_aspect_ratio: aspectRatio(projectAspect, width, height),
    p_resolution: width && height ? `${width}x${height}` : preset,
    p_duration_seconds: finalDuration,
    p_metadata: {
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
  console.log(`Completed ${jobId} -> ${outputPath}`);
}

try {
  await main();
} catch (e) {
  const message = e?.message || String(e);
  console.error(message);
  if (jobId && leaseToken) {
    try {
      await rpc('tgg_video_render_worker_fail', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_error: message.slice(0, 1900),
        p_retryable: !/Unsupported worker job mode|missing|Unsupported output preset/.test(message),
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
