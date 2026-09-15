# V11.7.2 live-client patch — TGG World

## Current live source finding

The active `tgg-tmp-final-page-check` Edge Function is version 87.

Its current realtime bootstrap subscribes to many Postgres Changes feeds, including `public.tgg_world_presence`, but it does **not** subscribe to the authoritative `public.world_presence` movement stream and does **not** acknowledge a server-created movement witness.

The authoritative heartbeat updates `public.world_presence`.

V11.7.2 therefore adds a separate server Broadcast witness channel instead of depending on a Postgres Changes publication for `world_presence`.

## Exact client addition

Add a dedicated movement-channel handle next to the existing `rt` variable:

```js
let rt=null;
let rtWorldMoves=null;
let rtWorldMovesTopic='';
```

Add this function before `realtimeBoot()`:

```js
function realtimeWorldMovementBoot(){
  const instanceId=P?.shared_music?.instance_id||P?.actions?.instance_id||'';
  if(!instanceId)return;
  const topic='world:'+instanceId+':moves';
  if(rtWorldMoves && rtWorldMovesTopic===topic)return;
  if(rtWorldMoves){try{sb.removeChannel(rtWorldMoves)}catch{}}
  rtWorldMovesTopic=topic;
  rtWorldMoves=sb.channel(topic,{config:{private:true}})
    .on('broadcast',{event:'server_movement_witness'},async({payload})=>{
      const witnessId=payload?.movement_witness_id;
      if(!witnessId)return;
      const {error}=await sb.rpc('tgg_world_ack_movement_witness',{
        p_movement_witness_id:witnessId
      });
      if(!error)await load();
    })
    .subscribe();
}
```

Call it immediately after the normal runtime channel is established and after every successful `load()` so a newly entered instance gets the correct topic:

```js
async function load(){
  const{data,error}=await sb.rpc('tgg_world_ui_payload');
  if(error){
    app.innerHTML='<div class="card"><h1>Load failed</h1><p class="error">'+esc(error.message)+'</p></div>';
    return;
  }
  P=data;
  render();
  realtimeWorldMovementBoot();
  syncRoomAudio();
}
```

When the user goes offline/signs out, remove the movement channel:

```js
async function cleanupWorldMovementChannel(){
  if(rtWorldMoves){
    try{await sb.removeChannel(rtWorldMoves)}catch{}
    rtWorldMoves=null;
    rtWorldMovesTopic='';
  }
}
```

Call `cleanupWorldMovementChannel()` before `sb.auth.signOut()` and when the World session becomes invalid.

## Why this is the correct witness path

Do **not** acknowledge ordinary client-originated `movement` broadcasts. Those can prove client traffic but cannot prove that the server accepted the movement.

Only acknowledge `server_movement_witness` events. Those events are created by the database trigger after an authoritative `public.world_presence.position` update and contain a server-created witness UUID.

The RPC independently checks:

- authenticated JWT;
- event target user equals `auth.uid()`;
- target user is currently present in the same instance;
- target heartbeat is fresh;
- event age is <= 120 seconds.

The server only marks the contract passed after it observes acknowledged A → B and B → A movement events.

## Live verification sequence

1. Deploy the V11.7.2 migration through the normal controlled migration path.
2. Deploy the client patch to the active World Edge Function through the normal reviewed deployment path.
3. Start a fresh browser session for Real User A.
4. Start a separate browser/device/session for Real User B.
5. Sign in with two different real authenticated accounts.
6. Enter the same World instance.
7. Wait until both heartbeats are fresh.
8. Move A once and wait for B's server-witness acknowledgement.
9. Move B once and wait for A's server-witness acknowledgement.
10. Query the witness/evidence tables immediately.
11. Confirm the final contract is `passed`.

No synthetic rows, fake users, manual witness inserts, or direct database evidence writes are permitted.
