# TRU GO GETTA Game V1.0

Clean browser-based foundation for the TRU GO GETTA game.

## Current modules
- GAME-001 Foundation
- GAME-002 Career System
- GAME-003 Content System
- GAME-004 QA and Auto Repair

## Playable loop

CREATE PLAYER → ENTER CITY → MOVE → TAKE MISSION → COMPLETE → CASH/XP → LEVEL UP → SAVE/LOAD

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

`qa.js` performs lightweight runtime checks for persistence, public APIs, required screens, and core controls. The QA policy is intentionally conservative: repair only a verified missing/disconnected guard and never duplicate active systems.

## Current checklist

- [x] Main menu
- [x] Player creation
- [x] Game state
- [x] Top-down city foundation
- [x] Keyboard movement
- [x] Mobile movement controls
- [x] Mission interaction
- [x] Cash rewards
- [x] XP and levels
- [x] Save/load via localStorage
- [x] Career system
- [x] Content/mission system
- [x] QA manifest and runtime checks
- [ ] Full browser interaction test
- [ ] Release checkpoint

No external libraries are required for the foundation.
