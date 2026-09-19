import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
const INTERVAL_MS = Math.max(15000, Number(process.env.TGG_AUTOPILOT_INTERVAL_MS || 15000));
const INSTANCE_ID = process.env.TGG_AUTOPILOT_ID || 'tgg-core-autopilot';
const SUPABASE_URL = String(process.env.TGG_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.TGG_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!DATABASE_URL) {
  console.warn('[TGG Autopilot] DATABASE_URL is not configured; scheduler paused');
} else {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    query_timeout: 15000
  });
  pool.on('error', err => console.error('[TGG Autopilot] pool error', err.message));

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

  async function tableExists(name) {
    const r = await pool.query(
      `select to_regclass($1) is not null as exists`,
      [`public.${name}`]
    );
    return Boolean(r.rows[0]?.exists);
  }

  async function countIfExists(name) {
    if (!(await tableExists(name))) return 0;
    const r = await pool.query(`select count(*)::int as count from public.${name}`);
    return Number(r.rows[0]?.count || 0);
  }

  async function masterBrainBridge(snapshot) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { enabled: false, reason: 'supabase_bridge_credentials_missing' };
    const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
    const tables = ['tgg_brain_goals','tgg_brain_decisions','tgg_brain_memory','tgg_autobuilder_cycles','tgg_autonomic_cycles','tgg_master_change_queue','tgg_final_completion_ledger'];
    const inventory = {};
    for (const table of tables) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers: { ...headers, Prefer: 'count=exact' } });
      if (!res.ok) throw new Error(`supabase_${table}_${res.status}`);
      const range = res.headers.get('content-range') || '';
      const total = range.includes('/') ? range.split('/')[1] : null;
      inventory[table] = total === '*' || total === null ? 0 : Number(total);
    }
    const payload = { source: 'tgg-core-autopilot', snapshot, inventory, observed_at: new Date().toISOString() };
    const queue = await fetch(`${SUPABASE_URL}/rest/v1/tgg_master_change_queue`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ target_site_key: 'supabase', change_type: 'autopilot_source_sync', payload, status: 'pending' })
    });
    if (!queue.ok) throw new Error(`supabase_master_queue_${queue.status}`);
    return { enabled: true, inventory, queued: true };
  }

  async function sourceTruthAudit() {
    const names = ['users','artists','releases','tracks','media_objects','tgg_jobs','tgg_browser_sessions','tgg_certifications','tgg_audit_log'];
    const counts = await Promise.all(names.map(async name => [name, await countIfExists(name)]));
    return Object.fromEntries(counts);
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
    if (!(await tableExists('tgg_jobs'))) return { recovered_jobs: 0, skipped: 'tgg_jobs_missing' };
    const r = await pool.query(`
      update public.tgg_jobs
      set status='queued', available_at=now(), error=coalesce(error,'Recovered by TGG Autopilot')
      where status='running' and available_at < now() - interval '10 minutes'
      returning id
    `);
    return { recovered_jobs: r.rowCount };
  }

  async function heartbeat() {
    await pool.query(`
      create table if not exists public.tgg_autopilot_heartbeat (
        instance_id text primary key,
        status text not null,
        heartbeat_at timestamptz not null,
        interval_ms integer not null,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(`
      insert into public.tgg_autopilot_heartbeat(instance_id,status,heartbeat_at,interval_ms,updated_at)
      values($1,'online',now(),$2,now())
      on conflict(instance_id) do update set
        status=excluded.status,heartbeat_at=excluded.heartbeat_at,
        interval_ms=excluded.interval_ms,updated_at=now()
    `, [INSTANCE_ID, INTERVAL_MS]);
    return { heartbeat: true };
  }

  async function runTask(task) {
    console.log(JSON.stringify({service:'tgg-autopilot',event:'task_start',task:task.task_key}));
    const run = await pool.query(
      `insert into tgg_autopilot_runs(instance_id,task_key,status,summary)
       values($1,$2,'running','{}'::jsonb) returning id`,
      [INSTANCE_ID, task.task_key]
    );
    try {
      let summary = {};
      if (task.task_key === 'source_truth_audit') {
        const snapshot = await sourceTruthAudit();
        summary = {...snapshot, ...(await generateIdeas(snapshot)), master_bridge: await masterBrainBridge(snapshot)};
      }
      if (task.task_key === 'job_queue_maintenance') summary = await recoverExpiredJobs();
      if (task.task_key === 'runtime_heartbeat') summary = await heartbeat();

      await pool.query(
        `update tgg_autopilot_runs set status='succeeded',summary=$2,finished_at=now() where id=$1`,
        [run.rows[0].id, summary]
      );
      console.log(JSON.stringify({service:'tgg-autopilot',task:task.task_key,status:'succeeded',summary}));
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
        with claimed as (
          select id from tgg_scheduled_tasks
          where enabled=true and next_run_at<=now()
            and coalesce(last_status,'') <> 'running'
          order by next_run_at asc
          for update skip locked
          limit 10
        )
        update tgg_scheduled_tasks t
        set last_status='running', updated_at=now()
        from claimed c
        where t.id=c.id
        returning t.*
      `);
      console.log(JSON.stringify({service:'tgg-autopilot',event:'tick',claimed:due.rowCount}));
      await Promise.all(due.rows.map(task => runTask(task)));
    } catch (e) {
      console.error(JSON.stringify({service:'tgg-autopilot',event:'tick_failed',error:e.message}));
    } finally {
      busy = false;
    }
  }

  console.log(JSON.stringify({service:'tgg-autopilot',event:'scheduler_start',interval_ms:INTERVAL_MS}));
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
  console.log(JSON.stringify({service:'tgg-autopilot',embedded:true,instance_id:INSTANCE_ID,interval_ms:INTERVAL_MS}));
}
