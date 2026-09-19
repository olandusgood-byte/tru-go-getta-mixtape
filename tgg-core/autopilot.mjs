import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
const INTERVAL_MS = Math.max(15000, Number(process.env.TGG_AUTOPILOT_INTERVAL_MS || 15000));
const INSTANCE_ID = process.env.TGG_AUTOPILOT_ID || 'tgg-core-autopilot';

if (!DATABASE_URL) {
  console.warn('[TGG Autopilot] DATABASE_URL is not configured; scheduler paused');
} else {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 3
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
      create table if not exists tgg_idea_queue (
        id uuid primary key default gen_random_uuid(),
        idea_key text not null unique,
        title text not null,
        category text not null,
        rationale text not null,
        priority integer not null default 0,
        status text not null default 'new' check (status in ('new','accepted','rejected','implemented')),
        source_snapshot jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists tgg_idea_queue_status_idx on tgg_idea_queue(status,priority desc,created_at desc);
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
        (select count(*)::int from users) as users,
        (select count(*)::int from artists) as artists,
        (select count(*)::int from releases) as releases,
        (select count(*)::int from tracks) as tracks,
        (select count(*)::int from media_objects) as media_objects,
        (select count(*)::int from tgg_jobs) as jobs,
        (select count(*)::int from tgg_browser_sessions) as browser_sessions,
        (select count(*)::int from tgg_certifications) as certifications,
        (select count(*)::int from tgg_audit_log) as audit_log
    `);
    return r.rows[0];
  }

  async function generateIdeas(snapshot) {
    const ideas = [];
    if (Number(snapshot.jobs || 0) > 0)
      ideas.push(['process_active_jobs','Process active TGG jobs','reliability','Queued TGG jobs exist in the runtime inventory and should be processed before adding duplicate implementations.',100]);
    if (Number(snapshot.change_queue || 0) > 0)
      ideas.push(['drain_change_queue','Process pending change queue','automation','Existing queued changes should be reconciled through the source-of-truth pipeline.',90]);
    ideas.push(['continuous_drift_scan','Run continuous architecture drift scan','governance','Compare live runtime, master inventory, code snapshots, and completion ledger before new work.',80]);
    ideas.push(['idea_expansion_cycle','Generate next-wave product ideas from current inventory','innovation','Use completed capabilities and observed gaps to propose additive work without rebuilding completed components.',70]);
    for (const [idea_key,title,category,rationale,priority] of ideas) {
      await pool.query(
        `insert into tgg_idea_queue(idea_key,title,category,rationale,priority,source_snapshot)
         values($1,$2,$3,$4,$5,$6)
         on conflict(idea_key) do update set
           rationale=excluded.rationale,priority=greatest(tgg_idea_queue.priority,excluded.priority),
           source_snapshot=excluded.source_snapshot,updated_at=now()
         where tgg_idea_queue.status not in ('implemented','rejected')`,
        [idea_key,title,category,rationale,priority,snapshot]
      );
    }
    return {ideas_generated: ideas.length};
  }

  async function recoverExpiredJobs() {
    const r = await pool.query(`
      update tgg_jobs
      set status='queued', available_at=now(), error=coalesce(error,'Recovered by TGG Autopilot')
      where status='running' and available_at < now() - interval '10 minutes'
      returning id
    `);
    return { recovered_jobs: r.rowCount };
  }

  async function heartbeat() {
    await pool.query(`
      insert into public.tgg_master_shared_settings(setting_key,title,config,is_published,updated_at)
      values(
        'auto_mode_runtime_heartbeat',
        'TGG AUTO MODE Runtime Heartbeat',
        jsonb_build_object('instance_id',$1,'status','online','heartbeat_at',now(),'interval_ms',$2),
        true,now()
      )
      on conflict(setting_key) do update set config=excluded.config,is_published=true,updated_at=now()
    `, [INSTANCE_ID, INTERVAL_MS]);
    return { heartbeat: true };
  }

  async function runTask(task) {
    const run = await pool.query(
      `insert into tgg_autopilot_runs(instance_id,task_key,status,summary)
       values($1,$2,'running','{}'::jsonb) returning id`,
      [INSTANCE_ID, task.task_key]
    );
    try {
      let summary = {};
      if (task.task_key === 'source_truth_audit') { const snapshot = await sourceTruthAudit(); summary = {...snapshot, ...(await generateIdeas(snapshot))}; }
      if (task.task_key === 'job_queue_maintenance') summary = await recoverExpiredJobs();
      if (task.task_key === 'runtime_heartbeat') summary = await heartbeat();

      await pool.query(
        `update tgg_autopilot_runs set status='succeeded',summary=$2,finished_at=now() where id=$1`,
        [run.rows[0].id, summary]
      );
      await pool.query(
        `update tgg_scheduled_tasks
         set last_run_at=now(),next_run_at=now()+make_interval(secs=>schedule_seconds),
             last_status='succeeded',last_error=null,run_count=run_count+1,updated_at=now()
         where id=$1`,
        [task.id]
      );
    } catch (e) {
      await pool.query(
        `update tgg_autopilot_runs set status='failed',summary=$2,finished_at=now() where id=$1`,
        [run.rows[0].id, {error:e.message}]
      );
      await pool.query(
        `update tgg_scheduled_tasks
         set last_run_at=now(),next_run_at=now()+make_interval(secs=>schedule_seconds),
             last_status='failed',last_error=$2,run_count=run_count+1,updated_at=now()
         where id=$1`,
        [task.id,e.message]
      );
      console.error(JSON.stringify({service:'tgg-autopilot',task:task.task_key,status:'failed',error:e.message}));
    }
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await ensureSchema();
      const due = await pool.query(`
        select * from tgg_scheduled_tasks
        where enabled=true and next_run_at<=now()
        order by next_run_at asc
        for update skip locked limit 10
      `);
      await Promise.all(due.rows.map(task => runTask(task)));
    } catch (e) {
      console.error('[TGG Autopilot] tick failed', e.message);
    } finally {
      busy = false;
    }
  }

  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
  console.log(JSON.stringify({service:'tgg-autopilot',embedded:true,instance_id:INSTANCE_ID,interval_ms:INTERVAL_MS}));
}
