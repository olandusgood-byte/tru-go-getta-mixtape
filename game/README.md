# TRU GO GETTA Game V1.0

Clean browser-based foundation for the TRU GO GETTA game.

## Playable loop

CREATE PLAYER → ENTER CITY → MOVE → TALK TO M → TAKE MISSION → MOVE TO M → COMPLETE → CASH/XP → LEVEL UP → SAVE/LOAD

## Files

- `index.html` — game shell and screens
- `style.css` — responsive visual system
- `game.js` — game state, movement, mission, progression, persistence

## Automatic Builder loop

1. BUILD — add one coherent module.
2. TEST — verify required DOM/state behavior.
3. REPAIR — fix failures before advancing.
4. VERIFY — run the smoke gate.
5. CHECKPOINT — record a clean milestone.
6. ADVANCE — only after the gate passes.

## V1.0 Foundation checklist

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
- [ ] Automated browser smoke test
- [ ] Release checkpoint

No external libraries are required for the foundation.
