import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '70mb' }));
const CORS_ORIGINS = new Set(String(process.env.TGG_CORS_ORIGINS || 'https://trugogettamixtapes.blogspot.com').split(',').map(x=>x.trim()).filter(Boolean));
app.use((req,res,next)=>{
  const origin=req.get('origin');
  if(origin && CORS_ORIGINS.has(origin)){
    res.set('Access-Control-Allow-Origin',origin);
    res.set('Vary','Origin');
    res.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-File-Name, X-Mime-Type, X-Project-Media-Kind, X-TGG-GitHub-OIDC, X-TGG-Render-Lease, X-TGG-Worker-ID, X-TGG-Worker-Token, X-TGG-Bootstrap-Secret');
    res.set('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,OPTIONS');
  }
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});

// TGG_VIDEO_STUDIO_V2_STATIC
const VIDEO_STUDIO_PUBLIC_ROOT = path.resolve(process.cwd(), 'tgg-core/public/video-studio');
app.use('/video-studio', express.static(VIDEO_STUDIO_PUBLIC_ROOT, {
  etag: true,
  maxAge: '5m',
  index: 'index.html',
  setHeaders(res,filePath) {
    if (/\.(?:css|js|webmanifest|svg)$/i.test(filePath)) {
      res.set('Cache-Control','public, max-age=300, stale-while-revalidate=86400');
    } else if (/index\.html$/i.test(filePath)) {
      res.set('Cache-Control','no-cache');
    }
  }
}));

import './autopilot.mjs';

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const STORAGE_ROOT = process.env.TGG_STORAGE_ROOT || '/data/media';
if (!DATABASE_URL) console.warn('[TGG Core] DATABASE_URL is not configured');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10)
});

const schemaPath = new URL('./schema.sql', import.meta.url);
let initPromise;
async function init() {
  if (!DATABASE_URL) return;
  if (!initPromise) {
    initPromise = (async () => {
      const schema = await fs.readFile(schemaPath, 'utf8');
      await pool.query(schema);
      await pool.query(`create table if not exists tgg_worker_registry (id uuid primary key default gen_random_uuid(), worker_id text not null unique, worker_token_hash text not null, status text not null default 'active', metadata jsonb not null default '{}'::jsonb, last_seen_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()); create table if not exists tgg_browser_jobs (id uuid primary key default gen_random_uuid(), worker_id uuid references tgg_worker_registry(id) on delete set null, flow_key text not null, status text not null default 'queued', payload jsonb not null default '{}'::jsonb, result jsonb, evidence jsonb not null default '[]'::jsonb, lease_token text, lease_expires_at timestamptz, attempts integer not null default 0, max_attempts integer not null default 3, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz); create index if not exists tgg_browser_jobs_claim_idx on tgg_browser_jobs(status,lease_expires_at,created_at);`);
    })();
  }
  return initPromise;
}

const SESSION_DAYS = 30;
const TOKEN_SECRET = process.env.TGG_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function secretKey(material=TOKEN_SECRET){ return crypto.createHash('sha256').update(String(material)).digest(); }
function encryptSecret(value,material=TOKEN_SECRET){ const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',secretKey(material),iv); const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]); return iv.toString('base64url')+'.'+cipher.getAuthTag().toString('base64url')+'.'+encrypted.toString('base64url'); }
function decryptSecret(value,material=TOKEN_SECRET){ try { const [ivS,tagS,dataS]=String(value||'').split('.'); if(!ivS||!tagS||!dataS) return null; const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(material),Buffer.from(ivS,'base64url')); decipher.setAuthTag(Buffer.from(tagS,'base64url')); return Buffer.concat([decipher.update(Buffer.from(dataS,'base64url')),decipher.final()]).toString('utf8'); } catch { return null; } }

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function newToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

async function auth(req, res, next) {
  try {
    await init();
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'missing_bearer_token' });
    const result = await pool.query(
      `select u.id, u.email, u.display_name, u.role, s.id as session_id
       from sessions s join users u on u.id=s.user_id
       where s.token_hash=$1 and s.expires_at > now()`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'invalid_or_expired_session' });
    req.user = result.rows[0];
    await pool.query('update sessions set last_seen_at=now() where id=$1', [req.user.session_id]);
    next();
  } catch (e) { next(e); }
}

const ARTIST_HQ_TRANSPORT = new URL('./artist-hq-transport.js', import.meta.url);
app.get('/assets/artist-hq-transport.js', async (_req, res, next) => {
  try {
    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(await fs.readFile(ARTIST_HQ_TRANSPORT, 'utf8'));
  } catch (e) { next(e); }
});

app.get('/health', async (_req, res) => {
  try {
    await init();
    const db = DATABASE_URL ? (await pool.query('select now() as now')).rows[0].now : null;
    res.json({ ok: true, service: 'tgg-core', version: '1.0.0', database: Boolean(db), time: new Date().toISOString() });
  } catch (e) { res.status(503).json({ ok: false, service: 'tgg-core', error: e.message }); }
});

app.post('/v1/auth/register', async (req, res, next) => {
  try {
    await init();
    const { email, password, display_name } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'invalid_email' });
    if (String(password || '').length < 8) return res.status(400).json({ error: 'password_too_short' });
    const result = await pool.query(
      'insert into users(email,password_hash,display_name) values($1,$2,$3) returning id,email,display_name,role,created_at',
      [String(email).toLowerCase().trim(), passwordHash(password), display_name || null]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_already_registered' });
    next(e);
  }
});

app.post('/v1/auth/login', async (req, res, next) => {
  try {
    await init();
    const { email, password } = req.body || {};
    const result = await pool.query('select * from users where email=$1', [String(email || '').toLowerCase().trim()]);
    if (!result.rowCount || !verifyPassword(password || '', result.rows[0].password_hash))
      return res.status(401).json({ error: 'invalid_credentials' });
    const token = newToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
    await pool.query('insert into sessions(user_id,token_hash,expires_at) values($1,$2,$3)', [result.rows[0].id, hashToken(token), expires]);
    const { password_hash, ...user } = result.rows[0];
    res.json({ access_token: token, token_type: 'Bearer', expires_at: expires.toISOString(), user });
  } catch (e) { next(e); }
});

