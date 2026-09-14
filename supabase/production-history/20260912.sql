-- TRU GO GETTA production migration history archive
-- Date bucket: 20260912
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260912002305 allow_authenticated_published_secure_audio_read
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create policy "mixtape audio published secure read" on storage.objects for select to authenticated using (bucket_id = 'mixtape-audio' and exists (select 1 from public.tracks t join public.mixtapes m on m.id = t.mixtape_id where t.audio_path = storage.objects.name and t.has_secure_audio = true and m.status::text = 'published'));

-- ============================================================
-- MIGRATION 20260912154150 v58_auto_builder_runtime_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_workflow_definitions (
  key text primary key,
  version integer not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v58_workflow_step_definitions (
  workflow_key text not null references public.v58_workflow_definitions(key) on delete cascade,
  workflow_version integer not null,
  key text not null,
  title text not null,
  description text,
  type text not null,
  sequence integer not null,
  required boolean not null default true,
  max_attempts integer not null default 3,
  depends_on text[] not null default '{}',
  auto_start boolean not null default true,
  action_type text,
  primary key (workflow_key, workflow_version, key)
);

create index if not exists v58_step_defs_order_idx
  on public.v58_workflow_step_definitions(workflow_key, workflow_version, sequence);

create table if not exists public.v58_workflow_drafts (
  creator_id uuid not null references auth.users(id) on delete cascade,
  workflow_key text not null,
  workflow_version integer not null,
  workflow jsonb not null,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, workflow_key, workflow_version)
);

alter table public.v58_workflow_definitions enable row level security;
alter table public.v58_workflow_step_definitions enable row level security;
alter table public.v58_workflow_drafts enable row level security;

drop policy if exists v58_workflow_defs_authenticated_read on public.v58_workflow_definitions;
create policy v58_workflow_defs_authenticated_read on public.v58_workflow_definitions
  for select to authenticated using (true);

drop policy if exists v58_workflow_steps_authenticated_read on public.v58_workflow_step_definitions;
create policy v58_workflow_steps_authenticated_read on public.v58_workflow_step_definitions
  for select to authenticated using (true);

insert into public.v58_workflow_definitions(key,version,name,description,active)
values ('release_launch',58,'Release Launch','End-to-end release launch workflow.',true)
on conflict (key) do update set version=excluded.version,name=excluded.name,description=excluded.description,active=excluded.active,updated_at=now();

insert into public.v58_workflow_step_definitions
(workflow_key,workflow_version,key,title,description,type,sequence,required,max_attempts,depends_on,auto_start,action_type)
values
('release_launch',58,'validate_release','Release Validation','Validate release metadata, required fields, schedule, and project readiness.','validation',10,true,3,'{}',true,null),
('release_launch',58,'rights_trust','Rights & Trust','Confirm ownership, rights, compliance, and trust requirements.','validation',20,true,3,array['validate_release'],true,null),
('release_launch',58,'media_assets','Media & Assets','Validate artwork, audio/video, metadata assets, and required media derivatives.','validation',30,true,3,array['validate_release'],true,null),
('release_launch',58,'distribution','Distribution','Deliver the approved release package to configured distribution destinations.','provider',40,true,3,array['rights_trust','media_assets'],true,null),
('release_launch',58,'promotion','Promotion','Prepare and schedule launch promotion; requires creator approval when configured.','approval',50,true,3,array['validate_release','rights_trust'],true,'approval'),
('release_launch',58,'fan_crm','Fan CRM','Build eligible audience segments and prepare release communications/activation.','automation',60,true,3,array['validate_release'],true,null),
('release_launch',58,'analytics','Analytics','Initialize release attribution, tracking, and post-launch reporting.','automation',70,true,3,array['validate_release'],true,null),
('release_launch',58,'monetization','Monetization','Prepare payment attribution, revenue tracking, and monetization hooks.','automation',80,true,3,array['rights_trust'],true,null),
('release_launch',58,'launch','Launch','Release the launch gate once all required upstream systems are ready.','gate',90,true,3,array['distribution','promotion','fan_crm','analytics','monetization'],true,null)
on conflict (workflow_key,workflow_version,key) do update set
 title=excluded.title,description=excluded.description,type=excluded.type,sequence=excluded.sequence,required=excluded.required,max_attempts=excluded.max_attempts,depends_on=excluded.depends_on,auto_start=excluded.auto_start,action_type=excluded.action_type;

