import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const INTERVAL_MS = Math.max(15000, Number(process.env.TGG_AUTOPILOT_INTERVAL_MS || 60000));
const INSTANCE_ID = process.env.TGG_AUTOPILOT_ID || 'tgg-autopilot';

if (!DATABASE_URL) console.warn('[TGG Autopilot] DATABASE_URL is not configured');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5
});

async function ensureSchema() {
  await pool.query(`
    create table if not exists tgg_scheduled_tasks (
      id uuid primary key default gen_random_uuid(),
      task_key text not null unique,
      title text not null,
      task_type text not null default 'maintenance',
      schedule_seconds integer not null default 60 check (schedule_seconds >= 15),
      enabled boolean not null default true,
      payload jsonb not null default '{}'::jsonb,
      last_run_at timestamptz,
      next_run_at timestamptz not null default now(),
      last_status text,
      last_error text,
      run_count bigint not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists tgg_scheduled_tasks_due_idx on tgg_scheduled_tasks(enabled,next_run_at);
    create table if not exists tgg_autopilot_runs (
      id uuid primary key default gen_random_uuid(),
      instance_id text not null,
      task_key text not null,
      status text not null,
      summary jsonb not null default '{}'::jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz
    );
    create index if not exists tgg_autopilot_runs_task_idx on tgg_autopilot_runs(task_key,started_at desc);
  `);

  await pool.query(`
    insert into tgg_scheduled_tasks(task_key,title,task_type,schedule_seconds,payload)
    values
      ('source_truth_audit','TGG Source of Truth Audit','bookkeeping',60,'{"action":"reconcile_master_inventory"}'::jsonb),
      ('job_queue_maintenance','TGG Job Queue Maintenance','queue',60,'{"action":"recover_expired_jobs"}'::jsonb),
      ('runtime_heartbeat','TGG Runtime Heartbeat','health',30,'{"action":"record_runtime_heartbeat"}'::jsonb)
    on conflict(task_key) do nothing
  `);
}

async function sourceTruthAudit() {
  const r = await pool.query(`
    select
      (select count(*)::int from public.tgg_master_sites) as master_sites,
      (select count(*)::int from public.tgg_master_content) as master_content,
      (select count(*)::int from public.tgg_master_shared_settings) as shared_settings,
      (select count(*)::int from public.tgg_master_audit_log) as master_audit_log,
      (select count(*)::int from public.tgg_master_change_queue) as change_queue,
      (select count(*)::int from public.tgg_code_components) as code_components,
      (select count(*)::int from public.tgg_code_snapshots) as code_snapshots,
      (select count(*)::int from public.tgg_code_issues) as code_issues,
      (select count(*)::int from public.tgg_final_completion_ledger) as completion_ledger,
      (select count(*)::int from public.tgg_edge_function_runtime_inventory) as edge_runtime_inventory
  `);
  return r.rows[0];
}

async function recoverExpiredJobs() {
  const r = await pool.query(`
    update tgg_jobs
    set status='queued',
        available_at=now(),
        error=coalesce(error,'Recovered by TGG Autopilot')
    where status='running'
      and available_at < now() - interval '10 minutes'
    returning id
  `);
  return { recovered_jobs: r.rowCount };
}

async function heartbeat() {
  const r = await pool.query(`
    insert into public.tgg_master_shared_settings(setting_key,title,config,is_published,updated_at)
    values(
      'auto_mode_runtime_heartbeat',
      'TGG AUTO MODE Runtime Heartbeat',
      jsonb_build_object(
        'instance_id',$1,
        'status','online',
        'heartbeat_at',now(),
        'interval_ms',$2
      ),
      true,now()
    )
    on conflict(setting_key) do update set
      config=excluded.config,
      is_published=true,
      updated_at=now()
    returning setting_key
  `, [INSTANCE_ID, INTERVAL_MS]);
  return { heartbeat: r.rowCount === 1 };
}

async function runTask(task) {
  const run = await pool.query(
    `insert into tgg_autopilot_runs(instance_id,task_key,status,summary)
     values($1,$2,'running','{}'::jsonb) returning id`,
    [INSTANCE_ID, task.task_key]
  );
  const runId = run.rows[0].id;
  try {
    let summary = {};
    if (task.task_key === 'source_truth_audit') summary = await sourceTruthAudit();
    if (task.task_key === 'job_queue_maintenance') summary = await recoverExpiredJobs();
    if (task.task_key === 'runtime_heartbeat') summary = await heartbeat();

    await pool.query(
      `update tgg_autopilot_runs set status='succeeded',summary=$2,finished_at=now() where id=$1`,
      [runId, summary]
    );
    await pool.query(
      `update tgg_scheduled_tasks
       set last_run_at=now(),next_run_at=now() + make_interval(secs => schedule_seconds),
           last_status='succeeded',last_error=null,run_count=run_count+1,updated_at=now()
       where id=$1`,
      [task.id]
    );
    return summary;
  } catch (e) {
    await pool.query(
      `update tgg_autopilot_runs set status='failed',summary=$2,finished_at=now() where id=$1`,
      [runId, { error: e.message }]
    );
    await pool.query(
      `update tgg_scheduled_tasks
       set last_run_at=now(),next_run_at=now() + make_interval(secs => schedule_seconds),
           last_status='failed',last_error=$2,run_count=run_count+1,updated_at=now()
       where id=$1`,
      [task.id, e.message]
    );
    throw e;
  }
}

let running = false;
async function tick() {
  if (running || !DATABASE_URL) return;
  running = true;
  try {
    await ensureSchema();
    const due = await pool.query(`
      select * from tgg_scheduled_tasks
      where enabled=true and next_run_at <= now()
      order by next_run_at asc
      for update skip locked
      limit 10
    `);
    for (const task of due.rows) {
      try { await runTask(task); }
      catch (e) { console.error('[TGG Autopilot] task failed', task.task_key, e.message); }
    }
  } catch (e) {
    console.error('[TGG Autopilot] tick failed', e.message);
  } finally {
    running = false;
  }
}

app.get('/health', async (_req,res) => {
  try {
    await pool.query('select 1');
    res.json({ok:true,service:'tgg-autopilot',instance_id:INSTANCE_ID,interval_ms:INTERVAL_MS,time:new Date().toISOString()});
  } catch (e) {
    res.status(503).json({ok:false,service:'tgg-autopilot',error:e.message});
  }
});

app.get('/status', async (_req,res) => {
  try {
    await ensureSchema();
    const tasks = await pool.query(`
      select task_key,title,task_type,enabled,schedule_seconds,last_run_at,next_run_at,last_status,last_error,run_count
      from tgg_scheduled_tasks order by task_key
    `);
    res.json({ok:true,instance_id:INSTANCE_ID,tasks:tasks.rows});
  } catch (e) {
    res.status(500).json({ok:false,error:e.message});
  }
});

app.listen(PORT, async () => {
  await ensureSchema();
  await tick();
  setInterval(tick, INTERVAL_MS);
  console.log(JSON.stringify({service:'tgg-autopilot',status:'online',interval_ms:INTERVAL_MS,instance_id:INSTANCE_ID}));
});
