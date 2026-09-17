# TRU GO GETTA Game V1.6

Browser-based TRU GO GETTA game with city progression, career and achievements, persistent inventory, inventory-aware missions/events, crews, economy bonuses, mission chains, district unlocks, expansion activities, save repair, character creation, and a credential-free World Sync foundation for Creator OS/Supabase integration.

## Playable loop

CREATE PLAYER → CUSTOMIZE CHARACTER → ENTER CITY → MOVE → TAKE JOBS → USE/CONSUME INVENTORY → EARN CASH/XP/REP → BUILD CAREER + CREW → UNLOCK DISTRICTS → SAVE/LOAD

## Verified foundation

- V1.0 foundation: player creation, movement, mission interaction, cash/XP, save/load
- V1.1 career/progression: recordings, mixtapes, studio upgrades, achievements, career level unlocks
- V1.2 city progression: mission chains, district unlocks, save validation/repair, integrity gate
- V1.3 City Life: city events, crews, normalized economy bonuses, persistent inventory, expansion activities
- V1.4 Inventory Gameplay: mission/event item requirements, missing-item blocks, successful-consumption rules
- V1.5 Character Identity: persistent avatar, wardrobe, hair, accent palette, 360-degree preview controls, mini city avatar
- V1.6 World Sync Foundation: local sync packet, avatar/profile mapping, injected RPC transport contract, offline-ready default
- Creator/website bridge and release/runtime QA

## V1.6 World Sync Foundation

`window.TGGWorldSync` is an additive adapter. It does not change existing save keys and it performs **no automatic network calls**.

It provides:

- `snapshot()` — builds a normalized local player/avatar/career/inventory/crew/events packet.
- `avatarProfile()` — maps the local V1.5 avatar into the existing TGG World avatar profile contract.
- `setTransport(fn)` — injects a trusted RPC transport from Creator OS or another host.
- `bootstrap()` — maps to existing backend bootstrap RPCs.
- `syncAvatar()` — maps to `tgg_world_v11_save_avatar`.
- `sync()` — runs the additive bootstrap + avatar sync sequence.
- `status()` — reports `offline_ready`, `transport_ready`, `bootstrapped`, `synced`, or `error`.

The game bundle stores no service-role key, provider secret, refresh token, or hardcoded authenticated credential.

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

Normal game updates use code/static validation only. Browser smoke remains manual-only and is not part of automatic update execution.

## Current checkpoint

- [x] Main menu and player creation
- [x] Keyboard + mobile movement
- [x] Missions, cash, XP and levels
- [x] Save/load + save repair
- [x] Career system + career/progression sync
- [x] Progression achievements
- [x] Mission chains + district progression
- [x] Expansion activities
- [x] City events
- [x] Crew recruitment + bonuses
- [x] Normalized economy rewards
- [x] Persistent inventory
- [x] Inventory-aware missions/events
- [x] Persistent Character Creator
- [x] Hair + wardrobe + accent customization
- [x] Avatar save repair + release QA coverage
- [x] World Sync local packet
- [x] World Sync injected transport contract
- [x] Existing backend RPC mapping
- [x] Website/Creator bridge
- [x] Runtime QA + release QA
- [ ] Re-run static code gate on V1.6
- [ ] Connect trusted Creator OS transport
- [ ] Production game deployment/release

## Release status

**V1.6-WORLD-SYNC-FOUNDATION-CODE-COMPLETE.** V1.6 is additive over the verified V1.5 code checkpoint. Production remains gated until the V1.6 static gate is green and a trusted Creator OS transport is connected.
