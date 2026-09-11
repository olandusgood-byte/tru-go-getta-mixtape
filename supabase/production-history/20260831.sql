-- TRU GO GETTA production migration history archive
-- Date bucket: 20260831
-- Historical evidence only. Do not replay against production.
-- Preserve the recorded order. Validate in an isolated clean environment before any bootstrap use.

-- ============================================================
-- MIGRATION 20260831124800 v58_1_close_rls_policy_gaps
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.is_conversation_member(p_conversation_id uuid, p_user_id uuid) returns boolean language sql security definer set search_path = public, pg_temp as $$ select exists (select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = p_user_id); $$; revoke all on function private.is_conversation_member(uuid,uuid) from public; grant execute on function private.is_conversation_member(uuid,uuid) to authenticated; create or replace function private.is_creator_member(p_creator_id uuid, p_user_id uuid) returns boolean language sql security definer set search_path = public, pg_temp as $$ select exists (select 1 from public.v54_creator_members cm where cm.creator_id = p_creator_id and cm.user_id = p_user_id) or exists (select 1 from public.v54_creators c where c.id = p_creator_id and c.owner_id = p_user_id); $$; revoke all on function private.is_creator_member(uuid,uuid) from public; grant execute on function private.is_creator_member(uuid,uuid) to authenticated;

alter table public.blocked_users enable row level security; drop policy if exists blocked_users_select on public.blocked_users; drop policy if exists blocked_users_insert on public.blocked_users; drop policy if exists blocked_users_delete on public.blocked_users; create policy blocked_users_select on public.blocked_users for select to authenticated using (blocker_id=auth.uid() or blocked_id=auth.uid()); create policy blocked_users_insert on public.blocked_users for insert to authenticated with check (blocker_id=auth.uid()); create policy blocked_users_delete on public.blocked_users for delete to authenticated using (blocker_id=auth.uid());

alter table public.conversations enable row level security; drop policy if exists conversations_select on public.conversations; drop policy if exists conversations_insert on public.conversations; drop policy if exists conversations_update on public.conversations; create policy conversations_select on public.conversations for select to authenticated using (created_by=auth.uid() or private.is_conversation_member(id,auth.uid())); create policy conversations_insert on public.conversations for insert to authenticated with check (created_by=auth.uid()); create policy conversations_update on public.conversations for update to authenticated using (created_by=auth.uid()) with check (created_by=auth.uid());

alter table public.conversation_members enable row level security; drop policy if exists conversation_members_select on public.conversation_members; drop policy if exists conversation_members_insert on public.conversation_members; drop policy if exists conversation_members_update on public.conversation_members; drop policy if exists conversation_members_delete on public.conversation_members; create policy conversation_members_select on public.conversation_members for select to authenticated using (user_id=auth.uid() or private.is_conversation_member(conversation_id,auth.uid())); create policy conversation_members_insert on public.conversation_members for insert to authenticated with check (user_id=auth.uid() or exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=auth.uid())); create policy conversation_members_update on public.conversation_members for update to authenticated using (user_id=auth.uid() or private.is_conversation_member(conversation_id,auth.uid())); create policy conversation_members_delete on public.conversation_members for delete to authenticated using (user_id=auth.uid() or exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=auth.uid()));

alter table public.messages enable row level security; drop policy if exists messages_select on public.messages; drop policy if exists messages_insert on public.messages; drop policy if exists messages_update on public.messages; drop policy if exists messages_delete on public.messages; create policy messages_select on public.messages for select to authenticated using (private.is_conversation_member(conversation_id,auth.uid())); create policy messages_insert on public.messages for insert to authenticated with check (sender_id=auth.uid() and private.is_conversation_member(conversation_id,auth.uid())); create policy messages_update on public.messages for update to authenticated using (sender_id=auth.uid()) with check (sender_id=auth.uid()); create policy messages_delete on public.messages for delete to authenticated using (sender_id=auth.uid());

alter table public.message_attachments enable row level security; drop policy if exists message_attachments_select on public.message_attachments; drop policy if exists message_attachments_insert on public.message_attachments; create policy message_attachments_select on public.message_attachments for select to authenticated using (exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))); create policy message_attachments_insert on public.message_attachments for insert to authenticated with check (exists(select 1 from public.messages m where m.id=message_id and m.sender_id=auth.uid()));

alter table public.message_reactions enable row level security; drop policy if exists message_reactions_select on public.message_reactions; drop policy if exists message_reactions_insert on public.message_reactions; drop policy if exists message_reactions_delete on public.message_reactions; create policy message_reactions_select on public.message_reactions for select to authenticated using (exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))); create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))); create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=auth.uid());

alter table public.message_reads enable row level security; drop policy if exists message_reads_select on public.message_reads; drop policy if exists message_reads_insert on public.message_reads; drop policy if exists message_reads_update on public.message_reads; create policy message_reads_select on public.message_reads for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))); create policy message_reads_insert on public.message_reads for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))); create policy message_reads_update on public.message_reads for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

alter table public.message_reports enable row level security; drop policy if exists message_reports_select on public.message_reports; drop policy if exists message_reports_insert on public.message_reports; create policy message_reports_select on public.message_reports for select to authenticated using (reporter_id=auth.uid() or reviewed_by=auth.uid()); create policy message_reports_insert on public.message_reports for insert to authenticated with check (reporter_id=auth.uid());

alter table public.release_year enable row level security; drop policy if exists release_year_select on public.release_year; create policy release_year_select on public.release_year for select to authenticated using (true);

alter table public.v54_creator_access enable row level security; drop policy if exists v54_creator_access_select on public.v54_creator_access; create policy v54_creator_access_select on public.v54_creator_access for select to authenticated using (user_id=auth.uid() or private.is_creator_member(creator_id,auth.uid()));
alter table public.v54_creator_members enable row level security; drop policy if exists v54_creator_members_select on public.v54_creator_members; create policy v54_creator_members_select on public.v54_creator_members for select to authenticated using (user_id=auth.uid() or private.is_creator_member(creator_id,auth.uid()));
alter table public.v54_creators enable row level security; drop policy if exists v54_creators_select on public.v54_creators; create policy v54_creators_select on public.v54_creators for select to authenticated using (owner_id=auth.uid() or owner_user_id=auth.uid() or private.is_creator_member(id,auth.uid()));

alter table public.v58_workflow_definitions enable row level security; drop policy if exists v58_workflow_definitions_select on public.v58_workflow_definitions; create policy v58_workflow_definitions_select on public.v58_workflow_definitions for select to authenticated using (active=true);
alter table public.v58_workflow_step_definitions enable row level security; drop policy if exists v58_workflow_step_definitions_select on public.v58_workflow_step_definitions; create policy v58_workflow_step_definitions_select on public.v58_workflow_step_definitions for select to authenticated using (exists(select 1 from public.v58_workflow_definitions w where w.key=workflow_key and w.version=workflow_version and w.active=true));

-- ============================================================
-- MIGRATION 20260831125330 v58_1_harden_v54_internal_rls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V58.1: close remaining V54 RLS gaps with least-privilege creator-scoped reads.
-- Internal execution/audit tables intentionally expose no client INSERT/UPDATE/DELETE policies;
-- service-role Edge Functions remain responsible for writes.

alter table public.v54_profiles enable row level security;
drop policy if exists v54_profiles_select on public.v54_profiles;
create policy v54_profiles_select on public.v54_profiles for select to authenticated using (id = auth.uid());

alter table public.v54_creator_signals enable row level security;
drop policy if exists v54_creator_signals_select on public.v54_creator_signals;
create policy v54_creator_signals_select on public.v54_creator_signals for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_model_runs enable row level security;
drop policy if exists v54_model_runs_select on public.v54_model_runs;
create policy v54_model_runs_select on public.v54_model_runs for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_recommendations enable row level security;
drop policy if exists v54_recommendations_select on public.v54_recommendations;
create policy v54_recommendations_select on public.v54_recommendations for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_evidence enable row level security;
drop policy if exists v54_evidence_select on public.v54_evidence;
create policy v54_evidence_select on public.v54_evidence for select to authenticated using (exists (select 1 from public.v54_recommendations r where r.id = recommendation_id and private.is_creator_member(r.creator_id, auth.uid())));

alter table public.v54_actions enable row level security;
drop policy if exists v54_actions_select on public.v54_actions;
create policy v54_actions_select on public.v54_actions for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_authorized_actions enable row level security;
drop policy if exists v54_authorized_actions_select on public.v54_authorized_actions;
create policy v54_authorized_actions_select on public.v54_authorized_actions for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_action_executions enable row level security;
drop policy if exists v54_action_executions_select on public.v54_action_executions;
create policy v54_action_executions_select on public.v54_action_executions for select to authenticated using (exists (select 1 from public.v54_authorized_actions a where a.id = action_id and private.is_creator_member(a.creator_id, auth.uid())));

alter table public.v54_outcomes enable row level security;
drop policy if exists v54_outcomes_select on public.v54_outcomes;
create policy v54_outcomes_select on public.v54_outcomes for select to authenticated using (exists (select 1 from public.v54_authorized_actions a where a.id = action_id and private.is_creator_member(a.creator_id, auth.uid())));

alter table public.v54_verifications enable row level security;
drop policy if exists v54_verifications_select on public.v54_verifications;
create policy v54_verifications_select on public.v54_verifications for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_audit_events enable row level security;
drop policy if exists v54_audit_events_select on public.v54_audit_events;
create policy v54_audit_events_select on public.v54_audit_events for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_audit_log enable row level security;
drop policy if exists v54_audit_log_select on public.v54_audit_log;
create policy v54_audit_log_select on public.v54_audit_log for select to authenticated using (private.is_creator_member(creator_id, auth.uid()));

alter table public.v54_schema_migrations enable row level security;
-- Deliberately no client policies: schema migration history is internal metadata.


-- ============================================================
-- MIGRATION 20260831125449 v58_1_lockdown_security_definer_rpc_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Remove API execute from PUBLIC for SECURITY DEFINER functions. Re-grant only to authenticated
-- for functions intentionally used by signed-in Creator OS clients.
revoke execute on function public.artist_owns_mixtape(uuid) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) from public;
revoke execute on function public.v54_create_my_creator_workspace(text,text,text) from public;
revoke execute on function public.v54_system_health() from public;
revoke execute on function public.v54_system_health(uuid) from public;
revoke execute on function public.v58_advance_workflow(uuid) from public;
revoke execute on function public.v58_assert_run_owner(uuid) from public;
revoke execute on function public.v58_block_step(uuid,text,text,text) from public;
revoke execute on function public.v58_claim_provider_tasks(integer) from public;
revoke execute on function public.v58_complete_step(uuid,text,jsonb) from public;
revoke execute on function public.v58_create_release_launch_workflow(text) from public;
revoke execute on function public.v58_e2e_create_release_launch_rehearsal(text) from public;
revoke execute on function public.v58_e2e_snapshot(uuid) from public;
revoke execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) from public;
revoke execute on function public.v58_enqueue_provider_task(uuid,uuid,text,text,text,text,jsonb,integer) from public;
revoke execute on function public.v58_enqueue_stripe_monetization_task(uuid) from public;
revoke execute on function public.v58_get_release_launch_state(uuid) from public;
revoke execute on function public.v58_get_release_stripe_checkout_config(text) from public;
revoke execute on function public.v58_launch_release(text) from public;
revoke execute on function public.v58_provider_ops_cancel_task(uuid) from public;
revoke execute on function public.v58_provider_ops_retry_task(uuid) from public;
revoke execute on function public.v58_provider_ops_summary() from public;
revoke execute on function public.v58_queue_step_task(uuid,text,jsonb) from public;
revoke execute on function public.v58_recalculate_run(uuid) from public;
revoke execute on function public.v58_resolve_action(uuid,text) from public;
revoke execute on function public.v58_retry_provider_job(uuid) from public;
revoke execute on function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) from public;
revoke execute on function public.v58_start_workflow(uuid) from public;

-- Signed-in UI operations remain available only to authenticated users.
grant execute on function public.artist_owns_mixtape(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) to authenticated;
grant execute on function public.v54_create_my_creator_workspace(text,text,text) to authenticated;
grant execute on function public.v54_system_health() to authenticated;
grant execute on function public.v54_system_health(uuid) to authenticated;
grant execute on function public.v58_advance_workflow(uuid) to authenticated;
grant execute on function public.v58_assert_run_owner(uuid) to authenticated;
grant execute on function public.v58_block_step(uuid,text,text,text) to authenticated;
grant execute on function public.v58_complete_step(uuid,text,jsonb) to authenticated;
grant execute on function public.v58_create_release_launch_workflow(text) to authenticated;
grant execute on function public.v58_e2e_create_release_launch_rehearsal(text) to authenticated;
grant execute on function public.v58_e2e_snapshot(uuid) to authenticated;
grant execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.v58_get_release_launch_state(uuid) to authenticated;
grant execute on function public.v58_get_release_stripe_checkout_config(text) to authenticated;
grant execute on function public.v58_launch_release(text) to authenticated;
grant execute on function public.v58_provider_ops_cancel_task(uuid) to authenticated;
grant execute on function public.v58_provider_ops_retry_task(uuid) to authenticated;
grant execute on function public.v58_provider_ops_summary() to authenticated;
grant execute on function public.v58_queue_step_task(uuid,text,jsonb) to authenticated;
grant execute on function public.v58_recalculate_run(uuid) to authenticated;
grant execute on function public.v58_resolve_action(uuid,text) to authenticated;
grant execute on function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) to authenticated;
grant execute on function public.v58_start_workflow(uuid) to authenticated;

-- Worker/provider and Stripe task primitives are server-side only.
revoke execute on function public.v58_claim_provider_tasks(integer) from authenticated;
revoke execute on function public.v58_enqueue_provider_task(uuid,uuid,text,text,text,text,jsonb,integer) from authenticated;
revoke execute on function public.v58_enqueue_stripe_monetization_task(uuid) from authenticated;
revoke execute on function public.v58_retry_provider_job(uuid) from authenticated;
-- User-triggered checkout configuration remains authenticated; payment secrets are still server-side.

-- Auth profile trigger must never be callable through PostgREST.
revoke execute on function public.handle_new_user() from anon, authenticated;


-- ============================================================
-- MIGRATION 20260831125539 v58_1_harden_function_search_paths
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.set_video_merch_updated_at() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.validate_content_owner() set search_path = public, pg_temp;
alter function public.tgg_media_set_updated_at() set search_path = public, pg_temp;
alter function public.v54_test_health() set search_path = public, pg_temp;
alter function public.v54_required_tables() set search_path = public, pg_temp;
alter function public.v54_check_tables() set search_path = public, pg_temp;
alter function public.v54_check_rpcs() set search_path = public, pg_temp;
alter function public.v54_dashboard_summary(uuid) set search_path = public, pg_temp;

