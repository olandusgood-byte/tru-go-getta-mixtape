-- TRU GO GETTA production migration history archive
-- Date bucket: 20260905
-- Historical evidence only. Do not replay against production.
-- Preserve the recorded order. Validate in an isolated clean environment before any bootstrap use.

-- ============================================================
-- MIGRATION 20260905090620 v3920_v159_creator_events_policy_initplan_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  p RECORD;
  q text;
  c text;
BEGIN
  FOR p IN
    SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) AS qual, pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname='public'
      AND cls.relname='v159_creator_events'
      AND pol.polname IN ('creator events select own','creator events insert own','v159_events_select_own','v159_events_insert_own')
      AND pol.polpermissive
  LOOP
    q := COALESCE(p.qual,'true');
    q := replace(q, '(select auth.uid())', 'auth.uid()');
    q := replace(q, 'auth.uid()', '(select auth.uid())');
    c := COALESCE(p.withcheck, p.qual, 'true');
    c := replace(c, '(select auth.uid())', 'auth.uid()');
    c := replace(c, 'auth.uid()', '(select auth.uid())');
    IF p.polname='creator events select own' THEN
      EXECUTE format('ALTER POLICY %I ON public.v159_creator_events USING (%s)', p.polname, q);
    ELSIF p.polname='creator events insert own' THEN
      EXECUTE format('ALTER POLICY %I ON public.v159_creator_events WITH CHECK (%s)', p.polname, c);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION 20260905090638 v3921_v159_creator_events_policy_consolidation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  q1 text; q2 text; c1 text; c2 text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO q1
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='v159_creator_events' AND pol.polname='creator events select own';
  SELECT pg_get_expr(polqual, polrelid) INTO q2
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='v159_creator_events' AND pol.polname='v159_events_select_own';
  IF q1 IS NOT NULL AND q2 IS NOT NULL THEN
    q1 := replace(q1, '(select auth.uid())','auth.uid()'); q1 := replace(q1,'auth.uid()','(select auth.uid())');
    q2 := replace(q2, '(select auth.uid())','auth.uid()'); q2 := replace(q2,'auth.uid()','(select auth.uid())');
    EXECUTE format('ALTER POLICY %I ON public.v159_creator_events USING ((%s) OR (%s))','creator events select own',q1,q2);
    EXECUTE 'DROP POLICY IF EXISTS "v159_events_select_own" ON public.v159_creator_events';
  END IF;

  SELECT pg_get_expr(polwithcheck, polrelid) INTO c1
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='v159_creator_events' AND pol.polname='creator events insert own';
  SELECT pg_get_expr(polwithcheck, polrelid) INTO c2
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='v159_creator_events' AND pol.polname='v159_events_insert_own';
  IF c1 IS NOT NULL AND c2 IS NOT NULL THEN
    c1 := replace(c1, '(select auth.uid())','auth.uid()'); c1 := replace(c1,'auth.uid()','(select auth.uid())');
    c2 := replace(c2, '(select auth.uid())','auth.uid()'); c2 := replace(c2,'auth.uid()','(select auth.uid())');
    EXECUTE format('ALTER POLICY %I ON public.v159_creator_events WITH CHECK ((%s) OR (%s))','creator events insert own',c1,c2);
    EXECUTE 'DROP POLICY IF EXISTS "v159_events_insert_own" ON public.v159_creator_events';
  END IF;
END $$;

-- ============================================================
-- MIGRATION 20260905090709 v3922_permissive_policy_consolidation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  x record;
  p1 record;
  p2 record;
  q1 text; q2 text; c1 text; c2 text;
  merged text;
  base text;
