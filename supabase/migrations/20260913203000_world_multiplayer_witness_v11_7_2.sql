-- TGG World V11.7.2
-- Server-observed two-real-user movement witness.
-- Additive only. Do not treat this migration as production evidence until deployed
-- and exercised by two distinct authenticated users in one live instance.

create table if not exists private.tgg_world_v11_7_movement_witness (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.world_instances(id) on delete cascade,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  source_presence_id uuid not null references public.world_presence(id) on delete cascade,
  source_position jsonb not null default '{}'::jsonb,
  source_activity jsonb not null default '{}'::jsonb,
  emitted_at timestamptz not null default now(),
  target_ack_at timestamptz,
  target_ack_position jsonb,
  target_presence_seen_at timestamptz,
  status text not null default 'pending' check (status in ('pending','acknowledged','expired')),
  constraint tgg_world_v11_7_movement_witness_distinct_users check (source_user_id <> target_user_id)
);

create index if not exists tgg_world_v11_7_movement_witness_instance_time_idx
  on private.tgg_world_v11_7_movement_witness(instance_id, emitted_at desc);

create index if not exists tgg_world_v11_7_movement_witness_target_time_idx
  on private.tgg_world_v11_7_movement_witness(target_user_id, emitted_at desc);

create index if not exists tgg_world_v11_7_movement_witness_direction_idx
  on private.tgg_world_v11_7_movement_witness(instance_id, source_user_id, target_user_id, emitted_at desc);

comment on table private.tgg_world_v11_7_movement_witness is
  'Server-created movement fanout evidence. Rows originate from authoritative world_presence position changes and can only be acknowledged by the authenticated target user who was present in the same live instance.';

create or replace function private.tgg_world_v11_7_emit_movement_witness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_topic text;
  v_target record;
begin
  if new.left_at is not null
     or new.presence_state = 'offline'
     or new.instance_id is null
     or new.position is not distinct from old.position then
    return new;
  end if;

  for v_target in
    select p.user_id
    from public.world_presence p
    join public.world_instances i on i.id = p.instance_id
      and i.status in ('active','draining')
    join public.world_characters c on c.id = p.character_id
      and c.user_id = p.user_id
      and c.character_status = 'active'
    join auth.users u on u.id = p.user_id
    where p.instance_id = new.instance_id
      and p.user_id <> new.user_id
      and p.left_at is null
      and p.presence_state <> 'offline'
      and p.heartbeat_at > now() - interval '2 minutes'
  loop
    insert into private.tgg_world_v11_7_movement_witness(
      instance_id,
      source_user_id,
      target_user_id,
      source_presence_id,
      source_position,
      source_activity,
      emitted_at,
      status
    ) values (
      new.instance_id,
      new.user_id,
      v_target.user_id,
      new.id,
      coalesce(new.position,'{}'::jsonb),
      coalesce(new.activity,'{}'::jsonb),
      now(),
      'pending'
    ) returning id into v_event_id;

    v_topic := 'world:' || new.instance_id::text || ':moves';

    begin
      perform realtime.send(
        jsonb_build_object(
          'movement_witness_id', v_event_id,
          'instance_id', new.instance_id,
          'source_presence_id', new.id,
          'source_position', coalesce(new.position,'{}'::jsonb),
          'source_activity', coalesce(new.activity,'{}'::jsonb),
          'source_emitted_at', now(),
          'target_ack_required', true
        ),
        'server_movement_witness',
        v_topic,
        true
      );
    exception when others then
      -- Movement proof must never interrupt the authoritative heartbeat/write path.
      null;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function private.tgg_world_v11_7_emit_movement_witness() from public, anon, authenticated;

 drop trigger if exists tgg_world_v11_7_emit_movement_witness_trigger on public.world_presence;
create trigger tgg_world_v11_7_emit_movement_witness_trigger
after update of position on public.world_presence
for each row
when (
  new.position is distinct from old.position
  and new.left_at is null
)
execute function private.tgg_world_v11_7_emit_movement_witness();