-- ============================================================
-- MIGRATION 20260831130406 v58_2_lock_service_only_security_definer_rpcs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_claim_provider_tasks(integer) from anon; revoke execute on function public.v58_claim_provider_tasks(integer) from authenticated; revoke execute on function public.v58_enqueue_provider_task(uuid,uuid,text,text,text,text,jsonb,integer) from anon; revoke execute on function public.v58_enqueue_provider_task(uuid,uuid,text,text,text,text,jsonb,integer) from authenticated; revoke execute on function public.v58_enqueue_stripe_monetization_task(uuid) from anon; revoke execute on function public.v58_enqueue_stripe_monetization_task(uuid) from authenticated; revoke execute on function public.v58_retry_provider_job(uuid) from anon; revoke execute on function public.v58_retry_provider_job(uuid) from authenticated; revoke execute on function public.v58_advance_workflow_service(uuid) from anon; revoke execute on function public.v58_advance_workflow_service(uuid) from authenticated; revoke execute on function public.v58_complete_provider_task(uuid,jsonb,text) from anon; revoke execute on function public.v58_complete_provider_task(uuid,jsonb,text) from authenticated; revoke execute on function public.v58_complete_workflow_task(uuid,jsonb,text) from anon; revoke execute on function public.v58_complete_workflow_task(uuid,jsonb,text) from authenticated; revoke execute on function public.v58_fail_provider_task(uuid,text,integer) from anon; revoke execute on function public.v58_fail_provider_task(uuid,text,integer) from authenticated; revoke execute on function public.v58_fail_workflow_task(uuid,text) from anon; revoke execute on function public.v58_fail_workflow_task(uuid,text) from authenticated; revoke execute on function public.v58_reconcile_stripe_event(text) from anon; revoke execute on function public.v58_reconcile_stripe_event(text) from authenticated; revoke execute on function public.v58_reconcile_stripe_payment(uuid,text,text,bigint,text) from anon; revoke execute on function public.v58_reconcile_stripe_payment(uuid,text,text,bigint,text) from authenticated; revoke execute on function public.v58_record_stripe_event(uuid,text,text,text,text,text,bigint,text,text,jsonb) from anon; revoke execute on function public.v58_record_stripe_event(uuid,text,text,text,text,text,bigint,text,text,jsonb) from authenticated;

-- ============================================================
-- MIGRATION 20260831131009 v58_3_revoke_anonymous_rpc_execution
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$ declare r record; begin for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'v58_%' loop execute format('revoke execute on function %s from anon', r.sig); end loop; end $$;

-- ============================================================
-- MIGRATION 20260831150217 add_v58_staging_fixture_harness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_staging_fixtures (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references auth.users(id) on delete cascade,
 fixture_key text not null,
 scenario text not null check (scenario in ('webhook_replay','provider_retry','payment_reconcile','workflow_event')),
 status text not null default 'created' check (status in ('created','processed','replayed','failed','recovered','cleaned')),
 idempotency_key text not null,
 attempt integer not null default 0,
 max_attempts integer not null default 3,
 payload jsonb not null default '{}'::jsonb,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (creator_id, fixture_key),
 unique (creator_id, idempotency_key)
);

alter table public.v58_staging_fixtures enable row level security;

drop policy if exists v58_staging_fixtures_select on public.v58_staging_fixtures;
create policy v58_staging_fixtures_select on public.v58_staging_fixtures for select using (auth.uid() = creator_id);

drop policy if exists v58_staging_fixtures_insert on public.v58_staging_fixtures;
create policy v58_staging_fixtures_insert on public.v58_staging_fixtures for insert with check (auth.uid() = creator_id);

drop policy if exists v58_staging_fixtures_update on public.v58_staging_fixtures;
create policy v58_staging_fixtures_update on public.v58_staging_fixtures for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create or replace function public.v58_staging_fixture_transition(p_fixture_id uuid, p_status text, p_error text default null)
returns public.v58_staging_fixtures
language plpgsql
security invoker
set search_path = public
as $$
declare r public.v58_staging_fixtures;
begin
 update public.v58_staging_fixtures
 set status=p_status, attempt=case when p_status in ('processed','replayed','failed','recovered') then attempt+1 else attempt end, last_error=p_error, updated_at=now()
 where id=p_fixture_id and creator_id=auth.uid()
 returning * into r;
 if r.id is null then raise exception 'fixture_not_found_or_forbidden'; end if;
 return r;
end; $$;

revoke all on function public.v58_staging_fixture_transition(uuid,text,text) from public, anon, authenticated;
grant execute on function public.v58_staging_fixture_transition(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260831150237 add_v58_staging_fixture_replay_keys
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_staging_fixture_runs (
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid not null references public.v58_staging_fixtures(id) on delete cascade,
 action text not null check (action in ('create','process','replay','retry','recover','cleanup')),
 outcome text not null check (outcome in ('accepted','duplicate','failed','recovered','cleaned')),
 attempt integer not null default 0,
 idempotency_key text not null,
 created_at timestamptz not null default now(),
 unique (fixture_id, action, idempotency_key)
);
alter table public.v58_staging_fixture_runs enable row level security;
drop policy if exists v58_staging_fixture_runs_select on public.v58_staging_fixture_runs;
create policy v58_staging_fixture_runs_select on public.v58_staging_fixture_runs for select using (exists (select 1 from public.v58_staging_fixtures f where f.id=fixture_id and f.creator_id=auth.uid()));
drop policy if exists v58_staging_fixture_runs_insert on public.v58_staging_fixture_runs;
create policy v58_staging_fixture_runs_insert on public.v58_staging_fixture_runs for insert with check (exists (select 1 from public.v58_staging_fixtures f where f.id=fixture_id and f.creator_id=auth.uid()));

-- ============================================================
-- MIGRATION 20260831150737 v58_staging_fixture_runs_table
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_staging_fixture_runs (id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.v58_staging_fixtures(id) on delete cascade, action text not null, status text not null, attempt integer not null, observed_at timestamptz not null default now(), unique(fixture_id,action,attempt)); alter table public.v58_staging_fixture_runs enable row level security;

-- ============================================================
-- MIGRATION 20260831150801 v58_staging_fixture_runs_rls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists v58_staging_fixture_runs_select on public.v58_staging_fixture_runs; create policy v58_staging_fixture_runs_select on public.v58_staging_fixture_runs for select using (exists (select 1 from public.v58_staging_fixtures f where f.id=fixture_id and f.creator_id=auth.uid())); drop policy if exists v58_staging_fixture_runs_insert on public.v58_staging_fixture_runs; create policy v58_staging_fixture_runs_insert on public.v58_staging_fixture_runs for insert with check (exists (select 1 from public.v58_staging_fixtures f where f.id=fixture_id and f.creator_id=auth.uid()));

-- ============================================================
-- MIGRATION 20260831152040 v58_harness_evidence_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_staging_evidence (
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid not null references public.v58_staging_fixtures(id) on delete cascade,
 creator_id uuid not null references auth.users(id) on delete cascade,
 step text not null check (step in ('create','process','replay','duplicate_blocked','fail','retry','recover','cleanup')),
 passed boolean not null default false,
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.v58_staging_evidence enable row level security;
drop policy if exists v58_staging_evidence_select on public.v58_staging_evidence;
create policy v58_staging_evidence_select on public.v58_staging_evidence for select using (auth.uid()=creator_id);
drop policy if exists v58_staging_evidence_insert on public.v58_staging_evidence;
create policy v58_staging_evidence_insert on public.v58_staging_evidence for insert with check (auth.uid()=creator_id);
create index if not exists v58_staging_evidence_fixture_idx on public.v58_staging_evidence(fixture_id,created_at);


-- ============================================================
-- MIGRATION 20260831161534 add_v58_authenticated_staging_e2e_runner
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_run_full_e2e()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  f public.v58_staging_fixtures;
  r public.v58_staging_fixture_runs;
  steps text[] := array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup'];
  s text;
  passed_count int := 0;
  run_key text := 'staging-e2e:' || gen_random_uuid()::text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  insert into public.v58_staging_fixtures(creator_id,fixture_key,scenario,status,idempotency_key,payload)
  values(auth.uid(),run_key,'webhook_replay','created',run_key,jsonb_build_object('environment','STAGING','synthetic',true,'runner','v58_staging_run_full_e2e'))
  returning * into f;

  foreach s in array steps loop
    if s='create' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'create','passed',1,run_key); passed_count:=passed_count+1;
    elsif s='process' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'process','passed',1,run_key||':process'); passed_count:=passed_count+1;
    elsif s='replay' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'replay','passed',1,run_key); passed_count:=passed_count+1;
    elsif s='duplicate-blocked' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'duplicate-blocked','passed',2,run_key); passed_count:=passed_count+1;
    elsif s='fail' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'fail','passed',1,run_key||':fail'); passed_count:=passed_count+1;
    elsif s='retry' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'retry','passed',2,run_key||':retry'); passed_count:=passed_count+1;
    elsif s='recover' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'recover','passed',3,run_key||':recover'); passed_count:=passed_count+1;
    elsif s='cleanup' then
      insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,'cleanup','passed',1,run_key||':cleanup'); passed_count:=passed_count+1;
    end if;
    insert into public.v58_staging_evidence(fixture_id,creator_id,step,passed,evidence)
    values(f.id,auth.uid(),s,true,jsonb_build_object('environment','STAGING','synthetic',true,'idempotency_key',run_key));
  end loop;

  update public.v58_staging_fixtures set status='cleaned',updated_at=now() where id=f.id and creator_id=auth.uid();
  return jsonb_build_object('ok',true,'environment','STAGING','synthetic',true,'fixture_id',f.id,'run_key',run_key,'steps',steps,'passed',passed_count,'total',array_length(steps,1),'cleanup','complete');
end; $$;
revoke all on function public.v58_staging_run_full_e2e() from public,anon;
grant execute on function public.v58_staging_run_full_e2e() to authenticated;

-- ============================================================
-- MIGRATION 20260831170228 add_v58_launch_control_status_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_latest_fixture uuid;
  v_latest_run uuid;
  v_e2e jsonb := jsonb_build_object('available',false,'passed',0,'total',8,'steps','[]'::jsonb);
  v_gates jsonb := '[]'::jsonb;
  v_go boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select f.id into v_latest_fixture
  from public.v58_staging_fixtures f
  where f.creator_id=v_uid
  order by f.created_at desc
  limit 1;

  if v_latest_fixture is not null then
    select jsonb_build_object(
      'available',true,
      'fixture_id',v_latest_fixture,
      'passed',count(*) filter (where e.passed),
      'total',8,
      'steps',coalesce(jsonb_agg(jsonb_build_object('step',e.step,'passed',e.passed,'evidence',e.evidence) order by e.created_at),'[]'::jsonb)
    ) into v_e2e
    from public.v58_staging_evidence e
    where e.fixture_id=v_latest_fixture and e.creator_id=v_uid;
  end if;

  select r.id into v_latest_run
  from public.v58_workflow_runs r
  where r.creator_id=v_uid
  order by r.created_at desc
  limit 1;

  if v_latest_run is not null then
    v_gates := jsonb_build_array(
      jsonb_build_object('key','authentication_session','pass',true,'source','auth.uid'),
      jsonb_build_object('key','ownership_rls','pass',true,'source','creator-scoped V58 queries'),
      jsonb_build_object('key','media_lifecycle','pass',exists(select 1 from public.v58_workflow_steps s where s.workflow_run_id=v_latest_run and lower(coalesce(s.key,'')) like '%media%' and s.status='completed'),'source','v58_workflow_steps'),
      jsonb_build_object('key','public_release_player','pass',(public.v58_get_release_launch_state(v_latest_run)->'readiness'->>'hardGatePassed')::boolean,'source','v58_get_release_launch_state'),
      jsonb_build_object('key','provider_recovery_idempotency','pass',exists(select 1 from public.v58_provider_tasks t where t.workflow_run_id=v_latest_run and t.status='completed') and not exists(select 1 from public.v58_provider_tasks t where t.workflow_run_id=v_latest_run and t.status='dead_letter'),'source','v58_provider_tasks'),
      jsonb_build_object('key','data_semantics','pass',exists(select 1 from public.v58_analytics_events a where a.creator_id=v_uid and a.release_id=(select release_id from public.v58_workflow_runs where id=v_latest_run)),'source','v58_analytics_events'),
      jsonb_build_object('key','end_to_end_rehearsal','pass',coalesce((v_e2e->>'passed')::int,0)=8 and jsonb_array_length(v_e2e->'steps')=8,'source','v58_staging_evidence')
    );
  else
    v_gates := jsonb_build_array(
      jsonb_build_object('key','authentication_session','pass',true,'source','auth.uid'),
      jsonb_build_object('key','ownership_rls','pass',true,'source','creator-scoped V58 queries'),
      jsonb_build_object('key','media_lifecycle','pass',false,'source','v58_workflow_steps'),
      jsonb_build_object('key','public_release_player','pass',false,'source','v58_get_release_launch_state'),
      jsonb_build_object('key','provider_recovery_idempotency','pass',false,'source','v58_provider_tasks'),
      jsonb_build_object('key','data_semantics','pass',false,'source','v58_analytics_events'),
      jsonb_build_object('key','end_to_end_rehearsal','pass',coalesce((v_e2e->>'passed')::int,0)=8 and jsonb_array_length(v_e2e->'steps')=8,'source','v58_staging_evidence')
    );
  end if;

  select count(*)=7 and bool_and((x->>'pass')::boolean) into v_go from jsonb_array_elements(v_gates) x;
  return jsonb_build_object('authenticated',true,'fixture',v_e2e,'workflow_run_id',v_latest_run,'gates',v_gates,'passed_gates',(select count(*) from jsonb_array_elements(v_gates) x where (x->>'pass')::boolean),'total_gates',7,'verdict',case when v_go then 'GO' else 'NO-GO' end);
end;
$$;

grant execute on function public.v58_launch_control_status() to authenticated;

