import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '70mb' }));

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
function encryptSecret(value){ const iv=crypto.randomBytes(12); const key=crypto.createHash('sha256').update(TOKEN_SECRET).digest(); const cipher=crypto.createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]); return iv.toString('base64url')+'.'+cipher.getAuthTag().toString('base64url')+'.'+encrypted.toString('base64url'); }
function decryptSecret(value){ const [ivS,tagS,dataS]=String(value||'').split('.'); if(!ivS||!tagS||!dataS) return null; const key=crypto.createHash('sha256').update(TOKEN_SECRET).digest(); const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivS,'base64url')); decipher.setAuthTag(Buffer.from(tagS,'base64url')); return Buffer.concat([decipher.update(Buffer.from(dataS,'base64url')),decipher.final()]).toString('utf8'); }

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

app.get('/v1/missions', auth, async (_req, res, next) => {
  try { const r=await pool.query('select * from world_missions where active=true order by created_at'); res.json({ missions:r.rows }); }
  catch(e){ next(e); }
});

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
    const cleanKey=String(object_key).replace(/^\\/+|\\\\/g,'/').split('/').filter(x=>x && x!=='.' && x!=='..').join('/');
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

app.get('/v1/storage/object-auth/:bucket/*key', auth, async (req,res,next)=>{try{const bucketKey=String(req.params.bucket||''),key=String(req.params.key||'').replace(/^\\/+/,''),r=await pool.query('select * from media_objects where storage_key=$1 and owner_user_id=$2',[path.posix.join(bucketKey,key),req.user.id]);if(!r.rowCount)return res.status(404).json({error:'media_object_not_found'});const target=path.resolve(STORAGE_ROOT,path.posix.join(bucketKey,key)),root=path.resolve(STORAGE_ROOT);if(!target.startsWith(root+path.sep))return res.status(400).json({error:'invalid_object_key'});const stat=await fs.stat(target);res.set('Content-Length',String(stat.size));if(r.rows[0].mime_type)res.type(r.rows[0].mime_type);res.sendFile(target);}catch(e){next(e);}});\n\napp.get('/v1/storage/object/:bucket/*key', async (req,res,next)=>{
  try {
    const bucketKey=String(req.params.bucket||'');
    const key=String(req.params.key||'').replace(/^\\/+/, '');
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

app.post('/v1/workers/bootstrap', async (req,res,next)=>{try{const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');if(!secret||req.headers['x-tgg-bootstrap-secret']!==secret)return res.status(403).json({error:'bootstrap_auth_failed'});const worker_id=String(req.body?.worker_id||'').trim();if(!worker_id)return res.status(400).json({error:'worker_id_required'});const worker_token=crypto.randomBytes(32).toString('base64url');const r=await pool.query(\`insert into tgg_worker_registry(worker_id,worker_token_hash,metadata,last_seen_at) values($1,$2,$3,now()) on conflict(worker_id) do update set worker_token_hash=excluded.worker_token_hash,status='active',updated_at=now(),last_seen_at=now() returning id,worker_id,status\`,[worker_id,hashWorkerToken(worker_token),req.body?.metadata||{}]);res.status(201).json({worker:r.rows[0],worker_token});}catch(e){next(e);}});\n\napp.post('/v1/workers/register', async (req,res,next)=>{
  try{
    const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');
    if(!secret || req.headers['x-tgg-bootstrap-secret']!==secret) return res.status(403).json({error:'bootstrap_auth_failed'});
    const worker_id=String(req.body?.worker_id||'').trim();
    const worker_token=String(req.body?.worker_token||'').trim();
    if(!worker_id||!worker_token) return res.status(400).json({error:'worker_credentials_required'});
    const r=await pool.query(`insert into tgg_worker_registry(worker_id,worker_token_hash,metadata,last_seen_at)
      values($1,$2,$3,now()) on conflict(worker_id) do update set worker_token_hash=excluded.worker_token_hash,metadata=excluded.metadata,status='active',updated_at=now(),last_seen_at=now() returning id,worker_id,status`,
      [worker_id,hashWorkerToken(worker_token),req.body?.metadata||{}]);
    res.status(201).json({worker:r.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/workers/heartbeat', async (req,res,next)=>{
  try{ const w=await requireWorker(req,res); if(!w)return; res.json({ok:true,worker_id:w.worker_id,at:new Date().toISOString()}); }catch(e){next(e);}
});

app.post('/v1/workers/jobs/claim', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const r=await pool.query(`with candidate as (
      select id from tgg_browser_jobs where status='queued' and (lease_expires_at is null or lease_expires_at<now())
      order by created_at asc limit 1 for update skip locked
    ) update tgg_browser_jobs j set status='running',worker_id=$1,lease_token=encode(gen_random_bytes(24),'hex'),lease_expires_at=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
      from candidate where j.id=candidate.id returning j.*`,[w.id]);
    res.json({job:r.rows[0]||null});
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
    res.json({job:r.rows[0]});
  }catch(e){next(e);}
});

app.post('/v1/browser/worker-session', async (req,res,next)=>{
  try{
    const w=await requireWorker(req,res); if(!w)return;
    const refresh_token=String(req.body?.refresh_token||'');
    const worker_id=String(req.body?.worker_id||'');
    if(!refresh_token||!worker_id||worker_id!==w.worker_id)return res.status(400).json({error:'worker_session_fields_required'});
    const encrypted=encryptSecret(refresh_token);
    const r=await pool.query("update tgg_worker_registry set metadata=jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),'{owner_refresh_token_encrypted}',to_jsonb($2::text),true),'{owner_user_id}',coalesce(metadata->'owner_user_id','null'::jsonb),true),updated_at=now() where worker_id=$1 and worker_token_hash=$3 returning worker_id",[worker_id,encrypted,w.hash]);
    if(!r.rowCount)return res.status(404).json({error:'worker_not_found'});
    res.json({ok:true});
  }catch(e){next(e);}
});
app.post('/v1/browser/worker-session/restore', async (req,res,next)=>{
  try{
    const w=workerAuthorized(req); if(!w)return res.status(401).json({error:'worker_credentials_required'});
    const r=await pool.query("select metadata->>'owner_refresh_token_encrypted' as refresh_token from tgg_worker_registry where worker_id=$1 and worker_token_hash=$2 and status='active'",[w.id,w.hash]);
    if(!r.rowCount||!r.rows[0].refresh_token)return res.status(404).json({error:'owner_session_not_found'});
    const refresh_token=decryptSecret(r.rows[0].refresh_token); if(!refresh_token)return res.status(500).json({error:'owner_session_decrypt_failed'});
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
    res.status(201).json({certification:r.rows[0]});
  } catch(e){next(e);}
});

app.use((err,_req,res,_next)=>{
  console.error('[TGG Core]',err);
  res.status(500).json({error:'internal_error'});
});

app.listen(PORT, async ()=> {
  try { await init(); console.log(`TGG Core listening on :${PORT}`); }
  catch(e){ console.error('[TGG Core] database initialization failed',e); }
});