create or replace function public.v58_save_workflow_definition(p_workflow jsonb, p_steps jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := nullif(trim(p_workflow->>'key'),'');
  v_version integer := coalesce((p_workflow->>'version')::integer,58);
  v_workflow jsonb := jsonb_build_object(
    'key',v_key,
    'version',v_version,
    'name',coalesce(p_workflow->>'name',''),
    'description',coalesce(p_workflow->>'description',''),
    'active',coalesce((p_workflow->>'active')::boolean,true)
  );
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_key is null then raise exception 'Workflow key is required'; end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'Workflow steps must be an array'; end if;

  insert into public.v58_workflow_drafts(creator_id,workflow_key,workflow_version,workflow,steps,updated_at)
  values(v_uid,v_key,v_version,v_workflow,p_steps,now())
  on conflict (creator_id,workflow_key,workflow_version) do update
    set workflow=excluded.workflow,steps=excluded.steps,updated_at=now();

  return jsonb_build_object('ok',true,'workflow',v_workflow,'steps',p_steps,'saved_at',now());
end;
$$;

revoke all on function public.v58_save_workflow_definition(jsonb,jsonb) from public;
grant execute on function public.v58_save_workflow_definition(jsonb,jsonb) to authenticated;

create or replace function public.v58_get_workflow_draft(p_workflow_key text, p_workflow_version integer default 58)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('workflow',d.workflow,'steps',d.steps)
  from public.v58_workflow_drafts d
  where d.creator_id=auth.uid()
    and d.workflow_key=p_workflow_key
    and d.workflow_version=p_workflow_version;
$$;

revoke all on function public.v58_get_workflow_draft(text,integer) from public;
grant execute on function public.v58_get_workflow_draft(text,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260912154253 v58_auto_builder_runtime_execution_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_auto_builder_load(p_workflow_key text default 'release_launch', p_workflow_version integer default 58)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_draft jsonb;
  v_workflow jsonb;
  v_steps jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select jsonb_build_object('workflow',d.workflow,'steps',d.steps)
    into v_draft
  from public.v58_workflow_drafts d
  where d.creator_id=v_uid
    and d.workflow_key=p_workflow_key
    and d.workflow_version=p_workflow_version;

  if v_draft is not null then
    return jsonb_build_object('source','draft','workflow',v_draft->'workflow','steps',v_draft->'steps');
  end if;

  select jsonb_build_object(
    'key',w.key,'version',w.version,'name',w.name,'description',w.description,'active',w.active
  ) into v_workflow
  from public.v58_workflow_definitions w
  where w.key=p_workflow_key and w.version=p_workflow_version and w.active=true;

  if v_workflow is null then raise exception 'Workflow definition not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',s.key,'title',s.title,'description',coalesce(s.description,''),'type',s.type,
    'sequence',s.sequence,'required',s.required,'max_attempts',s.max_attempts,
    'depends_on',to_jsonb(s.depends_on),'auto_start',s.auto_start,'action_type',s.action_type
  ) order by s.sequence),'[]'::jsonb)
  into v_steps
  from public.v58_workflow_step_definitions s
  where s.workflow_key=p_workflow_key and s.workflow_version=p_workflow_version;

  return jsonb_build_object('source','canonical','workflow',v_workflow,'steps',v_steps);
end;
$$;

revoke all on function public.v58_auto_builder_load(text,integer) from public;
grant execute on function public.v58_auto_builder_load(text,integer) to authenticated;