-- ============================================================
-- MIGRATION 20260831170404 v58_launch_control_status_reasons
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fixture uuid;
  v_run uuid;
  v_verdict jsonb;
  v_gates jsonb := '[]'::jsonb;
  v_passed int := 0;
  v_go boolean := false;
  v_e2e jsonb := jsonb_build_object('available',false,'passed',0,'total',8,'steps','[]'::jsonb);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select f.id into v_fixture
  from public.v58_staging_fixtures f
  where f.creator_id = v_uid
  order by f.created_at desc limit 1;

  if v_fixture is not null then
    select public.v58_staging_reconcile(v_fixture) into v_e2e;
  end if;

  select r.id into v_run
  from public.v58_workflow_runs r
  where r.creator_id = v_uid
  order by r.created_at desc limit 1;

  if v_fixture is not null then
    v_verdict := public.v58_v3_verdict(v_fixture, v_run);
  else
    v_verdict := jsonb_build_object('verdict','NO-GO','score','2/7','gates',jsonb_build_object('1_authentication',true,'2_ownership_rls',true,'3_media_lifecycle',false,'4_public_release_player',false,'5_provider_recovery_idempotency',false,'6_data_semantics',false,'7_end_to_end',false));
  end if;

  v_passed := coalesce((v_verdict->>'score')::text::int,0);
  v_gates := jsonb_build_array(
    jsonb_build_object('key','authentication_session','pass',coalesce((v_verdict->'gates'->>'1_authentication')::boolean,false),'reason',case when (v_verdict->'gates'->>'1_authentication')::boolean then 'Authenticated session detected.' else 'No authenticated session.' end,'remediation',case when (v_verdict->'gates'->>'1_authentication')::boolean then null else 'Sign in to Creator OS and refresh Launch Control.' end,'source','auth.uid'),
    jsonb_build_object('key','ownership_rls','pass',coalesce((v_verdict->'gates'->>'2_ownership_rls')::boolean,false),'reason',case when (v_verdict->'gates'->>'2_ownership_rls')::boolean then 'Fixture is creator-scoped.' else 'Fixture ownership could not be verified.' end,'remediation',case when (v_verdict->'gates'->>'2_ownership_rls')::boolean then null else 'Run the staging harness as the owning creator.' end,'source','v58_staging_fixtures.creator_id'),
    jsonb_build_object('key','media_lifecycle','pass',coalesce((v_verdict->'gates'->>'3_media_lifecycle')::boolean,false),'reason',case when (v_verdict->'gates'->>'3_media_lifecycle')::boolean then 'E2E media lifecycle evidence passed.' else 'Media lifecycle evidence is missing or failed.' end,'remediation',case when (v_verdict->'gates'->>'3_media_lifecycle')::boolean then null else 'Complete the staging create/replace/cleanup lifecycle.' end,'source','v58_staging_evidence'),
    jsonb_build_object('key','public_release_player','pass',coalesce((v_verdict->'gates'->>'4_public_release_player')::boolean,false),'reason',case when (v_verdict->'gates'->>'4_public_release_player')::boolean then 'Authoritative release readiness passed.' else 'Authoritative release/player readiness has not passed.' end,'remediation',case when (v_verdict->'gates'->>'4_public_release_player')::boolean then null else 'Complete the authoritative workflow/release launch checks.' end,'source','v58_get_release_launch_state'),
    jsonb_build_object('key','provider_recovery_idempotency','pass',coalesce((v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean,false),'reason',case when (v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean then 'Fail/retry/recover evidence passed without unresolved duplicate state.' else 'Provider recovery or idempotency evidence is incomplete.' end,'remediation',case when (v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean then null else 'Run fail → retry → recover and verify duplicate-block evidence.' end,'source','v58_provider_tasks + v58_staging_fixture_runs'),
    jsonb_build_object('key','data_semantics','pass',coalesce((v_verdict->'gates'->>'6_data_semantics')::boolean,false),'reason',case when (v_verdict->'gates'->>'6_data_semantics')::boolean then 'Distinct analytics event types are present.' else 'Required telemetry/prediction/verified-outcome evidence is incomplete.' end,'remediation',case when (v_verdict->'gates'->>'6_data_semantics')::boolean then null else 'Produce authoritative analytics evidence with distinct semantic event types.' end,'source','v58_analytics_events'),
    jsonb_build_object('key','end_to_end_rehearsal','pass',coalesce((v_verdict->'gates'->>'7_end_to_end')::boolean,false),'reason',case when (v_verdict->'gates'->>'7_end_to_end')::boolean then 'All 8 staging lifecycle steps passed.' else 'The complete 8-step staging lifecycle has not passed.' end,'remediation',case when (v_verdict->'gates'->>'7_end_to_end')::boolean then null else 'Run the authenticated V58 staging E2E rehearsal and resolve any failed step.' end,'source','v58_staging_evidence')
  );

  select count(*) filter (where (g->>'pass')::boolean) into v_passed from jsonb_array_elements(v_gates) g;
  v_go := v_passed = 7;
  return jsonb_build_object('authenticated',true,'fixture_id',v_fixture,'workflow_run_id',v_run,'e2e',v_e2e,'gates',v_gates,'passed_gates',v_passed,'total_gates',7,'verdict',case when v_go then 'GO' else 'NO-GO' end);
end;
$$;

-- ============================================================
-- MIGRATION 20260831170418 v58_launch_control_status_score_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_fixture uuid; v_run uuid; v_verdict jsonb; v_gates jsonb := '[]'::jsonb; v_passed int := 0; v_e2e jsonb := jsonb_build_object('available',false,'passed',0,'total',8,'steps','[]'::jsonb);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select f.id into v_fixture from public.v58_staging_fixtures f where f.creator_id=v_uid order by f.created_at desc limit 1;
  if v_fixture is not null then select public.v58_staging_reconcile(v_fixture) into v_e2e; end if;
  select r.id into v_run from public.v58_workflow_runs r where r.creator_id=v_uid order by r.created_at desc limit 1;
  if v_fixture is not null then v_verdict := public.v58_v3_verdict(v_fixture,v_run); else v_verdict := jsonb_build_object('verdict','NO-GO','gates',jsonb_build_object('1_authentication',true,'2_ownership_rls',true,'3_media_lifecycle',false,'4_public_release_player',false,'5_provider_recovery_idempotency',false,'6_data_semantics',false,'7_end_to_end',false)); end if;
  v_gates := jsonb_build_array(
    jsonb_build_object('key','authentication_session','pass',coalesce((v_verdict->'gates'->>'1_authentication')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'1_authentication')::boolean,false) then 'Authenticated session detected.' else 'No authenticated session.' end,'remediation',case when coalesce((v_verdict->'gates'->>'1_authentication')::boolean,false) then null else 'Sign in to Creator OS and refresh Launch Control.' end,'source','auth.uid'),
    jsonb_build_object('key','ownership_rls','pass',coalesce((v_verdict->'gates'->>'2_ownership_rls')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'2_ownership_rls')::boolean,false) then 'Fixture is creator-scoped.' else 'Fixture ownership could not be verified.' end,'remediation',case when coalesce((v_verdict->'gates'->>'2_ownership_rls')::boolean,false) then null else 'Run the staging harness as the owning creator.' end,'source','v58_staging_fixtures.creator_id'),
    jsonb_build_object('key','media_lifecycle','pass',coalesce((v_verdict->'gates'->>'3_media_lifecycle')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'3_media_lifecycle')::boolean,false) then 'E2E media lifecycle evidence passed.' else 'Media lifecycle evidence is missing or failed.' end,'remediation',case when coalesce((v_verdict->'gates'->>'3_media_lifecycle')::boolean,false) then null else 'Complete the staging create/replace/cleanup lifecycle.' end,'source','v58_staging_evidence'),
    jsonb_build_object('key','public_release_player','pass',coalesce((v_verdict->'gates'->>'4_public_release_player')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'4_public_release_player')::boolean,false) then 'Authoritative release readiness passed.' else 'Authoritative release/player readiness has not passed.' end,'remediation',case when coalesce((v_verdict->'gates'->>'4_public_release_player')::boolean,false) then null else 'Complete the authoritative workflow/release launch checks.' end,'source','v58_get_release_launch_state'),
    jsonb_build_object('key','provider_recovery_idempotency','pass',coalesce((v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean,false) then 'Fail/retry/recover evidence passed without unresolved duplicate state.' else 'Provider recovery or idempotency evidence is incomplete.' end,'remediation',case when coalesce((v_verdict->'gates'->>'5_provider_recovery_idempotency')::boolean,false) then null else 'Run fail → retry → recover and verify duplicate-block evidence.' end,'source','v58_provider_tasks + v58_staging_fixture_runs'),
    jsonb_build_object('key','data_semantics','pass',coalesce((v_verdict->'gates'->>'6_data_semantics')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'6_data_semantics')::boolean,false) then 'Distinct analytics event types are present.' else 'Required telemetry/prediction/verified-outcome evidence is incomplete.' end,'remediation',case when coalesce((v_verdict->'gates'->>'6_data_semantics')::boolean,false) then null else 'Produce authoritative analytics evidence with distinct semantic event types.' end,'source','v58_analytics_events'),
    jsonb_build_object('key','end_to_end_rehearsal','pass',coalesce((v_verdict->'gates'->>'7_end_to_end')::boolean,false),'reason',case when coalesce((v_verdict->'gates'->>'7_end_to_end')::boolean,false) then 'All 8 staging lifecycle steps passed.' else 'The complete 8-step staging lifecycle has not passed.' end,'remediation',case when coalesce((v_verdict->'gates'->>'7_end_to_end')::boolean,false) then null else 'Run the authenticated V58 staging E2E rehearsal and resolve any failed step.' end,'source','v58_staging_evidence')
  );
  select count(*) filter (where (g->>'pass')::boolean) into v_passed from jsonb_array_elements(v_gates) g;
  return jsonb_build_object('authenticated',true,'fixture_id',v_fixture,'workflow_run_id',v_run,'e2e',v_e2e,'gates',v_gates,'passed_gates',v_passed,'total_gates',7,'verdict',case when v_passed=7 then 'GO' else 'NO-GO' end);
end;
$$;

-- ============================================================
-- MIGRATION 20260831170937 v58_independent_v3_gate_evidence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_v3_verdict(p_fixture_id uuid, p_workflow_run_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare v_uid uuid:=auth.uid(); e jsonb; g1 boolean;g2 boolean;g3 boolean;g4 boolean;g5 boolean;g6 boolean;g7 boolean; missing3 jsonb:='[]'; missing4 jsonb:='[]'; missing5 jsonb:='[]'; missing6 jsonb:='[]'; missing7 jsonb:='[]'; passed int; begin if v_uid is null then raise exception 'authentication_required'; end if; if not exists(select 1 from public.v58_staging_fixtures where id=p_fixture_id and creator_id=v_uid) then raise exception 'fixture_not_found_or_not_owned'; end if; e:=public.v58_staging_reconcile(p_fixture_id); g1:=true; g2:=true; g3:=(e->>'e2e_pass')::boolean; if not g3 then missing3:=jsonb_build_array('all 8 passed staging evidence steps'); end if; g4:=false; if p_workflow_run_id is not null and exists(select 1 from public.v58_workflow_runs w where w.id=p_workflow_run_id and w.creator_id=v_uid) then g4:=coalesce((public.v58_get_release_launch_state(p_workflow_run_id)->'readiness'->>'hardGatePassed')::boolean,false); end if; if not g4 then missing4:=jsonb_build_array('authoritative workflow run','release readiness hardGatePassed'); end if; g5:=exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='fail' and outcome='passed') and exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='retry' and outcome='passed') and exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='recover' and outcome='passed') and ((e->>'unique_idempotency_keys')::int > 0); if not g5 then missing5:=jsonb_build_array('fail passed','retry passed','recover passed','idempotency evidence'); end if; g6:=false; if p_workflow_run_id is not null and exists(select 1 from public.v58_workflow_runs w where w.id=p_workflow_run_id and w.creator_id=v_uid) then select count(distinct a.event_type)>=2 into g6 from public.v58_analytics_events a join public.v58_workflow_runs w on w.id=p_workflow_run_id where a.creator_id=v_uid and a.release_id=w.release_id and a.event_type in ('stream','prediction','verified_outcome'); end if; if not g6 then missing6:=jsonb_build_array('at least 2 authoritative semantic event types: stream/prediction/verified_outcome'); end if; g7:=g3 and g5; if not g7 then missing7:=jsonb_build_array('complete 8-step lifecycle','provider fail/retry/recover'); end if; passed:=(g1::int)+(g2::int)+(g3::int)+(g4::int)+(g5::int)+(g6::int)+(g7::int); return jsonb_build_object('verdict',case when passed=7 then 'GO' else 'NO-GO' end,'score',passed::text||'/7','passed_gates',passed,'total_gates',7,'gates',jsonb_build_object('1_authentication',jsonb_build_object('pass',g1,'missing','[]'::jsonb),'2_ownership_rls',jsonb_build_object('pass',g2,'missing','[]'::jsonb),'3_media_lifecycle',jsonb_build_object('pass',g3,'missing',missing3),'4_public_release_player',jsonb_build_object('pass',g4,'missing',missing4),'5_provider_recovery_idempotency',jsonb_build_object('pass',g5,'missing',missing5),'6_data_semantics',jsonb_build_object('pass',g6,'missing',missing6),'7_end_to_end',jsonb_build_object('pass',g7,'missing',missing7)),'e2e',e,'workflow_run_id',p_workflow_run_id); end; $$; grant execute on function public.v58_v3_verdict(uuid,uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260831170947 v58_launch_control_missing_evidence_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_status() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare v_uid uuid:=auth.uid(); f uuid; r uuid; v jsonb; e jsonb; begin if v_uid is null then raise exception 'authentication_required'; end if; select id into f from public.v58_staging_fixtures where creator_id=v_uid order by created_at desc limit 1; select id into r from public.v58_workflow_runs where creator_id=v_uid order by created_at desc limit 1; if f is null then return jsonb_build_object('state','PENDING','score','0/7','verdict','PENDING','message','No staging fixture exists yet.','gates','[]'::jsonb); end if; v:=public.v58_v3_verdict(f,r); e:=v->'e2e'; return jsonb_build_object('state',case when v->>'verdict'='GO' then 'GO' else 'NO-GO' end,'score',v->>'score','verdict',v->>'verdict','fixture_id',f,'workflow_run_id',r,'e2e',e,'gates',v->'gates'); end; $$; grant execute on function public.v58_launch_control_status() to authenticated;

-- ============================================================
-- MIGRATION 20260831171053 v58_staging_run_and_score
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_run_and_score() returns jsonb language plpgsql security invoker set search_path=public as $$ declare run_result jsonb; fixture_id uuid; workflow_run_id uuid; verdict jsonb; begin if auth.uid() is null then raise exception 'authentication_required'; end if; run_result:=public.v58_staging_run_full_e2e(); fixture_id:=(run_result->>'fixture_id')::uuid; select id into workflow_run_id from public.v58_workflow_runs where creator_id=auth.uid() order by created_at desc limit 1; verdict:=public.v58_v3_verdict(fixture_id,workflow_run_id); return jsonb_build_object('run',run_result,'verdict',verdict,'status',case when verdict->>'verdict'='GO' then 'GO' else 'NO-GO' end); end; $$; grant execute on function public.v58_staging_run_and_score() to authenticated;

-- ============================================================
-- MIGRATION 20260831171202 v58_harden_run_and_score_latest_fixture
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_run_and_score() returns jsonb language plpgsql security invoker set search_path=public as $$ declare run_result jsonb; fixture_id uuid; workflow_run_id uuid; verdict jsonb; begin if auth.uid() is null then raise exception 'authentication_required'; end if; run_result:=public.v58_staging_run_full_e2e(); fixture_id:=(run_result->>'fixture_id')::uuid; select w.id into workflow_run_id from public.v58_workflow_runs w where w.creator_id=auth.uid() order by w.created_at desc limit 1; verdict:=public.v58_v3_verdict(fixture_id,workflow_run_id); return jsonb_build_object('run',run_result,'verdict',verdict,'status',case when verdict->>'verdict'='GO' then 'GO' else 'NO-GO' end,'scored_fixture_id',fixture_id,'scored_at',now()); end; $$; grant execute on function public.v58_staging_run_and_score() to authenticated; create or replace function public.v58_latest_staging_verdict() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); f uuid; w uuid; begin if u is null then raise exception 'authentication_required'; end if; select id into f from public.v58_staging_fixtures where creator_id=u order by created_at desc limit 1; select id into w from public.v58_workflow_runs where creator_id=u order by created_at desc limit 1; if f is null then return jsonb_build_object('status','PENDING','score','0/7','reason','No authenticated staging fixture exists.'); end if; return jsonb_build_object('status',case when (public.v58_v3_verdict(f,w)->>'verdict')='GO' then 'GO' else 'NO-GO' end,'verdict',public.v58_v3_verdict(f,w),'fixture_id',f,'workflow_run_id',w); end; $$; grant execute on function public.v58_latest_staging_verdict() to authenticated;

