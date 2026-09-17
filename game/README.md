# TRU GO GETTA Game V1.5

Browser-based TRU GO GETTA game with city progression, career and achievements, persistent inventory, inventory-aware missions/events, crews, economy bonuses, mission chains, district unlocks, expansion activities, save repair, character creation, and a Creator OS/website bridge.

## Playable loop

CREATE PLAYER → CUSTOMIZE CHARACTER → ENTER CITY → MOVE → TAKE JOBS → USE/CONSUME INVENTORY → EARN CASH/XP/REP → BUILD CAREER + CREW → UNLOCK DISTRICTS → SAVE/LOAD

## Verified foundation

- V1.0 foundation: player creation, movement, mission interaction, cash/XP, save/load
- V1.1 career/progression: recordings, mixtapes, studio upgrades, achievements, career level unlocks
- V1.2 city progression: mission chains, district unlocks, save validation/repair, integrity gate
- V1.3 City Life: city events, crews, normalized economy bonuses, persistent inventory, expansion activities
- V1.4 Inventory Gameplay: mission/event item requirements, missing-item blocks, successful-consumption rules
- V1.5 Character Identity: persistent avatar, wardrobe, hair, accent palette, 360-degree preview controls, mini city avatar
- Creator/website bridge and release/runtime QA

## V1.5 character identity

- Save key remains isolated as `tgg-avatar-v1`; no existing gameplay save key was changed.
- Avatar state is included in save validation/repair.
- Hair options: Fade, Buzz, Curls, Locs.
- Wardrobe: top, bottom, shoes, hat, chain.
- Accent palette: Volt, Red, Blue, Purple.
- Character state is exposed through `window.TGGAvatar` and covered by QA/release gates.
- V1.4 inventory/economy/progression state remains unchanged.

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

Normal game updates use code/static validation only. Browser smoke is retained as a manual-only workflow and is not part of automatic update execution.

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
- [x] Website/Creator bridge
- [x] Runtime QA + release QA
- [ ] Re-run static code gate on V1.5
- [ ] Production game deployment/release

## Release status

**V1.5-CHARACTER-IDENTITY-CODE-COMPLETE.** V1.5 is additive over the verified V1.4 checkpoint. Production remains gated until the V1.5 static gate is green and a deliberate production release is chosen.