create or replace function public.v58_auto_builder_publish(p_workflow_key text, p_workflow_version integer default 58)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_draft public.v58_workflow_drafts%rowtype;
  v_step jsonb;
  v_key text;
  v_dep text;
  v_keys text[];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_draft from public.v58_workflow_drafts
  where creator_id=v_uid and workflow_key=p_workflow_key and workflow_version=p_workflow_version;
  if not found then raise exception 'No saved workflow draft'; end if;

  if jsonb_typeof(v_draft.steps) <> 'array' then raise exception 'Workflow steps must be an array'; end if;
  select array_agg(x->>'key') into v_keys from jsonb_array_elements(v_draft.steps) x;
  if coalesce(array_length(v_keys,1),0)=0 then raise exception 'Workflow must contain at least one step'; end if;
  if exists (select 1 from unnest(v_keys) k group by k having count(*)>1) then raise exception 'Duplicate step key detected'; end if;

  for v_step in select * from jsonb_array_elements(v_draft.steps) loop
    v_key := nullif(trim(v_step->>'key'),'');
    if v_key is null then raise exception 'Every workflow step requires a key'; end if;
    if nullif(trim(v_step->>'title'),'') is null then raise exception 'Step % requires a title',v_key; end if;
    for v_dep in select jsonb_array_elements_text(coalesce(v_step->'depends_on','[]'::jsonb)) loop
      if not (v_dep = any(v_keys)) then raise exception 'Step % depends on missing step %',v_key,v_dep; end if;
    end loop;
  end loop;

  return jsonb_build_object('ok',true,'published',true,'workflow_key',p_workflow_key,'workflow_version',p_workflow_version,'validated_at',now());
end;
$$;

revoke all on function public.v58_auto_builder_publish(text,integer) from public;
grant execute on function public.v58_auto_builder_publish(text,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260912154432 v58_auto_builder_execution_engine_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_workflow_runs (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id) on delete cascade, release_id text not null,
 workflow_key text not null default 'release_launch', workflow_version integer not null default 58,
 status text not null default 'pending' check (status in ('pending','running','blocked','completed','failed','cancelled')),
 progress numeric(5,2) not null default 0, total_steps integer not null default 0, completed_steps integer not null default 0,
 current_step text, errors integer not null default 0, events_processed integer not null default 0, automations_executed integer not null default 0,
 started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists v58_runs_creator_release_idx on public.v58_workflow_runs(creator_id,release_id,created_at desc);

create table if not exists public.v58_workflow_steps (
 id uuid primary key default gen_random_uuid(), workflow_run_id uuid not null references public.v58_workflow_runs(id) on delete cascade,
 key text not null, title text not null, description text, type text not null default 'automation',
 status text not null default 'pending' check (status in ('pending','running','completed','blocked','failed','retrying','skipped')),
 required boolean not null default true, progress numeric(5,2), sequence integer not null default 0, attempts integer not null default 0,
 max_attempts integer not null default 3, depends_on text[] not null default '{}', detail text, error_message text,
 started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workflow_run_id,key));
create index if not exists v58_steps_run_sequence_idx on public.v58_workflow_steps(workflow_run_id,sequence);

create table if not exists public.v58_workflow_events (
 id uuid primary key default gen_random_uuid(), workflow_run_id uuid not null references public.v58_workflow_runs(id) on delete cascade,
 workflow_step_id uuid references public.v58_workflow_steps(id) on delete set null, event_type text not null, title text not null, description text,
 severity text not null default 'info' check (severity in ('info','success','warning','error')), entity_type text, entity_id text,
 payload jsonb not null default '{}', created_at timestamptz not null default now(), idempotency_key text);
create unique index if not exists v58_events_idempotency_idx on public.v58_workflow_events(workflow_run_id,idempotency_key) where idempotency_key is not null;

create table if not exists public.v58_required_actions (
 id uuid primary key default gen_random_uuid(), workflow_run_id uuid not null references public.v58_workflow_runs(id) on delete cascade,
 workflow_step_id uuid references public.v58_workflow_steps(id) on delete set null, creator_id uuid not null references auth.users(id) on delete cascade,
 type text not null default 'approval', priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
 title text not null, description text, entity_type text, entity_id text, action_label text not null default 'Review',
 blocks_launch boolean not null default true, resolved boolean not null default false, resolved_at timestamptz, created_at timestamptz not null default now());
