# TGG World V11.7.2 — Real-User Multiplayer Witness

## Goal

Close the remaining `world_multiplayer_same_instance_two_real_users_v11_7` contract with evidence that is created from authoritative production state and authenticated client acknowledgements.

The witness requires **two real authenticated users**, not seeded users, synthetic rows, or client-only presence injection.

## Required flow

1. Real User A signs into the live TGG World.
2. A enters a live World instance.
3. Real User B signs into a separate browser/device/session with a different real account.
4. B enters the **same** World instance as A.
5. Both sessions remain connected.
6. A moves to a new position.
7. The server heartbeat writes A's new position to `public.world_presence`.
8. The V11.7.2 server trigger creates a movement witness row for B and emits a private `server_movement_witness` event on `world:<instance_id>:moves`.
9. B's client receives that server event and calls `public.tgg_world_ack_movement_witness(event_id)`.
10. B moves to a new position.
11. The server creates the reverse witness and A acknowledges it.
12. The acknowledgement function passes the contract only when both directions are acknowledged within the 120-second freshness window.

## Evidence that must exist

The final server evidence must show:

- `distinct_authenticated_users >= 2`
- both users are real `auth.users` records
- both users are bound to active `world_characters`
- both users were present in the same `world_instances.id`
- fresh `world_presence.heartbeat_at` values
- A → B movement witness acknowledged
- B → A movement witness acknowledged
- source movement came from authoritative `public.world_presence`
- server-created movement witness IDs
- source emission timestamps
- target acknowledgement timestamps
- freshness within 120 seconds
- `synthetic_presence_used = false`
- `client_presence_mutation_allowed = false`

## What V11.7.2 changes

The migration adds `private.tgg_world_v11_7_movement_witness`.

A position update on authoritative `public.world_presence` creates a server-owned witness event for each other fresh user in the same instance. The trigger emits the event through Supabase Realtime Broadcast using the existing private topic pattern:

`world:<instance_id>:moves`

The receiving client must acknowledge the event through:

`tgg_world_ack_movement_witness(p_movement_witness_id uuid)`

The acknowledgement is accepted only if:

- the JWT is authenticated;
- the event's target user matches `auth.uid()`;
- the target user has fresh presence in the same instance;
- the event is no older than 120 seconds.

The server then checks for both movement directions before writing the passed evidence.

## Client change required before live verification

The live TGG World client currently subscribes to the `world:<instance_id>:moves` topic for movement traffic. The client must additionally listen for the server-only event:

```js
.on('broadcast', { event: 'server_movement_witness' }, async ({ payload }) => {
  await sb.rpc('tgg_world_ack_movement_witness', {
    p_movement_witness_id: payload.movement_witness_id
  });
})
```

The channel must remain private and authenticated. Do not acknowledge events from a client-supplied movement ID unless that ID was emitted by the server event.

## Verification queries

### 1. Witness rows

```sql
select
  id,
  instance_id,
  source_user_id,
  target_user_id,
  source_position,
  emitted_at,
  target_ack_at,
  target_presence_seen_at,
  status
from private.tgg_world_v11_7_movement_witness
order by emitted_at desc
limit 50;
```

### 2. Final contract

```sql
select
  contract_key,
  status,
  metadata,
  updated_at
from public.tgg_runtime_qa_contract_matrix
where contract_key = 'world_multiplayer_same_instance_two_real_users_v11_7';
```

### 3. Passed evidence

```sql
select
  evidence_source,
  evidence_type,
  status,
  source_ref,
  evidence,
  captured_at
from public.tgg_runtime_qa_contract_evidence
where evidence_source = 'world_multiplayer_movement_witness_v11_7_2'
order by captured_at desc;
```

### 4. Existing high-level witness

```sql
select *
from private.tgg_world_multiplayer_witness
where witness_key = 'same_instance_two_real_users';
```

## Pass condition

The gate is **PASS** only when the server evidence contains both directions and both acknowledgements are fresh. A database row showing two users online by itself is not sufficient anymore.

Protected Audio remains intentionally skipped/open and is unrelated to this witness.
