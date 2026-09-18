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
    })();
  }
  return initPromise;
}

const SESSION_DAYS = 30;
const TOKEN_SECRET = process.env.TGG_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

app.get('/v1/realtime/stream', auth, async (req,res,next)=>{\n  const topic=String(req.query.topic||'');\n  const after=Math.max(0,Number(req.query.after||0));\n  if(!topic) return res.status(400).json({error:'topic_required'});\n  const client=await pool.connect();\n  let closed=false;\n  const send=(event)=>{ if(!closed) res.write('data: '+JSON.stringify(event)+'\\n\\n'); };\n  try {\n    await client.query('listen tgg_realtime');\n    res.status(200);\n    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});\n    res.flushHeaders?.();\n    const backlog=await pool.query('select * from realtime_events where id>$1 and topic=$2 and (user_id=$3 or user_id is null) order by id asc limit 100',[after,topic,req.user.id]);\n    for(const event of backlog.rows) send({id:event.id,topic:event.topic,user_id:event.user_id,payload:event.payload,created_at:event.created_at});\n    const heartbeat=setInterval(()=>{ if(!closed) res.write(': tgg-heartbeat\\n\\n'); },25000);\n    const onNotification=(msg)=>{ try { const event=JSON.parse(msg.payload||'{}'); if(event.topic!==topic) return; if(event.user_id && event.user_id!==req.user.id) return; send(event); } catch {} };\n    client.on('notification',onNotification);\n    const close=async()=>{ if(closed) return; closed=true; clearInterval(heartbeat); client.off('notification',onNotification); try { await client.query('unlisten tgg_realtime'); } catch {} client.release(); if(!res.writableEnded) res.end(); };\n    req.on('close',close);\n  } catch(e) { client.release(); next(e); }\n});\n\napp.get('/v1/realtime/events', auth, async (req,res,next)=>{
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

app.get('/v1/storage/object/:bucket/*key', async (req,res,next)=>{
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

app.post('/v1/browser/sessions', auth, async (req,res,next)=>{
  try {
    const r=await pool.query(
      'insert into tgg_browser_sessions(user_id,session_key,metadata) values($1,$2,$3) returning *',
      [req.user.id,crypto.randomBytes(24).toString('hex'),req.body?.metadata||{}]
    );
    res.status(201).json({session:r.rows[0]});
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