create index if not exists v58_actions_creator_open_idx on public.v58_required_actions(creator_id,resolved,created_at desc);

create table if not exists public.v58_provider_jobs (
 id uuid primary key default gen_random_uuid(), workflow_run_id uuid not null references public.v58_workflow_runs(id) on delete cascade,
 workflow_step_id uuid references public.v58_workflow_steps(id) on delete set null, creator_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, operation text not null, status text not null default 'pending' check (status in ('pending','processing','delivered','completed','failed','retrying','dead_letter')),
 attempt integer not null default 0, max_attempts integer not null default 3, external_id text, error_message text,
 payload jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), idempotency_key text);
create unique index if not exists v58_jobs_idempotency_idx on public.v58_provider_jobs(workflow_run_id,idempotency_key) where idempotency_key is not null;

create table if not exists public.v58_launch_milestones (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id) on delete cascade, release_id text not null,
 key text not null, label text not null, sequence integer not null default 0, status text not null default 'scheduled', scheduled_at timestamptz,
 completed_at timestamptz, created_at timestamptz not null default now(), unique(release_id,key));

alter table public.v58_workflow_runs enable row level security;
alter table public.v58_workflow_steps enable row level security;
alter table public.v58_workflow_events enable row level security;
alter table public.v58_required_actions enable row level security;
alter table public.v58_provider_jobs enable row level security;
alter table public.v58_launch_milestones enable row level security;

drop policy if exists v58_runs_select_own on public.v58_workflow_runs; create policy v58_runs_select_own on public.v58_workflow_runs for select using (creator_id=auth.uid());
drop policy if exists v58_steps_select_own on public.v58_workflow_steps; create policy v58_steps_select_own on public.v58_workflow_steps for select using (exists(select 1 from public.v58_workflow_runs r where r.id=workflow_run_id and r.creator_id=auth.uid()));
drop policy if exists v58_events_select_own on public.v58_workflow_events; create policy v58_events_select_own on public.v58_workflow_events for select using (exists(select 1 from public.v58_workflow_runs r where r.id=workflow_run_id and r.creator_id=auth.uid()));
drop policy if exists v58_actions_select_own on public.v58_required_actions; create policy v58_actions_select_own on public.v58_required_actions for select using (creator_id=auth.uid());
drop policy if exists v58_jobs_select_own on public.v58_provider_jobs; create policy v58_jobs_select_own on public.v58_provider_jobs for select using (creator_id=auth.uid());
drop policy if exists v58_milestones_select_own on public.v58_launch_milestones; create policy v58_milestones_select_own on public.v58_launch_milestones for select using (creator_id=auth.uid());

create or replace function public.v58_assert_run_owner(p_run_id uuid) returns public.v58_workflow_runs language plpgsql security definer set search_path=public as $$ declare r public.v58_workflow_runs; begin select * into r from public.v58_workflow_runs where id=p_run_id and creator_id=auth.uid() for update; if not found then raise exception 'Workflow run not found or not owned by current creator'; end if; return r; end; $$;
revoke all on function public.v58_assert_run_owner(uuid) from public;