BEGIN
  FOR x IN
    SELECT * FROM (VALUES
      ('tgg_artist_world_settings','artist world manage','artist world public read'),
      ('tgg_creator_resume','resume_owner_all','resume_read'),
      ('tgg_directory_profiles','directory own manage','directory public read'),
      ('tgg_epk_settings','epk_owner_all','epk_public_read'),
      ('tgg_events','events creator manage','events public read'),
      ('tgg_fan_journey','fan_journey_creator_read','fan_journey_self_read'),
      ('tgg_feedback_requests','feedback_request_owner_all','feedback_request_read'),
      ('tgg_hotline_greetings','hotline artist manage','hotline public read'),
      ('tgg_live_events','live host manage','live public read'),
      ('tgg_membership_tiers','tiers artist manage','tiers public read'),
      ('tgg_music_ids','music ids artist manage','music ids public read'),
      ('tgg_press_items','press_owner_all','press_public_read'),
      ('tgg_programs','programs creator manage','programs public read'),
      ('tgg_release_credits','release_credits_owner_all','release_credits_public_read'),
      ('tgg_smart_links','smart_links_owner_all','smart_links_public_read'),
      ('tgg_vault_items','vault artist manage','vault member read')
    ) AS v(tbl, p1name, p2name)
  LOOP
    SELECT pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck
      INTO p1
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=x.tbl AND pol.polname=x.p1name AND pol.polpermissive;

    SELECT pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck
      INTO p2
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=x.tbl AND pol.polname=x.p2name AND pol.polpermissive;

    IF p1.polcmd IS NULL OR p2.polcmd IS NULL THEN
      CONTINUE;
    END IF;

    q1 := COALESCE(p1.qual,'true'); q1 := replace(q1,'(select auth.uid())','auth.uid()'); q1 := replace(q1,'auth.uid()','(select auth.uid())');
    q2 := COALESCE(p2.qual,'true'); q2 := replace(q2,'(select auth.uid())','auth.uid()'); q2 := replace(q2,'auth.uid()','(select auth.uid())');

    IF p1.polcmd='*' THEN
      base := 'tgg_v3922_' || regexp_replace(x.tbl,'[^a-zA-Z0-9]+','_','g');
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING ((%s) OR (%s))',base||'_select',x.tbl,q1,q2);

      c1 := COALESCE(p1.withcheck,p1.qual,'true'); c1 := replace(c1,'(select auth.uid())','auth.uid()'); c1 := replace(c1,'auth.uid()','(select auth.uid())');
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',base||'_insert',x.tbl,c1);
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',base||'_update',x.tbl,q1,c1);
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',base||'_delete',x.tbl,q1);

      EXECUTE format('DROP POLICY %I ON public.%I',x.p1name,x.tbl);
      EXECUTE format('DROP POLICY %I ON public.%I',x.p2name,x.tbl);
    ELSIF p1.polcmd='r' AND p2.polcmd='r' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) OR (%s))',x.p1name,x.tbl,q1,q2);
      EXECUTE format('DROP POLICY %I ON public.%I',x.p2name,x.tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION 20260905103333 v3923_security_advisor_suppression_audit
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v3923_security_advisor_suppression_audit (
  id boolean primary key default true,
  rule_name text not null default 'auth_leaked_password_protection',
  status text not null default 'dashboard_config_required',
  note text not null default 'Supabase Security Advisor rule suppression is a platform/Dashboard setting; this table is audit metadata only and does not alter Auth security.',
  updated_at timestamptz not null default now()
);
alter table public.v3923_security_advisor_suppression_audit enable row level security;
alter table public.v3923_security_advisor_suppression_audit force row level security;
revoke all on table public.v3923_security_advisor_suppression_audit from public, anon, authenticated, service_role;
drop policy if exists v3923_deny_all on public.v3923_security_advisor_suppression_audit;
create policy v3923_deny_all on public.v3923_security_advisor_suppression_audit for all to public using (false) with check (false);
insert into public.v3923_security_advisor_suppression_audit(id) values (true) on conflict (id) do update set updated_at=now();

-- ============================================================
-- MIGRATION 20260905120620 v58_secure_cron_worker_trigger_key
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_verify_cron_worker_key(p_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  expected text;
begin
  select decrypted_secret into expected
  from vault.decrypted_secrets
  where name = 'v58_orchestrator_worker_key';
  return expected is not null and p_key is not null and p_key = expected;
end;
$$;
revoke all on function public.v58_verify_cron_worker_key(text) from public, anon, authenticated;
grant execute on function public.v58_verify_cron_worker_key(text) to service_role;

-- ============================================================
-- MIGRATION 20260905120636 v58_route_cron_through_vault_worker_auth
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.alter_job(8, command := $cmd$select net.http_post(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v16?nonce=v58-once-9f2c7a41e6b8d3', headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='v58_orchestrator_worker_key')), body := jsonb_build_object('source','pg_cron','time',now()), timeout_milliseconds := 5000) as request_id;$cmd$);

-- ============================================================
-- MIGRATION 20260905124233 v3930_creator_os_command_center_snapshot
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  aid uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select a.id into aid
  from public.artists a
  where a.user_id = uid
  limit 1;

  if aid is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'creator', jsonb_build_object(
      'user_id', uid,
      'artist_id', aid,
      'stage_name', (select stage_name from public.artists where id = aid),
      'stripe_connected', coalesce((select stripe_onboarding_complete from public.artists where id = aid), false),
      'payouts_enabled', coalesce((select payouts_enabled from public.artists where id = aid), false)
    ),
    'releases', jsonb_build_object(
      'total', (select count(*) from public.mixtapes where artist_id = aid),
      'published', (select count(*) from public.mixtapes where artist_id = aid and status = 'published'),
      'draft', (select count(*) from public.mixtapes where artist_id = aid and status = 'draft'),
      'plays', coalesce((select sum(play_count) from public.mixtapes where artist_id = aid), 0),
      'downloads', coalesce((select sum(download_count) from public.mixtapes where artist_id = aid), 0)
    ),
    'tracks', jsonb_build_object(
      'total', (select count(*) from public.tracks where artist_id = aid)
    ),
    'videos', jsonb_build_object(
      'total', (select count(*) from public.videos where artist_id = aid),
      'published', (select count(*) from public.videos where artist_id = aid and status = 'published'),
      'featured', (select count(*) from public.videos where artist_id = aid and featured = true)
    ),
    'merch', jsonb_build_object(
      'products', (select count(*) from public.products where artist_id = aid),
      'active', (select count(*) from public.products where artist_id = aid and status = 'active')
    ),
    'community', jsonb_build_object(
      'unread_notifications', (select count(*) from public.notifications where recipient_id = uid and read_at is null),
      'fans', (select count(*) from public.tgg_fan_crm where creator_user_id = uid),
      'campaigns', (select count(*) from public.tgg_campaigns where owner_user_id = uid),
      'live_events', (select count(*) from public.tgg_live_events where host_user_id = uid)
    ),
    'growth', jsonb_build_object(
      'goals', (select count(*) from public.tgg_creator_goals where owner_user_id = uid),
      'opportunities', (select count(*) from public.tgg_opportunities where artist_id = aid and status = 'open'),
      'actions_open', (select count(*) from public.tgg_creator_action_queue where owner_user_id = uid and status in ('open','pending'))
    ),
    'studio', jsonb_build_object(
      'projects', (select count(*) from public.tgg_studio_projects where user_id = uid)
    ),
    'release_pipeline', jsonb_build_object(
      'workflow_runs', (select count(*) from public.v58_workflow_runs where creator_id = uid),
      'active_runs', (select count(*) from public.v58_workflow_runs where creator_id = uid and status in ('running','pending','in_progress')),
      'provider_jobs', (select count(*) from public.v58_provider_jobs where creator_id = uid and status in ('queued','running','retrying'))
    ),
    'navigation', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'route_key', route_key,
          'title', title,
          'path', path,
          'workspace_key', workspace_key,
          'icon', icon,
          'nav_group', nav_group,
          'nav_order', nav_order
        ) order by nav_order, title
      )
      from public.tgg_site_routes
      where is_active = true
        and area in ('artist','shared')
        and access_level in ('artist','authenticated')
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.tgg_creator_os_command_center() from public, anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

comment on function public.tgg_creator_os_command_center() is
'Authenticated Creator OS command-center snapshot. Returns creator-owned counts and active navigation in one server-side call; no secrets or private message bodies.';


-- ============================================================
-- MIGRATION 20260905124301 v3931_creator_os_command_center_invoker_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.tgg_creator_os_command_center() security invoker;
comment on function public.tgg_creator_os_command_center() is
'Authenticated Creator OS command-center snapshot using caller RLS context; returns creator-owned counts and active navigation in one server-side call; no secrets or private message bodies.';

-- ============================================================
-- MIGRATION 20260905124522 v3940_creator_os_unified_app_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_app_bundle()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_dashboard jsonb;
  v_os jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id = v_uid
  order by a.created_at asc
  limit 1;

  if v_artist is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  v_dashboard := public.tgg_get_creator_dashboard_bundle(v_artist, 12);
  v_os := public.tgg_creator_os_command_center();

  return jsonb_build_object(
    'app', jsonb_build_object(
      'key', 'tgg-creator-os',
      'name', 'TRU GO GETTA Creator OS',
      'version', 'V3940',
      'environment', 'production',
      'generated_at', now()
    ),
    'creator', coalesce(v_os->'creator', '{}'::jsonb),
    'command_center', v_dashboard->'command_center',
    'monetization', v_dashboard->'monetization',
    'fan_intelligence', v_dashboard->'fan_intelligence',
    'supporters', v_dashboard->'supporters',
    'actions', v_dashboard->'actions',
    'releases', v_dashboard->'releases',
    'campaigns', v_dashboard->'campaigns',
    'modules', jsonb_build_object(
      'music', jsonb_build_object(
        'releases', coalesce(v_os->'releases', '{}'::jsonb),
        'tracks', coalesce(v_os->'tracks', '{}'::jsonb)
      ),
      'video', coalesce(v_os->'videos', '{}'::jsonb),
      'merch', coalesce(v_os->'merch', '{}'::jsonb),
      'community', coalesce(v_os->'community', '{}'::jsonb),
      'growth', coalesce(v_os->'growth', '{}'::jsonb),
      'studio', coalesce(v_os->'studio', '{}'::jsonb),
      'release_pipeline', coalesce(v_os->'release_pipeline', '{}'::jsonb)
    ),
    'navigation', coalesce(v_os->'navigation', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.tgg_creator_os_app_bundle() from public;
grant execute on function public.tgg_creator_os_app_bundle() to authenticated;


-- ============================================================
-- MIGRATION 20260905125929 v3924_creator_os_unified_home_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_home_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'version','v1',
    'creator', coalesce((select to_jsonb(x) from public.creator_dashboard_master x limit 1),'{}'::jsonb),
    'workspace', coalesce((select to_jsonb(x) from public.creator_workspace_v1 x where x.user_id = auth.uid() limit 1),'{}'::jsonb),
    'ui_preferences', coalesce((select to_jsonb(x) from public.tgg_creator_ui_preferences x where x.user_id = auth.uid() limit 1),'{}'::jsonb),
    'ui_state', coalesce((select to_jsonb(x) from public.tgg_creator_ui_workspace_state x where x.user_id = auth.uid() limit 1),'{}'::jsonb),
    'daily_brief', coalesce((select to_jsonb(x) from public.tgg_creator_daily_brief x where x.owner_user_id = auth.uid() limit 1),'{}'::jsonb),
    'growth', coalesce((select to_jsonb(x) from public.tgg_creator_growth_snapshot x where x.owner_user_id = auth.uid() limit 1),'{}'::jsonb),
    'fan_intelligence', coalesce((select to_jsonb(x) from public.tgg_creator_fan_intelligence_summary x where x.creator_user_id = auth.uid() limit 1),'{}'::jsonb),
    'monetization', coalesce((select to_jsonb(x) from public.tgg_creator_monetization_summary x where x.creator_user_id = auth.uid() limit 1),'{}'::jsonb),
    'release_health', coalesce((select jsonb_agg(to_jsonb(r) order by r.release_date desc) from public.tgg_creator_release_health r where r.creator_user_id = auth.uid()),'[]'::jsonb)
  );
$$;

revoke all on function public.tgg_creator_os_home_v1() from public;
revoke all on function public.tgg_creator_os_home_v1() from anon;
grant execute on function public.tgg_creator_os_home_v1() to authenticated;


-- ============================================================
-- MIGRATION 20260905133953 v3930_creator_os_unified_bootstrap
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_bootstrap_v1()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  with me as (
    select auth.uid() as user_id
  ),
  dashboard as (
    select to_jsonb(d) as data
    from public.creator_dashboard_master d
    join me on d.user_id = me.user_id
    limit 1
  ),
  actions as (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.priority desc, a.due_at nulls last, a.created_at desc), '[]'::jsonb) as data
    from (
      select id, artist_id, source_type, source_id, action_type, title, rationale,
             priority, status, due_at, metadata, created_at, updated_at
      from public.tgg_creator_action_queue
      where owner_user_id = auth.uid()
        and status in ('open','pending','ready','in_progress')
      order by priority desc, due_at nulls last, created_at desc
      limit 25
    ) a
  ),
  prefs as (
    select coalesce(to_jsonb(p), jsonb_build_object(
      'user_id', auth.uid(),
      'default_workspace', 'home',
      'compact_mode', false,
      'sidebar_collapsed', false,
      'reduce_motion', false
    )) as data
    from public.tgg_creator_ui_preferences p
    where p.user_id = auth.uid()
    limit 1
  ),
  workspace as (
    select coalesce(
      jsonb_agg(to_jsonb(w) order by w.workspace),
      '[]'::jsonb
    ) as data
    from public.tgg_creator_ui_workspace_state w
    where w.user_id = auth.uid()
  ),
  inventory as (
    select coalesce(to_jsonb(i), '{}'::jsonb) as data
    from public.creator_content_inventory_v1 i
    where i.user_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'ok', true,
    'version', 'creator_os_bootstrap_v1',
    'user_id', (select user_id from me),
    'dashboard', coalesce((select data from dashboard), '{}'::jsonb),
    'content_inventory', coalesce((select data from inventory), '{}'::jsonb),
    'action_queue', (select data from actions),
    'ui_preferences', (select data from prefs),
    'workspace_state', (select data from workspace),
    'generated_at', now()
  );
$$;

revoke all on function public.tgg_creator_os_bootstrap_v1() from public, anon, authenticated;
grant execute on function public.tgg_creator_os_bootstrap_v1() to authenticated;


-- ============================================================
-- MIGRATION 20260905140935 v3950_creator_os_unified_app_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_app_bundle()
returns jsonb
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_dashboard jsonb;
  v_os jsonb;
  v_release_id uuid;
  v_routes jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id = v_uid
  order by a.created_at asc
  limit 1;

  if v_artist is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  v_dashboard := public.tgg_get_creator_dashboard_bundle(v_artist, 12);
  v_os := public.tgg_creator_os_command_center();

  select m.id into v_release_id
  from public.mixtapes m
  where m.artist_id = v_artist
  order by m.release_date desc nulls last, m.created_at desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_key', r.route_key,
      'title', r.title,
      'path', r.path,
      'workspace_key', r.workspace_key,
      'icon', r.icon,
      'nav_group', r.nav_group,
      'nav_order', r.nav_order
    ) order by r.nav_order, r.title
  ), '[]'::jsonb)
  into v_routes
  from public.tgg_site_routes r
  where r.is_active = true
    and r.area in ('artist','shared')
    and r.access_level in ('artist','authenticated');

  return jsonb_build_object(
    'app', jsonb_build_object(
      'key', 'tgg-creator-os',
      'name', 'TRU GO GETTA Creator OS',
      'version', 'V3950',
      'environment', 'production',
      'generated_at', now()
    ),
    'creator', coalesce(v_os->'creator', '{}'::jsonb),
    'command_center', v_dashboard->'command_center',
    'monetization', v_dashboard->'monetization',
    'fan_intelligence', v_dashboard->'fan_intelligence',
    'supporters', v_dashboard->'supporters',
    'actions', v_dashboard->'actions',
    'releases', v_dashboard->'releases',
    'campaigns', v_dashboard->'campaigns',
    'modules', jsonb_build_object(
      'music', jsonb_build_object(
        'releases', coalesce(v_os->'releases', '{}'::jsonb),
        'tracks', coalesce(v_os->'tracks', '{}'::jsonb)
      ),
      'video', coalesce(v_os->'videos', '{}'::jsonb),
      'merch', coalesce(v_os->'merch', '{}'::jsonb),
      'community', coalesce(v_os->'community', '{}'::jsonb),
      'growth', coalesce(v_os->'growth', '{}'::jsonb),
      'studio', coalesce(v_os->'studio', '{}'::jsonb),
      'release_pipeline', coalesce(v_os->'release_pipeline', '{}'::jsonb)
    ),
    'navigation', v_routes,
    'workspace_contract', jsonb_build_object(
      'dashboard', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_dashboard_bundle'),
      'releases', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_release_workspace_bundle'),
      'fans', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_fan_crm_bundle'),
      'growth', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_growth_workspace_bundle'),
      'live', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_live_booking_bundle'),
      'opportunities', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_opportunity_bundle'),
      'career', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_career_workspace_bundle'),
      'communications', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_communications_bundle'),
      'supporters', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_supporters_revenue_bundle'),
      'account', jsonb_build_object('enabled', true, 'source', 'tgg_get_account_workspace_bundle'),
      'shell', jsonb_build_object('enabled', true, 'source', 'tgg_get_creator_shell_bundle'),
      'studio', jsonb_build_object('enabled', true, 'source', 'tgg_creator_os_app_bundle')
    ),
    'selection', jsonb_build_object(
      'artist_id', v_artist,
      'release_id', v_release_id,
      'selection_policy', 'authenticated-owner-first'
    )
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260905141656 v3930_creator_os_master_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_master_status()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  aid uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select a.id into aid
  from public.artists a
  where a.user_id = uid
  order by a.created_at
  limit 1;

  if aid is null then
    raise exception 'creator_profile_required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'version','3930',
    'generated_at',now(),
    'creator_os',jsonb_build_object(
      'status','ready',
      'route','/p/creator-os.html',
      'command_center','tgg_creator_os_command_center'
    ),
    'modules',jsonb_build_object(
      'dashboard',jsonb_build_object('status','ready'),
      'releases',jsonb_build_object(
        'status','ready',
        'total',(select count(*) from public.mixtapes where artist_id=aid),
        'published',(select count(*) from public.mixtapes where artist_id=aid and status='published')
      ),
      'music',jsonb_build_object(
        'status','ready',
        'tracks',(select count(*) from public.tracks where artist_id=aid)
      ),
      'video',jsonb_build_object(
        'status','ready',
        'items',(select count(*) from public.videos where artist_id=aid)
      ),
      'commerce',jsonb_build_object(
        'status','ready',
        'products',(select count(*) from public.products where artist_id=aid)
      ),
      'fans',jsonb_build_object(
        'status','ready',
        'fans',(select count(*) from public.tgg_fan_crm where creator_user_id=uid)
      ),
      'messages',jsonb_build_object(
        'status','ready',
        'unread',(select count(*) from public.notifications where recipient_id=uid and read_at is null)
      ),
      'growth',jsonb_build_object(
        'status','ready',
        'goals',(select count(*) from public.tgg_creator_goals where owner_user_id=uid),
        'open_actions',(select count(*) from public.tgg_creator_action_queue where owner_user_id=uid and status in ('open','pending'))
      ),
      'live',jsonb_build_object(
        'status','ready',
        'events',(select count(*) from public.tgg_live_events where host_user_id=uid)
      ),
      'career',jsonb_build_object(
        'status','ready',
        'opportunities',(select count(*) from public.tgg_opportunities where artist_id=aid and status='open')
      ),
      'studio',jsonb_build_object(
        'status','ready',
        'projects',(select count(*) from public.tgg_studio_projects where user_id=uid)
      )
    ),
    'navigation',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'route_key',route_key,
          'title',title,
          'path',path,
          'workspace_key',workspace_key,
          'nav_group',nav_group,
          'nav_order',nav_order
        ) order by nav_order,title
      )
      from public.tgg_site_routes
      where is_active=true
        and area in ('artist','shared')
        and access_level in ('artist','authenticated')
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.tgg_creator_os_master_status() from public, anon;
grant execute on function public.tgg_creator_os_master_status() to authenticated;


