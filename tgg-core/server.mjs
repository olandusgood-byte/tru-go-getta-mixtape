import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
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
    await pool.query('select pg_notify($1,$2)', ['tgg_realtime', JSON.stringify({id:r.rows[0].id,topic,payload})]);
    res.status(201).json({event:r.rows[0]});
  } catch(e){ next(e); }
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

app.use((err,_req,res,_next)=>{
  console.error('[TGG Core]',err);
  res.status(500).json({error:'internal_error'});
});

app.listen(PORT, async ()=> {
  try { await init(); console.log(`TGG Core listening on :${PORT}`); }
  catch(e){ console.error('[TGG Core] database initialization failed',e); }
});
