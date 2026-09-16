# TRU GO GETTA Game V1.4

Browser-based TRU GO GETTA game with city progression, career and achievements, persistent inventory, inventory-aware missions/events, crews, economy bonuses, mission chains, district unlocks, expansion activities, save repair, release QA, and a Creator OS/website bridge.

## Playable loop

CREATE PLAYER → ENTER CITY → MOVE → TAKE JOBS → USE/CONSUME INVENTORY → EARN CASH/XP/REP → BUILD CAREER + CREW → UNLOCK DISTRICTS → SAVE/LOAD

## Verified layers

- V1.0 foundation: player creation, movement, mission interaction, cash/XP, save/load
- V1.1 career/progression: recordings, mixtapes, studio upgrades, achievements, career level unlocks
- V1.2 city progression: mission chains, district unlocks, save validation/repair, integrity gate
- V1.3 City Life: city events, crews, normalized economy bonuses, inventory UI/state, expansion activities
- V1.4 Inventory Gameplay: mission/event item requirements, clear missing-item blocks, successful-consumption rules, starter inventory compatibility
- Creator/website bridge and release/runtime QA

## V1.4 inventory loop

- Flyer Run → Promo Flyers
- Studio Session → Mic
- Mixtape Promo → Beat Pack
- Street Cypher → Notebook
- Studio Pop-In → Mic
- Release Rush → Beat Pack + Promo Flyers

The inventory remains a single persistent `tgg-inventory-v1` store. Rewards continue through the existing game/career/economy APIs; V1.4 does not create duplicate reward or progression state.

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

The QA policy is conservative: preserve verified save keys and runtime APIs, repair only proven gaps, and keep production gated until a deliberate release/deployment step.

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
- [x] Website/Creator bridge
- [x] Runtime QA + release QA
- [x] Game Static Gate
- [x] Game Browser Smoke
- [x] V1.4 verified checkpoint
- [ ] Production game deployment/release

## Release status

**V1.4-INVENTORY-VERIFY-PASSED.** The recovered V1.4 stack passed both the Game Static Gate and Game Browser Smoke on the exact recovery commit before integration to `main`. Production release remains gated while development continues into the next gameplay layer.

No external libraries are required by the game itself; CI installs Playwright only for automated browser verification.
