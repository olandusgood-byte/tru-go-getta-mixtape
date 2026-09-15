-- TGG World Alpha live-only catch-up: RC8 + RC9
-- Source: verified live Supabase state on 2026-09-08.
-- Purpose: capture current schema in source control without altering production.
-- Safety: virtual currency only; no Stripe/cash-out; server-controlled writes.

create table if not exists public.tgg_world_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  character_id uuid not null unique references public.world_characters(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  currency_key text not null default 'tgg_credits' check (currency_key='tgg_credits'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_world_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  entry_type text not null check (entry_type in ('starter_grant','purchase_debit','adjustment')),
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  reference_type text,
  reference_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists tgg_world_wallet_ledger_reference_uq
on public.tgg_world_wallet_ledger(user_id,reference_type,reference_key)
where reference_type is not null and reference_key is not null;

create table if not exists public.tgg_world_shop_catalog (
  item_key text primary key,
  display_name text not null,
  category text not null check (category in ('outfit','accessory','vehicle_cosmetic','fitness_gear','home_decor')),
  price bigint not null check (price >= 0),
  equippable boolean not null default false,
  slot_key text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_world_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  item_key text not null references public.tgg_world_shop_catalog(item_key) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,item_key)
);

create table if not exists public.tgg_world_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  idempotency_key text not null,
  item_key text not null references public.tgg_world_shop_catalog(item_key) on delete restrict,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 20),
  total_cost bigint not null check (total_cost >= 0),
  status text not null check (status in ('completed','rejected')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);

create table if not exists public.tgg_world_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_character_id uuid not null references public.world_characters(id) on delete cascade,
  vehicle_key text not null,
  display_name text not null,
  vehicle_status text not null default 'parked' check (vehicle_status in ('parked','active')),
  current_instance_id uuid references public.tgg_world_instances(id) on delete set null,
  music_state jsonb not null default '{"mode":"shared","track":null,"position_ms":0}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_character_id, vehicle_key)
);

create table if not exists public.tgg_world_vehicle_passengers (
  vehicle_id uuid not null references public.tgg_world_vehicles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  seat_key text not null default 'passenger',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key(vehicle_id,user_id)
);