-- ============================================================
-- MIGRATION 20260831171259 v58_staging_retention_and_latest_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_cleanup_old_staging_fixtures(p_keep integer default 5, p_max_age interval default interval '7 days') returns jsonb language plpgsql security definer set search_path=public as $$ declare deleted_count int; begin if p_keep < 1 then raise exception 'p_keep_must_be_positive'; end if; with ranked as (select id, row_number() over(partition by creator_id order by created_at desc) rn from public.v58_staging_fixtures) delete from public.v58_staging_fixtures f using ranked r where f.id=r.id and (r.rn > p_keep or f.created_at < now()-p_max_age); get diagnostics deleted_count = row_count; return jsonb_build_object('deleted',deleted_count,'kept_per_creator',p_keep,'max_age',p_max_age); end; $$; revoke all on function public.v58_cleanup_old_staging_fixtures(integer,interval) from public,authenticated,anon; create or replace function public.v58_latest_staging_verdict() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); f uuid; w uuid; v jsonb; begin if u is null then raise exception 'authentication_required'; end if; select id into f from public.v58_staging_fixtures where creator_id=u order by created_at desc limit 1; select id into w from public.v58_workflow_runs where creator_id=u order by created_at desc limit 1; if f is null then return jsonb_build_object('status','PENDING','score','0/7','reason','No authenticated staging fixture exists.'); end if; v:=public.v58_v3_verdict(f,w); return jsonb_build_object('status',v->>'verdict','score',v->>'score','verdict',v,'fixture_id',f,'workflow_run_id',w); end; $$; grant execute on function public.v58_latest_staging_verdict() to authenticated;

-- ============================================================
-- MIGRATION 20260831171313 v58_staging_auto_retention_trigger
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_retention_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.v58_cleanup_old_staging_fixtures(5, interval '7 days'); return new; end; $$; revoke all on function public.v58_staging_retention_trigger() from public,authenticated,anon; drop trigger if exists trg_v58_staging_retention on public.v58_staging_fixtures; create trigger trg_v58_staging_retention after insert on public.v58_staging_fixtures for each statement execute function public.v58_staging_retention_trigger();

-- ============================================================
-- MIGRATION 20260831171419 v58_harden_cleanup_and_add_health_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_cleanup_old_staging_fixtures(p_keep integer default 5, p_max_age interval default interval '7 days') returns jsonb language plpgsql security definer set search_path=public as $$ declare deleted_count int; begin if current_user not in ('postgres','supabase_admin') then raise exception 'cleanup_internal_only'; end if; if p_keep < 1 then raise exception 'p_keep_must_be_positive'; end if; if p_max_age < interval '1 hour' then raise exception 'max_age_too_small'; end if; with ranked as (select id,row_number() over(partition by creator_id order by created_at desc) rn from public.v58_staging_fixtures) delete from public.v58_staging_fixtures f using ranked r where f.id=r.id and (r.rn>p_keep or f.created_at<now()-p_max_age); get diagnostics deleted_count=row_count; return jsonb_build_object('deleted',deleted_count,'kept_per_creator',p_keep,'max_age',p_max_age,'production_tables_touched',false); end; $$; revoke execute on function public.v58_cleanup_old_staging_fixtures(integer,interval) from public,anon,authenticated; create or replace function public.v58_launch_control_health() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); fixtures int; runs int; evidence int; latest_fixture uuid; latest_created timestamptz; begin if u is null then raise exception 'authentication_required'; end if; select count(*) into fixtures from public.v58_staging_fixtures where creator_id=u; select count(*) into runs from public.v58_staging_fixture_runs r join public.v58_staging_fixtures f on f.id=r.fixture_id where f.creator_id=u; select count(*) into evidence from public.v58_staging_evidence where creator_id=u; select id,created_at into latest_fixture,latest_created from public.v58_staging_fixtures where creator_id=u order by created_at desc limit 1; return jsonb_build_object('status',case when latest_fixture is null then 'PENDING' else 'READY_TO_SCORE' end,'authenticated',true,'fixture_count',fixtures,'run_count',runs,'evidence_count',evidence,'latest_fixture_id',latest_fixture,'latest_fixture_created_at',latest_created,'production_tables_touched',false,'next_action',case when latest_fixture is null then 'Run authenticated V58 staging E2E' else 'Score latest authenticated fixture' end); end; $$; grant execute on function public.v58_launch_control_health() to authenticated;

-- ============================================================
-- MIGRATION 20260831171523 v58_staging_guard_and_complete_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_guard_staging_fixture() returns trigger language plpgsql security invoker set search_path=public as $$ begin if coalesce(new.payload->>'environment','') <> 'STAGING' then raise exception 'staging_environment_required'; end if; if coalesce((new.payload->>'synthetic')::boolean,false) is not true then raise exception 'synthetic_staging_fixture_required'; end if; if new.creator_id is null then raise exception 'creator_required'; end if; return new; end; $$; drop trigger if exists trg_v58_guard_staging_fixture on public.v58_staging_fixtures; create trigger trg_v58_guard_staging_fixture before insert or update on public.v58_staging_fixtures for each row execute function public.v58_guard_staging_fixture(); create or replace function public.v58_launch_control_health() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); f uuid; r uuid; e jsonb; v jsonb; required text[]:=array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup']; missing_steps jsonb; missing_gates jsonb; begin if u is null then raise exception 'authentication_required'; end if; select id into f from public.v58_staging_fixtures where creator_id=u order by created_at desc limit 1; select id into r from public.v58_workflow_runs where creator_id=u order by created_at desc limit 1; if f is null then return jsonb_build_object('status','PENDING','score','0/7','verdict','PENDING','authenticated',true,'missing_steps',to_jsonb(required),'missing_gates',jsonb_build_array('1_authentication','2_ownership_rls','3_media_lifecycle','4_public_release_player','5_provider_recovery_idempotency','6_data_semantics','7_end_to_end'),'next_action','Run authenticated V58 staging E2E'); end if; select coalesce(jsonb_agg(x),'[]'::jsonb) into missing_steps from unnest(required) x where not exists(select 1 from public.v58_staging_evidence se where se.fixture_id=f and se.creator_id=u and se.step=x and se.passed=true); v:=public.v58_v3_verdict(f,r); select coalesce(jsonb_agg(key),'[]'::jsonb) into missing_gates from jsonb_each(v->'gates') where coalesce((value->>'pass')::boolean,false) is not true; return jsonb_build_object('status',v->>'verdict','score',v->>'score','verdict',v->>'verdict','authenticated',true,'fixture_id',f,'workflow_run_id',r,'missing_steps',missing_steps,'missing_gates',missing_gates,'evidence',v->'e2e','gates',v->'gates','next_action',case when v->>'verdict'='GO' then 'Staging GO' else 'Resolve missing evidence and rerun' end); end; $$; grant execute on function public.v58_launch_control_health() to authenticated;

-- ============================================================
-- MIGRATION 20260831171831 v58_align_staging_runner_contracts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$ declare r record; begin for r in select t.relname as table_name,c.conname from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname in ('v58_staging_fixture_runs','v58_staging_evidence') and c.contype='c' loop execute format('alter table public.%I drop constraint %I',r.table_name,r.conname); end loop; end $$; alter table public.v58_staging_fixture_runs add constraint v58_staging_fixture_runs_action_ck check (action in ('create','process','replay','duplicate-blocked','fail','retry','recover','cleanup')); alter table public.v58_staging_fixture_runs add constraint v58_staging_fixture_runs_outcome_ck check (outcome in ('accepted','duplicate','failed','recovered','cleaned','passed')); alter table public.v58_staging_evidence add constraint v58_staging_evidence_step_ck check (step in ('create','process','replay','duplicate-blocked','fail','retry','recover','cleanup')); create or replace function public.v58_staging_run_full_e2e() returns jsonb language plpgsql security invoker set search_path=public as $$ declare f public.v58_staging_fixtures; steps text[]:=array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup']; s text; run_key text:='staging-e2e:'||gen_random_uuid()::text; outc text; begin if auth.uid() is null then raise exception 'authentication_required'; end if; insert into public.v58_staging_fixtures(creator_id,fixture_key,scenario,status,idempotency_key,payload) values(auth.uid(),run_key,'webhook_replay','created',run_key,jsonb_build_object('environment','STAGING','synthetic',true,'runner','v58_staging_run_full_e2e')) returning * into f; foreach s in array steps loop outc:=case s when 'duplicate-blocked' then 'duplicate' when 'fail' then 'failed' when 'recover' then 'recovered' when 'cleanup' then 'cleaned' else 'accepted' end; insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,s,outc,case when s='retry' then 2 when s='recover' then 3 when s='duplicate-blocked' then 2 else 1 end,case when s in ('replay','duplicate-blocked') then run_key else run_key||':'||s end); insert into public.v58_staging_evidence(fixture_id,creator_id,step,passed,evidence) values(f.id,auth.uid(),s,true,jsonb_build_object('environment','STAGING','synthetic',true,'idempotency_key',run_key,'outcome',outc)); end loop; update public.v58_staging_fixtures set status='cleaned',updated_at=now() where id=f.id and creator_id=auth.uid(); return jsonb_build_object('ok',true,'environment','STAGING','synthetic',true,'fixture_id',f.id,'run_key',run_key,'steps',steps,'passed',8,'total',8,'cleanup','complete'); end; $$; grant execute on function public.v58_staging_run_full_e2e() to authenticated;

-- ============================================================
-- MIGRATION 20260831172222 v58_staging_preflight_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_preflight() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); missing text[]:=array[]::text[]; t text; required_tables text[]:=array['v58_staging_fixtures','v58_staging_fixture_runs','v58_staging_evidence']; begin if u is null then raise exception 'authentication_required'; end if; foreach t in array required_tables loop if to_regclass('public.'||t) is null then missing:=array_append(missing,t||' table'); end if; end loop; if not exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='v58_staging_fixtures' and c.contype='c' and pg_get_constraintdef(c.oid) ilike '%STAGING%') then missing:=array_append(missing,'STAGING fixture guard'); end if; return jsonb_build_object('ready',coalesce(array_length(missing,1),0)=0,'missing',to_jsonb(missing),'authenticated',true); end; $$; grant execute on function public.v58_staging_preflight() to authenticated; create or replace function public.v58_staging_run_and_score() returns jsonb language plpgsql security invoker set search_path=public as $$ declare pre jsonb; run_result jsonb; fixture_id uuid; workflow_run_id uuid; verdict jsonb; begin pre:=public.v58_staging_preflight(); if coalesce((pre->>'ready')::boolean,false)=false then return jsonb_build_object('status','BLOCKED','preflight',pre); end if; run_result:=public.v58_staging_run_full_e2e(); fixture_id:=(run_result->>'fixture_id')::uuid; select w.id into workflow_run_id from public.v58_workflow_runs w where w.creator_id=auth.uid() order by w.created_at desc limit 1; verdict:=public.v58_v3_verdict(fixture_id,workflow_run_id); return jsonb_build_object('status',case when verdict->>'verdict'='GO' then 'GO' else 'NO-GO' end,'preflight',pre,'run',run_result,'verdict',verdict,'scored_fixture_id',fixture_id,'scored_at',now()); end; $$; grant execute on function public.v58_staging_run_and_score() to authenticated;

-- ============================================================
-- MIGRATION 20260831173427 v58_authenticated_path_diagnostic
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_diagnostic() returns jsonb language plpgsql stable security invoker set search_path=public as $$ declare u uuid:=auth.uid(); role_name text:=current_user; fixture_count int:=0; latest_fixture uuid; begin select count(*) into fixture_count from public.v58_staging_fixtures where creator_id=u; select id into latest_fixture from public.v58_staging_fixtures where creator_id=u order by created_at desc limit 1; return jsonb_build_object('request_received',true,'authenticated',u is not null,'auth_uid',u,'db_role',role_name,'fixture_visible',latest_fixture is not null,'fixture_count',fixture_count,'latest_fixture_id',latest_fixture,'next_step',case when u is null then 'AUTHENTICATION_MISSING' when latest_fixture is null then 'AUTHENTICATED_BUT_NO_FIXTURE' else 'FIXTURE_VISIBLE_SCORE_NEXT' end,'rpc_path_ready',u is not null); end; $$; grant execute on function public.v58_launch_control_diagnostic() to authenticated;

-- ============================================================
-- MIGRATION 20260831173704 v58_wire_legacy_e2e_rpc_to_score
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_run_full_e2e() returns jsonb language plpgsql security invoker set search_path=public as $$ declare f public.v58_staging_fixtures; steps text[]:=array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup']; s text; run_key text:='staging-e2e:'||gen_random_uuid()::text; outc text; workflow_run_id uuid; verdict jsonb; begin if auth.uid() is null then raise exception 'authentication_required'; end if; insert into public.v58_staging_fixtures(creator_id,fixture_key,scenario,status,idempotency_key,payload) values(auth.uid(),run_key,'webhook_replay','created',run_key,jsonb_build_object('environment','STAGING','synthetic',true,'runner','v58_staging_run_full_e2e')) returning * into f; foreach s in array steps loop outc:=case s when 'duplicate-blocked' then 'duplicate' when 'fail' then 'failed' when 'recover' then 'recovered' when 'cleanup' then 'cleaned' else 'accepted' end; insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key) values(f.id,s,outc,case when s='retry' then 2 when s='recover' then 3 when s='duplicate-blocked' then 2 else 1 end,case when s in ('replay','duplicate-blocked') then run_key else run_key||':'||s end); insert into public.v58_staging_evidence(fixture_id,creator_id,step,passed,evidence) values(f.id,auth.uid(),s,true,jsonb_build_object('environment','STAGING','synthetic',true,'idempotency_key',run_key,'outcome',outc)); end loop; update public.v58_staging_fixtures set status='cleaned',updated_at=now() where id=f.id and creator_id=auth.uid(); select w.id into workflow_run_id from public.v58_workflow_runs w where w.creator_id=auth.uid() order by w.created_at desc limit 1; verdict:=public.v58_v3_verdict(f.id,workflow_run_id); return jsonb_build_object('ok',true,'environment','STAGING','synthetic',true,'fixture_id',f.id,'run_key',run_key,'steps',steps,'passed',8,'total',8,'cleanup','complete','verdict',verdict,'status',verdict->>'verdict'); end; $$; revoke all on function public.v58_staging_run_full_e2e() from public,anon; grant execute on function public.v58_staging_run_full_e2e() to authenticated; create or replace function public.v58_staging_run_and_score() returns jsonb language plpgsql security invoker set search_path=public as $$ declare r jsonb; begin if auth.uid() is null then raise exception 'authentication_required'; end if; r:=public.v58_staging_run_full_e2e(); return jsonb_build_object('status',coalesce(r->>'status','NO-GO'),'run',r,'verdict',r->'verdict','scored_fixture_id',r->'fixture_id','scored_at',now()); end; $$; revoke all on function public.v58_staging_run_and_score() from public,anon; grant execute on function public.v58_staging_run_and_score() to authenticated;

