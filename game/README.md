# TRU GO GETTA Game V1.7

Browser-based TRU GO GETTA game with city progression, career and achievements, persistent inventory, inventory-aware missions/events, crews, economy bonuses, mission chains, district unlocks, expansion activities, save repair, character creation, and an injected World/Creator OS transport bridge.

## Playable loop

CREATE PLAYER → CUSTOMIZE CHARACTER → ENTER CITY → MOVE → TAKE JOBS → USE/CONSUME INVENTORY → EARN CASH/XP/REP → BUILD CAREER + CREW → UNLOCK DISTRICTS → SAVE/LOAD

## Verified foundation

- V1.0 foundation: player creation, movement, mission interaction, cash/XP, save/load
- V1.1 career/progression: recordings, mixtapes, studio upgrades, achievements, career level unlocks
- V1.2 city progression: mission chains, district unlocks, save validation/repair, integrity gate
- V1.3 City Life: city events, crews, normalized economy bonuses, persistent inventory, expansion activities
- V1.4 Inventory Gameplay: mission/event item requirements, missing-item blocks, successful-consumption rules
- V1.5 Character Identity: persistent avatar, wardrobe, hair, accent palette, 360-degree preview controls
- V1.6 World Sync Foundation: local sync packet, avatar/profile mapping, injected RPC transport, offline-ready default
- V1.7 Online Player State Bridge: position/rotation/activity payload, authenticated presence heartbeat mapping, presence bundle, next-moves bridge

## V1.7 Online Player State Bridge

`window.TGGWorldSync` remains explicit-only and credential-free.

New V1.7 methods:

- `positionPayload()` — maps local city X/Y + heading + current screen/activity into a backend-ready presence payload.
- `heartbeat()` — maps to `tgg_world_presence_heartbeat_full`.
- `presenceBundle()` — maps to `tgg_world_v11_6_presence_bundle`.
- `nextMoves()` — maps to `tgg_world_next_moves`.
- `sync()` — now performs bootstrap → avatar sync → presence heartbeat when a trusted transport is injected.

There are still **no timers, no background polling, no automatic network calls, and no embedded credentials**.

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

Normal game updates use code/static validation only. Browser smoke remains manual-only.

## Current checkpoint

- [x] Core game loop
- [x] Career/progression
- [x] City jobs/events/crew/economy
- [x] Persistent inventory + inventory gameplay
- [x] Character Creator + avatar persistence
- [x] World Sync local packet
- [x] Trusted transport injection contract
- [x] Avatar backend RPC mapping
- [x] Presence position/rotation/activity mapping
- [x] Presence heartbeat backend RPC mapping
- [x] Presence bundle + next-moves mapping
- [x] V1.7 static code gate
- [ ] Connect trusted Creator OS transport
- [ ] Production game deployment/release

## Release status

**V1.7-ONLINE-PLAYER-STATE-BRIDGE-STATIC-PASSED.** Production remains gated; the next safe internal layer is authenticated career/economy state mapping over the same injected transport.