-- ============================================================
-- MIGRATION 20260905142304 v3924_creator_os_command_center_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  artist_row jsonb;
  artist_id uuid;
  releases_count bigint;
  tracks_count bigint;
  videos_count bigint;
  products_count bigint;
  unread_count bigint;
  open_actions_count bigint;
  active_workflows_count bigint;
  provider_failures_count bigint;
  pending_payments_count bigint;
  analytics_30d bigint;
  goals_active_count bigint;
  recent_releases jsonb;
  recent_actions jsonb;
  recent_notifications jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok',false,'code','authentication_required');
  end if;

  select a.id, to_jsonb(a) - 'stripe_account_id'
    into artist_id, artist_row
  from public.artists a
  where a.user_id = uid
  order by a.created_at desc
  limit 1;

  select count(*) into releases_count from public.mixtapes m
  where m.user_id = uid or m.artist_id = artist_id;

  select count(*) into tracks_count from public.tracks t
  where t.user_id = uid or t.artist_id = artist_id;

  select count(*) into videos_count from public.videos v
  where v.artist_id = artist_id;

  select count(*) into products_count from public.products p
  where p.user_id = uid or p.artist_id = artist_id;

  select count(*) into unread_count from public.notifications n
  where n.recipient_id = uid and n.read_at is null;

  select count(*) into open_actions_count
  from public.tgg_creator_action_queue q
  where q.owner_user_id = uid and q.status in ('open','pending','queued','in_progress');

  select count(*) into active_workflows_count
  from public.v58_workflow_runs w
  where w.creator_id = uid and w.status in ('running','pending','processing','queued');

  select count(*) into provider_failures_count
  from public.v58_provider_jobs j
  where j.creator_id = uid and j.status in ('failed','error','dead_letter');

  select count(*) into pending_payments_count
  from public.v58_payments p
  where p.creator_id = uid and p.status in ('pending','processing');

  select count(*) into analytics_30d
  from public.creator_analytics_events e
  where e.creator_id = uid and e.occurred_at >= now() - interval '30 days';

  select count(*) into goals_active_count
  from public.tgg_creator_goals g
  where g.owner_user_id = uid and g.status in ('active','in_progress');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into recent_releases
  from (
    select m.id,m.title,m.status,m.release_date,m.play_count,m.download_count,m.created_at
    from public.mixtapes m
    where m.user_id = uid or m.artist_id = artist_id
    order by m.created_at desc
    limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority desc, x.created_at desc), '[]'::jsonb)
    into recent_actions
  from (
    select q.id,q.action_type,q.title,q.rationale,q.priority,q.status,q.due_at,q.created_at
    from public.tgg_creator_action_queue q
    where q.owner_user_id = uid and q.status in ('open','pending','queued','in_progress')
    order by q.priority desc,q.created_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into recent_notifications
  from (
    select n.id,n.notification_type,n.title,n.body,n.read_at,n.created_at
    from public.notifications n
    where n.recipient_id = uid
    order by n.created_at desc
    limit 8
  ) x;

  return jsonb_build_object(
    'ok',true,
    'generated_at',now(),
    'creator',coalesce(artist_row,'{}'::jsonb),
    'counts',jsonb_build_object(
      'releases',releases_count,
      'tracks',tracks_count,
      'videos',videos_count,
      'products',products_count,
      'unread_notifications',unread_count,
      'open_actions',open_actions_count,
      'active_workflows',active_workflows_count,
      'provider_failures',provider_failures_count,
      'pending_payments',pending_payments_count,
      'analytics_events_30d',analytics_30d,
      'active_goals',goals_active_count
    ),
    'health',jsonb_build_object(
      'workflow',case when active_workflows_count = 0 then 'clear' else 'active' end,
      'providers',case when provider_failures_count = 0 then 'clear' else 'attention' end,
      'payments',case when pending_payments_count = 0 then 'clear' else 'processing' end
    ),
    'recent_releases',recent_releases,
    'action_queue',recent_actions,
    'notifications',recent_notifications
  );
end;
$$;

revoke all on function public.tgg_creator_os_command_center() from public;
revoke all on function public.tgg_creator_os_command_center() from anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

-- ============================================================
-- MIGRATION 20260905143010 v3930_creator_os_command_center_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.tgg_creator_os_command_center
with (security_invoker = true)
as
select
  (select p.id from public.profiles p where p.id = (select auth.uid()) limit 1) as user_id,
  (select a.id from public.artists a where a.user_id = (select auth.uid()) limit 1) as artist_id,
  jsonb_build_object(
    'releases', jsonb_build_object(
      'total', coalesce((select count(*) from public.mixtapes m join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid())),0),
      'published', coalesce((select count(*) from public.mixtapes m join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid()) and m.status='published'),0),
      'drafts', coalesce((select count(*) from public.mixtapes m join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid()) and m.status='draft'),0)
    ),
    'media', jsonb_build_object(
      'videos', coalesce((select count(*) from public.videos v join public.artists a on a.id=v.artist_id where a.user_id=(select auth.uid())),0),
      'artwork', coalesce((select count(*) from public.artist_artwork aa where aa.user_id=(select auth.uid())),0)
    ),
    'commerce', jsonb_build_object(
      'products', coalesce((select count(*) from public.products pr join public.artists a on a.id=pr.artist_id where a.user_id=(select auth.uid())),0),
      'merch_products', coalesce((select count(*) from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=(select auth.uid())),0)
    ),
    'community', jsonb_build_object(
      'followers', coalesce((select count(*) from public.artist_follows af join public.artists a on a.id=af.artist_id where a.user_id=(select auth.uid())),0),
      'notifications', coalesce((select count(*) from public.notifications n where n.recipient_id=(select auth.uid())),0),
      'messages_sent', coalesce((select count(*) from public.tgg_messages m where m.sender_id=(select auth.uid())),0)
    ),
    'growth', jsonb_build_object(
      'goals', coalesce((select count(*) from public.tgg_creator_goals g join public.artists a on a.id=g.artist_id where a.user_id=(select auth.uid())),0),
      'campaigns', coalesce((select count(*) from public.tgg_campaigns c join public.artists a on a.id=c.artist_id where a.user_id=(select auth.uid())),0),
      'opportunities', coalesce((select count(*) from public.tgg_opportunities o join public.artists a on a.id=o.artist_id where a.user_id=(select auth.uid())),0)
    ),
    'supporters', jsonb_build_object(
      'memberships', coalesce((select count(*) from public.tgg_memberships ms join public.artists a on a.id=ms.artist_id where a.user_id=(select auth.uid())),0),
      'support_transactions', coalesce((select count(*) from public.tgg_support_transactions st join public.artists a on a.id=st.artist_id where a.user_id=(select auth.uid())),0)
    ),
    'workflow', jsonb_build_object(
      'active_runs', coalesce((select count(*) from public.v58_workflow_runs wr where wr.creator_id=(select auth.uid()) and wr.completed_at is null),0),
      'pending_actions', coalesce((select count(*) from public.tgg_creator_action_queue q join public.artists a on a.id=q.artist_id where a.user_id=(select auth.uid())),0)
    )
  ) as snapshot;
grant select on public.tgg_creator_os_command_center to authenticated;
revoke all on public.tgg_creator_os_command_center from anon;

-- ============================================================
-- MIGRATION 20260905143457 v3930_creator_os_master_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_master_status()
returns jsonb
language sql
security invoker
stable
as $$
  with modules as (
    select * from (values
      ('identity','profiles','artists'),
      ('music','mixtapes','tracks'),
      ('video','videos','video_content'),
      ('merch','products','merch_products'),
      ('messenger','conversations','messages'),
      ('social','content_items','reels'),
      ('stories','stories','story_views'),
      ('live','live_streams','live_stream_viewers'),
      ('analytics','analytics_events','creator_analytics_events'),
      ('release_pipeline','release_status_history','v58_workflow_runs'),
      ('monetization','v58_payments','support_transactions'),
      ('notifications','notifications','notification_preferences'),
      ('fan_crm','tgg_fan_crm','tgg_fan_journey'),
      ('growth','tgg_creator_goals','tgg_creator_action_queue'),
      ('booking','tgg_booking_requests','tgg_opportunities'),
      ('creative_workspace','tgg_creative_projects','tgg_studio_projects'),
      ('collaboration','tgg_collaboration_requests','tgg_creator_conversations'),
      ('blogger','v98_blogger_connections','tgg_theme_deploy_jobs')
    ) as x(module, table_a, table_b)
  ),
  state as (
    select
      m.module,
      m.table_a,
      m.table_b,
      exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=m.table_a) as table_a_exists,
      exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=m.table_b) as table_b_exists
    from modules m
  ),
  counts as (
    select jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'artists', (select count(*) from public.artists),
      'mixtapes', (select count(*) from public.mixtapes),
      'tracks', (select count(*) from public.tracks),
      'videos', (select count(*) from public.videos),
      'products', (select count(*) from public.products),
      'conversations', (select count(*) from public.conversations),
      'messages', (select count(*) from public.messages),
      'content_items', (select count(*) from public.content_items),
      'live_streams', (select count(*) from public.live_streams),
      'notifications', (select count(*) from public.notifications),
      'workflow_runs', (select count(*) from public.v58_workflow_runs),
      'provider_jobs', (select count(*) from public.v58_provider_jobs),
      'provider_tasks', (select count(*) from public.v58_provider_tasks),
      'payments', (select count(*) from public.v58_payments),
      'blogger_connections', (select count(*) from public.v98_blogger_connections),
      'site_routes', (select count(*) from public.tgg_site_routes)
    ) as counts
  )
  select jsonb_build_object(
    'version','V3930',
    'generated_at',now(),
    'mode','creator_os_master',
    'modules', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'module',module,
          'status',case when table_a_exists and table_b_exists then 'ready' else 'foundation' end,
          'tables',jsonb_build_array(table_a,table_b)
        ) order by module
      ),'[]'::jsonb) from state
    ),
    'counts',(select counts from counts),
    'runtime',jsonb_build_object(
      'workflow_runs',(select count(*) from public.v58_workflow_runs),
      'workflow_tasks',(select count(*) from public.v58_workflow_tasks),
      'provider_jobs',(select count(*) from public.v58_provider_jobs),
      'provider_tasks',(select count(*) from public.v58_provider_tasks),
      'staging_runs',(select count(*) from public.v58_staging_fixture_runs),
      'staging_evidence',(select count(*) from public.v58_staging_evidence)
    ),
    'status','ready'
  );
$$;

revoke execute on function public.tgg_creator_os_master_status() from anon;
grant execute on function public.tgg_creator_os_master_status() to authenticated, service_role;


-- ============================================================
-- MIGRATION 20260905143745 v3930_creator_os_unified_command_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select auth.uid() as user_id),
  artist as (
    select a.id, a.user_id, a.stage_name, a.bio, a.avatar_url, a.stripe_onboarding_complete, a.payouts_enabled
    from public.artists a join me m on m.user_id = a.user_id limit 1
  ),
  release_stats as (
    select count(*)::int total,
           count(*) filter (where m.status = 'published')::int published,
           count(*) filter (where m.status = 'draft')::int drafts,
           count(*) filter (where m.status in ('pending','changes_requested'))::int attention
    from public.mixtapes m join artist a on a.id = m.artist_id
  ),
  track_stats as (
    select count(*)::int total from public.tracks t join artist a on a.id = t.artist_id
  ),
  video_stats as (
    select count(*)::int total,
           count(*) filter (where v.status = 'published')::int published,
           count(*) filter (where v.status in ('draft','pending','changes_requested'))::int attention
    from public.videos v join artist a on a.id = v.artist_id
  ),
  merch_stats as (
    select count(*)::int total,
           count(*) filter (where p.status = 'active')::int active
    from public.products p join artist a on a.id = p.artist_id
  ),
  campaign_stats as (
    select count(*)::int total,
           count(*) filter (where p.status in ('active','running','scheduled'))::int active
    from public.promotion_campaigns p join artist a on a.user_id = p.creator_id
  ),
  fan_stats as (
    select count(*)::int total from public.tgg_fan_crm f join artist a on a.id = f.artist_id
  ),
  action_stats as (
    select count(*) filter (where q.status in ('open','pending','todo'))::int open_actions,
           count(*) filter (where q.priority >= 80 and q.status in ('open','pending','todo'))::int high_priority
    from public.tgg_creator_action_queue q join artist a on a.id = q.artist_id
  ),
  workflow_stats as (
    select count(*)::int runs,
           count(*) filter (where w.status in ('running','processing'))::int active,
           count(*) filter (where w.status in ('failed','blocked'))::int blocked_or_failed,
           max(w.updated_at) last_activity
    from public.v58_workflow_runs w join me m on m.user_id = w.creator_id
  ),
  payment_stats as (
    select count(*)::int payments,
           coalesce(sum(p.amount) filter (where p.status in ('paid','succeeded','completed')),0)::numeric revenue
    from public.v58_payments p join me m on m.user_id = p.creator_id
  ),
  notification_stats as (
    select count(*) filter (where n.read_at is null)::int unread
    from public.notifications n join me m on m.user_id = n.recipient_id
  )
  select jsonb_build_object(
    'ok', true,
    'user_id', auth.uid(),
    'artist', coalesce((select to_jsonb(artist) from artist), '{}'::jsonb),
    'releases', (select to_jsonb(release_stats) from release_stats),
    'tracks', (select to_jsonb(track_stats) from track_stats),
    'videos', (select to_jsonb(video_stats) from video_stats),
    'merch', (select to_jsonb(merch_stats) from merch_stats),
    'campaigns', (select to_jsonb(campaign_stats) from campaign_stats),
    'fans', (select to_jsonb(fan_stats) from fan_stats),
    'actions', (select to_jsonb(action_stats) from action_stats),
    'workflows', (select to_jsonb(workflow_stats) from workflow_stats),
    'payments', (select to_jsonb(payment_stats) from payment_stats),
    'notifications', (select to_jsonb(notification_stats) from notification_stats),
    'generated_at', now()
  );
$$;
revoke all on function public.tgg_creator_os_command_center() from public;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

-- ============================================================
-- MIGRATION 20260905144837 v3930_creator_os_single_load_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_home_bundle()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'surface', 'creator_os',
    'command_center', coalesce(public.tgg_creator_os_command_center(), '{}'::jsonb),
    'workspace_manifest', coalesce(public.tgg_get_creator_workspace_manifest(), '[]'::jsonb),
    'workspace_states', coalesce(public.tgg_get_creator_ui_workspace_states(), '[]'::jsonb),
    'generated_at', now()
  );
$$;

revoke all on function public.tgg_creator_os_home_bundle() from public;
grant execute on function public.tgg_creator_os_home_bundle() to authenticated;