create or replace function public.tgg_world_ack_movement_witness(p_movement_witness_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event private.tgg_world_v11_7_movement_witness%rowtype;
  v_presence public.world_presence%rowtype;
  v_age_seconds numeric;
  v_matrix_id uuid;
  v_forward boolean := false;
  v_reverse boolean := false;
  v_distinct_users integer := 0;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select * into v_event
  from private.tgg_world_v11_7_movement_witness
  where id = p_movement_witness_id
    and target_user_id = v_user
  for update;

  if v_event.id is null then
    raise exception 'movement witness not found or target mismatch';
  end if;

  v_age_seconds := extract(epoch from (now() - v_event.emitted_at));
  if v_age_seconds > 120 then
    update private.tgg_world_v11_7_movement_witness
    set status = 'expired'
    where id = v_event.id;
    raise exception 'movement witness expired';
  end if;

  select * into v_presence
  from public.world_presence
  where user_id = v_user
    and instance_id = v_event.instance_id
    and left_at is null
    and presence_state <> 'offline'
    and heartbeat_at > now() - interval '2 minutes'
  order by heartbeat_at desc
  limit 1;

  if v_presence.id is null then
    raise exception 'fresh same-instance target presence required';
  end if;

  update private.tgg_world_v11_7_movement_witness
  set target_ack_at = now(),
      target_ack_position = coalesce(v_presence.position,'{}'::jsonb),
      target_presence_seen_at = v_presence.heartbeat_at,
      status = 'acknowledged'
  where id = v_event.id;

  select count(distinct p.user_id)::integer into v_distinct_users
  from public.world_presence p
  join auth.users u on u.id = p.user_id
  join public.world_characters c on c.id = p.character_id
    and c.user_id = p.user_id
    and c.character_status = 'active'
  where p.instance_id = v_event.instance_id
    and p.left_at is null
    and p.presence_state <> 'offline'
    and p.heartbeat_at > now() - interval '2 minutes';

  select exists(
    select 1 from private.tgg_world_v11_7_movement_witness e
    where e.instance_id = v_event.instance_id
      and e.source_user_id = v_event.source_user_id
      and e.target_user_id = v_event.target_user_id
      and e.status = 'acknowledged'
      and e.target_ack_at is not null
      and e.target_ack_at > now() - interval '2 minutes'
  ) into v_forward;

  select exists(
    select 1 from private.tgg_world_v11_7_movement_witness e
    where e.instance_id = v_event.instance_id
      and e.source_user_id = v_event.target_user_id
      and e.target_user_id = v_event.source_user_id
      and e.status = 'acknowledged'
      and e.target_ack_at is not null
      and e.target_ack_at > now() - interval '2 minutes'
  ) into v_reverse;

  if v_distinct_users >= 2 and v_forward and v_reverse then
    select id into v_matrix_id
    from public.tgg_runtime_qa_contract_matrix
    where contract_key = 'world_multiplayer_same_instance_two_real_users_v11_7'
    limit 1;

    if v_matrix_id is not null then
      update public.tgg_runtime_qa_contract_matrix
      set status = 'passed',
          metadata = metadata || jsonb_build_object(
            'version','WORLD-V11.7.2-REAL-MULTIPLAYER-MOVEMENT-WITNESS',
            'distinct_authenticated_users',v_distinct_users,
            'same_instance',true,
            'fresh_presence_window_seconds',120,
            'forward_movement_acknowledged',v_forward,
            'reverse_movement_acknowledged',v_reverse,
            'synthetic_presence_used',false,
            'client_presence_mutation_allowed',false,
            'movement_source','authoritative_public.world_presence',
            'movement_delivery','server_broadcast_to_private_world_instance_topic'
          ),
          updated_at = now()
      where id = v_matrix_id;

      if not exists(
        select 1 from public.tgg_runtime_qa_contract_evidence e
        where e.matrix_id = v_matrix_id
          and e.status = 'passed'
          and e.evidence_source = 'world_multiplayer_movement_witness_v11_7_2'
      ) then
        insert into public.tgg_runtime_qa_contract_evidence(
          matrix_id,
          evidence_source,
          evidence_type,
          status,
          source_ref,
          evidence,
          captured_at,
          expires_at
        ) values (
          v_matrix_id,
          'world_multiplayer_movement_witness_v11_7_2',
          'server_observed_presence_witness',
          'passed',
          'WORLD-V11.7.2',
          jsonb_build_object(
            'distinct_authenticated_users',v_distinct_users,
            'same_instance',true,
            'freshness_seconds',120,
            'forward_direction',jsonb_build_object('source_user_id',v_event.source_user_id,'target_user_id',v_event.target_user_id,'acknowledged',v_forward),
            'reverse_direction',jsonb_build_object('source_user_id',v_event.target_user_id,'target_user_id',v_event.source_user_id,'acknowledged',v_reverse),
            'synthetic_presence_used',false,
            'client_presence_mutation_allowed',false,
            'movement_source','authoritative_public.world_presence',
            'movement_delivery','server_broadcast_to_private_world_instance_topic'
          ),
          now(),
          null
        );
      end if;

      insert into private.tgg_world_multiplayer_witness(
        witness_key,status,required_players,peak_population,last_current_population,
        observed_instance_id,first_passed_at,last_observed_at,last_checked_at,evidence,updated_at
      ) values (
        'same_instance_two_real_users',
        'passed',
        2,
        v_distinct_users,
        v_distinct_users,
        v_event.instance_id,
        now(),
        now(),
        now(),
        jsonb_build_object(
          'source','server_observed_movement_ack',
          'version','WORLD-V11.7.2-REAL-MULTIPLAYER-MOVEMENT-WITNESS',
          'distinct_authenticated_users',v_distinct_users,
          'freshness_seconds',120,
          'same_instance',true,
          'forward_movement_acknowledged',v_forward,
          'reverse_movement_acknowledged',v_reverse,
          'synthetic_presence_used',false,
          'client_presence_mutation_allowed',false,
          'movement_source','authoritative_public.world_presence',
          'movement_delivery','server_broadcast_to_private_world_instance_topic'
        ),
        now()
      )
      on conflict(witness_key) do update
      set status='passed',
          required_players=2,
          peak_population=greatest(private.tgg_world_multiplayer_witness.peak_population,excluded.peak_population),
          last_current_population=excluded.last_current_population,
          observed_instance_id=excluded.observed_instance_id,
          first_passed_at=coalesce(private.tgg_world_multiplayer_witness.first_passed_at,excluded.first_passed_at),
          last_observed_at=excluded.last_observed_at,
          last_checked_at=excluded.last_checked_at,
          evidence=excluded.evidence,
          updated_at=now();
    end if;
  end if;

  return jsonb_build_object(
    'status','acknowledged',
    'movement_witness_id',v_event.id,
    'instance_id',v_event.instance_id,
    'source_user_id',v_event.source_user_id,
    'target_user_id',v_event.target_user_id,
    'source_emitted_at',v_event.emitted_at,
    'target_ack_at',now(),
    'forward_direction',v_forward,
    'reverse_direction',v_reverse,
    'distinct_authenticated_users',v_distinct_users,
    'contract_passed',v_distinct_users >= 2 and v_forward and v_reverse
  );
end;
$$;

revoke all on function public.tgg_world_ack_movement_witness(uuid) from public, anon;
grant execute on function public.tgg_world_ack_movement_witness(uuid) to authenticated;

comment on function public.tgg_world_ack_movement_witness(uuid) is
  'Acknowledges a server-created movement witness only when the authenticated target user is currently present in the same live instance with fresh heartbeat. Two opposite acknowledged directions within the freshness window satisfy the V11.7.2 movement witness contract.';
