import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.JOB_DB_POOL_MAX || 4)
});

const WORKER_ID = process.env.TGG_WORKER_ID || 'tgg-job-worker';
const POLL_MS = Number(process.env.TGG_JOB_POLL_MS || 1000);

async function claim(queue='default') {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const r = await client.query(
      `select * from tgg_jobs
       where queue=$1 and status='queued' and available_at<=now()
       order by priority desc, created_at asc
       for update skip locked limit 1`,
      [queue]
    );
    if (!r.rowCount) { await client.query('commit'); return null; }
    const job = r.rows[0];
    const updated = await client.query(
      `update tgg_jobs set status='running', attempts=attempts+1, started_at=now()
       where id=$1 and status='queued' returning *`,
      [job.id]
    );
    await client.query('commit');
    return updated.rows[0] || null;
  } catch (e) {
    await client.query('rollback').catch(()=>{});
    throw e;
  } finally { client.release(); }
}

async function finish(job, result) {
  await pool.query(
    `update tgg_jobs set status='succeeded', result=$2, finished_at=now(), error=null where id=$1`,
    [job.id, result || {}]
  );
}

async function fail(job, error) {
  const message=String(error?.message || error).slice(0,4000);
  const retry=job.attempts < job.max_attempts;
  await pool.query(
    `update tgg_jobs
     set status=$2, error=$3, finished_at=case when $2='failed' then now() else null end,
         available_at=case when $2='queued' then now()+interval '5 seconds' else available_at end
     where id=$1`,
    [job.id, retry ? 'queued' : 'failed', message]
  );
}

async function execute(job) {
  switch (job.job_type) {
    case 'noop':
    case 'healthcheck':
      return { worker_id: WORKER_ID, job_type: job.job_type, completed_at: new Date().toISOString() };
    default:
      return { worker_id: WORKER_ID, job_type: job.job_type, accepted: true, payload: job.payload || {} };
  }
}

async function loop() {
  await pool.query('select 1');
  console.log('[TGG Job Worker] online', WORKER_ID);
  for (;;) {
    try {
      const job=await claim(process.env.TGG_JOB_QUEUE || 'default');
      if (job) {
        try { await finish(job, await execute(job)); }
        catch (e) { await fail(job,e); }
      } else await new Promise(r=>setTimeout(r,POLL_MS));
    } catch (e) {
      console.error('[TGG Job Worker]',e);
      await new Promise(r=>setTimeout(r,Math.max(POLL_MS,2000)));
    }
  }
}

loop().catch(e=>{ console.error(e); process.exit(1); });