-- ============================================================
-- MIGRATION 20260905145413 v3950_creator_os_bundle_version_alignment
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_master_bundle()
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_catalog'
as $function$
declare
  uid uuid := auth.uid();
  artist_id uuid;
  command_center jsonb;
  bootstrap jsonb;
  readiness jsonb;
  startup jsonb;
  manifest jsonb;
  actions jsonb;
  runtime jsonb;
  analytics jsonb;
  prefs jsonb;
  states jsonb;
begin
  if uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select a.id into artist_id
  from public.artists a
  where a.user_id = uid
  order by a.created_at
  limit 1;

  if artist_id is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  command_center := public.tgg_creator_os_command_center();
  bootstrap := public.tgg_get_creator_ui_bootstrap();
  readiness := public.tgg_get_creator_ui_final_readiness();
  startup := public.tgg_get_creator_app_startup_bundle();
  manifest := public.tgg_get_creator_workspace_manifest();
  actions := public.tgg_get_creator_ui_action_registry();
  runtime := public.tgg_get_creator_ui_runtime_contract();
  analytics := public.phase2_creator_analytics_dashboard(30);

  select to_jsonb(p) into prefs
  from public.tgg_creator_ui_preferences p
  where p.user_id = uid;

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.workspace),
    '[]'::jsonb
  ) into states
  from public.tgg_creator_ui_workspace_state s
  where s.user_id = uid;

  return jsonb_build_object(
    'app', 'TRU GO GETTA Creator OS',
    'bundle_version', 'V3950',
    'generated_at', now(),
    'creator', jsonb_build_object(
      'user_id', uid,
      'artist_id', artist_id
    ),
    'readiness', readiness,
    'command_center', command_center,
    'ui', jsonb_build_object(
      'bootstrap', bootstrap,
      'startup', startup,
      'workspace_manifest', manifest,
      'action_registry', actions,
      'runtime_contract', runtime,
      'preferences', coalesce(prefs, '{}'::jsonb),
      'workspace_states', states
    ),
    'analytics', analytics,
    'next_step', 'creator_os_frontend_handoff'
  );
end;
$function$;

create or replace function public.tgg_creator_os_master_status()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with modules as (
  select * from (values
    ('identity','profiles','artists'),
    ('music','mixtapes','tracks'),
    ('video','videos','video_content'),
    ('merch','products','merch_products'),
    ('messenger','conversations','messages'),
    ('social','content_items','reels'),
    ('stories','stories','story_views'),
    ('live','live_streams','live_stream_viewers'),
    ('analytics','analytics_events','creator_analytics_events'),
    ('release_pipeline','release_status_history','v58_workflow_runs'),
    ('monetization','v58_payments','support_transactions'),
    ('notifications','notifications','notification_preferences'),
    ('fan_crm','tgg_fan_crm','tgg_fan_journey'),
    ('growth','tgg_creator_goals','tgg_creator_action_queue'),
    ('booking','tgg_booking_requests','tgg_opportunities'),
    ('creative_workspace','tgg_creative_projects','tgg_studio_projects'),
    ('collaboration','tgg_collaboration_requests','tgg_conversations'),
    ('blogger','v98_blogger_connections','tgg_theme_deploy_jobs')
  ) as x(module, table_a, table_b)
),
state as (
  select m.*,
    exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=m.table_a) as table_a_exists,
    exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=m.table_b) as table_b_exists
  from modules m
),
counts as (
  select jsonb_build_object(
    'profiles',(select count(*) from public.profiles),
    'artists',(select count(*) from public.artists),
    'mixtapes',(select count(*) from public.mixtapes),
    'tracks',(select count(*) from public.tracks),
    'videos',(select count(*) from public.videos),
    'products',(select count(*) from public.products),
    'conversations',(select count(*) from public.conversations),
    'messages',(select count(*) from public.messages),
    'content_items',(select count(*) from public.content_items),
    'live_streams',(select count(*) from public.live_streams),
    'notifications',(select count(*) from public.notifications),
    'workflow_runs',(select count(*) from public.v58_workflow_runs),
    'provider_jobs',(select count(*) from public.v58_provider_jobs),
    'provider_tasks',(select count(*) from public.v58_provider_tasks),
    'payments',(select count(*) from public.v58_payments),
    'blogger_connections',(select count(*) from public.v98_blogger_connections),
    'site_routes',(select count(*) from public.tgg_site_routes)
  ) as counts
),
module_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'module',module,
      'status',case when table_a_exists and table_b_exists then 'ready' else 'foundation' end,
      'tables',jsonb_build_array(table_a,table_b)
    ) order by module
  ),'[]'::jsonb) as modules
  from state
)
select jsonb_build_object(
  'version','V3950',
  'generated_at',now(),
  'mode','creator_os_master',
  'modules',(select modules from module_json),
  'counts',(select counts from counts),
  'runtime',jsonb_build_object(
    'workflow_runs',(select count(*) from public.v58_workflow_runs),
    'workflow_tasks',(select count(*) from public.v58_workflow_tasks),
    'provider_jobs',(select count(*) from public.v58_provider_jobs),
    'provider_tasks',(select count(*) from public.v58_provider_tasks),
    'staging_runs',(select count(*) from public.v58_staging_fixture_runs),
    'staging_evidence',(select count(*) from public.v58_staging_evidence)
  ),
  'status',case
    when exists(select 1 from state where not (table_a_exists and table_b_exists)) then 'foundation'
    else 'ready'
  end
);
$function$;


-- ============================================================
-- MIGRATION 20260905145721 v3930_creator_os_home_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_home_bundle()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id
  ),
  artist as (
    select a.id as artist_id, a.user_id, a.stage_name, a.bio, a.avatar_url,
           a.stripe_onboarding_complete, a.payouts_enabled
    from public.artists a
    join me m on m.user_id = a.user_id
    limit 1
  ),
  prefs as (
    select p.*
    from public.tgg_creator_ui_preferences p
    join me m on m.user_id = p.user_id
    limit 1
  ),
  routes as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'route_key', r.route_key,
        'title', r.title,
        'area', r.area,
        'access_level', r.access_level,
        'path', r.path,
        'workspace_key', r.workspace_key,
        'icon', r.icon,
        'nav_group', r.nav_group,
        'nav_order', r.nav_order,
        'is_primary', r.is_primary,
        'is_active', r.is_active
      ) order by r.nav_order, r.title
    ) filter (where r.is_active and r.area in ('artist','shared')), '[]'::jsonb) as items
    from public.tgg_site_routes r
  ),
  actions as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'action_type', q.action_type,
        'title', q.title,
        'rationale', q.rationale,
        'priority', q.priority,
        'status', q.status,
        'due_at', q.due_at,
        'metadata', q.metadata
      ) order by q.priority desc, q.due_at nulls last, q.created_at
    ) filter (where q.status in ('open','pending','todo')), '[]'::jsonb) as items
    from public.tgg_creator_action_queue q
    join artist a on a.artist_id = q.artist_id
  ),
  center as (
    select coalesce(to_jsonb(c), '{}'::jsonb) as payload
    from public.tgg_creator_command_center c
    join artist a on a.artist_id = c.artist_id
    limit 1
  ),
  os as (
    select coalesce(o.snapshot, '{}'::jsonb) as snapshot
    from public.tgg_creator_os_command_center o
    join artist a on a.artist_id = o.artist_id
    limit 1
  )
  select jsonb_build_object(
    'ok', true,
    'contract', 'creator_os_home_v1',
    'user_id', (select user_id from me),
    'artist', coalesce((select to_jsonb(a) from artist a), '{}'::jsonb),
    'command_center', coalesce((select payload from center), '{}'::jsonb),
    'os_snapshot', coalesce((select snapshot from os), '{}'::jsonb),
    'actions', (select items from actions),
    'navigation', (select items from routes),
    'preferences', coalesce((select to_jsonb(p) from prefs p), '{}'::jsonb),
    'generated_at', now()
  );
$$;

revoke all on function public.tgg_creator_os_home_bundle() from public, anon;
grant execute on function public.tgg_creator_os_home_bundle() to authenticated, service_role;

create index if not exists tgg_creator_action_queue_artist_status_priority_idx
  on public.tgg_creator_action_queue (artist_id, status, priority desc, due_at);

create index if not exists tgg_site_routes_artist_access_nav_idx
  on public.tgg_site_routes (area, access_level, is_active, nav_order);

-- ============================================================
-- MIGRATION 20260905151354 v3930_creator_os_runtime_readiness_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v3930_creator_os_runtime_readiness (id boolean primary key default true, status text not null default 'ready', scope text not null default 'creator_os', notes text, checked_at timestamptz not null default now()); alter table public.v3930_creator_os_runtime_readiness enable row level security; drop policy if exists v3930_creator_os_runtime_readiness_service_only on public.v3930_creator_os_runtime_readiness; create policy v3930_creator_os_runtime_readiness_service_only on public.v3930_creator_os_runtime_readiness for all to service_role using (true) with check (true); insert into public.v3930_creator_os_runtime_readiness(id,status,scope,notes) values(true,'ready','creator_os','Creator OS forward-build readiness contract; existing V58 production chain preserved; no destructive cleanup.') on conflict (id) do update set status=excluded.status, scope=excluded.scope, notes=excluded.notes, checked_at=now();

-- ============================================================
-- MIGRATION 20260905152412 v3952_creator_os_unified_bootstrap
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_bootstrap()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_bundle jsonb;
  v_center jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  begin
    v_bundle := public.tgg_creator_os_app_bundle();
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'app', 'TRU GO GETTA Creator OS',
      'environment', 'production',
      'state', 'DEGRADED',
      'error', 'creator_os_bundle_failed',
      'detail', sqlerrm,
      'generated_at', now()
    );
  end;

  begin
    v_center := public.tgg_creator_os_command_center();
  exception when others then
    v_center := jsonb_build_object('ok',false,'error',sqlerrm);
  end;

  return jsonb_build_object(
    'ok', coalesce((v_bundle->>'ok')::boolean, true) and coalesce((v_center->>'ok')::boolean, false),
    'app', 'TRU GO GETTA Creator OS',
    'version', 'V3952',
    'environment', 'production',
    'creator', coalesce(v_bundle->'creator','{}'::jsonb),
    'command_center', coalesce(v_bundle->'command_center', v_center),
    'modules', coalesce(v_bundle->'modules','{}'::jsonb),
    'navigation', coalesce(v_bundle->'navigation','[]'::jsonb),
    'workspace_contract', coalesce(v_bundle->'workspace_contract','{}'::jsonb),
    'selection', coalesce(v_bundle->'selection','{}'::jsonb),
    'health', jsonb_build_object(
      'status', case when coalesce((v_bundle->>'ok')::boolean,true)
                           and coalesce((v_center->>'ok')::boolean,false)
                     then 'PASS' else 'DEGRADED' end,
      'auth','pass',
      'bundle', case when coalesce((v_bundle->>'ok')::boolean,true) then 'pass' else 'attention' end,
      'command_center', case when coalesce((v_center->>'ok')::boolean,false) then 'pass' else 'attention' end
    ),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.tgg_creator_os_bootstrap() from public, anon;
grant execute on function public.tgg_creator_os_bootstrap() to authenticated;


-- ============================================================
-- MIGRATION 20260905153849 v3924_creator_os_bootstrap_alignment
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_bootstrap() returns jsonb language plpgsql stable set search_path to 'public','pg_catalog' as $function$
declare
  v_uid uuid := auth.uid();
  v_bundle jsonb;
  v_center jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  begin
    v_bundle := public.tgg_creator_os_app_bundle();
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'app', 'TRU GO GETTA Creator OS',
      'environment', 'production',
      'state', 'DEGRADED',
      'error', 'creator_os_bundle_failed',
      'detail', sqlerrm,
      'generated_at', now()
    );
  end;

  begin
    v_center := public.tgg_creator_os_command_center();
  exception when others then
    v_center := jsonb_build_object('ok',false,'error',sqlerrm);
  end;

  return jsonb_build_object(
    'ok', coalesce((v_bundle->>'ok')::boolean, true) and coalesce((v_center->>'ok')::boolean, false),
    'app', 'TRU GO GETTA Creator OS',
    'version', 'V3924',
    'environment', 'production',
    'creator', coalesce(v_bundle->'creator','{}'::jsonb),
    'command_center', coalesce(v_bundle->'command_center', v_center),
    'modules', coalesce(v_bundle->'modules','{}'::jsonb),
    'navigation', coalesce(v_bundle->'navigation','[]'::jsonb),
    'workspace_contract', coalesce(v_bundle->'workspace_contract','{}'::jsonb),
    'selection', coalesce(v_bundle->'selection','{}'::jsonb),
    'health', jsonb_build_object(
      'status', case when coalesce((v_bundle->>'ok')::boolean,true)
                           and coalesce((v_center->>'ok')::boolean,false)
                     then 'PASS' else 'DEGRADED' end,
      'auth','pass',
      'bundle', case when coalesce((v_bundle->>'ok')::boolean,true) then 'pass' else 'attention' end,
      'command_center', case when coalesce((v_center->>'ok')::boolean,false) then 'pass' else 'attention' end
    ),
    'generated_at', now()
  );
end;
$function$;