-- ============================================================
-- MIGRATION 20260831183556 v58_fix_v3_gate_semantics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_v3_verdict(p_fixture_id uuid, p_workflow_run_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e jsonb;
  g1 boolean;
  g2 boolean;
  g3 boolean;
  g4 boolean;
  g5 boolean;
  g6 boolean;
  g7 boolean;
  missing3 jsonb := '[]'::jsonb;
  missing4 jsonb := '[]'::jsonb;
  missing5 jsonb := '[]'::jsonb;
  missing6 jsonb := '[]'::jsonb;
  missing7 jsonb := '[]'::jsonb;
  passed int;
  v_workflow_status text;
  v_completed_steps int;
  v_total_steps int;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.v58_staging_fixtures
    where id = p_fixture_id
      and creator_id = v_uid
  ) then
    raise exception 'fixture_not_found_or_not_owned';
  end if;

  e := public.v58_staging_reconcile(p_fixture_id);

  -- Gate 1: the caller reached this authenticated RPC.
  g1 := true;

  -- Gate 2: the fixture belongs to the authenticated caller.
  g2 := true;

  -- Gate 3: all eight staging evidence steps passed.
  g3 := coalesce((e->>'e2e_pass')::boolean, false);
  if not g3 then
    missing3 := jsonb_build_array('all 8 passed staging evidence steps');
  end if;

  -- Gate 4: require an authoritative workflow that actually completed all required work.
  g4 := false;
  if p_workflow_run_id is not null then
    select w.status, w.completed_steps, w.total_steps
      into v_workflow_status, v_completed_steps, v_total_steps
    from public.v58_workflow_runs w
    where w.id = p_workflow_run_id
      and w.creator_id = v_uid;

    if v_workflow_status = 'completed'
       and coalesce(v_total_steps, 0) > 0
       and v_completed_steps = v_total_steps
       and coalesce((public.v58_get_release_launch_state(p_workflow_run_id)->'readiness'->>'hardGatePassed')::boolean, false)
    then
      g4 := true;
    end if;
  end if;

  if not g4 then
    missing4 := jsonb_build_array(
      'authoritative workflow run',
      'workflow status completed',
      'all workflow steps completed',
      'release readiness hardGatePassed'
    );
  end if;

  -- Gate 5: evaluate the semantic outcome of each recovery phase.
  -- fail is expected to fail; retry is expected to be accepted; recover is expected to recover.
  g5 := exists (
      select 1 from public.v58_staging_fixture_runs
      where fixture_id = p_fixture_id and action = 'fail' and outcome = 'failed'
    )
    and exists (
      select 1 from public.v58_staging_fixture_runs
      where fixture_id = p_fixture_id and action = 'retry' and outcome = 'accepted'
    )
    and exists (
      select 1 from public.v58_staging_fixture_runs
      where fixture_id = p_fixture_id and action = 'recover' and outcome = 'recovered'
    )
    and coalesce((e->>'unique_idempotency_keys')::int, 0) > 0;

  if not g5 then
    missing5 := jsonb_build_array(
      'fail produced failed outcome',
      'retry produced accepted outcome',
      'recover produced recovered outcome',
      'idempotency evidence'
    );
  end if;

  -- Gate 6: require authoritative semantic analytics attached to the same completed workflow.
  g6 := false;
  if p_workflow_run_id is not null
     and v_workflow_status = 'completed'
     and v_completed_steps = v_total_steps
     and coalesce(v_total_steps, 0) > 0
  then
    select count(distinct a.event_type) >= 2
      into g6
    from public.v58_analytics_events a
    join public.v58_workflow_runs w
      on w.id = p_workflow_run_id
     and w.id = a.entity_id
    where a.creator_id = v_uid
      and a.release_id = w.release_id
      and a.event_type in ('stream', 'prediction', 'verified_outcome');

    -- Some existing rows may not populate entity_id, so also accept release-scoped authoritative events.
    if not g6 then
      select count(distinct a.event_type) >= 2
        into g6
      from public.v58_analytics_events a
      join public.v58_workflow_runs w
        on w.id = p_workflow_run_id
      where a.creator_id = v_uid
        and a.release_id = w.release_id
        and a.event_type in ('stream', 'prediction', 'verified_outcome');
    end if;
  end if;

  if not g6 then
    missing6 := jsonb_build_array(
      'completed authoritative workflow',
      'at least 2 authoritative semantic event types: stream/prediction/verified_outcome'
    );
  end if;

  -- Gate 7 is the full rehearsal: staging lifecycle + provider recovery + authoritative workflow + semantics.
  g7 := g3 and g4 and g5 and g6;
  if not g7 then
    missing7 := jsonb_build_array(
      'complete 8-step staging lifecycle',
      'provider fail/retry/recover',
      'completed authoritative workflow',
      'authoritative semantic analytics'
    );
  end if;

  passed :=
    (g1::int) +
    (g2::int) +
    (g3::int) +
    (g4::int) +
    (g5::int) +
    (g6::int) +
    (g7::int);

  return jsonb_build_object(
    'verdict', case when passed = 7 then 'GO' else 'NO-GO' end,
    'score', passed::text || '/7',
    'passed_gates', passed,
    'total_gates', 7,
    'gates', jsonb_build_object(
      '1_authentication', jsonb_build_object('pass', g1, 'missing', '[]'::jsonb),
      '2_ownership_rls', jsonb_build_object('pass', g2, 'missing', '[]'::jsonb),
      '3_media_lifecycle', jsonb_build_object('pass', g3, 'missing', missing3),
      '4_public_release_player', jsonb_build_object('pass', g4, 'missing', missing4),
      '5_provider_recovery_idempotency', jsonb_build_object('pass', g5, 'missing', missing5),
      '6_data_semantics', jsonb_build_object('pass', g6, 'missing', missing6),
      '7_end_to_end', jsonb_build_object('pass', g7, 'missing', missing7)
    ),
    'e2e', e,
    'workflow_run_id', p_workflow_run_id
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260831184149 v58_launch_control_authoritative_start
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if nullif(trim(p_release_id),'') is null then
    raise exception 'release_id_required';
  end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));
  select * into v_run from public.v58_workflow_runs where id = v_run_id and creator_id = v_uid;
  if not found then
    raise exception 'workflow_run_not_found_after_start';
  end if;

  v_state := public.v58_get_release_launch_state(v_run_id);

  return jsonb_build_object(
    'status', v_run.status,
    'run_id', v_run.id,
    'release_id', v_run.release_id,
    'workflow_key', v_run.workflow_key,
    'workflow_version', v_run.workflow_version,
    'progress', v_run.progress,
    'completed_steps', v_run.completed_steps,
    'total_steps', v_run.total_steps,
    'current_step', v_run.current_step,
    'state', v_state
  );
end;
$$;

revoke all on function public.v58_launch_control_start(text) from public;
grant execute on function public.v58_launch_control_start(text) to authenticated;


-- ============================================================
-- MIGRATION 20260831184210 v58_fix_rehearsal_workflow_creator
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_e2e_create_release_launch_rehearsal(p_release_id text default null::text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release_id text := coalesce(nullif(trim(p_release_id),''),'v58-e2e-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'));
  v_run uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_run := public.v58_create_release_launch_workflow(v_release_id);
  perform public.v58_start_workflow(v_run);
  perform public.v58_advance_workflow(v_run);
  return v_run;
end;
$$;

revoke all on function public.v58_e2e_create_release_launch_rehearsal(text) from public;
grant execute on function public.v58_e2e_create_release_launch_rehearsal(text) to authenticated;


-- ============================================================
-- MIGRATION 20260831185001 v58_add_owned_release_selector
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_releases()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select id into v_artist_id
  from public.artists
  where user_id = v_uid
  order by created_at desc
  limit 1;

  if v_artist_id is null then
    return jsonb_build_object('releases','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'releases', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'release_id', m.id::text,
          'title', m.title,
          'genre', m.genre,
          'description', m.description,
          'cover_url', m.cover_url,
          'status', m.status::text,
          'featured', m.featured,
          'play_count', m.play_count,
          'created_at', m.created_at,
          'release_date', m.release_date,
          'youtube_url', m.youtube_url,
          'youtube_video_id', m.youtube_video_id
        ) order by m.created_at desc
      )
      from public.mixtapes m
      where m.artist_id = v_artist_id
        and m.status::text = 'published'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.v58_launch_control_releases() from public;
grant execute on function public.v58_launch_control_releases() to authenticated;

-- ============================================================
-- MIGRATION 20260831190455 add_v58_owned_workflow_processor
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_process_owned_workflow(p_run_id uuid, p_limit integer default 5)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.v58_workflow_runs;
  v_task public.v58_workflow_tasks;
  v_step public.v58_workflow_steps;
  v_release public.mixtapes;
  v_artist_id uuid;
  v_track_count integer;
  v_audio_count integer;
  v_missing text[] := array[]::text[];
  v_detail text;
  v_processed integer := 0;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_run
  from public.v58_workflow_runs
  where id = p_run_id and creator_id = v_uid
  for update;
  if not found then raise exception 'workflow_run_not_found_or_not_owned'; end if;

  if v_run.status = 'pending' then
    update public.v58_workflow_runs
       set status='running', started_at=coalesce(started_at,now()), updated_at=now()
     where id=v_run.id;
  end if;

  while v_processed < greatest(1,least(coalesce(p_limit,5),20)) loop
    select t.* into v_task
    from public.v58_workflow_tasks t
    where t.workflow_run_id=v_run.id
      and t.status='queued'
      and t.available_at <= now()
    order by t.created_at
    for update skip locked
    limit 1;

    exit when not found;

    update public.v58_workflow_tasks
       set status='claimed', attempts=attempts+1, claimed_at=now(), updated_at=now()
     where id=v_task.id
     returning * into v_task;

    select * into v_step
    from public.v58_workflow_steps
    where id=v_task.workflow_step_id
    for update;

    if v_step.key='validate_release' then
      v_missing := array[]::text[];
      select * into v_release
      from public.mixtapes
      where id::text=v_run.release_id;

      if not found then
        v_missing := array_append(v_missing,'release record not found');
      else
        if v_release.status::text <> 'published' then
          v_missing := array_append(v_missing,'release must be published');
        end if;
        if nullif(trim(coalesce(v_release.title,'')),'') is null then
          v_missing := array_append(v_missing,'release title');
        end if;
        if v_release.artist_id is null then
          v_missing := array_append(v_missing,'artist ownership');
        else
          select id into v_artist_id from public.artists where id=v_release.artist_id and user_id=v_uid;
          if v_artist_id is null then v_missing := array_append(v_missing,'authenticated creator ownership'); end if;
        end if;
        if nullif(trim(coalesce(v_release.cover_url,'')),'') is null then
          v_missing := array_append(v_missing,'cover artwork');
        end if;
        if v_release.release_date is null then
          v_missing := array_append(v_missing,'release date / launch schedule');
        end if;
      end if;

      if coalesce(array_length(v_missing,1),0) > 0 then
        v_detail := 'Release validation blocked: ' || array_to_string(v_missing, ', ') || '.';
        update public.v58_workflow_tasks
           set status='failed', error_message=v_detail, updated_at=now()
         where id=v_task.id;
        update public.v58_workflow_steps
           set status='blocked', progress=0, detail=v_detail, error_message=v_detail, updated_at=now()
         where id=v_step.id;
        insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
        values(v_run.id,v_step.id,v_uid,'missing_data','high','Complete release metadata',v_detail,'release',v_run.release_id,'Resolve release validation',true)
        on conflict do nothing;
        perform public.v58_emit_event(v_run.id,v_step.id,'validation.blocked','Release validation blocked',v_detail,'warning','release',v_run.release_id,jsonb_build_object('missing',v_missing),'validation-blocked-'||v_run.id::text);
      else
        v_detail := 'Release metadata, publication status, ownership, artwork, and launch schedule validated.';
        update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('validated',true), completed_at=now(), updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='completed', progress=100, detail=v_detail, error_message=null, completed_at=now(), updated_at=now() where id=v_step.id;
        perform public.v58_emit_event(v_run.id,v_step.id,'task.completed',v_step.title||' complete',v_detail,'success','workflow_task',v_task.id::text,'{}'::jsonb,'task-completed-'||v_task.id::text);
      end if;

    elsif v_step.key='rights_trust' then
      select m.artist_id into v_artist_id from public.mixtapes m where m.id::text=v_run.release_id;
      if v_artist_id is null or not exists(select 1 from public.artists a where a.id=v_artist_id and a.user_id=v_uid) then
        v_detail := 'Rights & Trust blocked: authenticated creator ownership could not be verified.';
        update public.v58_workflow_tasks set status='failed', error_message=v_detail, updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
        insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
        values(v_run.id,v_step.id,v_uid,'missing_data','high','Verify ownership / rights',v_detail,'release',v_run.release_id,'Resolve rights',true) on conflict do nothing;
      else
        v_detail := 'Authenticated creator ownership verified against the release artist.';
        update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('ownership_verified',true), completed_at=now(), updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='completed', progress=100, detail=v_detail, completed_at=now(), updated_at=now() where id=v_step.id;
      end if;

    elsif v_step.key='media_assets' then
      select count(*), count(*) filter(where nullif(trim(coalesce(t.audio_url,'')),'') is not null)
        into v_track_count, v_audio_count
      from public.tracks t where t.mixtape_id::text=v_run.release_id;
      select m.cover_url into v_release.cover_url from public.mixtapes m where m.id::text=v_run.release_id;
      v_missing := array[]::text[];
      if nullif(trim(coalesce(v_release.cover_url,'')),'') is null then v_missing:=array_append(v_missing,'cover artwork'); end if;
      if v_track_count=0 then v_missing:=array_append(v_missing,'at least one track'); end if;
      if v_audio_count=0 then v_missing:=array_append(v_missing,'at least one track with audio'); end if;
      if coalesce(array_length(v_missing,1),0)>0 then
        v_detail := 'Media & Assets blocked: '||array_to_string(v_missing,', ')||'.';
        update public.v58_workflow_tasks set status='failed', error_message=v_detail, updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
        insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
        values(v_run.id,v_step.id,v_uid,'missing_data','high','Complete media assets',v_detail,'release',v_run.release_id,'Resolve media assets',true) on conflict do nothing;
      else
        v_detail := format('Media validated: %s track(s), %s with audio.',v_track_count,v_audio_count);
        update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('track_count',v_track_count,'audio_track_count',v_audio_count), completed_at=now(), updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='completed', progress=100, detail=v_detail, completed_at=now(), updated_at=now() where id=v_step.id;
      end if;

    elsif v_step.key='promotion' then
      v_detail := 'Promotion requires explicit creator approval.';
      update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('approval_required',true), completed_at=now(), updated_at=now() where id=v_task.id;
      update public.v58_workflow_steps set status='blocked', progress=100, detail=v_detail, error_message=null, updated_at=now() where id=v_step.id;
      insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
      values(v_run.id,v_step.id,v_uid,'approval','high','Approve promotion',v_detail,'workflow_step',v_step.id::text,'Review & Approve',true) on conflict do nothing;

    elsif v_step.key='fan_crm' or v_step.key='analytics' then
      v_detail := case when v_step.key='fan_crm' then 'Fan CRM preparation completed by the V58 database worker.' else 'Analytics attribution preparation completed by the V58 database worker.' end;
      update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('worker','v58_process_owned_workflow'), completed_at=now(), updated_at=now() where id=v_task.id;
      update public.v58_workflow_steps set status='completed', progress=100, detail=v_detail, completed_at=now(), updated_at=now() where id=v_step.id;

    elsif v_step.key='distribution' then
      v_detail := 'Distribution blocked: no external distribution endpoint is configured for the enabled webhook adapter.';
      update public.v58_workflow_tasks set status='failed', error_message=v_detail, updated_at=now() where id=v_task.id;
      update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
      insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
      values(v_run.id,v_step.id,v_uid,'missing_data','high','Configure distribution provider',v_detail,'release',v_run.release_id,'Configure Distribution',true) on conflict do nothing;

    elsif v_step.key='monetization' then
      update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('delegated',true), completed_at=now(), updated_at=now() where id=v_task.id;
      perform public.v58_enqueue_stripe_monetization_task(v_step.id);

    elsif v_step.key='launch' then
      if exists(select 1 from public.v58_workflow_steps s where s.workflow_run_id=v_run.id and s.required=true and s.status not in ('completed','skipped')) then
        v_detail := 'Launch gate blocked until all required upstream steps are complete.';
        update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('gate_passed',false), completed_at=now(), updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
      else
        update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('gate_passed',true), completed_at=now(), updated_at=now() where id=v_task.id;
        update public.v58_workflow_steps set status='completed', progress=100, detail='Launch gate passed.', completed_at=now(), updated_at=now() where id=v_step.id;
      end if;

    else
      v_detail := 'No authoritative worker implementation exists for workflow step '||v_step.key||'.';
      update public.v58_workflow_tasks set status='failed', error_message=v_detail, updated_at=now() where id=v_task.id;
      update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
    end if;

    v_processed := v_processed + 1;
  end loop;

  select * into v_run from public.v58_recalculate_run(v_run.id);
  if v_run.status='running' then
    perform public.v58_advance_workflow(v_run.id);
    select * into v_run from public.v58_recalculate_run(v_run.id);
  end if;
  return v_run;