create table if not exists public.tgg_world_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  workout_type text not null check (workout_type in ('gym','run_outside','cardio','strength')),
  workout_status text not null default 'active' check (workout_status in ('active','complete','canceled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  reward_applied boolean not null default false,
  reward_detail jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.tgg_world_crews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_character_id uuid not null references public.world_characters(id) on delete cascade,
  crew_name text not null,
  crew_key text not null unique,
  crew_status text not null default 'active' check (crew_status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_world_crew_members (
  crew_id uuid not null references public.tgg_world_crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  crew_role text not null default 'member' check (crew_role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key(crew_id,user_id)
);

create table if not exists public.tgg_world_crew_activity (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.tgg_world_crews(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tgg_world_wallets enable row level security;
alter table public.tgg_world_wallet_ledger enable row level security;
alter table public.tgg_world_shop_catalog enable row level security;
alter table public.tgg_world_inventory enable row level security;
alter table public.tgg_world_purchase_requests enable row level security;
alter table public.tgg_world_vehicles enable row level security;
alter table public.tgg_world_vehicle_passengers enable row level security;
alter table public.tgg_world_workouts enable row level security;
alter table public.tgg_world_crews enable row level security;
alter table public.tgg_world_crew_members enable row level security;
alter table public.tgg_world_crew_activity enable row level security;

drop policy if exists tgg_world_wallets_read on public.tgg_world_wallets;
create policy tgg_world_wallets_read on public.tgg_world_wallets for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists tgg_world_wallet_ledger_read on public.tgg_world_wallet_ledger;
create policy tgg_world_wallet_ledger_read on public.tgg_world_wallet_ledger for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists tgg_world_shop_catalog_read on public.tgg_world_shop_catalog;
create policy tgg_world_shop_catalog_read on public.tgg_world_shop_catalog for select to authenticated
using (enabled=true);

drop policy if exists tgg_world_inventory_read on public.tgg_world_inventory;
create policy tgg_world_inventory_read on public.tgg_world_inventory for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists tgg_world_purchase_requests_read on public.tgg_world_purchase_requests;
create policy tgg_world_purchase_requests_read on public.tgg_world_purchase_requests for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists tgg_world_workouts_read on public.tgg_world_workouts;
create policy tgg_world_workouts_read on public.tgg_world_workouts for select to authenticated
using (user_id=(select auth.uid()));

revoke insert,update,delete on public.tgg_world_wallets from anon,authenticated;
revoke insert,update,delete on public.tgg_world_wallet_ledger from anon,authenticated;
revoke insert,update,delete on public.tgg_world_shop_catalog from anon,authenticated;
revoke insert,update,delete on public.tgg_world_inventory from anon,authenticated;
revoke insert,update,delete on public.tgg_world_purchase_requests from anon,authenticated;
revoke insert,update,delete on public.tgg_world_vehicles from anon,authenticated;
revoke insert,update,delete on public.tgg_world_vehicle_passengers from anon,authenticated;
revoke insert,update,delete on public.tgg_world_workouts from anon,authenticated;
revoke insert,update,delete on public.tgg_world_crews from anon,authenticated;
revoke insert,update,delete on public.tgg_world_crew_members from anon,authenticated;
revoke insert,update,delete on public.tgg_world_crew_activity from anon,authenticated;

grant select on public.tgg_world_wallets,public.tgg_world_wallet_ledger,
public.tgg_world_shop_catalog,public.tgg_world_inventory,public.tgg_world_purchase_requests,
public.tgg_world_vehicles,public.tgg_world_vehicle_passengers,public.tgg_world_workouts,
public.tgg_world_crews,public.tgg_world_crew_members,public.tgg_world_crew_activity
to authenticated;

insert into public.tgg_world_shop_catalog(item_key,display_name,category,price,equippable,slot_key,metadata)
values
('starter-black-hoodie','TGG Black Hoodie','outfit',120,true,'outfit','{"rarity":"common"}'),
('red-chain','Red Chain','accessory',90,true,'accessory','{"rarity":"common"}'),
('street-rims','Street Rims','vehicle_cosmetic',160,true,'vehicle_cosmetic','{"rarity":"common"}'),
('runner-pack','Runner Pack','fitness_gear',80,true,'fitness_gear','{"rarity":"common"}'),
('studio-neon','Studio Neon Sign','home_decor',140,true,'home_decor','{"rarity":"common"}')
on conflict(item_key) do update
set display_name=excluded.display_name,category=excluded.category,price=excluded.price,
    equippable=excluded.equippable,slot_key=excluded.slot_key,enabled=true,
    metadata=excluded.metadata,updated_at=now();

create or replace function public.tgg_world_can_read_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.tgg_world_vehicles v
    where v.id=p_vehicle_id
      and (
        v.owner_user_id=auth.uid()
        or exists(
          select 1 from public.tgg_world_vehicle_passengers p
          where p.vehicle_id=v.id and p.user_id=auth.uid() and p.left_at is null
        )
      )
  )
$$;

create or replace function public.tgg_world_can_read_crew(p_crew_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.tgg_world_crew_members m
    where m.crew_id=p_crew_id and m.user_id=auth.uid() and m.left_at is null
  )
$$;

drop policy if exists tgg_world_vehicles_read on public.tgg_world_vehicles;
create policy tgg_world_vehicles_read on public.tgg_world_vehicles
for select to authenticated using (public.tgg_world_can_read_vehicle(id));

drop policy if exists tgg_world_vehicle_passengers_read on public.tgg_world_vehicle_passengers;
create policy tgg_world_vehicle_passengers_read on public.tgg_world_vehicle_passengers
for select to authenticated using (public.tgg_world_can_read_vehicle(vehicle_id));

drop policy if exists tgg_world_crews_read on public.tgg_world_crews;
create policy tgg_world_crews_read on public.tgg_world_crews
for select to authenticated using (public.tgg_world_can_read_crew(id));

drop policy if exists tgg_world_crew_members_read on public.tgg_world_crew_members;
create policy tgg_world_crew_members_read on public.tgg_world_crew_members
for select to authenticated using (public.tgg_world_can_read_crew(crew_id));

drop policy if exists tgg_world_crew_activity_read on public.tgg_world_crew_activity;
create policy tgg_world_crew_activity_read on public.tgg_world_crew_activity
for select to authenticated using (public.tgg_world_can_read_crew(crew_id));

create or replace function public.tgg_world_wallet_ensure()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_wallet public.tgg_world_wallets%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_char from public.world_characters
  where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  insert into public.tgg_world_wallets(user_id,character_id,balance)
  values(v_uid,v_char.id,500)
  on conflict(user_id) do nothing;

  select * into v_wallet from public.tgg_world_wallets where user_id=v_uid;

  insert into public.tgg_world_wallet_ledger(
    user_id,character_id,entry_type,amount,balance_after,reference_type,reference_key,metadata
  )
  values(
    v_uid,v_char.id,'starter_grant',500,v_wallet.balance,'wallet_init','starter',
    jsonb_build_object('virtual_currency',true,'real_money',false)
  )
  on conflict do nothing;

  return jsonb_build_object('ok',true,'balance',v_wallet.balance,'currency','tgg_credits',
    'virtual_currency',true,'real_money',false);
end $$;

create or replace function public.tgg_world_purchase(
  p_item_key text,
  p_quantity integer default 1,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_wallet public.tgg_world_wallets%rowtype;
  v_item public.tgg_world_shop_catalog%rowtype;
  v_existing public.tgg_world_purchase_requests%rowtype;
  v_key text := trim(coalesce(p_idempotency_key,''));
  v_qty integer := coalesce(p_quantity,1);
  v_cost bigint;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_qty < 1 or v_qty > 20 then raise exception 'invalid_quantity'; end if;
  if length(v_key) < 8 or length(v_key) > 120 then raise exception 'idempotency_key_required'; end if;

  select * into v_char from public.world_characters
  where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  select * into v_existing from public.tgg_world_purchase_requests
  where user_id=v_uid and idempotency_key=v_key;
  if found then
    if v_existing.item_key<>p_item_key or v_existing.quantity<>v_qty then
      raise exception 'idempotency_key_reuse_mismatch';
    end if;
    return v_existing.result || jsonb_build_object('replayed',true);
  end if;

  select * into v_item from public.tgg_world_shop_catalog
  where item_key=p_item_key and enabled=true;
  if not found then raise exception 'item_not_found'; end if;

  perform public.tgg_world_wallet_ensure();

  select * into v_wallet from public.tgg_world_wallets
  where user_id=v_uid for update;

  v_cost := v_item.price * v_qty;
  if v_wallet.balance < v_cost then
    v_result := jsonb_build_object(
      'ok',false,'reason','insufficient_virtual_credits',
      'balance',v_wallet.balance,'total_cost',v_cost,
      'currency','tgg_credits','virtual_currency',true,'real_money',false
    );
    insert into public.tgg_world_purchase_requests(
      user_id,character_id,idempotency_key,item_key,quantity,total_cost,status,result
    )
    values(v_uid,v_char.id,v_key,p_item_key,v_qty,v_cost,'rejected',v_result);
    return v_result;
  end if;

  update public.tgg_world_wallets
  set balance=balance-v_cost,updated_at=now()
  where user_id=v_uid
  returning * into v_wallet;

  insert into public.tgg_world_wallet_ledger(
    user_id,character_id,entry_type,amount,balance_after,reference_type,reference_key,metadata
  )
  values(
    v_uid,v_char.id,'purchase_debit',-v_cost,v_wallet.balance,'purchase',v_key,
    jsonb_build_object('item_key',p_item_key,'quantity',v_qty,'unit_price',v_item.price,'virtual_currency',true,'real_money',false)
  );

  insert into public.tgg_world_inventory(user_id,character_id,item_key,quantity,equipped)
  values(v_uid,v_char.id,p_item_key,v_qty,false)
  on conflict(user_id,item_key) do update
  set quantity=public.tgg_world_inventory.quantity+excluded.quantity,updated_at=now();

  v_result := jsonb_build_object(
    'ok',true,'item_key',p_item_key,'quantity',v_qty,'total_cost',v_cost,
    'balance',v_wallet.balance,'currency','tgg_credits','virtual_currency',true,'real_money',false
  );

  insert into public.tgg_world_purchase_requests(
    user_id,character_id,idempotency_key,item_key,quantity,total_cost,status,result
  )
  values(v_uid,v_char.id,v_key,p_item_key,v_qty,v_cost,'completed',v_result);

  return v_result || jsonb_build_object('replayed',false);
exception
  when unique_violation then
    select * into v_existing from public.tgg_world_purchase_requests
    where user_id=v_uid and idempotency_key=v_key;
    if found then return v_existing.result || jsonb_build_object('replayed',true); end if;
    raise;
end $$;

create or replace function public.tgg_world_inventory_equip(p_item_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.tgg_world_shop_catalog%rowtype;
  v_inv public.tgg_world_inventory%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_item from public.tgg_world_shop_catalog where item_key=p_item_key and enabled=true;
  if not found then raise exception 'item_not_found'; end if;
  if not v_item.equippable or v_item.slot_key is null then raise exception 'item_not_equippable'; end if;

  select * into v_inv from public.tgg_world_inventory
  where user_id=v_uid and item_key=p_item_key and quantity>0;
  if not found then raise exception 'item_not_owned'; end if;

  update public.tgg_world_inventory i
  set equipped=false,updated_at=now()
  from public.tgg_world_shop_catalog c
  where i.user_id=v_uid and i.item_key=c.item_key
    and c.slot_key=v_item.slot_key and i.equipped=true;

  update public.tgg_world_inventory
  set equipped=true,updated_at=now()
  where user_id=v_uid and item_key=p_item_key;

  return jsonb_build_object('ok',true,'item_key',p_item_key,'slot_key',v_item.slot_key,
    'equipped',true,'virtual_item',true,'real_money',false);
end $$;

create or replace function public.tgg_world_economy_bundle()
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  return jsonb_build_object(
    'wallet',(select to_jsonb(w) from public.tgg_world_wallets w where w.user_id=v_uid),
    'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.price,c.item_key) from public.tgg_world_shop_catalog c where c.enabled=true),'[]'::jsonb),
    'inventory',coalesce((select jsonb_agg(to_jsonb(i) order by i.acquired_at) from public.tgg_world_inventory i where i.user_id=v_uid),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from public.tgg_world_wallet_ledger where user_id=v_uid order by created_at desc limit 50) l),'[]'::jsonb),
    'virtual_currency',true,'real_money',false
  );
end $$;

create or replace function public.tgg_world_wallet_reconcile()
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_ledger bigint;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select balance into v_balance from public.tgg_world_wallets where user_id=v_uid;
  select coalesce(sum(amount),0) into v_ledger from public.tgg_world_wallet_ledger where user_id=v_uid;
  return jsonb_build_object('ok',coalesce(v_balance,0)=v_ledger,
    'wallet_balance',coalesce(v_balance,0),'ledger_total',v_ledger,
    'currency','tgg_credits','virtual_currency',true,'real_money',false);
end $$;

create or replace function public.tgg_world_vehicle_spawn(
  p_vehicle_key text default 'starter-ride',
  p_display_name text default 'TGG Starter Ride'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_presence public.tgg_world_presence%rowtype;
  v_vehicle public.tgg_world_vehicles%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_char from public.world_characters
   where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;
  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;

  insert into public.tgg_world_vehicles
    (owner_user_id,owner_character_id,vehicle_key,display_name,vehicle_status,current_instance_id)
  values
    (v_uid,v_char.id,coalesce(nullif(trim(p_vehicle_key),''),'starter-ride'),
     coalesce(nullif(trim(p_display_name),''),'TGG Starter Ride'),
     'active',v_presence.instance_id)
  on conflict(owner_character_id,vehicle_key) do update
    set vehicle_status='active',current_instance_id=excluded.current_instance_id,updated_at=now()
  returning * into v_vehicle;

  insert into public.tgg_world_vehicle_passengers(vehicle_id,user_id,character_id,seat_key,left_at,last_seen_at)
  values(v_vehicle.id,v_uid,v_char.id,'driver',null,now())
  on conflict(vehicle_id,user_id) do update
    set character_id=excluded.character_id,seat_key='driver',left_at=null,last_seen_at=now();

  return jsonb_build_object('ok',true,'vehicle_id',v_vehicle.id,'vehicle_key',v_vehicle.vehicle_key,
    'display_name',v_vehicle.display_name,'seat','driver','instance_id',v_vehicle.current_instance_id,'real_money',false);
end $$;

create or replace function public.tgg_world_vehicle_join(p_vehicle_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_presence public.tgg_world_presence%rowtype;
  v_vehicle public.tgg_world_vehicles%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_char from public.world_characters where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;
  select * into v_vehicle from public.tgg_world_vehicles where id=p_vehicle_id and vehicle_status='active';
  if not found then raise exception 'vehicle_not_active'; end if;
  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;
  if v_presence.instance_id is distinct from v_vehicle.current_instance_id then raise exception 'same_instance_required'; end if;

  insert into public.tgg_world_vehicle_passengers(vehicle_id,user_id,character_id,seat_key,left_at,last_seen_at)
  values(v_vehicle.id,v_uid,v_char.id,'passenger',null,now())
  on conflict(vehicle_id,user_id) do update
    set character_id=excluded.character_id,
        seat_key=case when tgg_world_vehicle_passengers.seat_key='driver' then 'driver' else 'passenger' end,
        left_at=null,last_seen_at=now();

  return jsonb_build_object('ok',true,'vehicle_id',v_vehicle.id,'seat','passenger',
    'shared_music',v_vehicle.music_state,'real_money',false);
end $$;

create or replace function public.tgg_world_vehicle_music(p_vehicle_id uuid,p_track jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_state jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select p.seat_key into v_role
  from public.tgg_world_vehicle_passengers p
  where p.vehicle_id=p_vehicle_id and p.user_id=v_uid and p.left_at is null;
  if v_role is null then raise exception 'vehicle_membership_required'; end if;
  if v_role <> 'driver' then raise exception 'driver_only'; end if;

  v_state := jsonb_build_object('mode','shared','track',coalesce(p_track,'{}'::jsonb),'position_ms',0,'updated_at',now());
  update public.tgg_world_vehicles set music_state=v_state,updated_at=now() where id=p_vehicle_id;
  return jsonb_build_object('ok',true,'vehicle_id',p_vehicle_id,'music_state',v_state);
end $$;

create or replace function public.tgg_world_vehicle_bundle(p_vehicle_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  return jsonb_build_object(
    'vehicle',(select to_jsonb(v) from public.tgg_world_vehicles v where v.id=p_vehicle_id),
    'passengers',coalesce((select jsonb_agg(to_jsonb(p) order by p.joined_at) from public.tgg_world_vehicle_passengers p where p.vehicle_id=p_vehicle_id and p.left_at is null),'[]'::jsonb),
    'real_money',false
  );
end $$;

create or replace function public.tgg_world_workout_start(p_workout_type text default 'gym')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_type text := lower(trim(coalesce(p_workout_type,'')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_type not in ('gym','run_outside','cardio','strength') then raise exception 'invalid_workout_type'; end if;
  select * into v_char from public.world_characters where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  update public.tgg_world_workouts set workout_status='canceled'
  where user_id=v_uid and workout_status='active';

  insert into public.tgg_world_workouts(user_id,character_id,workout_type)
  values(v_uid,v_char.id,v_type) returning id into v_id;

  return jsonb_build_object('ok',true,'workout_id',v_id,'workout_type',v_type,
    'virtual_reward_only',true,'real_money',false);
end $$;

create or replace function public.tgg_world_workout_finish(p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_workout public.tgg_world_workouts%rowtype;
  v_xp integer;
  v_fitness integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_workout from public.tgg_world_workouts where id=p_workout_id and user_id=v_uid for update;
  if not found then raise exception 'workout_not_found'; end if;

  if v_workout.workout_status='complete' then
    return jsonb_build_object('ok',true,'already_complete',true,'workout_id',v_workout.id,
      'reward',v_workout.reward_detail,'real_money',false);
  end if;
  if v_workout.workout_status<>'active' then raise exception 'workout_not_active'; end if;

  v_xp := case v_workout.workout_type when 'run_outside' then 18 when 'strength' then 20 else 15 end;
  v_fitness := case v_workout.workout_type when 'run_outside' then 3 when 'strength' then 4 else 2 end;

  insert into public.world_character_stats(character_id,stat_key,stat_value,updated_at)
  values(v_workout.character_id,'xp',v_xp,now())
  on conflict(character_id,stat_key) do update
  set stat_value=world_character_stats.stat_value+excluded.stat_value,updated_at=now();

  insert into public.world_character_stats(character_id,stat_key,stat_value,updated_at)
  values(v_workout.character_id,'fitness',v_fitness,now())
  on conflict(character_id,stat_key) do update
  set stat_value=world_character_stats.stat_value+excluded.stat_value,updated_at=now();

  update public.tgg_world_workouts
  set workout_status='complete',completed_at=now(),reward_applied=true,
      reward_detail=jsonb_build_object('type','virtual_progression','xp',v_xp,'fitness',v_fitness,'real_money',false)
  where id=v_workout.id
  returning * into v_workout;

  return jsonb_build_object('ok',true,'already_complete',false,'workout_id',v_workout.id,
    'reward',v_workout.reward_detail,'real_money',false);
end $$;

create or replace function public.tgg_world_crew_create(p_crew_name text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_name text := trim(coalesce(p_crew_name,''));
  v_key text;
  v_crew public.tgg_world_crews%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if length(v_name)<2 or length(v_name)>50 then raise exception 'crew_name_invalid'; end if;
  select * into v_char from public.world_characters where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  v_key := regexp_replace(lower(v_name),'[^a-z0-9]+','-','g')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6);
  insert into public.tgg_world_crews(owner_user_id,owner_character_id,crew_name,crew_key)
  values(v_uid,v_char.id,v_name,v_key) returning * into v_crew;

  insert into public.tgg_world_crew_members(crew_id,user_id,character_id,crew_role)
  values(v_crew.id,v_uid,v_char.id,'owner');

  insert into public.tgg_world_crew_activity(crew_id,actor_user_id,activity_type,detail)
  values(v_crew.id,v_uid,'crew_created',jsonb_build_object('crew_name',v_name));

  return jsonb_build_object('ok',true,'crew_id',v_crew.id,'crew_key',v_crew.crew_key,
    'role','owner','real_money',false);
end $$;

create or replace function public.tgg_world_crew_join(p_crew_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_crew public.tgg_world_crews%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_char from public.world_characters where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;
  select * into v_crew from public.tgg_world_crews where id=p_crew_id and crew_status='active';
  if not found then raise exception 'crew_not_found'; end if;

  insert into public.tgg_world_crew_members(crew_id,user_id,character_id,crew_role,left_at)
  values(v_crew.id,v_uid,v_char.id,'member',null)
  on conflict(crew_id,user_id) do update
    set character_id=excluded.character_id,
        crew_role=case when tgg_world_crew_members.crew_role in ('owner','admin') then tgg_world_crew_members.crew_role else 'member' end,
        left_at=null;

  insert into public.tgg_world_crew_activity(crew_id,actor_user_id,activity_type,detail)
  values(v_crew.id,v_uid,'member_joined',jsonb_build_object('character_id',v_char.id));

  return jsonb_build_object('ok',true,'crew_id',v_crew.id,
    'role',(select crew_role from public.tgg_world_crew_members where crew_id=v_crew.id and user_id=v_uid),
    'real_money',false);
end $$;

create or replace function public.tgg_world_crew_set_role(p_crew_id uuid,p_member_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_target_role text := lower(trim(coalesce(p_role,'')));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_target_role not in ('admin','member') then raise exception 'invalid_role'; end if;

  select crew_role into v_actor_role
  from public.tgg_world_crew_members
  where crew_id=p_crew_id and user_id=v_uid and left_at is null;

  if v_actor_role is null then raise exception 'crew_membership_required'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'crew_permission_denied'; end if;

  if exists(select 1 from public.tgg_world_crew_members where crew_id=p_crew_id and user_id=p_member_user_id and crew_role='owner') then
    raise exception 'owner_role_immutable';
  end if;
  if v_actor_role='admin' and v_target_role='admin' then
    raise exception 'owner_required_for_admin_promotion';
  end if;

  update public.tgg_world_crew_members
  set crew_role=v_target_role
  where crew_id=p_crew_id and user_id=p_member_user_id and left_at is null;

  if not found then raise exception 'crew_member_not_found'; end if;

  insert into public.tgg_world_crew_activity(crew_id,actor_user_id,activity_type,detail)
  values(p_crew_id,v_uid,'role_changed',jsonb_build_object('member_user_id',p_member_user_id,'role',v_target_role));

  return jsonb_build_object('ok',true,'crew_id',p_crew_id,'member_user_id',p_member_user_id,'role',v_target_role);
end $$;

create or replace function public.tgg_world_crew_bundle(p_crew_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  return jsonb_build_object(
    'crew',(select to_jsonb(c) from public.tgg_world_crews c where c.id=p_crew_id),
    'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at) from public.tgg_world_crew_members m where m.crew_id=p_crew_id and m.left_at is null),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.tgg_world_crew_activity where crew_id=p_crew_id order by created_at desc limit 25) a),'[]'::jsonb),
    'real_money',false
  );
end $$;

revoke all on function public.tgg_world_can_read_vehicle(uuid) from public,anon;
revoke all on function public.tgg_world_can_read_crew(uuid) from public,anon;
revoke all on function public.tgg_world_wallet_ensure() from public,anon;
revoke all on function public.tgg_world_purchase(text,integer,text) from public,anon;
revoke all on function public.tgg_world_inventory_equip(text) from public,anon;
revoke all on function public.tgg_world_economy_bundle() from public,anon;
revoke all on function public.tgg_world_wallet_reconcile() from public,anon;
revoke all on function public.tgg_world_vehicle_spawn(text,text) from public,anon;
revoke all on function public.tgg_world_vehicle_join(uuid) from public,anon;
revoke all on function public.tgg_world_vehicle_music(uuid,jsonb) from public,anon;
revoke all on function public.tgg_world_vehicle_bundle(uuid) from public,anon;
revoke all on function public.tgg_world_workout_start(text) from public,anon;
revoke all on function public.tgg_world_workout_finish(uuid) from public,anon;
revoke all on function public.tgg_world_crew_create(text) from public,anon;
revoke all on function public.tgg_world_crew_join(uuid) from public,anon;
revoke all on function public.tgg_world_crew_set_role(uuid,uuid,text) from public,anon;
revoke all on function public.tgg_world_crew_bundle(uuid) from public,anon;

grant execute on function public.tgg_world_can_read_vehicle(uuid) to authenticated;
grant execute on function public.tgg_world_can_read_crew(uuid) to authenticated;
grant execute on function public.tgg_world_wallet_ensure() to authenticated;
grant execute on function public.tgg_world_purchase(text,integer,text) to authenticated;
grant execute on function public.tgg_world_inventory_equip(text) to authenticated;
grant execute on function public.tgg_world_economy_bundle() to authenticated;
grant execute on function public.tgg_world_wallet_reconcile() to authenticated;
grant execute on function public.tgg_world_vehicle_spawn(text,text) to authenticated;
grant execute on function public.tgg_world_vehicle_join(uuid) to authenticated;
grant execute on function public.tgg_world_vehicle_music(uuid,jsonb) to authenticated;
grant execute on function public.tgg_world_vehicle_bundle(uuid) to authenticated;
grant execute on function public.tgg_world_workout_start(text) to authenticated;
grant execute on function public.tgg_world_workout_finish(uuid) to authenticated;
grant execute on function public.tgg_world_crew_create(text) to authenticated;
grant execute on function public.tgg_world_crew_join(uuid) to authenticated;
grant execute on function public.tgg_world_crew_set_role(uuid,uuid,text) to authenticated;
grant execute on function public.tgg_world_crew_bundle(uuid) to authenticated;