update public.v3930_creator_os_runtime_readiness
set status='ready',
    notes='Bootstrap contract aligned to migration V3924; authentication remains fail-closed and runtime readiness is monitored separately.',
    checked_at=now()
where id=true;

-- ============================================================
-- MIGRATION 20260905154837 v3931_creator_os_master_command_center_batch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_master_status()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_artist uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id = v_user
  limit 1;

  if v_artist is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'version','V3931',
    'scope','creator_os',
    'generated_at',now(),
    'creator', jsonb_build_object(
      'user_id',v_user,
      'artist_id',v_artist,
      'stage_name',(select a.stage_name from public.artists a where a.id=v_artist)
    ),
    'command_center', coalesce((
      select to_jsonb(c) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_command_center c
      where c.creator_user_id=v_user and c.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'actions', coalesce((
      select to_jsonb(s) - 'owner_user_id' - 'artist_id'
      from public.tgg_creator_action_summary s
      where s.owner_user_id=v_user and s.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'release_health', coalesce((
      select jsonb_agg(to_jsonb(r) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_release_health r
      where r.creator_user_id=v_user and r.artist_id=v_artist
    ), '[]'::jsonb),
    'growth', coalesce((
      select to_jsonb(g) - 'owner_user_id' - 'artist_id'
      from public.tgg_creator_growth_snapshot g
      where g.owner_user_id=v_user and g.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'fans', coalesce((
      select to_jsonb(f) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_fan_intelligence_summary f
      where f.creator_user_id=v_user and f.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'supporters', coalesce((
      select to_jsonb(su) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_supporter_summary su
      where su.creator_user_id=v_user and su.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'monetization', coalesce((
      select to_jsonb(m) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_monetization_summary m
      where m.creator_user_id=v_user and m.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(b) - 'creator_user_id')
      from public.tgg_creator_booking_pipeline b
      where b.creator_user_id=v_user
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(cp) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_campaign_health cp
      where cp.creator_user_id=v_user and cp.artist_id=v_artist
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_event_performance e
      where e.creator_user_id=v_user and e.artist_id=v_artist
    ), '[]'::jsonb),
    'daily_brief', coalesce((
      select to_jsonb(d) - 'owner_user_id'
      from public.tgg_creator_daily_brief d
      where d.owner_user_id=v_user
      limit 1
    ), '{}'::jsonb),
    'ui', jsonb_build_object(
      'preferences', coalesce((
        select to_jsonb(p) - 'user_id'
        from public.tgg_creator_ui_preferences p
        where p.user_id=v_user
        limit 1
      ), '{}'::jsonb),
      'workspace_state', coalesce((
        select jsonb_agg(to_jsonb(w) - 'user_id')
        from public.tgg_creator_ui_workspace_state w
        where w.user_id=v_user
      ), '[]'::jsonb)
    ),
    'notifications', coalesce((
      select count(*) from public.notifications n where n.recipient_id=v_user
    ),0),
    'content', jsonb_build_object(
      'releases', (select count(*) from public.mixtapes m where m.artist_id=v_artist),
      'tracks', (select count(*) from public.tracks t join public.mixtapes m on m.id=t.mixtape_id where m.artist_id=v_artist),
      'videos', (select count(*) from public.videos v where v.artist_id=v_artist),
      'products', (select count(*) from public.products p where p.artist_id=v_artist)
    ),
    'readiness', jsonb_build_object(
      'runtime', coalesce((select status from public.v3930_creator_os_runtime_readiness where id=true limit 1),'unknown'),
      'authenticated', true
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.tgg_creator_os_master_status() from public;
grant execute on function public.tgg_creator_os_master_status() to authenticated;

-- ============================================================
-- MIGRATION 20260905191746 v3940_creator_os_command_center_security_invoker
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter view public.tgg_creator_os_command_center set (security_invoker = true);


-- ============================================================
-- MIGRATION 20260905193131 v3960_creator_os_final_reconciliation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_final_reconciliation()
returns jsonb
language sql
stable
set search_path = public, pg_catalog
as $$
  with latest as (
    select version, name
    from supabase_migrations.schema_migrations
    order by version desc
    limit 1
  ),
  rls as (
    select count(*) filter (where c.relrowsecurity) as protected,
           count(*) as total
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  ),
  funcs as (
    select
      count(*) filter (where proname in ('tgg_creator_os_master_bundle','tgg_creator_os_master_status','tgg_creator_os_home_bundle','tgg_creator_os_command_center')) as required_functions,
      count(*) filter (where proname='tgg_creator_os_master_bundle' and not prosecdef) as master_invoker
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
  ),
  readiness as (
    select status, checked_at from public.v3930_creator_os_runtime_readiness where id=true limit 1
  )
  select jsonb_build_object(
    'ok', true,
    'app', 'TRU GO GETTA Creator OS',
    'scope', 'creator_os',
    'production', true,
    'latest_migration', (select row_to_json(latest) from latest),
    'rls', (select jsonb_build_object('protected',protected,'total',total,'all_protected',protected=total) from rls),
    'functions', (select jsonb_build_object('required',required_functions,'required_total',4,'all_present',required_functions=4,'master_is_invoker',master_invoker=1) from funcs),
    'runtime_readiness', coalesce((select jsonb_build_object('status',status,'checked_at',checked_at) from readiness),'{}'::jsonb),
    'next_step', 'creator_os_frontend_handoff',
    'generated_at', now()
  );
$$;

revoke all on function public.tgg_creator_os_final_reconciliation() from public;
grant execute on function public.tgg_creator_os_final_reconciliation() to authenticated, service_role;

update public.v3930_creator_os_runtime_readiness
set status='ready', notes='Creator OS unified command center and single-load bundle reconciled; authenticated invoker path preserved; final reconciliation active.', checked_at=now()
where id=true;

-- ============================================================
-- MIGRATION 20260905193520 v3970_creator_os_unified_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_unified_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  master jsonb;
  status jsonb;
  home jsonb;
  command_center jsonb;
  reconciliation jsonb;
begin
  if uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  master := public.tgg_creator_os_master_bundle();
  status := public.tgg_creator_os_master_status();
  home := public.tgg_creator_os_home_bundle();
  command_center := public.tgg_creator_os_command_center();
  reconciliation := public.tgg_creator_os_final_reconciliation();

  return jsonb_build_object(
    'ok', true,
    'app', 'TRU GO GETTA Creator OS',
    'contract', 'V3970',
    'environment', 'production',
    'user_id', uid,
    'modules', jsonb_build_object(
      'dashboard', home,
      'command_center', command_center,
      'master', master,
      'status', status
    ),
    'reconciliation', reconciliation,
    'capabilities', jsonb_build_array(
      'releases',
      'tracks',
      'videos',
      'merch',
      'fan_crm',
      'messenger',
      'promotion',
      'analytics',
      'payments',
      'bookings',
      'live',
      'notifications',
      'creator_workspace'
    ),
    'runtime', jsonb_build_object(
      'authenticated', true,
      'readiness', 'production'
    ),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.tgg_creator_os_unified_bundle() from public;
revoke all on function public.tgg_creator_os_unified_bundle() from anon;
grant execute on function public.tgg_creator_os_unified_bundle() to authenticated;


-- ============================================================
-- MIGRATION 20260905193958 v3971_creator_os_unified_frontend_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_unified_bundle()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  uid uuid := auth.uid();
  master jsonb;
  status jsonb;
  home jsonb;
  command_center jsonb;
  reconciliation jsonb;
  recent_releases jsonb;
  notifications jsonb;
begin
  if uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  master := public.tgg_creator_os_master_bundle();
  status := public.tgg_creator_os_master_status();
  home := public.tgg_creator_os_home_bundle();
  command_center := public.tgg_creator_os_command_center();
  reconciliation := public.tgg_creator_os_final_reconciliation();

  select coalesce(jsonb_agg(to_jsonb(r) order by coalesce(r.release_date,r.created_at) desc) filter (where r.id is not null),'[]'::jsonb)
    into recent_releases
  from (
    select m.id,m.title,m.status,m.release_date,m.created_at,m.play_count,m.download_count
    from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    where a.user_id=uid
    order by coalesce(m.release_date,m.created_at) desc
    limit 10
  ) r;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc) filter (where n.id is not null),'[]'::jsonb)
    into notifications
  from (
    select n.id,n.title,n.body,n.notification_type,n.created_at,n.read_at
    from public.notifications n
    where n.recipient_id=uid
    order by n.created_at desc
    limit 20
  ) n;

  return jsonb_build_object(
    'ok', true,
    'app', 'TRU GO GETTA Creator OS',
    'contract', 'V3971',
    'environment', 'production',
    'user_id', uid,
    'modules', jsonb_build_object(
      'dashboard', home,
      'command_center', command_center,
      'master', master,
      'status', status
    ),
    'reconciliation', reconciliation,
    'action_queue', coalesce(home->'actions','[]'::jsonb),
    'recent_releases', recent_releases,
    'notifications', notifications,
    'capabilities', jsonb_build_array(
      'releases','tracks','videos','merch','fan_crm','messenger',
      'promotion','analytics','payments','bookings','live','notifications',
      'creator_workspace'
    ),
    'runtime', jsonb_build_object(
      'authenticated', true,
      'readiness', 'production'
    ),
    'generated_at', now()
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260905194211 v3972_creator_os_unified_bundle_creator_fallback
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.phase2_creator_analytics_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
set search_path to 'public','auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_creator uuid;
  v_days integer := greatest(1, least(coalesce(p_days,30),365));
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select coalesce(
    (select m.creator_id
       from public.v54_creator_members m
      where m.user_id=v_user
      order by m.created_at asc
      limit 1),
    (select a.id
       from public.artists a
      where a.user_id=v_user
      order by a.created_at asc
      limit 1)
  ) into v_creator;

  if v_creator is null then raise exception 'Creator workspace not found'; end if;

  select jsonb_build_object(
    'creator_id', v_creator,
    'days', v_days,
    'events_total', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.occurred_at>=now()-make_interval(days=>v_days)),
    'views', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='view' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'plays', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='play' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'downloads', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='download' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'shares', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='share' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'likes', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='like' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'mixtapes', coalesce((select jsonb_agg(to_jsonb(x) order by x.play_count desc, x.created_at desc) from (
      select mt.id,mt.title,mt.genre,mt.status,mt.featured,mt.play_count,mt.created_at
      from public.mixtapes mt
      join public.artists ar on ar.id=mt.artist_id
      where ar.user_id=v_user
      order by mt.play_count desc,mt.created_at desc limit 12
    ) x),'[]'::jsonb),
    'event_breakdown', coalesce((select jsonb_agg(jsonb_build_object('event_type',z.event_type,'count',z.event_count) order by z.event_count desc) from (
      select e.event_type,count(*)::bigint event_count
      from public.creator_analytics_events e
      where e.creator_id=v_creator and e.occurred_at>=now()-make_interval(days=>v_days)
      group by e.event_type
    ) z),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;


-- ============================================================
-- MIGRATION 20260905202151 v3940_creator_os_command_center_unified
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_artist_id uuid;
  v_artist jsonb;
  v_profile jsonb;
  v_releases jsonb;
  v_media jsonb;
  v_community jsonb;
  v_growth jsonb;
  v_money jsonb;
  v_operations jsonb;
  v_actions jsonb;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id = v_uid
  limit 1;

  if v_artist_id is null then
    return jsonb_build_object(
      'ok', true,
      'user_id', v_uid,
      'has_artist_workspace', false,
      'generated_at', now()
    );
  end if;

  select jsonb_build_object(
    'id', a.id,
    'stage_name', a.stage_name,
    'bio_complete', coalesce(length(trim(a.bio)) > 0, false),
    'avatar_complete', a.avatar_url is not null and length(trim(a.avatar_url)) > 0,
    'stripe_connected', coalesce(a.stripe_onboarding_complete, false),
    'payouts_enabled', coalesce(a.payouts_enabled, false)
  ) into v_artist
  from public.artists a
  where a.id = v_artist_id;

  select jsonb_build_object(
    'profile_ready',
      (
        coalesce(length(trim(a.stage_name)) > 0, false)
        and coalesce(length(trim(a.bio)) > 0, false)
        and a.avatar_url is not null
      ),
    'stripe_ready', coalesce(a.stripe_onboarding_complete, false),
    'default_workspace', p.default_workspace,
    'compact_mode', p.compact_mode,
    'sidebar_collapsed', p.sidebar_collapsed
  ) into v_profile
  from public.artists a
  left join public.tgg_creator_ui_preferences p on p.user_id = v_uid
  where a.id = v_artist_id;

  select jsonb_build_object(
    'total', count(*)::int,
    'published', count(*) filter (where m.status = 'published')::int,
    'draft', count(*) filter (where m.status = 'draft')::int,
    'pending', count(*) filter (where m.status = 'pending')::int,
    'changes_requested', count(*) filter (where m.status = 'changes_requested')::int,
    'rejected', count(*) filter (where m.status = 'rejected')::int
  ) into v_releases
  from public.mixtapes m
  where m.artist_id = v_artist_id;

  select jsonb_build_object(
    'videos', (select count(*)::int from public.videos where artist_id = v_artist_id),
    'creative_projects', (select count(*)::int from public.tgg_creative_projects where artist_id = v_artist_id),
    'studio_projects', (select count(*)::int from public.tgg_studio_projects where artist_id = v_artist_id),
    'vault_assets', (select count(*)::int from public.tgg_media_vault_assets where artist_id = v_artist_id),
    'pending_uploads', (select count(*)::int from public.tgg_pending_media_uploads where user_id = v_uid)
  ) into v_media;

  select jsonb_build_object(
    'fans', (select count(*)::int from public.tgg_fan_crm where artist_id = v_artist_id),
    'followers', (select count(*)::int from public.artist_follows where artist_id = v_artist_id),
    'unread_notifications', (select count(*)::int from public.notifications where recipient_id = v_uid and coalesce(read_at, null) is null),
    'active_campaigns', (select count(*)::int from public.tgg_campaigns where artist_id = v_artist_id and status not in ('completed','cancelled')),
    'active_conversations', (select count(*)::int from public.creator_conversations c join public.creator_conversation_members cm on cm.conversation_id=c.id where cm.user_id=v_uid)
  ) into v_community;

  select jsonb_build_object(
    'goals', (select count(*)::int from public.tgg_creator_goals where artist_id=v_artist_id and status not in ('completed','cancelled')),
    'opportunities', (select count(*)::int from public.tgg_opportunities where artist_id=v_artist_id and status not in ('closed','cancelled')),
    'smart_links', (select count(*)::int from public.tgg_smart_links where artist_id=v_artist_id and is_active),
    'analytics_events_30d', (select count(*)::int from public.tgg_creator_analytics_events where artist_id=v_artist_id and created_at >= now()-interval '30 days')
  ) into v_growth;

  select jsonb_build_object(
    'payments_count', (select count(*)::int from public.v58_payments where creator_id=v_uid),
    'payments_total', (select coalesce(sum(amount),0) from public.v58_payments where creator_id=v_uid and status in ('paid','succeeded','complete')),
    'payments_currency', (select max(currency) from public.v58_payments where creator_id=v_uid),
    'provider_pending', (select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('queued','pending','processing','retry')),
    'workflow_active', (select count(*)::int from public.v58_workflow_runs where creator_id=v_uid and status not in ('completed','failed','cancelled'))
  ) into v_money;

  select jsonb_build_object(
    'workflow_runs', (select count(*)::int from public.v58_workflow_runs where creator_id=v_uid),
    'provider_tasks', (select count(*)::int from public.v58_provider_tasks where creator_id=v_uid),
    'failed_provider_tasks', (select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('failed','dead_letter')),
    'release_checklist_open', (select count(*)::int from public.tgg_release_checklist_items where artist_id=v_artist_id and status not in ('complete','completed')),
    'launch_readiness', (select status from public.v3930_creator_os_runtime_readiness where id=true limit 1)
  ) into v_operations;

  select coalesce(jsonb_agg(x order by x.priority desc, x.due_at nulls last, x.created_at desc), '[]'::jsonb)
  into v_actions
  from (
    select jsonb_build_object(
      'id', q.id,
      'action_type', q.action_type,
      'title', q.title,
      'rationale', q.rationale,
      'priority', q.priority,
      'status', q.status,
      'due_at', q.due_at,
      'source_type', q.source_type,
      'source_id', q.source_id
    ) as x, q.priority, q.due_at, q.created_at
    from public.tgg_creator_action_queue q
    where q.owner_user_id=v_uid
      and q.status in ('open','pending','ready','todo')
    order by q.priority desc, q.due_at nulls last, q.created_at desc
    limit 10
  ) s;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'user_id', v_uid,
    'artist_id', v_artist_id,
    'has_artist_workspace', true,
    'artist', v_artist,
    'profile', v_profile,
    'releases', v_releases,
    'media', v_media,
    'community', v_community,
    'growth', v_growth,
    'money', v_money,
    'operations', v_operations,
    'next_actions', v_actions
  );
end;
$$;

revoke all on function public.tgg_creator_os_command_center() from public, anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

comment on function public.tgg_creator_os_command_center() is
'Unified authenticated Creator OS command-center snapshot. Aggregates creator profile, releases, media, community, growth, money, operations, and prioritized next actions using caller-visible RLS data.';

-- ============================================================
-- MIGRATION 20260905202233 v3941_creator_os_command_center_schema_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_artist_id uuid;
  v_artist jsonb; v_profile jsonb; v_releases jsonb; v_media jsonb;
  v_community jsonb; v_growth jsonb; v_money jsonb; v_operations jsonb; v_actions jsonb;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;

  select a.id into v_artist_id from public.artists a where a.user_id=v_uid limit 1;
  if v_artist_id is null then
    return jsonb_build_object('ok',true,'user_id',v_uid,'has_artist_workspace',false,'generated_at',now());
  end if;

  select jsonb_build_object(
    'id',a.id,'stage_name',a.stage_name,
    'bio_complete',coalesce(length(trim(a.bio))>0,false),
    'avatar_complete',coalesce(length(trim(a.avatar_url))>0,false),
    'stripe_connected',coalesce(a.stripe_onboarding_complete,false),
    'payouts_enabled',coalesce(a.payouts_enabled,false)
  ) into v_artist from public.artists a where a.id=v_artist_id;

  select jsonb_build_object(
    'profile_ready',(coalesce(length(trim(a.stage_name))>0,false) and coalesce(length(trim(a.bio))>0,false) and a.avatar_url is not null),
    'stripe_ready',coalesce(a.stripe_onboarding_complete,false),
    'default_workspace',p.default_workspace,
    'compact_mode',p.compact_mode,
    'sidebar_collapsed',p.sidebar_collapsed
  ) into v_profile
  from public.artists a left join public.tgg_creator_ui_preferences p on p.user_id=v_uid
  where a.id=v_artist_id;

  select jsonb_build_object(
    'total',count(*)::int,
    'published',count(*) filter(where m.status='published')::int,
    'draft',count(*) filter(where m.status='draft')::int,
    'pending',count(*) filter(where m.status='pending')::int,
    'changes_requested',count(*) filter(where m.status='changes_requested')::int,
    'rejected',count(*) filter(where m.status='rejected')::int
  ) into v_releases from public.mixtapes m where m.artist_id=v_artist_id;

  select jsonb_build_object(
    'videos',(select count(*)::int from public.videos where artist_id=v_artist_id),
    'creative_projects',(select count(*)::int from public.tgg_creative_projects where user_id=v_uid),
    'studio_projects',(select count(*)::int from public.tgg_studio_projects where user_id=v_uid),
    'vault_assets',(select count(*)::int from public.tgg_media_vault_assets where user_id=v_uid),
    'pending_uploads',(select count(*)::int from public.tgg_pending_media_uploads where user_id=v_uid)
  ) into v_media;

  select jsonb_build_object(
    'fans',(select count(*)::int from public.tgg_fan_crm where artist_id=v_artist_id),
    'followers',(select count(*)::int from public.artist_follows where artist_id=v_artist_id),
    'unread_notifications',(select count(*)::int from public.notifications where recipient_id=v_uid and coalesce(read_at,null) is null),
    'active_campaigns',(select count(*)::int from public.tgg_campaigns where artist_id=v_artist_id and status not in ('completed','cancelled')),
    'active_conversations',(select count(*)::int from public.creator_conversations c join public.creator_conversation_members cm on cm.conversation_id=c.id where cm.user_id=v_uid)
  ) into v_community;

  select jsonb_build_object(
    'goals',(select count(*)::int from public.tgg_creator_goals where artist_id=v_artist_id and status not in ('completed','cancelled')),
    'opportunities',(select count(*)::int from public.tgg_opportunities where artist_id=v_artist_id and status not in ('closed','cancelled')),
    'smart_links',(select count(*)::int from public.tgg_smart_links where artist_id=v_artist_id and is_active),
    'analytics_events_30d',(select count(*)::int from public.tgg_creator_analytics_events where artist_id=v_artist_id and created_at>=now()-interval '30 days')
  ) into v_growth;

  select jsonb_build_object(
    'payments_count',(select count(*)::int from public.v58_payments where creator_id=v_uid),
    'payments_total',(select coalesce(sum(amount),0) from public.v58_payments where creator_id=v_uid and status in ('paid','succeeded','complete')),
    'payments_currency',(select max(currency) from public.v58_payments where creator_id=v_uid),
    'provider_pending',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('queued','pending','processing','retry')),
    'workflow_active',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid and status not in ('completed','failed','cancelled'))
  ) into v_money;

  select jsonb_build_object(
    'workflow_runs',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid),
    'provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid),
    'failed_provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('failed','dead_letter')),
    'release_checklist_open',(select count(*)::int from public.tgg_release_checklist_items where artist_id=v_artist_id and status not in ('complete','completed')),
    'launch_readiness',(select status from public.v3930_creator_os_runtime_readiness where id=true limit 1)
  ) into v_operations;

  select coalesce(jsonb_agg(x order by priority desc,due_at nulls last,created_at desc),'[]'::jsonb) into v_actions
  from (
    select jsonb_build_object('id',q.id,'action_type',q.action_type,'title',q.title,'rationale',q.rationale,'priority',q.priority,'status',q.status,'due_at',q.due_at,'source_type',q.source_type,'source_id',q.source_id) x,
           q.priority,q.due_at,q.created_at
    from public.tgg_creator_action_queue q
    where q.owner_user_id=v_uid and q.status in ('open','pending','ready','todo')
    order by q.priority desc,q.due_at nulls last,q.created_at desc limit 10
  ) s;

  return jsonb_build_object('ok',true,'generated_at',now(),'user_id',v_uid,'artist_id',v_artist_id,'has_artist_workspace',true,
    'artist',v_artist,'profile',v_profile,'releases',v_releases,'media',v_media,'community',v_community,'growth',v_growth,'money',v_money,'operations',v_operations,'next_actions',v_actions);
end;
$$;
revoke all on function public.tgg_creator_os_command_center() from public, anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

-- ============================================================
-- MIGRATION 20260905202302 v3942_creator_os_command_center_analytics_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 v_uid uuid:=auth.uid(); v_artist_id uuid;
 v_artist jsonb; v_profile jsonb; v_releases jsonb; v_media jsonb; v_community jsonb; v_growth jsonb; v_money jsonb; v_operations jsonb; v_actions jsonb;
begin
 if v_uid is null then raise exception 'unauthorized'; end if;
 select id into v_artist_id from public.artists where user_id=v_uid limit 1;
 if v_artist_id is null then return jsonb_build_object('ok',true,'user_id',v_uid,'has_artist_workspace',false,'generated_at',now()); end if;

 select jsonb_build_object('id',a.id,'stage_name',a.stage_name,'bio_complete',coalesce(length(trim(a.bio))>0,false),'avatar_complete',coalesce(length(trim(a.avatar_url))>0,false),'stripe_connected',coalesce(a.stripe_onboarding_complete,false),'payouts_enabled',coalesce(a.payouts_enabled,false)) into v_artist from public.artists a where a.id=v_artist_id;

 select jsonb_build_object('profile_ready',(coalesce(length(trim(a.stage_name))>0,false) and coalesce(length(trim(a.bio))>0,false) and a.avatar_url is not null),'stripe_ready',coalesce(a.stripe_onboarding_complete,false),'default_workspace',p.default_workspace,'compact_mode',p.compact_mode,'sidebar_collapsed',p.sidebar_collapsed) into v_profile
 from public.artists a left join public.tgg_creator_ui_preferences p on p.user_id=v_uid where a.id=v_artist_id;

 select jsonb_build_object('total',count(*)::int,'published',count(*) filter(where m.status='published')::int,'draft',count(*) filter(where m.status='draft')::int,'pending',count(*) filter(where m.status='pending')::int,'changes_requested',count(*) filter(where m.status='changes_requested')::int,'rejected',count(*) filter(where m.status='rejected')::int) into v_releases from public.mixtapes m where m.artist_id=v_artist_id;

 select jsonb_build_object('videos',(select count(*)::int from public.videos where artist_id=v_artist_id),'creative_projects',(select count(*)::int from public.tgg_creative_projects where user_id=v_uid),'studio_projects',(select count(*)::int from public.tgg_studio_projects where user_id=v_uid),'vault_assets',(select count(*)::int from public.tgg_media_vault_assets where user_id=v_uid),'pending_uploads',(select count(*)::int from public.tgg_pending_media_uploads where user_id=v_uid)) into v_media;

 select jsonb_build_object('fans',(select count(*)::int from public.tgg_fan_crm where artist_id=v_artist_id),'followers',(select count(*)::int from public.artist_follows where artist_id=v_artist_id),'unread_notifications',(select count(*)::int from public.notifications where recipient_id=v_uid and read_at is null),'active_campaigns',(select count(*)::int from public.tgg_campaigns where artist_id=v_artist_id and status not in ('completed','cancelled')),'active_conversations',(select count(*)::int from public.creator_conversations c join public.creator_conversation_members cm on cm.conversation_id=c.id where cm.user_id=v_uid)) into v_community;

 select jsonb_build_object('goals',(select count(*)::int from public.tgg_creator_goals where artist_id=v_artist_id and status not in ('completed','cancelled')),'opportunities',(select count(*)::int from public.tgg_opportunities where artist_id=v_artist_id and status not in ('closed','cancelled')),'smart_links',(select count(*)::int from public.tgg_smart_links where artist_id=v_artist_id and is_active),'analytics_events_30d',(select count(*)::int from public.creator_analytics_events where creator_id=v_artist_id and occurred_at>=now()-interval '30 days')) into v_growth;

 select jsonb_build_object('payments_count',(select count(*)::int from public.v58_payments where creator_id=v_uid),'payments_total',(select coalesce(sum(amount),0) from public.v58_payments where creator_id=v_uid and status in ('paid','succeeded','complete')),'payments_currency',(select max(currency) from public.v58_payments where creator_id=v_uid),'provider_pending',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('queued','pending','processing','retry')),'workflow_active',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid and status not in ('completed','failed','cancelled'))) into v_money;

 select jsonb_build_object('workflow_runs',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid),'provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid),'failed_provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('failed','dead_letter')),'release_checklist_open',(select count(*)::int from public.tgg_release_checklist_items where artist_id=v_artist_id and status not in ('complete','completed')),'launch_readiness',(select status from public.v3930_creator_os_runtime_readiness where id=true limit 1)) into v_operations;

 select coalesce(jsonb_agg(x order by priority desc,due_at nulls last,created_at desc),'[]'::jsonb) into v_actions from (
   select jsonb_build_object('id',q.id,'action_type',q.action_type,'title',q.title,'rationale',q.rationale,'priority',q.priority,'status',q.status,'due_at',q.due_at,'source_type',q.source_type,'source_id',q.source_id) x,q.priority,q.due_at,q.created_at
   from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.status in ('open','pending','ready','todo')
   order by q.priority desc,q.due_at nulls last,q.created_at desc limit 10
 ) s;

 return jsonb_build_object('ok',true,'generated_at',now(),'user_id',v_uid,'artist_id',v_artist_id,'has_artist_workspace',true,'artist',v_artist,'profile',v_profile,'releases',v_releases,'media',v_media,'community',v_community,'growth',v_growth,'money',v_money,'operations',v_operations,'next_actions',v_actions);
end;
$$;
revoke all on function public.tgg_creator_os_command_center() from public, anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

-- ============================================================
-- MIGRATION 20260905202332 v3943_creator_os_quarantine_aware_readiness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 v_uid uuid:=auth.uid(); v_artist_id uuid;
 v_artist jsonb; v_profile jsonb; v_releases jsonb; v_media jsonb; v_community jsonb; v_growth jsonb; v_money jsonb; v_operations jsonb; v_actions jsonb;
begin
 if v_uid is null then raise exception 'unauthorized'; end if;
 select id into v_artist_id from public.artists where user_id=v_uid limit 1;
 if v_artist_id is null then return jsonb_build_object('ok',true,'user_id',v_uid,'has_artist_workspace',false,'generated_at',now()); end if;

 select jsonb_build_object('id',a.id,'stage_name',a.stage_name,'bio_complete',coalesce(length(trim(a.bio))>0,false),'avatar_complete',coalesce(length(trim(a.avatar_url))>0,false),'stripe_connected',coalesce(a.stripe_onboarding_complete,false),'payouts_enabled',coalesce(a.payouts_enabled,false)) into v_artist from public.artists a where a.id=v_artist_id;
 select jsonb_build_object('profile_ready',(coalesce(length(trim(a.stage_name))>0,false) and coalesce(length(trim(a.bio))>0,false) and a.avatar_url is not null),'stripe_ready',coalesce(a.stripe_onboarding_complete,false),'default_workspace',p.default_workspace,'compact_mode',p.compact_mode,'sidebar_collapsed',p.sidebar_collapsed) into v_profile from public.artists a left join public.tgg_creator_ui_preferences p on p.user_id=v_uid where a.id=v_artist_id;
 select jsonb_build_object('total',count(*)::int,'published',count(*) filter(where m.status='published')::int,'draft',count(*) filter(where m.status='draft')::int,'pending',count(*) filter(where m.status='pending')::int,'changes_requested',count(*) filter(where m.status='changes_requested')::int,'rejected',count(*) filter(where m.status='rejected')::int) into v_releases from public.mixtapes m where m.artist_id=v_artist_id;
 select jsonb_build_object('videos',(select count(*)::int from public.videos where artist_id=v_artist_id),'creative_projects',(select count(*)::int from public.tgg_creative_projects where user_id=v_uid),'studio_projects',(select count(*)::int from public.tgg_studio_projects where user_id=v_uid),'vault_assets',(select count(*)::int from public.tgg_media_vault_assets where user_id=v_uid),'pending_uploads',(select count(*)::int from public.tgg_pending_media_uploads where user_id=v_uid)) into v_media;
 select jsonb_build_object('fans',(select count(*)::int from public.tgg_fan_crm where artist_id=v_artist_id),'followers',(select count(*)::int from public.artist_follows where artist_id=v_artist_id),'unread_notifications',(select count(*)::int from public.notifications where recipient_id=v_uid and read_at is null),'active_campaigns',(select count(*)::int from public.tgg_campaigns where artist_id=v_artist_id and status not in ('completed','cancelled')),'active_conversations',(select count(*)::int from public.creator_conversations c join public.creator_conversation_members cm on cm.conversation_id=c.id where cm.user_id=v_uid)) into v_community;
 select jsonb_build_object('goals',(select count(*)::int from public.tgg_creator_goals where artist_id=v_artist_id and status not in ('completed','cancelled')),'opportunities',(select count(*)::int from public.tgg_opportunities where artist_id=v_artist_id and status not in ('closed','cancelled')),'smart_links',(select count(*)::int from public.tgg_smart_links where artist_id=v_artist_id and is_active),'analytics_events_30d',(select count(*)::int from public.creator_analytics_events where creator_id=v_artist_id and occurred_at>=now()-interval '30 days')) into v_growth;
 select jsonb_build_object('payments_count',(select count(*)::int from public.v58_payments where creator_id=v_uid),'payments_total',(select coalesce(sum(amount),0) from public.v58_payments where creator_id=v_uid and status in ('paid','succeeded','complete')),'payments_currency',(select max(currency) from public.v58_payments where creator_id=v_uid),'provider_pending',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('queued','pending','processing','retry')),'workflow_active',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid and status not in ('completed','failed','cancelled'))) into v_money;
 select jsonb_build_object('workflow_runs',(select count(*)::int from public.v58_workflow_runs where creator_id=v_uid),'provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid),'failed_provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status in ('failed','dead_letter') and coalesce(last_error,'') not like 'stale claimed task from superseded workflow run%'),'quarantined_provider_tasks',(select count(*)::int from public.v58_provider_tasks where creator_id=v_uid and status='failed' and coalesce(last_error,'') like 'stale claimed task from superseded workflow run%'),'release_checklist_open',(select count(*)::int from public.tgg_release_checklist_items where artist_id=v_artist_id and status not in ('complete','completed')),'launch_readiness',(select status from public.v3930_creator_os_runtime_readiness where id=true limit 1)) into v_operations;
 select coalesce(jsonb_agg(x order by priority desc,due_at nulls last,created_at desc),'[]'::jsonb) into v_actions from (select jsonb_build_object('id',q.id,'action_type',q.action_type,'title',q.title,'rationale',q.rationale,'priority',q.priority,'status',q.status,'due_at',q.due_at,'source_type',q.source_type,'source_id',q.source_id) x,q.priority,q.due_at,q.created_at from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.status in ('open','pending','ready','todo') order by q.priority desc,q.due_at nulls last,q.created_at desc limit 10) s;
 return jsonb_build_object('ok',true,'generated_at',now(),'user_id',v_uid,'artist_id',v_artist_id,'has_artist_workspace',true,'artist',v_artist,'profile',v_profile,'releases',v_releases,'media',v_media,'community',v_community,'growth',v_growth,'money',v_money,'operations',v_operations,'next_actions',v_actions);
end;
$$;
revoke all on function public.tgg_creator_os_command_center() from public, anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;

-- ============================================================
-- MIGRATION 20260905203029 v3931_creator_os_command_center_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center_v1()
returns jsonb language sql stable security invoker set search_path = public
as $$
with me as (select auth.uid() as user_id),
artist as (
 select a.id,a.stage_name,a.avatar_url,a.bio,a.instagram,a.website,a.youtube,a.spotify,a.stripe_onboarding_complete,a.payouts_enabled
 from public.artists a join me on a.user_id=me.user_id limit 1
),
metrics as (
 select
 (select count(*) from public.mixtapes m join artist a on m.artist_id=a.id) as mixtapes,
 (select count(*) from public.tracks t join artist a on t.artist_id=a.id) as tracks,
 (select count(*) from public.videos v join artist a on v.artist_id=a.id) as videos,
 (select count(*) from public.products p join artist a on p.artist_id=a.id) as products,
 (select count(*) from public.tgg_creator_action_queue q join me on q.owner_user_id=me.user_id where q.status in ('open','pending','ready','in_progress')) as open_actions,
 (select count(*) from public.tgg_campaigns c join me on c.owner_user_id=me.user_id where c.status in ('draft','scheduled','active')) as campaigns,
 (select count(*) from public.tgg_creator_goals g join me on g.owner_user_id=me.user_id where g.status not in ('completed','cancelled')) as goals,
 (select count(*) from public.tgg_fan_crm f join me on f.creator_user_id=me.user_id) as fans,
 (select count(*) from public.tgg_opportunities o join artist a on o.artist_id=a.id where o.status in ('open','active')) as opportunities,
 (select count(*) from public.tgg_live_events l join artist a on l.artist_id=a.id where l.status in ('scheduled','live')) as live_events,
 (select count(*) from public.notifications n join me on n.recipient_id=me.user_id where n.read_at is null) as unread_notifications
),
completeness as (
 select case when not exists(select 1 from artist) then 0 else round(100.0 * (
 (case when nullif(trim(coalesce((select stage_name from artist),'')),'') is not null then 1 else 0 end)+
 (case when nullif(trim(coalesce((select bio from artist),'')),'') is not null then 1 else 0 end)+
 (case when nullif(trim(coalesce((select avatar_url from artist),'')),'') is not null then 1 else 0 end)+
 (case when nullif(trim(coalesce((select instagram from artist),'')),'') is not null then 1 else 0 end)+
 (case when nullif(trim(coalesce((select website from artist),'')),'') is not null then 1 else 0 end)+
 (case when coalesce((select stripe_onboarding_complete from artist),false) then 1 else 0 end)
 )/6.0) end as percent
)
select jsonb_build_object(
 'ok',true,'user_id',auth.uid(),
 'artist',coalesce((select to_jsonb(a) from artist a),'{}'::jsonb),
 'profile',jsonb_build_object('completeness_percent',(select percent from completeness)),
 'metrics',coalesce((select to_jsonb(m) from metrics m),'{}'::jsonb),
 'workspaces',jsonb_build_array(
  jsonb_build_object('key','dashboard','label','Dashboard','path','/p/creator-os.html'),
  jsonb_build_object('key','create','label','Create','path','/p/create-hub.html'),
  jsonb_build_object('key','releases','label','Releases','path','/p/music-hub.html'),
  jsonb_build_object('key','video-studio','label','Video Studio','path','/p/video-studio.html'),
  jsonb_build_object('key','commerce','label','Creator Store','path','/p/creator-store.html'),
  jsonb_build_object('key','messages','label','Messages','path','/p/messages.html'),
  jsonb_build_object('key','growth','label','Growth','path','/p/command-center.html'),
  jsonb_build_object('key','career','label','Career OS','path','/p/career-os.html'),
  jsonb_build_object('key','live','label','Live','path','/p/live.html'),
  jsonb_build_object('key','vault','label','Vault','path','/p/vault.html')
 ),
 'generated_at',now()
);
$$;
revoke all on function public.tgg_creator_os_command_center_v1() from public;
grant execute on function public.tgg_creator_os_command_center_v1() to authenticated;
insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description,updated_at)
values('creator_os_command_center_v1','rpc',1,'authenticated','Unified authenticated Creator OS command-center contract for dashboard metrics, profile readiness and workspace navigation.',now())
on conflict(contract_name) do update set contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260905204223 v3940_creator_os_command_center_snapshot
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_command_center()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', (select auth.uid()),
    'runtime', coalesce(
      (select jsonb_build_object('status',r.status,'scope',r.scope,'notes',r.notes,'checked_at',r.checked_at)
       from public.v3930_creator_os_runtime_readiness r where r.id=true),
      jsonb_build_object('status','UNKNOWN')
    ),
    'profile', jsonb_build_object(
      'profile_count',(select count(*) from public.profiles where id=(select auth.uid())),
      'artist_count',(select count(*) from public.artists where id=(select auth.uid()))
    ),
    'music', jsonb_build_object(
      'mixtapes',(select count(*) from public.mixtapes where artist_id=(select auth.uid())),
      'tracks',(select count(*) from public.tracks t join public.mixtapes m on m.id=t.mixtape_id where m.artist_id=(select auth.uid())),
      'release_status_history',(select count(*) from public.release_status_history where user_id=(select auth.uid()))
    ),
    'media', jsonb_build_object(
      'videos',(select count(*) from public.videos where artist_id=(select auth.uid())),
      'video_assets',(select count(*) from public.media_assets where owner_id=(select auth.uid())),
      'creative_projects',(select count(*) from public.tgg_creative_projects where user_id=(select auth.uid()))
    ),
    'community', jsonb_build_object(
      'followers',(select count(*) from public.artist_follows where artist_id=(select auth.uid())),
      'notifications',(select count(*) from public.notifications where recipient_id=(select auth.uid())),
      'conversations',(select count(*) from public.tgg_conversation_members where user_id=(select auth.uid())),
      'messages',(select count(*) from public.tgg_messages where sender_id=(select auth.uid()))
    ),
    'commerce', jsonb_build_object(
      'products',(select count(*) from public.merch_products where creator_id=(select auth.uid())),
      'support_transactions',(select count(*) from public.tgg_support_transactions where artist_id=(select auth.uid())),
      'live_events',(select count(*) from public.tgg_live_events where host_user_id=(select auth.uid()))
    ),
    'growth', jsonb_build_object(
      'campaigns',(select count(*) from public.tgg_campaigns where owner_user_id=(select auth.uid())),
      'goals',(select count(*) from public.tgg_creator_goals where owner_user_id=(select auth.uid())),
      'opportunities',(select count(*) from public.tgg_opportunities where created_by=(select auth.uid())),
      'smart_links',(select count(*) from public.tgg_smart_links where owner_user_id=(select auth.uid())),
      'action_queue',(select count(*) from public.tgg_creator_action_queue where owner_user_id=(select auth.uid()))
    ),
    'workspace',coalesce(
      (select jsonb_build_object('preferences',jsonb_build_object(
        'default_workspace',p.default_workspace,'compact_mode',p.compact_mode,
        'sidebar_collapsed',p.sidebar_collapsed,'reduce_motion',p.reduce_motion))
       from public.tgg_creator_ui_preferences p where p.user_id=(select auth.uid())),
      '{}'::jsonb
    ),
    'routes',coalesce(
      (select jsonb_agg(jsonb_build_object(
        'route_key',r.route_key,'title',r.title,'area',r.area,'path',r.path,
        'workspace_key',r.workspace_key,'icon',r.icon,'nav_group',r.nav_group,'nav_order',r.nav_order)
        order by r.nav_order,r.route_key)
       from public.tgg_site_routes r
       where r.is_active=true and r.access_level in ('public','authenticated','creator')),
      '[]'::jsonb
    )
  );