app.post('/v1/auth/logout', auth, async (req, res, next) => {
  try {
    const token = req.get('authorization').slice(7);
    await pool.query('delete from sessions where token_hash=$1', [hashToken(token)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/v1/me', auth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/v1/artists/me', auth, async (req, res, next) => {
  try {
    const r = await pool.query('select * from artists where user_id=$1', [req.user.id]);
    res.json({ artist: r.rows[0] || null });
  } catch (e) { next(e); }
});

app.post('/v1/artists/me', auth, async (req, res, next) => {
  try {
    const { stage_name, bio, avatar_url } = req.body || {};
    if (!stage_name) return res.status(400).json({ error: 'stage_name_required' });
    const r = await pool.query(
      `insert into artists(user_id,stage_name,bio,avatar_url) values($1,$2,$3,$4)
       on conflict(user_id) do update set stage_name=excluded.stage_name,bio=excluded.bio,avatar_url=excluded.avatar_url
       returning *`,
      [req.user.id, stage_name, bio || null, avatar_url || null]
    );
    await pool.query("update users set role='artist' where id=$1", [req.user.id]);
    res.status(201).json({ artist: r.rows[0] });
  } catch (e) { next(e); }
});

app.get('/v1/creator/workspace', auth, async (req,res,next)=>{try{const r=await pool.query('select a.*,u.email,u.display_name from artists a join users u on u.id=a.user_id where a.user_id=$1',[req.user.id]);if(!r.rowCount)return res.status(404).json({error:'artist_profile_required'});const releases=await pool.query('select * from releases where artist_id=$1 order by created_at desc',[r.rows[0].id]);const tracks=await pool.query('select * from tracks where artist_id=$1 order by created_at desc',[r.rows[0].id]);res.json({artist:r.rows[0],releases:releases.rows,tracks:tracks.rows});}catch(e){next(e);}});

app.get('/v1/protected-audio/candidate', auth, async (req,res,next)=>{try{const r=await pool.query(`select t.id as track_id,m.storage_key,m.mime_type from tracks t join media_objects m on m.storage_key=replace(t.audio_url,'/v1/storage/object/','') where t.artist_id in (select id from artists where user_id=$1) and t.published=true and t.audio_url is not null and m.media_type='audio' order by t.created_at desc limit 1`,[req.user.id]);if(!r.rowCount)return res.status(404).json({error:'no_published_protected_audio_candidate'});res.json({track_id:r.rows[0].track_id,object_key:r.rows[0].storage_key,mime_type:r.rows[0].mime_type});}catch(e){next(e);}});


app.post('/v1/protected-audio/access', auth, async (req,res,next)=>{try{const trackId=String(req.body?.track_id||'');const r=await pool.query(`select t.id,m.storage_key,m.mime_type from tracks t join media_objects m on m.storage_key=replace(t.audio_url,'/v1/storage/object/','') where t.id=$1 and t.published=true and t.audio_url is not null and m.media_type='audio' and t.artist_id in (select id from artists where user_id=$2)`,[trackId,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'protected_audio_not_found'});const key=r.rows[0].storage_key,expires=Math.floor(Date.now()/1000)+300,sig=crypto.createHmac('sha256',TOKEN_SECRET).update('audio/'+key+':'+expires).digest('hex');res.json({source:'protected_storage',url:'/v1/storage/signed/audio/'+key.split('/').map(encodeURIComponent).join('/')+'?expires='+expires+'&sig='+sig,expires_in:300,track_id:r.rows[0].id,mime_type:r.rows[0].mime_type});}catch(e){next(e);}});

app.post('/v1/protected-audio/evidence', auth, async (req,res,next)=>{try{const {track_id,playback_started,load_ms,anonymous_status,anonymous_error,qa_denial_proof}=req.body||{};if(!track_id||playback_started!==true)return res.status(400).json({error:'protected_audio_evidence_incomplete'});const r=await pool.query(`select t.id from tracks t where t.id=$1 and t.published=true and t.artist_id in (select id from artists where user_id=$2)`,[track_id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'protected_audio_not_found'});const evidence={track_id,playback_started:true,load_ms:Number(load_ms)||null,anonymous_status:Number(anonymous_status)||null,anonymous_error:anonymous_error||null,qa_denial_proof:qa_denial_proof||null,recorded_at:new Date().toISOString()};await pool.query('insert into tgg_audit_log(actor_user_id,action,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)',[req.user.id,'protected_audio_browser_qa','track',track_id,evidence]);res.json({ok:true,verified:1,required:1,remaining:0,evidence});}catch(e){next(e);}});

app.get('/v1/creator/library', auth, async (req,res,next)=>{try{const a=await pool.query('select id,stage_name,bio,avatar_url from artists where user_id=$1',[req.user.id]);if(!a.rowCount)return res.status(404).json({error:'artist_profile_required'});const [releases,tracks]=await Promise.all([pool.query('select * from releases where artist_id=$1 order by created_at desc',[a.rows[0].id]),pool.query('select * from tracks where artist_id=$1 order by created_at desc',[a.rows[0].id])]);res.json({artist:a.rows[0],releases:releases.rows,tracks:tracks.rows});}catch(e){next(e);}});

app.post('/v1/creator/tracks', auth, async (req,res,next)=>{try{const {release_id,title,track_number,audio_url,video_url,artwork_url,duration_seconds,published=false}=req.body||{};const a=await pool.query('select id from artists where user_id=$1',[req.user.id]);if(!a.rowCount)return res.status(409).json({error:'artist_profile_required'});const r=await pool.query('select id from releases where id=$1 and artist_id=$2',[release_id,a.rows[0].id]);if(!r.rowCount)return res.status(404).json({error:'release_not_found'});const t=await pool.query('insert into tracks(release_id,artist_id,title,track_number,audio_url,video_url,artwork_url,duration_seconds,published) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[release_id,a.rows[0].id,title,track_number||null,audio_url||null,video_url||null,artwork_url||null,duration_seconds||null,Boolean(published)]);res.status(201).json({track:t.rows[0]});}catch(e){next(e);}});

app.get('/v1/creator/dashboard', auth, async (req,res,next)=>{try{const a=await pool.query('select id,stage_name,bio,avatar_url from artists where user_id=$1',[req.user.id]);if(!a.rowCount)return res.status(404).json({error:'artist_profile_required'});const artistId=a.rows[0].id;const [releases,tracks,audit,jobs]=await Promise.all([pool.query('select * from releases where artist_id=$1 order by created_at desc limit 100',[artistId]),pool.query('select * from tracks where artist_id=$1 order by created_at desc limit 200',[artistId]),pool.query('select id,action,payload as metadata,created_at from tgg_audit_log where actor_user_id=$1 order by created_at desc limit 25',[req.user.id]),pool.query('select id,queue,job_type,status,priority,attempts,created_at,finished_at from tgg_jobs where payload->>\'user_id\'=$1 order by created_at desc limit 25',[req.user.id])]);res.json({artist:a.rows[0],releases:releases.rows,tracks:tracks.rows,audit:audit.rows,jobs:jobs.rows});}catch(e){next(e);}});

app.get('/v1/releases', auth, async (req, res, next) => {
  try {
    const r = await pool.query(
      `select r.* from releases r join artists a on a.id=r.artist_id where a.user_id=$1 order by r.created_at desc`,
      [req.user.id]
    );
    res.json({ releases: r.rows });
  } catch (e) { next(e); }
});

app.post('/v1/releases', auth, async (req, res, next) => {
  try {
    const { title, release_type='single', release_year, cover_url } = req.body || {};
    const a = await pool.query('select id from artists where user_id=$1', [req.user.id]);
    if (!a.rowCount) return res.status(409).json({ error: 'artist_profile_required' });
    const r = await pool.query(
      'insert into releases(artist_id,title,release_type,release_year,cover_url) values($1,$2,$3,$4,$5) returning *',
      [a.rows[0].id, title, release_type, release_year || null, cover_url || null]
    );
    res.status(201).json({ release: r.rows[0] });
  } catch (e) { next(e); }
});

app.get('/v1/studio/projects', auth, async (req,res,next)=>{try{const r=await pool.query('select * from studio_projects where user_id=$1 order by created_at desc',[req.user.id]);res.json({projects:r.rows});}catch(e){next(e);}});

app.post('/v1/studio/projects', auth, async (req,res,next)=>{try{const {title,project_type='recording',bpm,musical_key,description}=req.body||{};const allowed=['beat','recording','mix','master','podcast','audiobook'];if(!title)return res.status(400).json({error:'title_required'});if(!allowed.includes(project_type))return res.status(400).json({error:'invalid_project_type'});const r=await pool.query('insert into studio_projects(user_id,title,project_type,bpm,musical_key,description) values($1,$2,$3,$4,$5,$6) returning *',[req.user.id,title,project_type,bpm||null,musical_key||null,description||null]);res.status(201).json({project:r.rows[0]});}catch(e){next(e);}});

app.get('/v1/studio/projects/:id', auth, async (req,res,next)=>{try{const p=await pool.query('select * from studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);if(!p.rowCount)return res.status(404).json({error:'project_not_found'});const [sessions,versions]=await Promise.all([pool.query('select * from recording_sessions where project_id=$1 and user_id=$2 order by started_at desc',[req.params.id,req.user.id]),pool.query('select * from studio_versions where project_id=$1 and user_id=$2 order by created_at desc',[req.params.id,req.user.id])]);res.json({project:p.rows[0],sessions:sessions.rows,versions:versions.rows});}catch(e){next(e);}});

app.post('/v1/studio/projects/:id/recordings', auth, async (req,res,next)=>{try{const {title,sample_rate=48000,bit_depth=24,notes}=req.body||{};const p=await pool.query('select id from studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);if(!p.rowCount)return res.status(404).json({error:'project_not_found'});if(!title)return res.status(400).json({error:'recording_title_required'});const r=await pool.query('insert into recording_sessions(project_id,user_id,title,sample_rate,bit_depth,notes) values($1,$2,$3,$4,$5,$6) returning *',[req.params.id,req.user.id,title,sample_rate,bit_depth,notes||null]);await pool.query("update studio_projects set status='recording',updated_at=now() where id=$1",[req.params.id]);res.status(201).json({session:r.rows[0]});}catch(e){next(e);}});

app.patch('/v1/studio/recordings/:id', auth, async (req,res,next)=>{try{const status=req.body?.status;if(status&&!['open','paused','completed'].includes(status))return res.status(400).json({error:'invalid_recording_status'});const r=await pool.query("update recording_sessions set status=coalesce($1,status),completed_at=case when $1='completed' then now() else completed_at end where id=$2 and user_id=$3 returning *",[status||null,req.params.id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'recording_session_not_found'});if(status==='completed')await pool.query("update studio_projects set status='completed',updated_at=now() where id=$1",[r.rows[0].project_id]);else if(status)await pool.query("update studio_projects set status=case when $1='paused' then 'paused' else 'recording' end,updated_at=now() where id=$2",[status,r.rows[0].project_id]);res.json({session:r.rows[0]});}catch(e){next(e);}});

app.post('/v1/studio/projects/:id/versions', auth, async (req,res,next)=>{try{const label=String(req.body?.label||'').trim();if(!label)return res.status(400).json({error:'version_label_required'});const p=await pool.query('select id from studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);if(!p.rowCount)return res.status(404).json({error:'project_not_found'});const r=await pool.query('insert into studio_versions(project_id,user_id,label) values($1,$2,$3) returning *',[req.params.id,req.user.id,label]);res.status(201).json({version:r.rows[0]});}catch(e){next(e);}});


// TGG_VIDEO_STUDIO_V2_API
function normalizeVideoProjectJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { version: 2, tracks: [], assets: [], settings: {} };
  return value;
}
function clampVideoStudioNumber(value,min,max,fallback) {
  const n=Number(value);
  return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;
}
function videoStudioSignedUrl(storageKey,expiresIn=900) {
  const normalized=String(storageKey||'').replace(/^\/+/, '');
  const slash=normalized.indexOf('/');
  if(slash<1) return null;
  const bucket=normalized.slice(0,slash),key=normalized.slice(slash+1);
  const seconds=Math.min(3600,Math.max(30,Number(expiresIn)||900));
  const expires=Math.floor(Date.now()/1000)+seconds;
  const sig=crypto.createHmac('sha256',TOKEN_SECRET).update(bucket+'/'+key+':'+expires).digest('hex');
  return '/v1/storage/signed/'+encodeURIComponent(bucket)+'/'+key.split('/').map(encodeURIComponent).join('/')+'?expires='+expires+'&sig='+sig;
}

app.get('/v1/video-studio/readiness', auth, async (req,res,next)=>{
  try{
    const [projects,media,worker]=await Promise.all([
      pool.query('select count(*)::int as n from video_studio_projects where user_id=$1',[req.user.id]),
      pool.query("select count(*)::int as n,coalesce(sum(size_bytes),0)::bigint as bytes from media_objects where owner_user_id=$1 and storage_key like 'creator-media/%'",[req.user.id]),
      pool.query("select worker_id,provider,status,progress,last_seen_at from video_studio_render_workers where status='online' and last_seen_at>now()-interval '15 minutes' order by last_seen_at desc limit 1")
    ]);
    res.json({
      editor_version:'2.4.1',
      cloud_save:true,
      private_media:true,
      browser_render_registration:true,
      server_render_contract:'github_oidc_ffmpeg',
      server_render_bridge:'tgg_core_native',
      server_render_online:Boolean(worker.rowCount),
      render_worker:worker.rows[0]||null,
      projects:Number(projects.rows[0]?.n||0),
      media_objects:Number(media.rows[0]?.n||0),
      media_bytes:Number(media.rows[0]?.bytes||0)
    });
  }catch(e){next(e);}
});

app.get('/v1/video-studio/dashboard', auth, async (req,res,next)=>{
  try{
    const [summary,projects,exports,media]=await Promise.all([
      pool.query("select count(*)::int as projects,count(*) filter(where status='ready')::int as ready,count(*) filter(where updated_at>now()-interval '7 days')::int as active_7d from video_studio_projects where user_id=$1",[req.user.id]),
      pool.query('select id,title,status,width,height,fps,duration_ms,created_at,updated_at from video_studio_projects where user_id=$1 order by updated_at desc limit 8',[req.user.id]),
      pool.query('select id,project_id,provider,preset,status,mime_type,width,height,duration_ms,size_bytes,created_at,finished_at from video_studio_exports where user_id=$1 order by created_at desc limit 8',[req.user.id]),
      pool.query("select count(*)::int as objects,coalesce(sum(size_bytes),0)::bigint as bytes from media_objects where owner_user_id=$1 and storage_key like 'creator-media/%'",[req.user.id])
    ]);
    res.json({summary:summary.rows[0],projects:projects.rows,exports:exports.rows,media:media.rows[0]});
  }catch(e){next(e);}
});

app.get('/v1/video-studio/projects', auth, async (req,res,next)=>{
  try{
    const r=await pool.query('select id,title,status,width,height,fps,duration_ms,project_json,created_at,updated_at from video_studio_projects where user_id=$1 order by updated_at desc limit 100',[req.user.id]);
    res.json({projects:r.rows});
  }catch(e){next(e);}
});

app.post('/v1/video-studio/projects', auth, async (req,res,next)=>{
  try{
    const title=String(req.body?.title||'Untitled Video').trim().slice(0,180)||'Untitled Video';
    const width=Math.round(clampVideoStudioNumber(req.body?.width,240,7680,1920));
    const height=Math.round(clampVideoStudioNumber(req.body?.height,240,7680,1080));
    const fps=clampVideoStudioNumber(req.body?.fps,1,120,30);
    const duration_ms=Math.round(clampVideoStudioNumber(req.body?.duration_ms,0,86400000,60000));
    const project_json=normalizeVideoProjectJson(req.body?.project_json);
    const r=await pool.query('insert into video_studio_projects(user_id,title,width,height,fps,duration_ms,project_json) values($1,$2,$3,$4,$5,$6,$7) returning *',[req.user.id,title,width,height,fps,duration_ms,project_json]);
    res.status(201).json({project:r.rows[0]});
  }catch(e){next(e);}
});

app.get('/v1/video-studio/projects/:id', auth, async (req,res,next)=>{
  try{
    const p=await pool.query('select * from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const [versions,exports,media]=await Promise.all([
      pool.query('select id,label,created_at from video_studio_versions where project_id=$1 and user_id=$2 order by created_at desc limit 50',[req.params.id,req.user.id]),
      pool.query('select * from video_studio_exports where project_id=$1 and user_id=$2 order by created_at desc limit 50',[req.params.id,req.user.id]),
      pool.query("select id,media_type,storage_key,size_bytes,mime_type,created_at from media_objects where owner_user_id=$1 and storage_key like $2 order by created_at desc",[req.user.id,'creator-media/'+req.user.id+'/'+req.params.id+'/%'])
    ]);
    res.json({project:p.rows[0],versions:versions.rows,exports:exports.rows,media:media.rows.map(x=>({...x,url:videoStudioSignedUrl(x.storage_key,900)}))});
  }catch(e){next(e);}
});

app.patch('/v1/video-studio/projects/:id', auth, async (req,res,next)=>{
  try{
    const existing=await pool.query('select * from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!existing.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const prev=existing.rows[0],allowedStatuses=new Set(['draft','editing','rendering','ready','archived']);
    const status=req.body?.status&&allowedStatuses.has(req.body.status)?req.body.status:prev.status;
    const title=req.body?.title===undefined?prev.title:(String(req.body.title||'Untitled Video').trim().slice(0,180)||'Untitled Video');
    const width=req.body?.width===undefined?prev.width:Math.round(clampVideoStudioNumber(req.body.width,240,7680,prev.width));
    const height=req.body?.height===undefined?prev.height:Math.round(clampVideoStudioNumber(req.body.height,240,7680,prev.height));
    const fps=req.body?.fps===undefined?prev.fps:clampVideoStudioNumber(req.body.fps,1,120,prev.fps);
    const duration_ms=req.body?.duration_ms===undefined?prev.duration_ms:Math.round(clampVideoStudioNumber(req.body.duration_ms,0,86400000,prev.duration_ms));
    const project_json=req.body?.project_json===undefined?prev.project_json:normalizeVideoProjectJson(req.body.project_json);
    const r=await pool.query('update video_studio_projects set title=$3,status=$4,width=$5,height=$6,fps=$7,duration_ms=$8,project_json=$9,updated_at=now() where id=$1 and user_id=$2 returning *',[req.params.id,req.user.id,title,status,width,height,fps,duration_ms,project_json]);
    res.json({project:r.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/video-studio/projects/:id/versions', auth, async (req,res,next)=>{
  try{
    const p=await pool.query('select * from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const label=String(req.body?.label||('Version '+new Date().toISOString())).trim().slice(0,180);
    const snapshot=req.body?.project_json===undefined?p.rows[0].project_json:normalizeVideoProjectJson(req.body.project_json);
    const r=await pool.query('insert into video_studio_versions(project_id,user_id,label,project_json) values($1,$2,$3,$4) returning id,label,created_at',[req.params.id,req.user.id,label,snapshot]);
    res.status(201).json({version:r.rows[0]});
  }catch(e){next(e);}
});

app.get('/v1/video-studio/projects/:id/versions/:versionId', auth, async (req,res,next)=>{
  try{
    const r=await pool.query('select * from video_studio_versions where id=$1 and project_id=$2 and user_id=$3',[req.params.versionId,req.params.id,req.user.id]);
    if(!r.rowCount)return res.status(404).json({error:'video_project_version_not_found'});
    res.json({version:r.rows[0]});
  }catch(e){next(e);}
});

app.put('/v1/video-studio/projects/:id/media', auth, async (req,res,next)=>{
  let handle=null,target=null;
  try{
    const p=await pool.query('select id from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const rawName=decodeURIComponent(String(req.get('x-file-name')||'media.bin')).replace(/[\r\n]/g,'').slice(0,200);
    const safeName=(rawName||'media.bin').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/\s+/g,'-');
    const mime=String(req.get('x-mime-type')||req.get('content-type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
    if(!/^(video|audio|image)\//.test(mime))return res.status(415).json({error:'video_studio_media_type_not_allowed'});
    const declared=Number(req.get('content-length')||0),maxBytes=2147483648;
    if(declared>maxBytes)return res.status(413).json({error:'video_studio_media_too_large',max_bytes:maxBytes});
    const objectKey=req.user.id+'/'+req.params.id+'/'+Date.now()+'-'+crypto.randomUUID()+'-'+safeName;
    const storageKey=path.posix.join('creator-media',objectKey);
    target=path.resolve(STORAGE_ROOT,storageKey);
    const root=path.resolve(STORAGE_ROOT);
    if(!target.startsWith(root+path.sep))return res.status(400).json({error:'invalid_object_key'});
    await fs.mkdir(path.dirname(target),{recursive:true});
    handle=await fs.open(target,'w');
    let written=0;const hash=crypto.createHash('sha256');
    for await(const chunk of req){written+=chunk.length;if(written>maxBytes)throw Object.assign(new Error('video_studio_media_too_large'),{statusCode:413});hash.update(chunk);await handle.write(chunk);}
    await handle.close();handle=null;
    if(!written){await fs.unlink(target).catch(()=>{});return res.status(400).json({error:'empty_upload'});}
    const mediaType=mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'image';
    const media=await pool.query('insert into media_objects(owner_user_id,media_type,storage_key,public_url,size_bytes,mime_type) values($1,$2,$3,$4,$5,$6) on conflict(storage_key) do update set size_bytes=excluded.size_bytes,mime_type=excluded.mime_type returning *',[req.user.id,mediaType,storageKey,null,written,mime]);
    const upload=await pool.query("insert into tgg_media_uploads(media_object_id,owner_user_id,bucket_key,object_key,status,checksum_sha256,metadata) values($1,$2,'creator-media',$3,'ready',$4,$5) on conflict(object_key) do update set media_object_id=excluded.media_object_id,status='ready',checksum_sha256=excluded.checksum_sha256,metadata=excluded.metadata,updated_at=now() returning *",[media.rows[0].id,req.user.id,objectKey,hash.digest('hex'),{project_id:req.params.id,original_name:rawName,mime_type:mime,size_bytes:written}]);
    res.status(201).json({media:media.rows[0],upload:upload.rows[0],url:videoStudioSignedUrl(storageKey,900)});
  }catch(e){
    if(handle)await handle.close().catch(()=>{});
    if(target)await fs.unlink(target).catch(()=>{});
    if(e?.statusCode)return res.status(e.statusCode).json({error:e.message});
    next(e);
  }
});

app.post('/v1/video-studio/projects/:id/media/:mediaId/sign', auth, async (req,res,next)=>{
  try{
    const p=await pool.query('select id from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const m=await pool.query("select * from media_objects where id=$1 and owner_user_id=$2 and storage_key like $3",[req.params.mediaId,req.user.id,'creator-media/'+req.user.id+'/'+req.params.id+'/%']);
    if(!m.rowCount)return res.status(404).json({error:'video_project_media_not_found'});
    res.json({url:videoStudioSignedUrl(m.rows[0].storage_key,Math.min(3600,Math.max(60,Number(req.body?.expires_in)||900))),media:m.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/video-studio/projects/:id/browser-render', auth, async (req,res,next)=>{
  try{
    const p=await pool.query('select * from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const m=await pool.query("select * from media_objects where id=$1 and owner_user_id=$2 and media_type='video'",[req.body?.media_object_id,req.user.id]);
    if(!m.rowCount)return res.status(404).json({error:'browser_render_media_not_found'});
    const preset=String(req.body?.preset||'browser-master').slice(0,64);
    const r=await pool.query("insert into video_studio_exports(project_id,user_id,provider,preset,status,output_media_object_id,mime_type,width,height,duration_ms,size_bytes,metadata,finished_at) values($1,$2,'browser',$3,'ready',$4,$5,$6,$7,$8,$9,$10,now()) returning *",[req.params.id,req.user.id,preset,m.rows[0].id,req.body?.mime_type||m.rows[0].mime_type,req.body?.width||p.rows[0].width,req.body?.height||p.rows[0].height,req.body?.duration_ms||p.rows[0].duration_ms,req.body?.size_bytes||m.rows[0].size_bytes,req.body?.metadata||{}]);
    await pool.query("update video_studio_projects set status='ready',updated_at=now() where id=$1",[req.params.id]);
    res.status(201).json({export:r.rows[0]});
  }catch(e){next(e);}
});


// TGG_VIDEO_STUDIO_V2_RENDER_BRIDGE_API
const TGG_PUBLIC_BASE_URL=String(process.env.TGG_PUBLIC_BASE_URL||'https://tgg-core.onrender.com').replace(/\/$/,'');
const TGG_VIDEO_RENDER_AUDIENCE='tgg-core-video-render-worker';
const TGG_VIDEO_RENDER_REPOSITORY=String(process.env.TGG_GITHUB_REPOSITORY||'olandusgood-byte/tru-go-getta-mixtape');
const TGG_VIDEO_RENDER_REPOSITORY_ID=String(process.env.TGG_GITHUB_REPOSITORY_ID||'1361630814');
const TGG_VIDEO_RENDER_OWNER_ID=String(process.env.TGG_GITHUB_OWNER_ID||'326575362');
const TGG_VIDEO_RENDER_WORKFLOW=TGG_VIDEO_RENDER_REPOSITORY+'/.github/workflows/tgg-core-video-render-worker.yml@refs/heads/main';
let githubOidcConfigCache=null;
let githubOidcKeysCache={expiresAt:0,keys:[]};

function parseJwtPart(part){
  try{return JSON.parse(Buffer.from(String(part||''),'base64url').toString('utf8'));}catch{return null;}
}
async function githubOidcKeys(){
  const now=Date.now();
  if(githubOidcKeysCache.keys.length&&githubOidcKeysCache.expiresAt>now)return githubOidcKeysCache.keys;
  if(!githubOidcConfigCache){
    const r=await fetch('https://token.actions.githubusercontent.com/.well-known/openid-configuration',{signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('github_oidc_discovery_failed');
    githubOidcConfigCache=await r.json();
  }
  const r=await fetch(githubOidcConfigCache.jwks_uri,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('github_oidc_jwks_failed');
  const body=await r.json();
  githubOidcKeysCache={expiresAt:now+60*60*1000,keys:Array.isArray(body.keys)?body.keys:[]};
  return githubOidcKeysCache.keys;
}
async function verifyGitHubVideoRenderOidc(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw Object.assign(new Error('github_oidc_missing_or_invalid'),{statusCode:401});
  const header=parseJwtPart(parts[0]),claims=parseJwtPart(parts[1]);
  if(!header||!claims||header.alg!=='RS256'||!header.kid)throw Object.assign(new Error('github_oidc_header_invalid'),{statusCode:401});
  const keys=await githubOidcKeys();
  const jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk)throw Object.assign(new Error('github_oidc_key_not_found'),{statusCode:401});
  const key=crypto.createPublicKey({key:jwk,format:'jwk'});
  const valid=crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url'));
  if(!valid)throw Object.assign(new Error('github_oidc_signature_invalid'),{statusCode:401});
  const now=Math.floor(Date.now()/1000),aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!=='https://token.actions.githubusercontent.com')throw Object.assign(new Error('github_oidc_issuer_invalid'),{statusCode:401});
  if(!aud.includes(TGG_VIDEO_RENDER_AUDIENCE))throw Object.assign(new Error('github_oidc_audience_invalid'),{statusCode:401});
  if(Number(claims.exp||0)<now-30||Number(claims.nbf||0)>now+30)throw Object.assign(new Error('github_oidc_time_invalid'),{statusCode:401});
  if(String(claims.repository_id||'')!==TGG_VIDEO_RENDER_REPOSITORY_ID)throw Object.assign(new Error('github_oidc_repository_invalid'),{statusCode:403});
  if(String(claims.repository_owner_id||'')!==TGG_VIDEO_RENDER_OWNER_ID)throw Object.assign(new Error('github_oidc_owner_invalid'),{statusCode:403});
  if(String(claims.repository||'')!==TGG_VIDEO_RENDER_REPOSITORY)throw Object.assign(new Error('github_oidc_repository_name_invalid'),{statusCode:403});
  if(String(claims.ref||'')!=='refs/heads/main')throw Object.assign(new Error('github_oidc_ref_invalid'),{statusCode:403});
  const workflowRef=String(claims.job_workflow_ref||claims.workflow_ref||'');
  if(workflowRef!==TGG_VIDEO_RENDER_WORKFLOW)throw Object.assign(new Error('github_oidc_workflow_invalid'),{statusCode:403});
  if(claims.runner_environment&&String(claims.runner_environment)!=='github-hosted')throw Object.assign(new Error('github_oidc_runner_invalid'),{statusCode:403});
  return claims;
}
function githubRenderWorkerId(claims){
  return 'github:'+String(claims.run_id||claims.jti||'run')+':'+String(claims.run_attempt||'1');
}
function renderLeaseHash(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
async function validateRenderLease(jobId,workerId,leaseToken){
  const r=await pool.query(
    "select * from tgg_jobs where id=$1 and queue='video-render' and job_type='master_transcode' and status='running' and worker_id=$2 and lease_token_hash=$3 and lease_expires_at>now()",
    [jobId,workerId,renderLeaseHash(leaseToken)]
  );
  return r.rows[0]||null;
}
async function touchVideoRenderWorker(workerId,{status='online',jobId=null,progress=0,metadata={}}={}){
  await pool.query(
    `insert into video_studio_render_workers(worker_id,status,current_job_id,progress,metadata,last_seen_at,updated_at)
     values($1,$2,$3,$4,$5,now(),now())
     on conflict(worker_id) do update set status=excluded.status,current_job_id=excluded.current_job_id,
     progress=excluded.progress,metadata=video_studio_render_workers.metadata||excluded.metadata,last_seen_at=now(),updated_at=now()`,
    [workerId,status,jobId,Math.max(0,Math.min(100,Math.round(Number(progress)||0))),metadata||{}]
  );
}
async function reapExpiredVideoRenderLeases(){
  const expired=await pool.query(
    `select id,attempts,max_attempts,payload from tgg_jobs
     where queue='video-render' and job_type='master_transcode' and status='running'
       and lease_expires_at is not null and lease_expires_at<=now()`
  );
  for(const job of expired.rows){
    const retry=Number(job.attempts)<Number(job.max_attempts);
    await pool.query(
      `update tgg_jobs set status=$2,worker_id=null,lease_token_hash=null,lease_expires_at=null,
       error='render_worker_lease_expired',available_at=case when $2='queued' then now()+interval '30 seconds' else available_at end,
       finished_at=case when $2='failed' then now() else null end where id=$1`,
      [job.id,retry?'queued':'failed']
    );
    await pool.query("update video_studio_exports set status=$2,metadata=metadata||$3::jsonb where job_id=$1",[job.id,retry?'queued':'failed',JSON.stringify({last_error:'render_worker_lease_expired'})]);
  }
}

app.post('/v1/video-studio/projects/:id/server-render',auth,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const preset=String(req.body?.preset||'1080p').toLowerCase();
    if(!['720p','1080p','2160p','source'].includes(preset))return res.status(400).json({error:'invalid_render_preset'});
    const p=await client.query('select * from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const sourceId=req.body?.source_export_id||null;
    const source=sourceId
      ? await client.query("select e.*,m.storage_key,m.mime_type as source_mime_type,m.size_bytes as source_size_bytes from video_studio_exports e join media_objects m on m.id=e.output_media_object_id where e.id=$1 and e.project_id=$2 and e.user_id=$3 and e.provider='browser' and e.status='ready'",[sourceId,req.params.id,req.user.id])
      : await client.query("select e.*,m.storage_key,m.mime_type as source_mime_type,m.size_bytes as source_size_bytes from video_studio_exports e join media_objects m on m.id=e.output_media_object_id where e.project_id=$1 and e.user_id=$2 and e.provider='browser' and e.status='ready' order by e.finished_at desc nulls last,e.created_at desc limit 1",[req.params.id,req.user.id]);
    if(!source.rowCount)return res.status(409).json({error:'browser_master_required',detail:'Create a Quick Browser Render first.'});
    const s=source.rows[0];
    const existing=await client.query(
      "select * from video_studio_exports where project_id=$1 and user_id=$2 and provider='server' and preset=$3 and status in ('queued','processing','ready') and metadata->>'source_export_id'=$4 order by created_at desc limit 1",
      [req.params.id,req.user.id,preset,String(s.id)]
    );
    if(existing.rowCount)return res.json({export:existing.rows[0],existing:true});
    await client.query('begin');
    const payload={
      user_id:req.user.id,project_id:req.params.id,preset,source_export_id:s.id,
      source_media_object_id:s.output_media_object_id,source_storage_key:s.storage_key,
      source_mime_type:s.source_mime_type,source_size_bytes:Number(s.source_size_bytes||0),
      source_revision:String(s.finished_at||s.created_at||new Date().toISOString()),
      width:Number(s.width||p.rows[0].width),height:Number(s.height||p.rows[0].height),
      duration_ms:Number(s.duration_ms||p.rows[0].duration_ms)
    };
    const job=await client.query(
      "insert into tgg_jobs(queue,job_type,payload,priority,max_attempts) values('video-render','master_transcode',$1,10,3) returning *",
      [payload]
    );
    const exp=await client.query(
      "insert into video_studio_exports(project_id,user_id,provider,preset,status,job_id,metadata,width,height,duration_ms) values($1,$2,'server',$3,'queued',$4,$5,$6,$7,$8) returning *",
      [req.params.id,req.user.id,preset,job.rows[0].id,{source_export_id:String(s.id),source_media_object_id:String(s.output_media_object_id),source_revision:payload.source_revision,progress:0},payload.width,payload.height,payload.duration_ms]
    );
    await client.query("update video_studio_projects set status='rendering',updated_at=now() where id=$1",[req.params.id]);
    await client.query('commit');
    await pool.query('select pg_notify($1,$2)',['tgg_jobs',JSON.stringify({id:job.rows[0].id,queue:'video-render',job_type:'master_transcode'})]).catch(()=>{});
    res.status(201).json({export:exp.rows[0],job:job.rows[0],existing:false});
  }catch(e){await client.query('rollback').catch(()=>{});next(e);}finally{client.release();}
});

app.get('/v1/video-studio/projects/:id/server-renders',auth,async(req,res,next)=>{
  try{
    const p=await pool.query('select id from video_studio_projects where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!p.rowCount)return res.status(404).json({error:'video_project_not_found'});
    const r=await pool.query("select e.*,j.attempts,j.max_attempts,j.error,j.result,j.started_at,j.finished_at from video_studio_exports e left join tgg_jobs j on j.id=e.job_id where e.project_id=$1 and e.user_id=$2 and e.provider='server' order by e.created_at desc limit 50",[req.params.id,req.user.id]);
    res.json({renders:r.rows});
  }catch(e){next(e);}
});

app.post('/v1/video-studio/render-worker',async(req,res,next)=>{
  try{
    await init();
    const claims=await verifyGitHubVideoRenderOidc(req.get('x-tgg-github-oidc'));
    const workerId=githubRenderWorkerId(claims);
    const operation=String(req.body?.operation||'');
    await reapExpiredVideoRenderLeases();

    if(operation==='register'){
      await touchVideoRenderWorker(workerId,{status:'online',jobId:req.body?.job_id||null,progress:req.body?.progress||0,metadata:{workflow_ref:claims.workflow_ref||claims.job_workflow_ref,run_id:claims.run_id,sha:claims.sha}});
      return res.json({ok:true,data:{worker_id:workerId}});
    }
    if(operation==='claim'){
      const client=await pool.connect();
      try{
        await client.query('begin');
        const q=await client.query(
          `select * from tgg_jobs where queue='video-render' and job_type='master_transcode'
           and status='queued' and available_at<=now()
           order by priority desc,created_at asc for update skip locked limit 1`
        );
        if(!q.rowCount){await client.query('commit');await touchVideoRenderWorker(workerId,{status:'online',progress:0});return res.json({ok:true,data:{manifest:null}});}
        const leaseToken=crypto.randomBytes(32).toString('base64url'),job=q.rows[0];
        const updated=await client.query(
          `update tgg_jobs set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),
           worker_id=$2,lease_token_hash=$3,lease_expires_at=now()+interval '12 minutes',
           result=coalesce(result,'{}'::jsonb)||'{"progress":1}'::jsonb,error=null
           where id=$1 returning *`,
          [job.id,workerId,renderLeaseHash(leaseToken)]
        );
        await client.query("update video_studio_exports set status='processing',metadata=metadata||'{\"progress\":1}'::jsonb where job_id=$1",[job.id]);
        await client.query('commit');
        await touchVideoRenderWorker(workerId,{status:'online',jobId:job.id,progress:1});
        return res.json({ok:true,data:{manifest:{job:{id:job.id,preset:String(job.payload?.preset||'1080p'),payload:job.payload,attempts:updated.rows[0].attempts},lease_token:leaseToken}}});
      }catch(e){await client.query('rollback').catch(()=>{});throw e;}finally{client.release();}
    }

    const jobId=String(req.body?.job_id||''),leaseToken=String(req.body?.lease_token||'');
    if(!jobId||!leaseToken)return res.status(400).json({error:'render_job_and_lease_required'});
    const job=await validateRenderLease(jobId,workerId,leaseToken);
    if(!job)return res.status(409).json({error:'render_lease_invalid_or_expired'});

    if(operation==='heartbeat'){
      const progress=Math.max(1,Math.min(98,Math.round(Number(req.body?.progress)||1)));
      await pool.query("update tgg_jobs set lease_expires_at=now()+interval '12 minutes',result=coalesce(result,'{}'::jsonb)||$2::jsonb where id=$1",[jobId,JSON.stringify({progress})]);
      await pool.query("update video_studio_exports set status='processing',metadata=metadata||$2::jsonb where job_id=$1",[jobId,JSON.stringify({progress})]);
      await touchVideoRenderWorker(workerId,{status:'online',jobId,progress});
      return res.json({ok:true,data:{lease_valid:true,progress}});
    }
    if(operation==='download_url'){
      const sourceKey=String(job.payload?.source_storage_key||'');
      if(!sourceKey)return res.status(409).json({error:'render_source_missing'});
      return res.json({ok:true,data:{signed_url:TGG_PUBLIC_BASE_URL+videoStudioSignedUrl(sourceKey,900),mime_type:job.payload?.source_mime_type||null}});
    }
    if(operation==='complete'){
      const result=job.result||{},mediaId=String(result.output_media_object_id||req.body?.media_object_id||'');
      const media=await pool.query("select * from media_objects where id=$1 and owner_user_id=$2 and media_type='video'",[mediaId,job.payload?.user_id]);
      if(!media.rowCount)return res.status(409).json({error:'render_output_media_missing'});
      const detail={
        progress:100,output_media_object_id:media.rows[0].id,output_storage_key:media.rows[0].storage_key,
        width:Number(req.body?.width)||null,height:Number(req.body?.height)||null,
        duration_ms:Number(req.body?.duration_ms)||null,size_bytes:Number(media.rows[0].size_bytes)||null,
        codec_video:req.body?.codec_video||'h264',codec_audio:req.body?.codec_audio||'aac',
        completed_at:new Date().toISOString(),worker_id:workerId
      };
      await pool.query("update tgg_jobs set status='succeeded',result=coalesce(result,'{}'::jsonb)||$2::jsonb,error=null,finished_at=now(),lease_token_hash=null,lease_expires_at=null where id=$1",[jobId,JSON.stringify(detail)]);
      await pool.query("update video_studio_exports set status='ready',output_media_object_id=$2,mime_type='video/mp4',width=coalesce($3,width),height=coalesce($4,height),duration_ms=coalesce($5,duration_ms),size_bytes=$6,metadata=metadata||$7::jsonb,finished_at=now() where job_id=$1",[jobId,media.rows[0].id,detail.width,detail.height,detail.duration_ms,detail.size_bytes,JSON.stringify({progress:100,codec_video:detail.codec_video,codec_audio:detail.codec_audio,worker_id:workerId})]);
      await pool.query("update video_studio_projects set status='ready',updated_at=now() where id=$1",[job.payload?.project_id]);
      await touchVideoRenderWorker(workerId,{status:'online',progress:100,metadata:{last_completed_job_id:jobId}});
      return res.json({ok:true,data:{completed:true,media_id:media.rows[0].id}});
    }
    if(operation==='fail'){
      const message=String(req.body?.error||'render_failed').slice(0,1900),retryable=req.body?.retryable!==false,retry=retryable&&Number(job.attempts)<Number(job.max_attempts);
      await pool.query(
        `update tgg_jobs set status=$2,error=$3,worker_id=null,lease_token_hash=null,lease_expires_at=null,
         available_at=case when $2='queued' then now()+interval '30 seconds' else available_at end,
         finished_at=case when $2='failed' then now() else null end where id=$1`,
        [jobId,retry?'queued':'failed',message]
      );
      await pool.query("update video_studio_exports set status=$2,metadata=metadata||$3::jsonb where job_id=$1",[jobId,retry?'queued':'failed',JSON.stringify({last_error:message,progress:0})]);
      await pool.query("update video_studio_projects set status='ready',updated_at=now() where id=$1",[job.payload?.project_id]);
      await touchVideoRenderWorker(workerId,{status:'online',progress:0,metadata:{last_error:message}});
      return res.json({ok:true,data:{retrying:retry}});
    }
    return res.status(400).json({error:'render_worker_operation_unknown'});
  }catch(e){
    if(e?.statusCode)return res.status(e.statusCode).json({error:e.message});
    next(e);
  }
});

app.put('/v1/video-studio/render-worker/jobs/:id/output',async(req,res,next)=>{
  let handle=null,target=null;
  try{
    await init();
    const claims=await verifyGitHubVideoRenderOidc(req.get('x-tgg-github-oidc'));
    const workerId=githubRenderWorkerId(claims),leaseToken=String(req.get('x-tgg-render-lease')||'');
    const job=await validateRenderLease(req.params.id,workerId,leaseToken);
    if(!job)return res.status(409).json({error:'render_lease_invalid_or_expired'});
    const maxBytes=10737418240,declared=Number(req.get('content-length')||0);
    if(declared>maxBytes)return res.status(413).json({error:'render_output_too_large',max_bytes:maxBytes});
    const objectKey=String(job.payload.user_id)+'/'+String(job.payload.project_id)+'/renders/'+String(job.id)+'.mp4';
    const storageKey=path.posix.join('creator-media',objectKey),root=path.resolve(STORAGE_ROOT);
    target=path.resolve(STORAGE_ROOT,storageKey);
    if(!target.startsWith(root+path.sep))return res.status(400).json({error:'invalid_object_key'});
    await fs.mkdir(path.dirname(target),{recursive:true});
    handle=await fs.open(target,'w');
    let written=0;const hash=crypto.createHash('sha256');
    for await(const chunk of req){
      written+=chunk.length;
      if(written>maxBytes)throw Object.assign(new Error('render_output_too_large'),{statusCode:413});
      hash.update(chunk);await handle.write(chunk);
    }
    await handle.close();handle=null;
    if(!written){await fs.unlink(target).catch(()=>{});return res.status(400).json({error:'empty_render_output'});}
    const checksum=hash.digest('hex');
    const media=await pool.query(
      "insert into media_objects(owner_user_id,media_type,storage_key,public_url,size_bytes,mime_type) values($1,'video',$2,null,$3,'video/mp4') on conflict(storage_key) do update set size_bytes=excluded.size_bytes,mime_type=excluded.mime_type returning *",
      [job.payload.user_id,storageKey,written]
    );
    await pool.query(
      "insert into tgg_media_uploads(media_object_id,owner_user_id,bucket_key,object_key,status,checksum_sha256,metadata) values($1,$2,'creator-media',$3,'ready',$4,$5) on conflict(object_key) do update set media_object_id=excluded.media_object_id,status='ready',checksum_sha256=excluded.checksum_sha256,metadata=excluded.metadata,updated_at=now()",
      [media.rows[0].id,job.payload.user_id,objectKey,checksum,{project_id:job.payload.project_id,render_job_id:job.id,preset:job.payload.preset,provider:'github.oidc.ffmpeg.v2'}]
    );
    await pool.query("update tgg_jobs set result=coalesce(result,'{}'::jsonb)||$2::jsonb,lease_expires_at=now()+interval '12 minutes' where id=$1",[job.id,JSON.stringify({output_media_object_id:media.rows[0].id,output_storage_key:storageKey,size_bytes:written,checksum_sha256:checksum,progress:99})]);
    await touchVideoRenderWorker(workerId,{status:'online',jobId:job.id,progress:99});
    res.status(201).json({ok:true,media:media.rows[0]});
  }catch(e){
    if(handle)await handle.close().catch(()=>{});
    if(target)await fs.unlink(target).catch(()=>{});
    if(e?.statusCode)return res.status(e.statusCode).json({error:e.message});
    next(e);
  }
});

app.get('/v1/missions', auth, async (_req, res, next) => {
  try { const r=await pool.query('select * from world_missions where active=true order by created_at'); res.json({ missions:r.rows }); }
  catch(e){ next(e); }
});

app.post('/v1/missions/:id/start', auth, async (req,res,next)=>{try{const r=await pool.query("select * from world_missions where id=$1 and active=true",[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'mission_not_found'});const existing=await pool.query("select * from mission_sessions where mission_id=$1 and user_id=$2 and status in ('started','submitted') order by started_at desc limit 1",[req.params.id,req.user.id]);if(existing.rowCount)return res.json({session:existing.rows[0],existing:true});const s=await pool.query("insert into mission_sessions(mission_id,user_id) values($1,$2) returning *",[req.params.id,req.user.id]);res.status(201).json({session:s.rows[0],existing:false});}catch(e){next(e);}});

app.get('/v1/missions/:id/session', auth, async (req,res,next)=>{try{const r=await pool.query("select s.*,m.slug,m.title,m.description,m.reward_points from mission_sessions s join world_missions m on m.id=s.mission_id where s.mission_id=$1 and s.user_id=$2 order by s.started_at desc limit 1",[req.params.id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'mission_session_not_found'});const evidence=await pool.query("select * from mission_evidence where session_id=$1 order by created_at desc",[r.rows[0].id]);res.json({session:r.rows[0],evidence:evidence.rows});}catch(e){next(e);}});

app.post('/v1/missions/sessions/:id/evidence', auth, async (req,res,next)=>{try{const {evidence_type,evidence_url,payload={}}=req.body||{};if(!evidence_type)return res.status(400).json({error:'evidence_type_required'});const s=await pool.query("select id from mission_sessions where id=$1 and user_id=$2",[req.params.id,req.user.id]);if(!s.rowCount)return res.status(404).json({error:'mission_session_not_found'});const e=await pool.query("insert into mission_evidence(session_id,evidence_type,evidence_url,payload) values($1,$2,$3,$4) returning *",[req.params.id,evidence_type,evidence_url||null,payload]);res.status(201).json({evidence:e.rows[0]});}catch(e){next(e);}});

app.patch('/v1/missions/sessions/:id', auth, async (req,res,next)=>{try{const status=req.body?.status;if(!['submitted','verified','rejected'].includes(status))return res.status(400).json({error:'invalid_mission_status'});const s=await pool.query("update mission_sessions set status=$1,completed_at=case when $1 in ('verified','rejected') then now() else completed_at end where id=$2 and user_id=$3 returning *",[status,req.params.id,req.user.id]);if(!s.rowCount)return res.status(404).json({error:'mission_session_not_found'});if(status==='verified'){const m=await pool.query("select reward_points from world_missions where id=$1",[s.rows[0].mission_id]);const points=Number(m.rows[0]?.reward_points||0);if(points){await pool.query("insert into rewards_ledger(user_id,source_type,source_id,points,idempotency_key) values($1,'mission',$2,$3,$4) on conflict(idempotency_key) do nothing",[req.user.id,s.rows[0].mission_id,points,'mission:'+s.rows[0].id]);}}res.json({session:s.rows[0]});}catch(e){next(e);}});

app.post('/v1/realtime/publish', auth, async (req,res,next)=>{
  try {
    const { topic, payload={} }=req.body||{};
    if(!topic) return res.status(400).json({error:'topic_required'});
    const r=await pool.query('insert into realtime_events(topic,user_id,payload) values($1,$2,$3) returning *',[topic,req.user.id,payload]);
    await pool.query('select pg_notify($1,$2)', ['tgg_realtime', JSON.stringify({id:r.rows[0].id,topic,user_id:req.user.id,payload})]);
    res.status(201).json({event:r.rows[0]});
  } catch(e){ next(e); }
});

app.get('/v1/realtime/stream', auth, async (req,res,next)=>{
  const topic=String(req.query.topic||'');
  const after=Math.max(0,Number(req.query.after||0));
  if(!topic) return res.status(400).json({error:'topic_required'});
  const client=await pool.connect();
  let closed=false;
  const send=(event)=>{ if(!closed) res.write('data: '+JSON.stringify(event)+'\
\
'); };
  try {
    await client.query('listen tgg_realtime');
    res.status(200);
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.flushHeaders?.();
    const backlog=await pool.query('select * from realtime_events where id>$1 and topic=$2 and (user_id=$3 or user_id is null) order by id asc limit 100',[after,topic,req.user.id]);
    for(const event of backlog.rows) send({id:event.id,topic:event.topic,user_id:event.user_id,payload:event.payload,created_at:event.created_at});
    const heartbeat=setInterval(()=>{ if(!closed) res.write(': tgg-heartbeat\
\
'); },25000);
    const onNotification=(msg)=>{ try { const event=JSON.parse(msg.payload||'{}'); if(event.topic!==topic) return; if(event.user_id && event.user_id!==req.user.id) return; send(event); } catch {} };
    client.on('notification',onNotification);
    const close=async()=>{ if(closed) return; closed=true; clearInterval(heartbeat); client.off('notification',onNotification); try { await client.query('unlisten tgg_realtime'); } catch {} client.release(); if(!res.writableEnded) res.end(); };
    req.on('close',close);
  } catch(e) { client.release(); next(e); }
});

app.get('/v1/realtime/events', auth, async (req,res,next)=>{
  try {
    const after=Number(req.query.after||0);
    const r=await pool.query(
      'select * from realtime_events where id>$1 and (user_id=$2 or user_id is null) order by id asc limit 100',
      [after,req.user.id]
    );
    res.json({events:r.rows});
  } catch(e){next(e);}
});


app.get('/v1/storage/buckets', auth, async (_req,res,next)=>{
  try {
    const r=await pool.query('select bucket_key,visibility,max_bytes,allowed_mime_types from tgg_storage_buckets order by bucket_key');
    res.json({buckets:r.rows});
  } catch(e){next(e);}
});

app.post('/v1/storage/uploads', auth, async (req,res,next)=>{
  try {
    const {bucket_key,object_key,mime_type,size_bytes,metadata={},data_base64}=req.body||{};
    if(!bucket_key||!object_key) return res.status(400).json({error:'bucket_key_and_object_key_required'});
    const b=await pool.query('select bucket_key,visibility,max_bytes,allowed_mime_types from tgg_storage_buckets where bucket_key=$1',[bucket_key]);
    if(!b.rowCount) return res.status(404).json({error:'storage_bucket_not_found'});
    if(!data_base64) return res.status(400).json({error:'data_base64_required'});
    const bucket=b.rows[0];
    const cleanKey=String(object_key).replace(/^\/+|\\/g,'/').split('/').filter(x=>x && x!=='.' && x!=='..').join('/');
    if(!cleanKey) return res.status(400).json({error:'invalid_object_key'});
    const bytes=Buffer.from(String(data_base64).replace(/^data:[^;]+;base64,/,'').replace(/\\s/g,''),'base64');
    if(!bytes.length) return res.status(400).json({error:'empty_upload'});
    if(bucket.max_bytes && bytes.length>Number(bucket.max_bytes)) return res.status(413).json({error:'object_too_large',max_bytes:Number(bucket.max_bytes)});
    if(bucket.allowed_mime_types?.length && mime_type && !bucket.allowed_mime_types.includes(mime_type)) return res.status(415).json({error:'mime_type_not_allowed'});
    const checksum_sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const mediaType=String(mime_type||'application/octet-stream').startsWith('video/')?'video':String(mime_type||'').startsWith('audio/')?'audio':String(mime_type||'').startsWith('image/')?'image':'document';
    const storageKey=path.posix.join(bucket_key,cleanKey);
    const target=path.resolve(STORAGE_ROOT,storageKey);
    const root=path.resolve(STORAGE_ROOT);
    if(!target.startsWith(root+path.sep)) return res.status(400).json({error:'invalid_object_key'});
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,bytes,{flag:'wx'}).catch(async e=>{ if(e.code==='EEXIST') await fs.writeFile(target,bytes); else throw e; });
    const media=await pool.query(
      'insert into media_objects(owner_user_id,media_type,storage_key,public_url,size_bytes,mime_type) values($1,$2,$3,$4,$5,$6) on conflict(storage_key) do update set public_url=excluded.public_url,size_bytes=excluded.size_bytes,mime_type=excluded.mime_type returning *',
      [req.user.id,mediaType,storageKey,'/v1/storage/object/'+encodeURIComponent(bucket_key)+'/'+cleanKey,bytes.length,mime_type||null]
    );
    const upload=await pool.query(
      'insert into tgg_media_uploads(media_object_id,owner_user_id,bucket_key,object_key,status,checksum_sha256,metadata) values($1,$2,$3,$4,$5,$6,$7) on conflict(object_key) do update set media_object_id=excluded.media_object_id,status=excluded.status,checksum_sha256=excluded.checksum_sha256,metadata=excluded.metadata,updated_at=now() returning *',
      [media.rows[0].id,req.user.id,bucket_key,cleanKey,'ready',checksum_sha256,{...metadata,mime_type:mime_type||null,size_bytes:bytes.length}]
    );
    res.status(201).json({upload:upload.rows[0],media:media.rows[0],checksum_sha256,storage_key:storageKey});
  } catch(e){next(e);}
});

app.get('/v1/storage/object-auth/:bucket/*key', auth, async (req,res,next)=>{try{const bucketKey=String(req.params.bucket||''),key=String(req.params.key||'').replace(/^\/+/,''),r=await pool.query('select * from media_objects where storage_key=$1 and owner_user_id=$2',[path.posix.join(bucketKey,key),req.user.id]);if(!r.rowCount)return res.status(404).json({error:'media_object_not_found'});const target=path.resolve(STORAGE_ROOT,path.posix.join(bucketKey,key)),root=path.resolve(STORAGE_ROOT);if(!target.startsWith(root+path.sep))return res.status(400).json({error:'invalid_object_key'});const stat=await fs.stat(target);res.set('Content-Length',String(stat.size));if(r.rows[0].mime_type)res.type(r.rows[0].mime_type);res.sendFile(target);}catch(e){next(e);}});

app.get('/v1/storage/signed/:bucket/*key', async (req,res,next)=>{try{const bucketKey=String(req.params.bucket||''),key=String(req.params.key||'').replace(/^\/+/,''),expires=Number(req.query.expires||0),sig=String(req.query.sig||'');if(!expires||expires<Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+3600||!sig)return res.status(401).json({error:'signed_url_invalid'});const expected=crypto.createHmac('sha256',TOKEN_SECRET).update(bucketKey+'/'+key+':'+expires).digest('hex');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.status(401).json({error:'signed_url_invalid'});const target=path.resolve(STORAGE_ROOT,path.posix.join(bucketKey,key)),root=path.resolve(STORAGE_ROOT);if(!target.startsWith(root+path.sep))return res.status(400).json({error:'invalid_object_key'});const stat=await fs.stat(target);res.set('Content-Length',String(stat.size));res.sendFile(target);}catch(e){next(e);}});

app.post('/v1/storage/sign', auth, async (req,res,next)=>{try{const {bucket_key,object_key,expires_in=300}=req.body||{};if(!bucket_key||!object_key)return res.status(400).json({error:'bucket_key_and_object_key_required'});const key=String(object_key).replace(/^\/+/,''),max=Math.min(3600,Math.max(30,Number(expires_in)||300)),expires=Math.floor(Date.now()/1000)+max;const r=await pool.query('select id from media_objects where owner_user_id=$1 and storage_key=$2',[req.user.id,path.posix.join(bucket_key,key)]);if(!r.rowCount)return res.status(404).json({error:'media_object_not_found'});const sig=crypto.createHmac('sha256',TOKEN_SECRET).update(bucket_key+'/'+key+':'+expires).digest('hex');res.json({url:'/v1/storage/signed/'+encodeURIComponent(bucket_key)+'/'+key.split('/').map(encodeURIComponent).join('/')+'?expires='+expires+'&sig='+sig,expires_in:max});}catch(e){next(e);}});

app.get('/v1/storage/object/:bucket/*key', async (req,res,next)=>{
  try {
    const bucketKey=String(req.params.bucket||'');
    const key=String(req.params.key||'').replace(/^\/+/, '');
    const b=await pool.query('select visibility from tgg_storage_buckets where bucket_key=$1',[bucketKey]);
    if(!b.rowCount) return res.status(404).json({error:'storage_bucket_not_found'});
    if(b.rows[0].visibility!=='public') return res.status(401).json({error:'private_object_requires_authenticated_route'});
    const target=path.resolve(STORAGE_ROOT,path.posix.join(bucketKey,key));
    const root=path.resolve(STORAGE_ROOT);
    if(!target.startsWith(root+path.sep)) return res.status(400).json({error:'invalid_object_key'});
    const stat=await fs.stat(target);
    res.set('Content-Length',String(stat.size));
    res.sendFile(target);
  } catch(e){ if(e.code==='ENOENT') return res.status(404).json({error:'object_not_found'}); next(e); }
});

app.post('/v1/browser/jobs/protected-audio', auth, async (req,res,next)=>{try{const object_key=String(req.body?.object_key||'').replace(/^\/+/,''),mime_type=String(req.body?.mime_type||'audio/mpeg');if(!object_key)return res.status(400).json({error:'object_key_required'});const r=await pool.query('select id from media_objects where owner_user_id=$1 and storage_key=$2 and media_type=\'audio\'',[req.user.id,object_key]);if(!r.rowCount)return res.status(404).json({error:'owned_audio_object_not_found'});const j=await pool.query(`insert into tgg_browser_jobs(flow_key,payload) values('protected_audio_runtime',$1) returning *`,[{object_key,mime_type,user_id:req.user.id}]);res.status(201).json({job:j.rows[0]});}catch(e){next(e);}});

app.post('/v1/jobs', auth, async (req,res,next)=>{
  try {
    const {queue='default',job_type,payload={},priority=0,max_attempts=3}=req.body||{};
    if(!job_type) return res.status(400).json({error:'job_type_required'});
    const r=await pool.query(
      'insert into tgg_jobs(queue,job_type,payload,priority,max_attempts) values($1,$2,$3,$4,$5) returning *',
      [queue,job_type,payload,priority,max_attempts]
    );
    await pool.query('select pg_notify($1,$2)',['tgg_jobs',JSON.stringify({id:r.rows[0].id,queue,job_type})]);
    res.status(201).json({job:r.rows[0]});
  } catch(e){next(e);}
});

app.get('/v1/jobs', auth, async (req,res,next)=>{
  try {
    const queue=String(req.query.queue||'default');
    const r=await pool.query(
      "select * from tgg_jobs where queue=$1 and status in ('queued','running') order by priority desc,created_at asc limit 100",
      [queue]
    );
    res.json({jobs:r.rows});
  } catch(e){next(e);}
});

function hashWorkerToken(token){ return crypto.createHash('sha256').update(String(token||'')).digest('hex'); }
function workerAuthorized(req){
  const id=String(req.headers['x-tgg-worker-id']||req.body?.worker_id||'');
  const token=String(req.headers['x-tgg-worker-token']||req.body?.worker_token||'');
  return id && token ? {id,token,hash:hashWorkerToken(token)} : null;
}
async function requireWorker(req,res){
  const w=workerAuthorized(req);
  if(!w){ res.status(401).json({error:'worker_credentials_required'}); return null; }
  const r=await pool.query("select * from tgg_worker_registry where worker_id=$1 and worker_token_hash=$2 and status='active'",[w.id,w.hash]);
  if(!r.rowCount){ res.status(401).json({error:'worker_auth_failed'}); return null; }
  await pool.query('update tgg_worker_registry set last_seen_at=now(),updated_at=now() where id=$1',[r.rows[0].id]);
  return r.rows[0];
}

app.post('/v1/workers/bootstrap', async (req,res,next)=>{try{const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');if(!secret||req.headers['x-tgg-bootstrap-secret']!==secret)return res.status(403).json({error:'bootstrap_auth_failed'});const worker_id=String(req.body?.worker_id||'').trim();if(!worker_id)return res.status(400).json({error:'worker_id_required'});const worker_token=crypto.randomBytes(32).toString('base64url');const r=await pool.query(`insert into tgg_worker_registry(worker_id,worker_token_hash,metadata,last_seen_at) values($1,$2,$3,now()) on conflict(worker_id) do update set worker_token_hash=excluded.worker_token_hash,status='active',updated_at=now(),last_seen_at=now() returning id,worker_id,status`,[worker_id,hashWorkerToken(worker_token),req.body?.metadata||{}]);res.status(201).json({worker:r.rows[0],worker_token});}catch(e){next(e);}});

app.post('/v1/workers/register', async (req,res,next)=>{
  try{
    const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');
    if(!secret || req.headers['x-tgg-bootstrap-secret']!==secret) return res.status(403).json({error:'bootstrap_auth_failed'});
    const worker_id=String(req.body?.worker_id||'').trim();
    const worker_token=String(req.body?.worker_token||'').trim();
    if(!worker_id||!worker_token) return res.status(400).json({error:'worker_credentials_required'});
    const r=await pool.query(`insert into tgg_worker_registry(worker_id,worker_token_hash,metadata,last_seen_at)
      values($1,$2,$3,now()) on conflict(worker_id) do update set worker_token_hash=excluded.worker_token_hash,metadata=coalesce(tgg_worker_registry.metadata,'{}'::jsonb)||excluded.metadata,status='active',updated_at=now(),last_seen_at=now() returning id,worker_id,status`,
      [worker_id,hashWorkerToken(worker_token),req.body?.metadata||{}]);
    res.status(201).json({worker:r.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/workers/register-existing', async (req,res,next)=>{
  try{
    const w=workerAuthorized(req);
    if(!w) return res.status(401).json({error:'worker_credentials_required'});
    const worker_id=w.id;
    const worker_token=w.token;
    const r=await pool.query(`insert into tgg_worker_registry(worker_id,worker_token_hash,metadata,last_seen_at)
      values($1,$2,$3,now()) on conflict(worker_id) do update set worker_token_hash=excluded.worker_token_hash,metadata=coalesce(tgg_worker_registry.metadata,'{}'::jsonb)||excluded.metadata,status='active',updated_at=now(),last_seen_at=now() returning id,worker_id,status`,
      [worker_id,hashWorkerToken(worker_token),req.body?.metadata||{}]);
    res.status(201).json({worker:r.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/workers/heartbeat', async (req,res,next)=>{
  try{ const w=await requireWorker(req,res); if(!w)return; res.json({ok:true,worker_id:w.worker_id,at:new Date().toISOString()}); }catch(e){next(e);}
});

app.post('/v1/workers/certification-status', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const counts=await pool.query("select status,count(*)::int as count from tgg_certifications group by status order by status");
    const latest=await pool.query("select id,status,certification_type,browser_session_id,evidence from tgg_certifications order by id desc limit 5");
    res.json({counts:counts.rows,latest:latest.rows.map(x=>({id:x.id,status:x.status,certification_type:x.certification_type,browser_session_id:x.browser_session_id,evidence:x.evidence}))});
  }catch(e){next(e);}
});

app.post('/v1/workers/jobs/recover-certification', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const r=await pool.query("select id,user_id,browser_session_id,certification_type,status,evidence from tgg_certifications where status not in ('passed','failed','expired') order by id asc limit 1");
    const cert=r.rows[0];
    if(!cert) return res.json({job:null,reason:'no_open_certification'});
    const existing=await pool.query("select * from tgg_browser_jobs where flow_key='certification_runtime' and payload->>'certification_id'=$1 and status in ('queued','running') order by id desc limit 1",[String(cert.id)]);
    if(existing.rowCount) return res.json({job:existing.rows[0],existing:true});
    const job=await pool.query("insert into tgg_browser_jobs(flow_key,payload) values('certification_runtime',$1) returning *",[{certification_id:cert.id,browser_session_id:cert.browser_session_id||null,user_id:cert.user_id,certification_type:cert.certification_type}]);
    await pool.query("update tgg_certifications set evidence=coalesce(evidence,'{}'::jsonb)||$2::jsonb where id=$1",[cert.id,JSON.stringify({browser_job_id:job.rows[0].id})]);
    res.status(201).json({job:job.rows[0],recovered:true});
  }catch(e){ console.error('[TGG Core] certification recovery failed',e); next(e); }
});

app.post('/v1/workers/jobs/claim', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const r=await pool.query(`with candidate as (
      select id from tgg_browser_jobs where status='queued' and (lease_expires_at is null or lease_expires_at<now())
      order by created_at asc limit 1 for update skip locked
    ) update tgg_browser_jobs j set status='running',worker_id=$1,lease_token=encode(gen_random_bytes(24),'hex'),lease_expires_at=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
      from candidate where j.id=candidate.id returning j.*`,[w.id]);
    const job=r.rows[0]||null;
    if(job?.id && job?.payload?.user_id){
      const token=newToken();
      const expires=new Date(Date.now()+SESSION_DAYS*86400000);
      await pool.query('insert into sessions(user_id,token_hash,expires_at) values($1,$2,$3)',[job.payload.user_id,hashToken(token),expires]);
      job.tgg_core_access_token=token;
      job.tgg_core_access_token_expires_at=expires.toISOString();
    }
    res.json({job});
  }catch(e){next(e);}
});

app.post('/v1/workers/jobs/complete', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const verdict=String(req.body?.verdict||'failed');
    if(!['passed','failed'].includes(verdict)) return res.status(400).json({error:'invalid_verdict'});
    const r=await pool.query(`update tgg_browser_jobs set status=$1,result=coalesce($2,result),evidence=coalesce($3,evidence),lease_expires_at=null,updated_at=now(),finished_at=now()
      where id=$4 and worker_id=$5 and lease_token=$6 returning *`,
      [verdict,req.body?.result||null,req.body?.evidence||[],req.body?.job_id,w.id,req.body?.lease_token]);
    if(!r.rowCount)return res.status(409).json({error:'job_lease_invalid'});
    const finished=r.rows[0];
    const certId=finished.payload?.certification_id;
    if(certId){
      await pool.query(
        "update tgg_certifications set status=$2,evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('browser_job_id',$3,'browser_result',$4::jsonb),completed_at=case when $2 in ('passed','failed','expired') then now() else completed_at end where id=$1",
        [certId,verdict,finished.id,JSON.stringify(req.body?.result||{})]
      );
    }
    res.json({job:finished});
  }catch(e){next(e);}
});

app.post('/v1/workers/jobs/ensure-certification', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const email=String(req.body?.email||'').toLowerCase().trim();
    const certification_type=String(req.body?.certification_type||'protected_audio_runtime').trim();
    if(!/^\\S+@\\S+\\.\\S+$/.test(email)) return res.status(400).json({error:'valid_email_required'});
    let u=await pool.query('select id,email,display_name,role from users where email=$1',[email]);
    if(!u.rowCount){
      const password_hash=passwordHash(crypto.randomBytes(32).toString('hex'));
      u=await pool.query('insert into users(email,password_hash,display_name,role) values($1,$2,$3,$4) returning id,email,display_name,role',[email,password_hash,'TGG Owner','user']);
    }
    const user=u.rows[0];
    const existing=await pool.query("select * from tgg_certifications where user_id=$1 and status not in ('passed','failed','expired') order by id desc limit 1",[user.id]);
    if(existing.rowCount){
      const j=await pool.query("select * from tgg_browser_jobs where payload->>'certification_id'=$1 and status in ('queued','running') order by created_at desc limit 1",[String(existing.rows[0].id)]);
      if(j.rowCount) return res.json({certification:existing.rows[0],job:j.rows[0],created:true,existing:true});
      const job=await pool.query("insert into tgg_browser_jobs(flow_key,payload) values('certification_runtime',$1) returning *",[{certification_id:existing.rows[0].id,browser_session_id:existing.rows[0].browser_session_id||null,user_id:user.id,certification_type:existing.rows[0].certification_type}]);
      await pool.query("update tgg_certifications set evidence=coalesce(evidence,'{}'::jsonb)||$2::jsonb where id=$1",[existing.rows[0].id,JSON.stringify({browser_job_id:job.rows[0].id})]);
      return res.status(201).json({certification:existing.rows[0],job:job.rows[0],created:true,recovered:true});
    }
    const cert=await pool.query("insert into tgg_certifications(user_id,certification_type,evidence) values($1,$2,$3) returning *",[user.id,certification_type,{}]);
    const job=await pool.query("insert into tgg_browser_jobs(flow_key,payload) values('certification_runtime',$1) returning *",[{certification_id:cert.rows[0].id,browser_session_id:null,user_id:user.id,certification_type}]);
    await pool.query("update tgg_certifications set evidence=coalesce(evidence,'{}'::jsonb)||$2::jsonb where id=$1",[cert.rows[0].id,JSON.stringify({browser_job_id:job.rows[0].id})]);
    res.status(201).json({certification:cert.rows[0],job:job.rows[0],created:true});
  }catch(e){next(e);}
});

app.post('/v1/browser/worker-session', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const refresh_token=String(req.body?.refresh_token||'');
    const worker_id=String(req.body?.worker_id||'');
    if(!refresh_token||!worker_id||worker_id!==w.worker_id)return res.status(400).json({error:'worker_session_fields_required'});
    const encrypted=encryptSecret(refresh_token,w.hash);
    const r=await pool.query("update tgg_worker_registry set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('owner_refresh_token_encrypted',$2::text),updated_at=now() where worker_id=$1 and worker_token_hash=$3 returning worker_id",[worker_id,encrypted,w.hash]);
    if(!r.rowCount)return res.status(404).json({error:'worker_not_found'});
    res.json({ok:true});
  }catch(e){next(e);}
});
app.post('/v1/browser/worker-session/restore', async (req,res,next)=>{
  try{
    const w=workerAuthorized(req); if(!w)return res.status(401).json({error:'worker_credentials_required'});
    const r=await pool.query("select metadata->>'owner_refresh_token_encrypted' as refresh_token from tgg_worker_registry where worker_id=$1 and status='active'",[w.id]);
    if(!r.rowCount||!r.rows[0].refresh_token)return res.status(404).json({error:'owner_session_not_found'});
    const refresh_token=decryptSecret(r.rows[0].refresh_token,w.hash) || decryptSecret(r.rows[0].refresh_token,TOKEN_SECRET);
    if(!refresh_token)return res.status(500).json({error:'owner_session_decrypt_failed'});
    res.json({ok:true,refresh_token});
  }catch(e){next(e);}
});
app.post('/v1/browser/sessions', auth, async (req,res,next)=>{
  try {
    const r=await pool.query(
      'insert into tgg_browser_sessions(user_id,session_key,metadata) values($1,$2,$3) returning *',
      [req.user.id,crypto.randomBytes(24).toString('hex'),req.body?.metadata||{}]
    );
    res.status(201).json({session:r.rows[0]});
  } catch(e){next(e);}
});

app.patch('/v1/browser/sessions/:id', auth, async (req,res,next)=>{
  try {
    const allowed=['created','bootstrapping','active','closed','failed'];
    const status=req.body?.status;
    if(status && !allowed.includes(status)) return res.status(400).json({error:'invalid_session_status'});
    const r=await pool.query(
      `update tgg_browser_sessions set status=coalesce($2,status), metadata=coalesce($3,metadata), updated_at=now()
       where id=$1 and user_id=$4 returning *`,
      [req.params.id,status ?? null,req.body?.metadata ?? null,req.user.id]
    );
    if(!r.rowCount) return res.status(404).json({error:'browser_session_not_found'});
    res.json({session:r.rows[0]});
  } catch(e){next(e);}
});

app.get('/v1/browser/sessions/:id', auth, async (req,res,next)=>{
  try {
    const r=await pool.query('select * from tgg_browser_sessions where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({error:'browser_session_not_found'});
    res.json({session:r.rows[0]});
  } catch(e){next(e);}
});

// TGG Live Viewer: real-time browser-session telemetry over SSE.
app.post('/v1/browser/sessions/:id/viewer-events', async (req,res,next)=>{
  try {
    const w=workerAuthorized(req);
    if(!w){
      const header=req.get('authorization')||''; const token=header.startsWith('Bearer ')?header.slice(7):'';
      if(!token)return res.status(401).json({error:'viewer_session_unauthorized'});
      const u=await pool.query('select s.user_id as id from sessions s where s.token_hash=$1 and s.expires_at>now()',[hashToken(token)]);
      if(!u.rowCount)return res.status(401).json({error:'viewer_session_unauthorized'});
      const own=await pool.query('select 1 from tgg_browser_sessions where id=$1 and user_id=$2',[req.params.id,u.rows[0].id]);
      if(!own.rowCount)return res.status(404).json({error:'browser_session_not_found'});
    }
    const event_type=String(req.body?.event_type||'state').slice(0,80);
    const payload=req.body?.payload&&typeof req.body.payload==='object'?req.body.payload:{};
    const e=await pool.query('insert into tgg_browser_viewer_events(browser_session_id,event_type,payload) values($1,$2,$3) returning *',[req.params.id,event_type,payload]);
    await pool.query('select pg_notify($1,$2)',['tgg_browser_viewer',JSON.stringify({id:e.rows[0].id,browser_session_id:req.params.id,event_type,payload})]);
    res.status(201).json({event:e.rows[0]});
  } catch(e){next(e);}
});

app.get('/v1/browser/sessions/:id/viewer/stream', auth, async (req,res,next)=>{
  try {
    const own=await pool.query('select 1 from tgg_browser_sessions where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!own.rowCount)return res.status(404).json({error:'browser_session_not_found'});
    res.status(200); res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache, no-transform'); res.setHeader('Connection','keep-alive'); res.flushHeaders?.();
    const after=Number(req.query.after||0); let closed=false; const client=await pool.connect();
    await client.query('listen tgg_browser_viewer');
    const send=e=>{if(!closed)res.write('id: '+e.id+'\nevent: '+e.event_type+'\ndata: '+JSON.stringify(e.payload||{})+'\n\n');};
    const onNotification=msg=>{try{const e=JSON.parse(msg.payload);if(String(e.browser_session_id)===String(req.params.id))send(e);}catch{}};
    client.on('notification',onNotification);
    const backlog=await pool.query('select * from tgg_browser_viewer_events where id>$1 and browser_session_id=$2 order by id asc limit 200',[after,req.params.id]);
    backlog.rows.forEach(send);
    const heartbeat=setInterval(()=>{if(!closed)res.write(': ping\n\n');},15000);
    req.on('close',async()=>{if(closed)return;closed=true;clearInterval(heartbeat);client.off('notification',onNotification);try{await client.query('unlisten tgg_browser_viewer');}catch{}client.release();});
  } catch(e){next(e);}
});

app.get('/v1/browser/sessions/:id/viewer/state', auth, async (req,res,next)=>{
  try {
    const own=await pool.query('select * from tgg_browser_sessions where id=$1 and user_id=$2',[req.params.id,req.user.id]);
    if(!own.rowCount)return res.status(404).json({error:'browser_session_not_found'});
    const e=await pool.query('select * from tgg_browser_viewer_events where browser_session_id=$1 order by id desc limit 1',[req.params.id]);
    res.json({session:own.rows[0],latest_event:e.rows[0]||null});
  } catch(e){next(e);}
});

app.patch('/v1/certifications/:id', auth, async (req,res,next)=>{
  try {
    const allowed=['started','passed','failed','expired'];
    const status=req.body?.status;
    if(status && !allowed.includes(status)) return res.status(400).json({error:'invalid_certification_status'});
    const r=await pool.query(
      `update tgg_certifications set status=coalesce($2,status), evidence=coalesce($3,evidence), completed_at=case when $2 in ('passed','failed','expired') then now() else completed_at end
       where id=$1 and user_id=$4 returning *`,
      [req.params.id,status ?? null,req.body?.evidence ?? null,req.user.id]
    );
    if(!r.rowCount) return res.status(404).json({error:'certification_not_found'});
    res.json({certification:r.rows[0]});
  } catch(e){next(e);}
});

app.post('/v1/certifications', auth, async (req,res,next)=>{
  try {
    const {browser_session_id,certification_type,evidence={}}=req.body||{};
    if(!certification_type) return res.status(400).json({error:'certification_type_required'});
    const r=await pool.query(
      'insert into tgg_certifications(browser_session_id,user_id,certification_type,evidence) values($1,$2,$3,$4) returning *',
      [browser_session_id||null,req.user.id,certification_type,evidence]
    );
    const job=await pool.query(
      'insert into tgg_browser_jobs(flow_key,payload) values($1,$2) returning *',
      ['certification_runtime',{certification_id:r.rows[0].id,browser_session_id:browser_session_id||null,user_id:req.user.id,certification_type}]
    );
    await pool.query('update tgg_certifications set evidence=coalesce(evidence,\'{}\'::jsonb)||$2::jsonb where id=$1',[r.rows[0].id,JSON.stringify({browser_job_id:job.rows[0].id})]);
    res.status(201).json({certification:{...r.rows[0],evidence:{...evidence,browser_job_id:job.rows[0].id}},job:job.rows[0]});
  } catch(e){next(e);}
});


// Creator compatibility endpoints retained while the frontend migrates off Supabase.
app.get('/v1/creator/messages', auth, async (req,res,next)=>{try{const r=await pool.query('select id,sender_user_id,recipient_user_id,subject,body,read_at,created_at from tgg_creator_messages where sender_user_id=$1 or recipient_user_id=$1 order by created_at desc limit 100',[req.user.id]);res.json({messages:r.rows});}catch(e){next(e);}});
app.post('/v1/creator/messages', auth, async (req,res,next)=>{try{const {recipient_user_id,subject,body}=req.body||{};if(!recipient_user_id||!body)return res.status(400).json({error:'recipient_user_id_and_body_required'});const r=await pool.query('insert into tgg_creator_messages(sender_user_id,recipient_user_id,subject,body) values($1,$2,$3,$4) returning *',[req.user.id,recipient_user_id,subject||null,body]);res.status(201).json({message:r.rows[0]});}catch(e){next(e);}});
app.get('/v1/creator/supporters', auth, async (req,res,next)=>{try{const r=await pool.query('select s.* from tgg_creator_supporters s join artists a on a.id=s.artist_id where a.user_id=$1 order by s.created_at desc limit 500',[req.user.id]);res.json({supporters:r.rows});}catch(e){next(e);}});
app.get('/v1/creator/revenue', auth, async (req,res,next)=>{try{const r=await pool.query("select count(*)::int as events,coalesce(sum(amount_cents),0)::bigint as gross_cents from tgg_creator_revenue_events e join artists a on a.id=e.artist_id where a.user_id=$1 and e.status='recorded'",[req.user.id]);res.json({events:Number(r.rows[0]?.events||0),gross_cents:Number(r.rows[0]?.gross_cents||0)});}catch(e){next(e);}});
app.get('/v1/creator/expansion', auth, async (req,res,next)=>{try{const [m,a]=await Promise.all([pool.query('select count(*)::int as total from world_missions'),pool.query('select count(*)::int as completed from mission_sessions ms join users u on u.id=ms.user_id where u.id=$1 and ms.status=\'verified\'',[req.user.id])]);res.json({available_missions:Number(m.rows[0]?.total||0),completed_missions:Number(a.rows[0]?.completed||0)});}catch(e){next(e);}});
app.get('/v1/creator/growth', auth, async (req,res,next)=>{try{const [t,r]=await Promise.all([pool.query('select count(*)::int as tracks from tracks t join artists a on a.id=t.artist_id where a.user_id=$1',[req.user.id]),pool.query('select count(*)::int as releases from releases r join artists a on a.id=r.artist_id where a.user_id=$1',[req.user.id])]);res.json({tracks:Number(t.rows[0]?.tracks||0),releases:Number(r.rows[0]?.releases||0)});}catch(e){next(e);}});
app.get('/v1/creator/notifications', auth, async (req,res,next)=>{try{const r=await pool.query("select id,action,payload as metadata,created_at from tgg_audit_log where actor_user_id=$1 order by created_at desc limit 50",[req.user.id]);res.json({notifications:r.rows.map(x=>({id:x.id,type:x.action,metadata:x.metadata,created_at:x.created_at}))});}catch(e){next(e);}});
app.get('/v1/creator/profile', auth, async (req,res,next)=>{try{const r=await pool.query('select a.*,u.email,u.display_name,u.role from artists a join users u on u.id=a.user_id where a.user_id=$1',[req.user.id]);res.json({artist:r.rows[0]||null});}catch(e){next(e);}});

app.use((err,_req,res,_next)=>{
  console.error('[TGG Core]',err);
  res.status(500).json({error:'internal_error'});
});

app.listen(PORT, async ()=> {
  try { await init(); console.log(`TGG Core listening on :${PORT}`); }
  catch(e){ console.error('[TGG Core] database initialization failed',e); }
});