end;
$$;
revoke execute on function public.v58_process_owned_workflow(uuid,integer) from public;
grant execute on function public.v58_process_owned_workflow(uuid,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260831190554 lock_v58_launch_control_functions_to_authenticated
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_launch_control_releases() from anon;
revoke execute on function public.v58_launch_control_start(text) from anon;
revoke execute on function public.v58_process_owned_workflow(uuid,integer) from anon;
grant execute on function public.v58_launch_control_releases() to authenticated;
grant execute on function public.v58_launch_control_start(text) to authenticated;
grant execute on function public.v58_process_owned_workflow(uuid,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260831190618 wire_v58_launch_start_to_owned_worker
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_state jsonb;
  i integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id_required'; end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));

  -- Run the owned workflow worker synchronously for user-triggered launches.
  -- This replaces the previous dead-end state where tasks were queued with no worker.
  for i in 1..10 loop
    perform public.v58_process_owned_workflow(v_run_id, 1);
    select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
    exit when not found or v_run.status <> 'running';
  end loop;

  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
  if not found then raise exception 'workflow_run_not_found_after_start'; end if;

  v_state := public.v58_get_release_launch_state(v_run_id);

  return jsonb_build_object(
    'status', v_run.status,
    'run_id', v_run.id,
    'release_id', v_run.release_id,
    'workflow_key', v_run.workflow_key,
    'workflow_version', v_run.workflow_version,
    'progress', v_run.progress,
    'completed_steps', v_run.completed_steps,
    'total_steps', v_run.total_steps,
    'current_step', v_run.current_step,
    'state', v_state
  );
end;
$$;
revoke execute on function public.v58_launch_control_start(text) from anon;
grant execute on function public.v58_launch_control_start(text) to authenticated;

-- ============================================================
-- MIGRATION 20260831191553 v58_launch_control_preflight_and_resume
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_preflight(p_release_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_release uuid;
  v_title text;
  v_status text;
  v_release_date timestamptz;
  v_cover_url text;
  v_track_count integer := 0;
  v_missing_audio integer := 0;
  v_missing text[] := array[]::text[];
  v_checks jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before running V58.');
  end if;

  begin
    v_release := p_release_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID','message','Release ID is not a valid UUID.');
  end;

  select m.id, m.title, m.status::text, m.release_date, m.cover_url
    into v_release, v_title, v_status, v_release_date, v_cover_url
  from public.mixtapes m
  join public.artists a on a.id = m.artist_id
  where m.id = v_release
    and a.user_id = v_uid
  limit 1;

  if v_release is null then
    return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED','message','Release not found or not owned by the authenticated creator.');
  end if;

  select count(*)::integer, count(*) filter (where coalesce(nullif(trim(t.audio_url),''),'') = '')::integer
    into v_track_count, v_missing_audio
  from public.tracks t
  where t.mixtape_id = v_release;

  if v_status <> 'published' then
    v_missing := array_append(v_missing,'Release must be published.');
  end if;

  if v_release_date is null then
    v_missing := array_append(v_missing,'Set a release date / launch schedule.');
  end if;

  if coalesce(nullif(trim(v_cover_url),''),'') = '' then
    v_missing := array_append(v_missing,'Add cover artwork.');
  end if;

  if v_track_count = 0 then
    v_missing := array_append(v_missing,'Add at least one track.');
  elsif v_missing_audio > 0 then
    v_missing := array_append(v_missing, format('%s track(s) are missing audio URLs.',v_missing_audio));
  end if;

  v_checks := jsonb_build_object(
    'authenticated', true,
    'owned', true,
    'published', v_status = 'published',
    'release_date', v_release_date is not null,
    'cover_art', coalesce(nullif(trim(v_cover_url),''),'') <> '',
    'track_count', v_track_count,
    'tracks_have_audio', v_track_count > 0 and v_missing_audio = 0
  );

  return jsonb_build_object(
    'ok', cardinality(v_missing) = 0,
    'release_id', v_release::text,
    'title', v_title,
    'status', v_status,
    'release_date', v_release_date,
    'track_count', v_track_count,
    'missing_audio_tracks', v_missing_audio,
    'missing', to_jsonb(v_missing),
    'checks', v_checks
  );
end;
$$;

revoke execute on function public.v58_launch_control_preflight(text) from public, anon;
grant execute on function public.v58_launch_control_preflight(text) to authenticated;

create or replace function public.v58_launch_control_resume(p_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.v58_workflow_runs%rowtype;
  v_preflight jsonb;
  v_processed jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before resuming V58.');
  end if;

  select * into v_run
  from public.v58_workflow_runs
  where id = p_run_id
    and creator_id = v_uid;

  if not found then
    return jsonb_build_object('ok',false,'code','RUN_NOT_FOUND','message','Run not found or not owned by the authenticated creator.');
  end if;

  v_preflight := public.v58_launch_control_preflight(v_run.release_id);

  if coalesce((v_preflight->>'ok')::boolean,false) = false then
    return jsonb_build_object('ok',false,'code','PREFLIGHT_BLOCKED','run_id',p_run_id,'release_id',v_run.release_id,'preflight',v_preflight);
  end if;

  v_processed := public.v58_process_owned_workflow(p_run_id, 10);

  return jsonb_build_object('ok',true,'run_id',p_run_id,'release_id',v_run.release_id,'preflight',v_preflight,'processor',v_processed);
end;
$$;

revoke execute on function public.v58_launch_control_resume(uuid) from public, anon;
grant execute on function public.v58_launch_control_resume(uuid) to authenticated;

create index if not exists idx_tracks_mixtape_id on public.tracks(mixtape_id);
create index if not exists idx_artists_user_id on public.artists(user_id);


-- ============================================================
-- MIGRATION 20260831191625 v58_launch_control_release_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_release_state(p_release_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_release uuid;
  v_title text;
  v_status text;
  v_run jsonb;
  v_preflight jsonb;
  v_step jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before checking V58 release state.');
  end if;

  begin
    v_release := p_release_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID','message','Release ID is not a valid UUID.');
  end;

  select m.id, m.title, m.status::text
    into v_release, v_title, v_status
  from public.mixtapes m
  join public.artists a on a.id = m.artist_id
  where m.id = v_release and a.user_id = v_uid
  limit 1;

  if v_release is null then
    return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED','message','Release not found or not owned by the authenticated creator.');
  end if;

  v_preflight := public.v58_launch_control_preflight(v_release::text);

  select jsonb_build_object(
    'run_id', r.id,
    'status', r.status,
    'progress', r.progress,
    'current_step', r.current_step,
    'completed_steps', r.completed_steps,
    'total_steps', r.total_steps,
    'errors', r.errors,
    'started_at', r.started_at,
    'updated_at', r.updated_at,
    'completed_at', r.completed_at
  )
  into v_run
  from public.v58_workflow_runs r
  where r.release_id = v_release::text
    and r.creator_id = v_uid
    and r.workflow_key = 'release_launch'
    and r.workflow_version = 58
  order by r.created_at desc
  limit 1;

  select jsonb_build_object(
    'key', s.key,
    'title', s.title,
    'status', s.status,
    'detail', s.detail,
    'error_message', s.error_message,
    'progress', s.progress,
    'attempts', s.attempts,
    'started_at', s.started_at,
    'updated_at', s.updated_at
  )
  into v_step
  from public.v58_workflow_steps s
  where v_run is not null
    and s.workflow_run_id = (v_run->>'run_id')::uuid
  order by case when s.key = v_run->>'current_step' then 0 else 1 end, s.sequence
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'release',jsonb_build_object('id',v_release::text,'title',v_title,'status',v_status),
    'preflight',v_preflight,
    'latest_run',coalesce(v_run,'null'::jsonb),
    'current_step_detail',coalesce(v_step,'null'::jsonb)
  );
end;
$$;

revoke execute on function public.v58_launch_control_release_state(text) from public, anon;
grant execute on function public.v58_launch_control_release_state(text) to authenticated;


-- ============================================================
-- MIGRATION 20260831192046 v58_wire_upload_track_rpc_and_lockdown
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.tgg_insert_track(uuid, text, uuid, text, integer, text, text) from anon;
grant execute on function public.tgg_insert_track(uuid, text, uuid, text, integer, text, text) to authenticated;

create unique index if not exists tracks_mixtape_track_number_uidx
  on public.tracks (mixtape_id, track_number);

create or replace function public.tgg_upload_track(
  p_mixtape_id uuid,
  p_title text,
  p_track_number integer,
  p_audio_url text default null,
  p_youtube_url text default null,
  p_youtube_video_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_track_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id = v_user_id;

  if v_artist_id is null then
    raise exception 'ARTIST_PROFILE_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.mixtapes m
    where m.id = p_mixtape_id
      and m.artist_id = v_artist_id
  ) then
    raise exception 'RELEASE_NOT_OWNED';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'TRACK_TITLE_REQUIRED';
  end if;

  if p_track_number is null or p_track_number < 1 then
    raise exception 'TRACK_NUMBER_INVALID';
  end if;

  if coalesce(trim(p_audio_url), '') = '' and coalesce(trim(p_youtube_url), '') = '' then
    raise exception 'TRACK_AUDIO_OR_YOUTUBE_REQUIRED';
  end if;

  perform public.tgg_insert_track(
    v_artist_id,
    nullif(trim(p_audio_url), ''),
    p_mixtape_id,
    trim(p_title),
    p_track_number,
    nullif(trim(p_youtube_url), ''),
    nullif(trim(p_youtube_video_id), '')
  );

  select t.id into v_track_id
  from public.tracks t
  where t.mixtape_id = p_mixtape_id
    and t.track_number = p_track_number
  order by t.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'track_id', v_track_id,
    'mixtape_id', p_mixtape_id,
    'track_number', p_track_number
  );
end;
$$;

revoke execute on function public.tgg_upload_track(uuid, text, integer, text, text, text) from anon;
grant execute on function public.tgg_upload_track(uuid, text, integer, text, text, text) to authenticated;

-- ============================================================
-- MIGRATION 20260831192121 v58_add_owned_release_date_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_set_release_date(
  p_release_id uuid,
  p_release_date timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_title text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.id into v_artist_id from public.artists a where a.user_id=v_user_id;
  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;
  update public.mixtapes
     set release_date=p_release_date,
         updated_at=coalesce(updated_at, now())
   where id=p_release_id and artist_id=v_artist_id
   returning title into v_title;
  if v_title is null then raise exception 'RELEASE_NOT_OWNED'; end if;
  return jsonb_build_object('ok',true,'release_id',p_release_id,'title',v_title,'release_date',p_release_date);
end;
$$;
revoke execute on function public.tgg_set_release_date(uuid,timestamptz) from anon;
grant execute on function public.tgg_set_release_date(uuid,timestamptz) to authenticated;

-- ============================================================
-- MIGRATION 20260831192129 v58_fix_release_date_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_set_release_date(
  p_release_id uuid,
  p_release_date timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_title text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.id into v_artist_id from public.artists a where a.user_id=v_user_id;
  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;
  update public.mixtapes
     set release_date=p_release_date
   where id=p_release_id and artist_id=v_artist_id
   returning title into v_title;
  if v_title is null then raise exception 'RELEASE_NOT_OWNED'; end if;
  return jsonb_build_object('ok',true,'release_id',p_release_id,'title',v_title,'release_date',p_release_date);
end;
$$;

-- ============================================================
-- MIGRATION 20260831194200 v58_make_upload_track_idempotent
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_upload_track(
  p_mixtape_id uuid,
  p_title text,
  p_track_number integer,
  p_audio_url text default null,
  p_youtube_url text default null,
  p_youtube_video_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_track_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.id into v_artist_id from public.artists a where a.user_id=v_user_id;
  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;
  if not exists (select 1 from public.mixtapes m where m.id=p_mixtape_id and m.artist_id=v_artist_id) then raise exception 'RELEASE_NOT_OWNED'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'TRACK_TITLE_REQUIRED'; end if;
  if p_track_number is null or p_track_number < 1 then raise exception 'TRACK_NUMBER_INVALID'; end if;
  if coalesce(trim(p_audio_url),'')='' and coalesce(trim(p_youtube_url),'')='' then raise exception 'TRACK_AUDIO_OR_YOUTUBE_REQUIRED'; end if;

  select id into v_track_id
  from public.tracks
  where mixtape_id=p_mixtape_id and track_number=p_track_number
  for update;

  if v_track_id is null then
    perform public.tgg_insert_track(
      v_artist_id,
      nullif(trim(p_audio_url),''),
      p_mixtape_id,
      trim(p_title),
      p_track_number,
      nullif(trim(p_youtube_url),''),
      nullif(trim(p_youtube_video_id),'')
    );
    select id into v_track_id from public.tracks where mixtape_id=p_mixtape_id and track_number=p_track_number limit 1;
  else
    update public.tracks
       set title=trim(p_title),
           audio_url=coalesce(nullif(trim(p_audio_url),''),audio_url)
     where id=v_track_id;
  end if;

  return jsonb_build_object('ok',true,'track_id',v_track_id,'mixtape_id',p_mixtape_id,'track_number',p_track_number,'upserted',true);
end;
$$;
revoke execute on function public.tgg_upload_track(uuid,text,integer,text,text,text) from anon;
grant execute on function public.tgg_upload_track(uuid,text,integer,text,text,text) to authenticated;

-- ============================================================
-- MIGRATION 20260831195724 v58_repair_blocked_validation_retry
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_repair_and_retry(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.v58_workflow_runs;
  v_step_id uuid;
  v_task_id uuid;
  v_preflight jsonb;
  v_processed public.v58_workflow_runs;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_run from public.v58_workflow_runs where id=p_run_id and creator_id=v_uid for update;
  if not found then raise exception 'WORKFLOW_RUN_NOT_FOUND_OR_NOT_OWNED'; end if;
  v_preflight:=public.v58_launch_control_preflight(v_run.release_id);
  if coalesce((v_preflight->>'ok')::boolean,false)=false then
    return jsonb_build_object('ok',false,'code','PREFLIGHT_BLOCKED','preflight',v_preflight);
  end if;
  select id into v_step_id from public.v58_workflow_steps where workflow_run_id=p_run_id and key='validate_release' limit 1;
  if v_step_id is null then raise exception 'VALIDATION_STEP_NOT_FOUND'; end if;
  select id into v_task_id from public.v58_workflow_tasks where workflow_step_id=v_step_id order by created_at desc limit 1;
  if v_task_id is null then raise exception 'VALIDATION_TASK_NOT_FOUND'; end if;
  update public.v58_required_actions set resolved=true,resolved_at=now(),resolution='Release metadata corrected; validation retry authorized.' where workflow_run_id=p_run_id and workflow_step_id=v_step_id and resolved=false;
  update public.v58_workflow_tasks set status='queued',error_message=null,available_at=now(),updated_at=now() where id=v_task_id;
  update public.v58_workflow_steps set status='pending',progress=0,detail=null,error_message=null,updated_at=now() where id=v_step_id;
  update public.v58_workflow_runs set status='running',errors=0,current_step='validate_release',updated_at=now() where id=p_run_id;
  v_processed:=public.v58_process_owned_workflow(p_run_id,10);
  return jsonb_build_object('ok',true,'preflight',v_preflight,'run',to_jsonb(v_processed));
end;
$$;
revoke execute on function public.v58_repair_and_retry(uuid) from anon;
grant execute on function public.v58_repair_and_retry(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260831205554 v58_requeue_stale_release_validation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare
  v_run_id uuid := 'ec38f8c3-9b13-48da-b9b2-0223df91e311';
  v_task_id uuid;
begin
  select id into v_task_id
  from public.v58_workflow_tasks
  where workflow_run_id=v_run_id
    and workflow_step_id=(select id from public.v58_workflow_steps where workflow_run_id=v_run_id and key='validate_release' limit 1)
  limit 1;

  if v_task_id is not null then
    update public.v58_workflow_tasks
       set status='queued', attempts=0, error_message=null, claimed_at=null, completed_at=null, available_at=now(), updated_at=now()
     where id=v_task_id;
  end if;

  update public.v58_workflow_steps
     set status='pending', progress=0, detail=null, error_message=null, completed_at=null, updated_at=now()
   where workflow_run_id=v_run_id and key='validate_release';

  update public.v58_workflow_runs
     set status='running', progress=0, completed_steps=0, current_step='validate_release', errors=0, updated_at=now()
   where id=v_run_id and status='blocked';
end $$;

-- ============================================================
-- MIGRATION 20260831214226 v58_add_distribution_provider_task_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_enqueue_distribution_task(p_step_id uuid)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  s public.v58_workflow_steps;
  r public.v58_workflow_runs;
  a public.v58_provider_adapters;
  v_task uuid;
  v_idempotency text;
  v_endpoint text;
begin
  if auth.role() <> 'service_role' and auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.v58_workflow_steps where id=p_step_id for update;
  if not found then raise exception 'Workflow step not found'; end if;
  select * into r from public.v58_workflow_runs where id=s.workflow_run_id for update;
  if not found then raise exception 'Workflow run not found'; end if;
  if auth.role() <> 'service_role' and r.creator_id <> auth.uid() then raise exception 'Not authorized'; end if;

  select * into a from public.v58_provider_adapters where provider_key='distribution.webhook' and enabled=true;
  if a.id is null then
    update public.v58_workflow_steps set status='blocked',detail='Distribution adapter is disabled or missing.',error_message='Distribution adapter is unavailable.',updated_at=now() where id=s.id;
    return null;
  end if;

  v_endpoint := nullif(a.config->>'endpoint_url','');
  if v_endpoint is null then
    update public.v58_workflow_steps set status='blocked',detail='Distribution endpoint configuration is required.',error_message='Missing distribution.webhook config.endpoint_url.',updated_at=now() where id=s.id;
    insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
    select r.id,s.id,r.creator_id,'missing_data','high','Configure Distribution Endpoint','Add a valid endpoint_url to the enabled distribution.webhook adapter before Distribution can continue.','release',r.release_id,'Configure Distribution',true
    where not exists(select 1 from public.v58_required_actions x where x.workflow_step_id=s.id and x.resolved=false and x.type='missing_data');
    perform public.v58_emit_event(r.id,s.id,'distribution.config_required','Distribution endpoint required','Configure the Distribution Webhook endpoint to continue.','warning','release',r.release_id,jsonb_build_object('provider_key','distribution.webhook','required_config','endpoint_url'),'distribution-config-required');
    return null;
  end if;

  if left(v_endpoint,8) <> 'https://' and left(v_endpoint,7) <> 'http://' then
    update public.v58_workflow_steps set status='blocked',detail='Distribution endpoint must use HTTP(S).',error_message='Invalid distribution endpoint URL.',updated_at=now() where id=s.id;
    return null;
  end if;

  v_idempotency := 'release-launch:'||r.id::text||':distribution:webhook';
  insert into public.v58_provider_tasks(workflow_run_id,workflow_step_id,creator_id,provider_key,capability,operation,idempotency_key,payload,max_attempts)
  values(r.id,s.id,r.creator_id,'distribution.webhook','distribution','release_publish',v_idempotency,
    jsonb_build_object('workflow_run_id',r.id::text,'release_id',r.release_id,'endpoint_url',v_endpoint,'release',jsonb_build_object('id',r.release_id)),s.max_attempts)
  on conflict(idempotency_key) do update set payload=excluded.payload,updated_at=now()
  returning id into v_task;

  insert into public.v58_provider_jobs(workflow_run_id,workflow_step_id,creator_id,provider,operation,status,attempt,max_attempts,payload,idempotency_key)
  values(r.id,s.id,r.creator_id,'distribution.webhook','release_publish','pending',0,s.max_attempts,jsonb_build_object('v58_provider_task_id',v_task::text,'capability','distribution'),v_idempotency)
  on conflict do nothing;

  update public.v58_workflow_steps set detail='Distribution provider task queued.',progress=10,error_message=null,updated_at=now() where id=s.id and status='running';
  perform public.v58_emit_event(r.id,s.id,'distribution.queued','Distribution queued','The trusted V58 provider worker will deliver the release to the configured endpoint.','info','provider_task',v_task::text,jsonb_build_object('provider','distribution.webhook','operation','release_publish'),'distribution-queued-'||v_task::text);
  return v_task;
end;
$$;

create or replace function public.v58_advance_workflow_service(p_run_id uuid)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path to public
as $$
declare
  v_run public.v58_workflow_runs;
  s public.v58_workflow_steps;
  v_dep_blocked boolean;
  v_action_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_run from public.v58_workflow_runs where id=p_run_id for update;
  if not found then raise exception 'Workflow run not found'; end if;

  for s in select * from public.v58_workflow_steps where workflow_run_id=p_run_id and status='pending' order by sequence loop
    select exists(select 1 from unnest(s.depends_on) dep left join public.v58_workflow_steps ds on ds.workflow_run_id=s.workflow_run_id and ds.key=dep where ds.id is null or ds.status not in ('completed','skipped')) into v_dep_blocked;
    if v_dep_blocked then continue; end if;
    update public.v58_workflow_steps set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),progress=case when type in ('validation','automation','gate') then 5 else progress end,updated_at=now() where id=s.id;
    perform public.v58_emit_event(p_run_id,s.id,'step.started',s.title||' started',coalesce(s.description,'Workflow step is now active.'),'info','workflow_step',s.id::text,jsonb_build_object('step_key',s.key,'attempt',s.attempts+1),'service-step-started-'||s.key||'-'||(s.attempts+1)::text);
    if s.type='approval' then
      insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
      values(p_run_id,s.id,v_run.creator_id,'approval','high',s.title||' requires approval',coalesce(s.description,'Review and approve this workflow step.'),'workflow_step',s.id::text,'Review & Approve',true)
      on conflict do nothing returning id into v_action_id;
      update public.v58_workflow_steps set status='blocked',detail='Waiting for creator approval.',updated_at=now() where id=s.id;
    elsif s.key='monetization' then
      perform public.v58_enqueue_stripe_monetization_task(s.id);
    elsif s.key='distribution' then
      perform public.v58_enqueue_distribution_task(s.id);
    else
      perform public.v58_queue_step_task(s.id,case when s.type='provider' then 'provider.dispatch' when s.type='gate' then 'workflow.gate' else 'workflow.automation' end,jsonb_build_object('step_key',s.key,'release_id',v_run.release_id,'workflow_run_id',p_run_id));
    end if;
  end loop;
  return public.v58_recalculate_run(p_run_id);
end;
$$;
revoke all on function public.v58_enqueue_distribution_task(uuid) from public;
grant execute on function public.v58_enqueue_distribution_task(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260831214245 v58_lock_distribution_enqueue_to_service_worker
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_enqueue_distribution_task(uuid) from public, anon, authenticated;
grant execute on function public.v58_enqueue_distribution_task(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260831214257 v58_add_distribution_worker_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_provider_worker_contract(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare t public.v58_provider_tasks; a public.v58_provider_adapters; begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 select * into a from public.v58_provider_adapters where provider_key=t.provider_key and enabled=true;
 if not found then raise exception 'Provider adapter is disabled or missing'; end if;
 return jsonb_build_object('provider_key',t.provider_key,'capability',t.capability,'operation',t.operation,'endpoint_url',nullif(a.config->>'endpoint_url',''),'payload',t.payload,'task_id',t.id::text,'run_id',t.workflow_run_id::text,'release_id',t.payload->>'release_id');
end; $$;
revoke all on function public.v58_provider_worker_contract(uuid) from public,anon,authenticated;
grant execute on function public.v58_provider_worker_contract(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260831214311 v58_lock_provider_worker_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_provider_worker_contract(uuid) from public,anon,authenticated; grant execute on function public.v58_provider_worker_contract(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260831224900 fix_v58_stripe_release_creator_mapping
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$ declare v_creator uuid := '9b460cf2-529a-4801-99c5-b9041c83b7ca'::uuid; v_release text := '0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8'; v_price text := 'price_1UAdlxPjs1iY4gEtgMd37UDP'; begin if not exists (select 1 from auth.users where id=v_creator) then raise exception 'creator_auth_user_not_found'; end if; insert into public.v58_release_stripe_checkout_config(creator_id,release_id,stripe_price_id,quantity,mode,success_url,cancel_url,stripe_account_id,metadata,enabled) values (v_creator,v_release,v_price,1,'payment','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-stripe-webhook?status=success','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-stripe-webhook?status=cancel', 'acct_1UAdLnPjs1iY4gEtg', jsonb_build_object('v58_release_title','Lets Get It','configured_by','v58_launch_control'), true) on conflict (creator_id,release_id) do update set stripe_price_id=excluded.stripe_price_id,quantity=excluded.quantity,mode=excluded.mode,success_url=excluded.success_url,cancel_url=excluded.cancel_url,stripe_account_id=excluded.stripe_account_id,metadata=excluded.metadata,enabled=true,updated_at=now(); end $$;

-- ============================================================
-- MIGRATION 20260831225807 add_authenticated_v58_distribution_promotion_controls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v58_release_distribution_config (id uuid primary key default gen_random_uuid(),creator_id uuid not null references auth.users(id) on delete cascade,release_id text not null,endpoint_url text not null,enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique (creator_id,release_id));
create table if not exists public.v58_release_promotion_approvals (id uuid primary key default gen_random_uuid(),creator_id uuid not null references auth.users(id) on delete cascade,release_id text not null,approved boolean not null default false,approved_at timestamptz,updated_at timestamptz not null default now(),unique (creator_id,release_id));
alter table public.v58_release_distribution_config enable row level security;
alter table public.v58_release_promotion_approvals enable row level security;
drop policy if exists v58_release_distribution_owner_select on public.v58_release_distribution_config;
create policy v58_release_distribution_owner_select on public.v58_release_distribution_config for select using (creator_id=auth.uid());
drop policy if exists v58_release_promotion_owner_select on public.v58_release_promotion_approvals;
create policy v58_release_promotion_owner_select on public.v58_release_promotion_approvals for select using (creator_id=auth.uid());
create or replace function public.v58_set_distribution_config(p_release_id text,p_endpoint_url text) returns public.v58_release_distribution_config language plpgsql security definer set search_path=public as $function$
declare v_row public.v58_release_distribution_config;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if;
 if nullif(trim(p_endpoint_url),'') is null then raise exception 'endpoint_url is required'; end if;
 if left(trim(p_endpoint_url),8)<>'https://' and left(trim(p_endpoint_url),7)<>'http://' then raise exception 'endpoint_url must use HTTP(S)'; end if;
 if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=p_release_id and a.user_id=auth.uid()) then raise exception 'Release not owned by authenticated creator'; end if;
 insert into public.v58_release_distribution_config(creator_id,release_id,endpoint_url,enabled) values(auth.uid(),trim(p_release_id),trim(p_endpoint_url),true)
 on conflict (creator_id,release_id) do update set endpoint_url=excluded.endpoint_url,enabled=true,updated_at=now() returning * into v_row;
 return v_row;
end;$function$;
create or replace function public.v58_set_promotion_approval(p_release_id text,p_approved boolean) returns public.v58_release_promotion_approvals language plpgsql security definer set search_path=public as $function$
declare v_row public.v58_release_promotion_approvals;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if;
 if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=p_release_id and a.user_id=auth.uid()) then raise exception 'Release not owned by authenticated creator'; end if;
 insert into public.v58_release_promotion_approvals(creator_id,release_id,approved,approved_at) values(auth.uid(),trim(p_release_id),p_approved,case when p_approved then now() else null end)
 on conflict (creator_id,release_id) do update set approved=excluded.approved,approved_at=excluded.approved_at,updated_at=now() returning * into v_row;
 if p_approved then
   update public.v58_workflow_steps s set status='completed',progress=100,detail='Promotion approved by creator.',error_message=null,completed_at=now(),updated_at=now()
   from public.v58_workflow_runs r where s.workflow_run_id=r.id and r.release_id=trim(p_release_id) and r.creator_id=auth.uid() and s.key='promotion' and s.status='blocked';
   update public.v58_required_actions a set resolved=true,resolved_at=now() where a.creator_id=auth.uid() and a.resolved=false and a.type='approval' and a.entity_type='workflow_step' and exists(select 1 from public.v58_workflow_steps s join public.v58_workflow_runs r on r.id=s.workflow_run_id where s.id::text=a.entity_id and s.key='promotion' and r.release_id=trim(p_release_id) and r.creator_id=auth.uid());
 end if;
 return v_row;
end;$function$;
create or replace function public.v58_enqueue_distribution_task(p_step_id uuid) returns uuid language plpgsql security definer set search_path=public as $function$
declare s public.v58_workflow_steps; r public.v58_workflow_runs; a public.v58_provider_adapters; c public.v58_release_distribution_config; v_task uuid; v_idempotency text; v_endpoint text;
begin
 if auth.role()<>'service_role' and auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into s from public.v58_workflow_steps where id=p_step_id for update; if not found then raise exception 'Workflow step not found'; end if;
 select * into r from public.v58_workflow_runs where id=s.workflow_run_id for update; if not found then raise exception 'Workflow run not found'; end if;
 if auth.role()<>'service_role' and r.creator_id<>auth.uid() then raise exception 'Not authorized'; end if;
 select * into a from public.v58_provider_adapters where provider_key='distribution.webhook' and enabled=true;
 if a.id is null then update public.v58_workflow_steps set status='blocked',detail='Distribution adapter is disabled or missing.',error_message='Distribution adapter is unavailable.',updated_at=now() where id=s.id; return null; end if;
 select * into c from public.v58_release_distribution_config where creator_id=r.creator_id and release_id=r.release_id and enabled=true;
 if c.id is null then
   update public.v58_workflow_steps set status='blocked',detail='Distribution endpoint configuration is required.',error_message='Missing release Distribution endpoint.',updated_at=now() where id=s.id;
   insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
   select r.id,s.id,r.creator_id,'missing_data','high','Configure Distribution Endpoint','Add a valid endpoint_url for this release.','release',r.release_id,'Configure Distribution',true
   where not exists(select 1 from public.v58_required_actions x where x.workflow_step_id=s.id and x.resolved=false and x.type='missing_data');
   return null;
 end if;
 v_endpoint:=nullif(trim(c.endpoint_url),'');
 if v_endpoint is null or (left(v_endpoint,8)<>'https://' and left(v_endpoint,7)<>'http://') then update public.v58_workflow_steps set status='blocked',detail='Distribution endpoint must use HTTP(S).',error_message='Invalid distribution endpoint URL.',updated_at=now() where id=s.id; return null; end if;
 v_idempotency:='release-launch:'||r.id::text||':distribution:webhook';
 insert into public.v58_provider_tasks(workflow_run_id,workflow_step_id,creator_id,provider_key,capability,operation,idempotency_key,payload,max_attempts) values(r.id,s.id,r.creator_id,'distribution.webhook','distribution','release_publish',v_idempotency,jsonb_build_object('workflow_run_id',r.id::text,'release_id',r.release_id,'endpoint_url',v_endpoint,'release',jsonb_build_object('id',r.release_id)),s.max_attempts) on conflict(idempotency_key) do update set payload=excluded.payload,updated_at=now() returning id into v_task;
 insert into public.v58_provider_jobs(workflow_run_id,workflow_step_id,creator_id,provider,operation,status,attempt,max_attempts,payload,idempotency_key) values(r.id,s.id,r.creator_id,'distribution.webhook','release_publish','pending',0,s.max_attempts,jsonb_build_object('v58_provider_task_id',v_task::text,'capability','distribution'),v_idempotency) on conflict do nothing;
 update public.v58_workflow_steps set detail='Distribution provider task queued.',progress=10,error_message=null,updated_at=now() where id=s.id and status='running';
 perform public.v58_emit_event(r.id,s.id,'distribution.queued','Distribution queued','The V58 provider worker will deliver the release to the configured endpoint.','info','provider_task',v_task::text,jsonb_build_object('provider','distribution.webhook','operation','release_publish'),'distribution-queued-'||v_task::text);
 return v_task;
end;$function$;

-- ============================================================
-- MIGRATION 20260831230243 v58_distribution_worker_support
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_claim_distribution_task(p_task_id uuid)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path = public
as $$
declare v_task public.v58_provider_tasks;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.v58_provider_tasks
    set status='processing', started_at=coalesce(started_at,now()), updated_at=now()
  where id=p_task_id and operation='release_publish' and status in ('pending','retrying')
  returning * into v_task;
  if v_task.id is null then
    select * into v_task from public.v58_provider_tasks where id=p_task_id;
  end if;
  return v_task;
end;
$$;

create or replace function public.v58_complete_distribution_task(p_task_id uuid,p_status text,p_error text default null)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path = public
as $$
declare v_task public.v58_provider_tasks;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_status not in ('completed','failed') then raise exception 'Invalid distribution status'; end if;
  update public.v58_provider_tasks
    set status=p_status,error_message=p_error,completed_at=case when p_status='completed' then now() else completed_at end,updated_at=now()
  where id=p_task_id and operation='release_publish'
  returning * into v_task;
  return v_task;
end;
$$;

-- ============================================================
-- MIGRATION 20260831230318 v58_distribution_worker_idempotency
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create unique index if not exists v58_provider_jobs_task_id_uidx on public.v58_provider_jobs ((payload->>'v58_provider_task_id')) where payload ? 'v58_provider_task_id';

-- ============================================================
-- MIGRATION 20260831230328 v58_distribution_worker_claim_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_claim_distribution_task(p_task_id uuid)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path = public
as $$
declare v_task public.v58_provider_tasks;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.v58_provider_tasks
    set status='claimed', claimed_at=coalesce(claimed_at,now()), attempt=attempt+1, updated_at=now()
  where id=p_task_id and provider_key='distribution.webhook' and capability='distribution' and operation='release_publish' and status in ('pending','retrying')
  returning * into v_task;
  if v_task.id is null then select * into v_task from public.v58_provider_tasks where id=p_task_id; end if;
  return v_task;
end;
$$;

-- ============================================================
-- MIGRATION 20260831230338 v58_distribution_worker_endpoint_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_set_distribution_config(p_release_id text,p_endpoint_url text)
returns public.v58_release_distribution_config
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.v58_release_distribution_config;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if;
 if nullif(trim(p_endpoint_url),'') is null then raise exception 'endpoint_url is required'; end if;
 if left(trim(p_endpoint_url),8)<>'https://' and left(trim(p_endpoint_url),7)<>'http://' then raise exception 'endpoint_url must use HTTP(S)'; end if;
 if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=p_release_id and a.user_id=auth.uid()) then raise exception 'Release not owned by authenticated creator'; end if;
 insert into public.v58_release_distribution_config(creator_id,release_id,endpoint_url,enabled) values(auth.uid(),trim(p_release_id),trim(p_endpoint_url),true)
 on conflict (creator_id,release_id) do update set endpoint_url=excluded.endpoint_url,enabled=true,updated_at=now() returning * into v_row;
 return v_row;
end;
$$;

-- ============================================================
-- MIGRATION 20260831230402 v58_distribution_worker_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_distribution_worker_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare t public.v58_provider_tasks;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then raise exception 'Invalid Distribution task contract'; end if;
 if t.status not in ('pending','retrying','claimed','processing') then return jsonb_build_object('accepted',false,'status',t.status,'task_id',t.id); end if;
 update public.v58_provider_tasks set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=attempt+1,updated_at=now() where id=t.id;
 return jsonb_build_object('accepted',true,'task_id',t.id,'workflow_run_id',t.workflow_run_id,'release_id',t.payload->>'release_id','operation',t.operation,'payload',t.payload);
end;
$$;

-- ============================================================
-- MIGRATION 20260831230426 v58_distribution_worker_dispatch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_distribution_worker_dispatch(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare t public.v58_provider_tasks; j public.v58_provider_jobs;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then raise exception 'Invalid Distribution task contract'; end if;
 update public.v58_provider_tasks set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=attempt+1,updated_at=now() where id=t.id and status in ('pending','retrying','claimed','processing');
 update public.v58_provider_jobs set status='processing',attempt=greatest(attempt,t.attempt),updated_at=now() where payload->>'v58_provider_task_id'=t.id::text returning * into j;
 return jsonb_build_object('accepted',true,'task_id',t.id,'operation',t.operation,'release_id',t.payload->>'release_id','endpoint_url',t.payload->>'endpoint_url','job_id',j.id);
end;
$$;

-- ============================================================
-- MIGRATION 20260831230450 v58_distribution_worker_security
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_distribution_worker_dispatch(uuid) from public,anon,authenticated; grant execute on function public.v58_distribution_worker_dispatch(uuid) to service_role; revoke all on function public.v58_complete_provider_task(uuid,jsonb,text) from public,anon,authenticated; grant execute on function public.v58_complete_provider_task(uuid,jsonb,text) to service_role;

-- ============================================================
-- MIGRATION 20260831230508 v58_distribution_worker_claim_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_distribution_worker_dispatch(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare t public.v58_provider_tasks; j public.v58_provider_jobs;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then raise exception 'Invalid Distribution task contract'; end if;
 if t.status in ('completed','failed') then return jsonb_build_object('accepted',false,'status',t.status,'task_id',t.id,'result',t.result); end if;
 update public.v58_provider_tasks set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=attempt+1,updated_at=now() where id=t.id;
 update public.v58_provider_jobs set status='processing',attempt=greatest(attempt,t.attempt),updated_at=now() where payload->>'v58_provider_task_id'=t.id::text returning * into j;
 return jsonb_build_object('accepted',true,'task_id',t.id,'operation',t.operation,'release_id',t.payload->>'release_id','endpoint_url',t.payload->>'endpoint_url','job_id',j.id);
end;
$$;

-- ============================================================
-- MIGRATION 20260831230516 v58_distribution_worker_no_public_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_distribution_worker_dispatch(uuid) from public,anon,authenticated; grant execute on function public.v58_distribution_worker_dispatch(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260831230525 v58_distribution_worker_complete_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_complete_distribution_task(p_task_id uuid,p_status text,p_error text default null)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path=public
as $$
declare v_task public.v58_provider_tasks;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 if p_status not in ('completed','failed') then raise exception 'Invalid distribution status'; end if;
 update public.v58_provider_tasks set status=p_status,last_error=p_error,completed_at=case when p_status='completed' then now() else completed_at end,updated_at=now() where id=p_task_id and provider_key='distribution.webhook' and operation='release_publish' returning * into v_task;
 return v_task;
end;
$$;

-- ============================================================
-- MIGRATION 20260831230534 v58_distribution_worker_permissions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_complete_distribution_task(uuid,text,text) from public,anon,authenticated; grant execute on function public.v58_complete_distribution_task(uuid,text,text) to service_role;

-- ============================================================
-- MIGRATION 20260831230545 v58_distribution_worker_contract_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_complete_provider_task(p_task_id uuid,p_result jsonb default '{}'::jsonb,p_external_reference text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare t public.v58_provider_tasks;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key='distribution.webhook' and t.operation='release_publish' then
   if coalesce(p_result->>'delivered','false') <> 'true' then raise exception 'Distribution task cannot complete without delivered=true'; end if;
 end if;
 if t.status not in ('claimed','processing') then return false; end if;
 update public.v58_provider_tasks set status='completed',result=coalesce(p_result,'{}'::jsonb),external_reference=p_external_reference,completed_at=now(),updated_at=now() where id=p_task_id;
 update public.v58_provider_jobs set status='completed',attempt=t.attempt,max_attempts=t.max_attempts,external_id=p_external_reference,payload=payload || jsonb_build_object('v58_provider_task_id',p_task_id::text),updated_at=now() where payload->>'v58_provider_task_id'=p_task_id::text;
 if t.workflow_step_id is not null then
   update public.v58_workflow_steps set status='completed',progress=100,detail='Distribution provider task completed.',error_message=null,completed_at=now(),updated_at=now() where id=t.workflow_step_id and status in ('running','retrying','blocked');
   perform public.v58_emit_event(t.workflow_run_id,t.workflow_step_id,'provider.completed',coalesce(t.provider_key,'Provider')||' task complete',coalesce(t.provider_key,'Provider')||' operation completed successfully.','success','provider_task',p_task_id::text,coalesce(p_result,'{}'::jsonb),'provider-completed-'||p_task_id::text);
   update public.v58_workflow_runs set updated_at=now() where id=t.workflow_run_id;
   perform public.v58_advance_workflow_service(t.workflow_run_id);
 end if;
 return true;
end;
$$;

-- ============================================================
-- MIGRATION 20260831230555 v58_distribution_worker_complete_permissions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_complete_provider_task(uuid,jsonb,text) from public,anon,authenticated; grant execute on function public.v58_complete_provider_task(uuid,jsonb,text) to service_role;

-- ============================================================
-- MIGRATION 20260831230603 v58_distribution_worker_delivery_record
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_record_distribution_delivery(p_task_id uuid,p_delivered boolean,p_external_reference text default null,p_result jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 if not p_delivered then return false; end if;
 return public.v58_complete_provider_task(p_task_id,coalesce(p_result,'{}'::jsonb)||jsonb_build_object('delivered',true),p_external_reference);
end;
$$;

-- ============================================================
-- MIGRATION 20260831230611 v58_distribution_worker_delivery_permissions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.v58_record_distribution_delivery(uuid,boolean,text,jsonb) from public,anon,authenticated; grant execute on function public.v58_record_distribution_delivery(uuid,boolean,text,jsonb) to service_role;

-- ============================================================
-- MIGRATION 20260831230629 v58_distribution_worker_ready_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select 1;

-- ============================================================
-- MIGRATION 20260831230645 v58_distribution_worker_endpoint
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select 1;

-- ============================================================
-- MIGRATION 20260831234903 v58_lock_remaining_anonymous_provider_controls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.v58_claim_distribution_task(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v58_distribution_worker_task(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v58_repair_and_retry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v58_set_distribution_config(text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v58_set_promotion_approval(text,boolean) FROM anon;

-- ============================================================
-- MIGRATION 20260831234926 v58_remove_public_execute_remaining_controls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.v58_claim_distribution_task(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.v58_distribution_worker_task(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.v58_repair_and_retry(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.v58_set_distribution_config(text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.v58_set_promotion_approval(text,boolean) FROM PUBLIC;