$$;
revoke all on function public.tgg_creator_os_command_center() from public;
revoke all on function public.tgg_creator_os_command_center() from anon;
grant execute on function public.tgg_creator_os_command_center() to authenticated;


-- ============================================================
-- MIGRATION 20260905204425 v3940_creator_os_command_center_contract_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_os_command_center()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', (select auth.uid()),
    'runtime', coalesce(
      (select jsonb_build_object('status',r.status,'scope',r.scope,'notes',r.notes,'checked_at',r.checked_at)
       from public.v3930_creator_os_runtime_readiness r where r.id=true),
      jsonb_build_object('status','UNKNOWN')
    ),
    'profile', jsonb_build_object(
      'profile_count',(select count(*) from public.profiles where id=(select auth.uid())),
      'artist_count',(select count(*) from public.artists where user_id=(select auth.uid()))
    ),
    'music', jsonb_build_object(
      'mixtapes',(select count(*) from public.mixtapes m join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid())),
      'tracks',(select count(*) from public.tracks t join public.mixtapes m on m.id=t.mixtape_id join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid())),
      'release_status_history',(select count(*) from public.release_status_history where user_id=(select auth.uid()))
    ),
    'media', jsonb_build_object(
      'videos',(select count(*) from public.videos v join public.artists a on a.id=v.artist_id where a.user_id=(select auth.uid())),
      'video_assets',(select count(*) from public.media_assets where owner_id=(select auth.uid())),
      'creative_projects',(select count(*) from public.tgg_creative_projects where user_id=(select auth.uid()))
    ),
    'community', jsonb_build_object(
      'followers',(select count(*) from public.artist_follows af join public.artists a on a.id=af.artist_id where a.user_id=(select auth.uid())),
      'notifications',(select count(*) from public.notifications where recipient_id=(select auth.uid())),
      'conversations',(select count(*) from public.tgg_conversation_members where user_id=(select auth.uid())),
      'messages',(select count(*) from public.tgg_messages where sender_id=(select auth.uid()))
    ),
    'commerce', jsonb_build_object(
      'products',(select count(*) from public.merch_products p join public.artists a on a.id=p.creator_id where a.user_id=(select auth.uid())),
      'support_transactions',(select count(*) from public.tgg_support_transactions st join public.artists a on a.id=st.artist_id where a.user_id=(select auth.uid())),
      'live_events',(select count(*) from public.tgg_live_events le join public.artists a on a.id=le.artist_id where a.user_id=(select auth.uid()))
    ),
    'growth', jsonb_build_object(
      'campaigns',(select count(*) from public.tgg_campaigns where owner_user_id=(select auth.uid())),
      'goals',(select count(*) from public.tgg_creator_goals where owner_user_id=(select auth.uid())),
      'opportunities',(select count(*) from public.tgg_opportunities where created_by=(select auth.uid())),
      'smart_links',(select count(*) from public.tgg_smart_links where owner_user_id=(select auth.uid())),
      'action_queue',(select count(*) from public.tgg_creator_action_queue where owner_user_id=(select auth.uid()))
    ),
    'workspace', coalesce(
      (select jsonb_build_object('preferences',jsonb_build_object(
        'default_workspace',p.default_workspace,'compact_mode',p.compact_mode,
        'sidebar_collapsed',p.sidebar_collapsed,'reduce_motion',p.reduce_motion))
       from public.tgg_creator_ui_preferences p where p.user_id=(select auth.uid())),
      '{}'::jsonb
    ),
    'routes', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'route_key',r.route_key,'title',r.title,'area',r.area,'path',r.path,
        'workspace_key',r.workspace_key,'icon',r.icon,'nav_group',r.nav_group,'nav_order',r.nav_order)
        order by r.nav_order,r.route_key)
       from public.tgg_site_routes r
       where r.is_active=true and r.access_level in ('public','authenticated','creator')),
      '[]'::jsonb
    )
  );