create or replace function public.v58_emit_event(p_run_id uuid,p_step_id uuid,p_event_type text,p_title text,p_description text default null,p_severity text default 'info',p_entity_type text default null,p_entity_id text default null,p_payload jsonb default '{}',p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin if auth.uid() is null then raise exception 'Authentication required'; end if; if not exists(select 1 from public.v58_workflow_runs where id=p_run_id and creator_id=auth.uid()) then raise exception 'Workflow run not found or not owned by current creator'; end if; insert into public.v58_workflow_events(workflow_run_id,workflow_step_id,event_type,title,description,severity,entity_type,entity_id,payload,idempotency_key) values(p_run_id,p_step_id,p_event_type,p_title,p_description,p_severity,p_entity_type,p_entity_id,coalesce(p_payload,'{}'),p_idempotency_key) on conflict (workflow_run_id,idempotency_key) where idempotency_key is not null do nothing returning id into v_id; if v_id is null and p_idempotency_key is not null then select id into v_id from public.v58_workflow_events where workflow_run_id=p_run_id and idempotency_key=p_idempotency_key; end if; return v_id; end; $$;

create or replace function public.v58_queue_step_task(p_step_id uuid,p_task_type text default 'workflow.step',p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path=public as $$ declare s public.v58_workflow_steps; r public.v58_workflow_runs; j uuid; begin select s.* into s from public.v58_workflow_steps s join public.v58_workflow_runs r0 on r0.id=s.workflow_run_id where s.id=p_step_id and r0.creator_id=auth.uid(); if not found then raise exception 'Workflow step not found or not owned by current creator'; end if; select * into r from public.v58_workflow_runs where id=s.workflow_run_id; insert into public.v58_provider_jobs(workflow_run_id,workflow_step_id,creator_id,provider,operation,status,payload,idempotency_key) values(r.id,s.id,r.creator_id,case when s.type='provider' then 'provider' else 'creator_os' end,p_task_type,'pending',coalesce(p_payload,'{}'),'step-'||s.id::text) on conflict (workflow_run_id,idempotency_key) where idempotency_key is not null do nothing returning id into j; return j; end; $$;
grant execute on function public.v58_queue_step_task(uuid,text,jsonb) to authenticated;

create or replace function public.v58_recalculate_run(p_run_id uuid) returns public.v58_workflow_runs language plpgsql security definer set search_path=public as $$ declare r public.v58_workflow_runs; total_n int; done_n int; err_n int; block_n int; cur text; st text; begin select * into r from public.v58_workflow_runs where id=p_run_id and creator_id=auth.uid() for update; if not found then raise exception 'Workflow run not found or not owned by current creator'; end if; select count(*) into total_n from public.v58_workflow_steps where workflow_run_id=p_run_id and required=true; select count(*) into done_n from public.v58_workflow_steps where workflow_run_id=p_run_id and required=true and status in ('completed','skipped'); select count(*) into err_n from public.v58_workflow_steps where workflow_run_id=p_run_id and status in ('failed','blocked'); select count(*) into block_n from public.v58_required_actions where workflow_run_id=p_run_id and resolved=false and blocks_launch=true; select key into cur from public.v58_workflow_steps where workflow_run_id=p_run_id and status in ('running','retrying','blocked') order by sequence limit 1; st:=case when r.status in ('cancelled','failed') then r.status when done_n=total_n and total_n>0 then 'completed' when err_n>0 or block_n>0 then 'blocked' when r.started_at is not null then 'running' else 'pending' end; update public.v58_workflow_runs set status=st,progress=case when total_n=0 then 0 else round(done_n::numeric/total_n::numeric*100,2) end,total_steps=total_n,completed_steps=done_n,current_step=cur,errors=err_n,completed_at=case when st='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=p_run_id returning * into r; return r; end; $$;
revoke all on function public.v58_recalculate_run(uuid) from public;

create or replace function public.v58_create_release_launch_workflow(p_release_id text) returns uuid language plpgsql security definer set search_path=public as $$ declare uid uuid:=auth.uid(); rid uuid; d jsonb; s jsonb; keys text[]; begin if uid is null then raise exception 'Authentication required'; end if; select id into rid from public.v58_workflow_runs where creator_id=uid and release_id=p_release_id and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running','blocked') order by created_at desc limit 1; if rid is not null then return rid; end if; select public.v58_auto_builder_load('release_launch',58) into d; insert into public.v58_workflow_runs(creator_id,release_id,workflow_key,workflow_version,status) values(uid,p_release_id,'release_launch',58,'pending') returning id into rid; for s in select * from jsonb_array_elements(coalesce(d->'steps','[]')) loop insert into public.v58_workflow_steps(workflow_run_id,key,title,description,type,status,required,sequence,max_attempts,depends_on) values(rid,s->>'key',coalesce(s->>'title',s->>'key'),s->>'description',coalesce(s->>'type','automation'),'pending',coalesce((s->>'required')::boolean,true),coalesce((s->>'sequence')::int,0),coalesce((s->>'max_attempts')::int,3),coalesce(array(select jsonb_array_elements_text(coalesce(s->'depends_on','[]'))),'{}')); end loop; perform public.v58_emit_event(rid,null,'workflow.created','Release Launch workflow created','Workflow seeded from Auto Builder configuration.','info','release',p_release_id,jsonb_build_object('workflow_version',58),'workflow-created'); return rid; end; $$;
grant execute on function public.v58_create_release_launch_workflow(text) to authenticated;

create or replace function public.v58_start_workflow(p_run_id uuid) returns public.v58_workflow_runs language plpgsql security definer set search_path=public as $$ begin perform public.v58_assert_run_owner(p_run_id); update public.v58_workflow_runs set status='running',started_at=coalesce(started_at,now()),updated_at=now() where id=p_run_id; perform public.v58_emit_event(p_run_id,null,'workflow.started','Release Launch started','Workflow execution is active.','info','workflow',p_run_id::text,'{}','workflow-started'); return public.v58_recalculate_run(p_run_id); end; $$;
grant execute on function public.v58_start_workflow(uuid) to authenticated;

create or replace function public.v58_advance_workflow(p_run_id uuid) returns public.v58_workflow_runs language plpgsql security definer set search_path=public as $$ declare r public.v58_workflow_runs; s public.v58_workflow_steps; blocked boolean; aid uuid; begin r:=public.v58_assert_run_owner(p_run_id); if r.status='pending' then r:=public.v58_start_workflow(p_run_id); end if; for s in select * from public.v58_workflow_steps where workflow_run_id=p_run_id and status='pending' order by sequence loop select exists(select 1 from unnest(s.depends_on) dep left join public.v58_workflow_steps ds on ds.workflow_run_id=p_run_id and ds.key=dep where ds.id is null or ds.status not in ('completed','skipped')) into blocked; if blocked then continue; end if; update public.v58_workflow_steps set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),progress=case when type in ('validation','automation','gate') then 5 else progress end,updated_at=now() where id=s.id; if s.type='approval' then insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch) values(p_run_id,s.id,r.creator_id,'approval','high',s.title||' requires approval',coalesce(s.description,'Review and approve this workflow step.'),'workflow_step',s.id::text,'Review & Approve',true) returning id into aid; update public.v58_workflow_steps set status='blocked',detail='Waiting for creator approval.',updated_at=now() where id=s.id; perform public.v58_emit_event(p_run_id,s.id,'step.action_required',s.title||' needs your approval','Creator approval is required before the workflow can continue.','warning','required_action',aid::text,jsonb_build_object('action_id',aid),'approval-required-'||s.key); else perform public.v58_queue_step_task(s.id,case when s.type='provider' then 'provider.dispatch' when s.type='gate' then 'workflow.gate' else 'workflow.automation' end,jsonb_build_object('step_key',s.key,'release_id',r.release_id,'workflow_run_id',p_run_id)); perform public.v58_emit_event(p_run_id,s.id,'step.queued',s.title||' queued','Workflow step handed to the server-side execution queue.','info','workflow_step',s.id::text,jsonb_build_object('step_key',s.key),'step-queued-'||s.key||'-'||s.attempts::text); end if; end loop; return public.v58_recalculate_run(p_run_id); end; $$;
grant execute on function public.v58_advance_workflow(uuid) to authenticated;