$function$;

-- ============================================================
-- MIGRATION 20260905214947 harden_v58_cron_worker_key_search_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_verify_cron_worker_key(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expected text;
begin
  select decrypted_secret into expected
  from vault.decrypted_secrets
  where name = 'v58_orchestrator_worker_key';
  return expected is not null and p_key is not null and p_key = expected;
end;
$function$;

-- ============================================================
-- MIGRATION 20260905215032 harden_conversation_trigger_security_definers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_add_conversation_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.tgg_conversation_members(conversation_id,user_id,role,last_read_at)
  values(new.id,new.created_by,'owner',now())
  on conflict (conversation_id,user_id) do nothing;
  return new;
end;
$function$;

create or replace function public.tgg_touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.tgg_conversations
     set last_message_at = new.created_at,
         updated_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$function$;

-- ============================================================
-- MIGRATION 20260905215620 fix_cron_slo_running_status_classification
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_operational_record_cron_slo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_success bigint := 0;
  v_failure bigint := 0;
  v_last_end timestamptz;
  v_health text;
begin
  select coalesce(sum(case when status='succeeded' then 1 else 0 end),0),
         coalesce(sum(case when status not in ('succeeded','running') then 1 else 0 end),0),
         max(end_time)
    into v_success, v_failure, v_last_end
  from cron.job_run_details
  where start_time > now()-interval '5 minutes' and jobid in (6,8);

  v_health := case
    when v_last_end is null then 'unknown'
    when v_failure > 0 then 'degraded'
    when v_last_end < now()-interval '3 minutes' then 'degraded'
    else 'healthy'
  end;

  insert into public.tgg_operational_slo_snapshots(
    subsystem,health,availability_pct,success_count,failure_count,metadata
  )
  values (
    'pg_cron_runtime',v_health,
    case when v_success+v_failure=0 then null else round(100.0*v_success/(v_success+v_failure),3) end,
    v_success,v_failure,
    jsonb_build_object('tracked_jobs',jsonb_build_array(6,8),'last_run_end',v_last_end)
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260905223024 fix_operational_dependency_running_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_operational_dependency_check()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s jsonb;
  d bigint;
  f bigint;
  st text;
  fp text;
begin
  s := private.tgg_operational_control_snapshot();
  select count(*) into d from cron.job where active;
  select count(*) into f
  from cron.job_run_details
  where start_time > now() - interval '15 minutes'
    and status not in ('succeeded','running');
  st := case
    when f = 0 and s->>'state' = 'healthy' then 'pass'
    when f > 0 then 'warn'
    else 'unknown'
  end;
  fp := md5(s::text || d::text || f::text);
  insert into public.tgg_operational_dependency_checks
    (check_key,state,dependency_count,failed_count,details,fingerprint)
  values
    ('active-runtime-dependencies',st,d,f,
     jsonb_build_object('control',s,'active_cron_jobs',d,'recent_failed_runs',f),fp)
  on conflict(check_key) do update set
    checked_at=now(),
    state=excluded.state,
    dependency_count=excluded.dependency_count,
    failed_count=excluded.failed_count,
    details=excluded.details,
    fingerprint=excluded.fingerprint;
end;
$function$;

-- ============================================================
-- MIGRATION 20260905223242 gate_v58_orchestrator_cron_when_work_exists
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.alter_job(8, command := $$select case when exists (select 1 from public.v58_workflow_runs where workflow_key='release_launch' and workflow_version=58 and release_id='0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8' and status in ('pending','running')) then net.http_post(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v16?nonce=v58-once-9f2c7a41e6b8d3', headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='v58_orchestrator_worker_key')), body := jsonb_build_object('source','pg_cron','time',now()), timeout_milliseconds := 5000) else null end$$);

-- ============================================================
-- MIGRATION 20260905223412 decouple_launch_control_from_direct_orchestrator_http
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_preflight jsonb;
  v_distribution_ok boolean;
  v_promotion_ok boolean;
  v_stripe_ok boolean;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  v_preflight := public.v58_launch_control_preflight(trim(p_release_id));
  if coalesce((v_preflight->>'ok')::boolean,false)=false then raise exception 'release_preflight_failed'; end if;
  if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=trim(p_release_id) and a.user_id=v_uid) then raise exception 'release_not_owned'; end if;
  v_distribution_ok := exists(select 1 from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null);
  v_promotion_ok := exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true);
  v_stripe_ok := exists(select 1 from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.stripe_price_id),'') is not null and nullif(trim(c.success_url),'') is not null and nullif(trim(c.cancel_url),'') is not null);
  if not v_distribution_ok then raise exception 'distribution_endpoint_required'; end if;
  if not v_promotion_ok then raise exception 'promotion_approval_required'; end if;
  if not v_stripe_ok then raise exception 'stripe_checkout_configuration_required'; end if;
  select id into v_run_id from public.v58_workflow_runs where creator_id=v_uid and release_id=trim(p_release_id) and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running') order by created_at desc limit 1;
  if v_run_id is null then v_run_id := public.v58_create_release_launch_workflow(trim(p_release_id)); end if;
  update public.v58_workflow_runs set status='running',started_at=coalesce(started_at,now()),current_step='validate_release',updated_at=now() where id=v_run_id;
  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');
  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors,'orchestrator_triggered',false,'queued_for_orchestrator',true);
end;
$function$;

-- ============================================================
-- MIGRATION 20260905223734 generalize_v58_orchestrator_cron_dispatch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.alter_job(8, command := $$select net.http_post(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v16?nonce=v58-once-9f2c7a41e6b8d3', headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='v58_orchestrator_worker_key')), body := jsonb_build_object('source','pg_cron','time',now(),'release_id',r.release_id,'mode','production'), timeout_milliseconds := 5000) from (select distinct release_id from public.v58_workflow_runs where workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')) r;$$);

-- ============================================================
-- MIGRATION 20260905223805 route_v58_orchestrator_cron_to_release_aware_v15
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.alter_job(8, command := $$select net.http_post(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-workflow-orchestrator-v15', headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='v58_orchestrator_worker_key'),'X-V58-Worker-Key',(select decrypted_secret from vault.decrypted_secrets where name='v58_orchestrator_worker_key')), body := jsonb_build_object('source','pg_cron','time',now(),'release_id',r.release_id,'mode','production'), timeout_milliseconds := 5000) from (select distinct release_id from public.v58_workflow_runs where workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')) r;$$);