create or replace function public.v58_launch_release(p_release_id text) returns uuid language plpgsql security definer set search_path=public as $$ declare rid uuid; begin rid:=public.v58_create_release_launch_workflow(p_release_id); perform public.v58_start_workflow(rid); perform public.v58_advance_workflow(rid); return rid; end; $$;
grant execute on function public.v58_launch_release(text) to authenticated;

create or replace function public.v58_auto_builder_execute(p_release_id text,p_workflow_key text default 'release_launch',p_workflow_version integer default 58) returns jsonb language plpgsql security definer set search_path=public as $$ declare uid uuid:=auth.uid(); rid uuid; r public.v58_workflow_runs; draft jsonb; begin if uid is null then raise exception 'Authentication required'; end if; if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if; draft:=public.v58_auto_builder_load(p_workflow_key,p_workflow_version); if coalesce(draft->>'source','')='draft' then perform public.v58_auto_builder_publish(p_workflow_key,p_workflow_version); end if; rid:=public.v58_create_release_launch_workflow(p_release_id); r:=public.v58_start_workflow(rid); r:=public.v58_advance_workflow(rid); return jsonb_build_object('ok',true,'run_id',rid,'status',r.status,'progress',r.progress,'total_steps',r.total_steps,'completed_steps',r.completed_steps,'current_step',r.current_step,'source',draft->>'source'); end; $$;
revoke all on function public.v58_auto_builder_execute(text,text,integer) from public;
grant execute on function public.v58_auto_builder_execute(text,text,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260912164031 revoke_anon_v58_workflow_secdef
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_advance_workflow(uuid) from public, anon;
revoke execute on function public.v58_create_release_launch_workflow(text) from public, anon;
revoke execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) from public, anon;
revoke execute on function public.v58_launch_release(text) from public, anon;
revoke execute on function public.v58_queue_step_task(uuid,text,jsonb) from public, anon;
revoke execute on function public.v58_start_workflow(uuid) from public, anon;
grant execute on function public.v58_advance_workflow(uuid) to authenticated;
grant execute on function public.v58_create_release_launch_workflow(text) to authenticated;
grant execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.v58_launch_release(text) to authenticated;
grant execute on function public.v58_queue_step_task(uuid,text,jsonb) to authenticated;
grant execute on function public.v58_start_workflow(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260912180256 fix_operational_exposure_audit_delegated_guards
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_operational_exposure_audit()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tables jsonb; v_views jsonb; v_functions jsonb; v_guarded_functions jsonb;
  v_table_count integer:=0; v_view_count integer:=0; v_function_count integer:=0;
  v_guarded_function_count integer:=0; v_public_anon_count integer:=0; v_auth_unguarded_count integer:=0;
  v_payload jsonb;
begin
  with exposed as (
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
      and (pg_catalog.has_table_privilege('anon','public.'||pg_catalog.quote_ident(c.relname),'SELECT') or pg_catalog.has_table_privilege('anon','public.'||pg_catalog.quote_ident(c.relname),'INSERT') or pg_catalog.has_table_privilege('anon','public.'||pg_catalog.quote_ident(c.relname),'UPDATE') or pg_catalog.has_table_privilege('anon','public.'||pg_catalog.quote_ident(c.relname),'DELETE') or pg_catalog.has_table_privilege('authenticated','public.'||pg_catalog.quote_ident(c.relname),'SELECT') or pg_catalog.has_table_privilege('authenticated','public.'||pg_catalog.quote_ident(c.relname),'INSERT') or pg_catalog.has_table_privilege('authenticated','public.'||pg_catalog.quote_ident(c.relname),'UPDATE') or pg_catalog.has_table_privilege('authenticated','public.'||pg_catalog.quote_ident(c.relname),'DELETE'))
  ) select count(*),coalesce(jsonb_agg(relname order by relname),'[]'::jsonb) into v_table_count,v_tables from exposed;

  with exposed as (
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and (pg_catalog.has_table_privilege('anon','public.'||pg_catalog.quote_ident(c.relname),'SELECT') or pg_catalog.has_table_privilege('authenticated','public.'||pg_catalog.quote_ident(c.relname),'SELECT'))
      and not ('security_invoker=true'=any(coalesce(c.reloptions,array[]::text[])))
  ) select count(*),coalesce(jsonb_agg(relname order by relname),'[]'::jsonb) into v_view_count,v_views from exposed;

  with secdef as (
    select p.oid,p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')' signature,
      pg_catalog.has_function_privilege('public',p.oid,'EXECUTE') public_exec,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
      (
        position('auth.uid()' in lower(pg_catalog.pg_get_functiondef(p.oid)))>0
        or position('v58_assert_run_owner' in lower(pg_catalog.pg_get_functiondef(p.oid)))>0
        or (
          p.proname='v58_launch_release'
          and position('v58_create_release_launch_workflow' in lower(pg_catalog.pg_get_functiondef(p.oid)))>0
          and position('v58_start_workflow' in lower(pg_catalog.pg_get_functiondef(p.oid)))>0
          and position('v58_advance_workflow' in lower(pg_catalog.pg_get_functiondef(p.oid)))>0
        )
      ) has_uid_guard
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef=true
  ), unsafe as (
    select signature,(public_exec or anon_exec) public_or_anon,(auth_exec and not has_uid_guard) auth_unguarded
    from secdef
    where (public_exec or anon_exec or (auth_exec and not has_uid_guard))
      and signature not in (
        'tgg_public_epk(p_slug text)',
        'tgg_record_public_analytics_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_session_id text, p_referrer text, p_metadata jsonb)',
        'tgg_public_discovery_growth_feed(p_limit integer, p_query text)'
      )
  ), guarded as (
    select signature from secdef where auth_exec and has_uid_guard and not public_exec and not anon_exec
  )
  select (select count(*) from unsafe),(select coalesce(jsonb_agg(signature order by signature),'[]'::jsonb) from unsafe),
    (select count(*) from unsafe where public_or_anon),(select count(*) from unsafe where auth_unguarded),
    (select count(*) from guarded),(select coalesce(jsonb_agg(signature order by signature),'[]'::jsonb) from guarded)
  into v_function_count,v_functions,v_public_anon_count,v_auth_unguarded_count,v_guarded_function_count,v_guarded_functions;

  v_payload:=jsonb_build_object(
    'ok',(v_table_count+v_view_count+v_function_count)=0,
    'version','EXPOSURE-AUDIT-1.4',
    'tables_without_rls_with_api_grants',v_table_count,
    'non_invoker_exposed_views',v_view_count,
    'unsafe_security_definer_functions',v_function_count,
    'public_or_anon_security_definer_functions',v_public_anon_count,
    'authenticated_unguarded_security_definer_functions',v_auth_unguarded_count,
    'authenticated_guarded_security_definer_functions',v_guarded_function_count,
    'tables',v_tables,'views',v_views,'functions',v_functions,'guarded_functions_review_inventory',v_guarded_functions,
    'allowlisted_public_security_definer_functions',jsonb_build_array(
      'tgg_public_epk(p_slug text)',
      'tgg_record_public_analytics_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_session_id text, p_referrer text, p_metadata jsonb)',
      'tgg_public_discovery_growth_feed(p_limit integer, p_query text)'
    ),
    'allowlist_reason','Public EPK, public analytics event recording, and the bounded read-only public discovery feed are intentional anonymous endpoints. V58 workflow RPCs may satisfy authentication through v58_assert_run_owner or the authenticated workflow creation path.',
    'guard_semantics','Authenticated SECURITY DEFINER functions require direct auth.uid() gating or a verified delegated ownership/authentication guard; intentional anonymous wrappers are allowlisted only when their public purpose and input constraints are established.',
    'checked_at',now()
  );

  if (v_table_count+v_view_count+v_function_count)>0 then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('security:database_exposure','critical','database_exposure',v_payload)
    on conflict(alert_key) do update set status='open',last_seen=now(),occurrence_count=public.tgg_operational_alerts.occurrence_count+1,last_payload=excluded.last_payload,severity='critical';
  else
    update public.tgg_operational_alerts set status='resolved',last_seen=now(),last_payload=v_payload where alert_key='security:database_exposure' and status<>'resolved';
  end if;
  return v_payload;
end;
$function$;

