# TRU GO GETTA Game V1.2

Browser-based TRU GO GETTA game with a city progression loop, career system, missions, expansion activities, progression achievements, mission chains, district unlocks, persistence validation, QA, and a website bridge.

## Playable loop

CREATE PLAYER → ENTER CITY → MOVE → TAKE MISSION → COMPLETE → CASH/XP → LEVEL UP → UNLOCK DISTRICTS → SAVE/LOAD

## V1.2 additions

- Mission Chains: FIRST MOVE and CITY RUN
- District progression: Downtown L1, Studio Row L2, Mixtape Ave L3
- Save-state validation and repair for game and career data
- V1.2 integrity gate
- Expanded runtime/release QA
- Automated browser smoke gate through GitHub Actions
- Progression hardening for district unlocks, corrupted saves, mission-chain completion, and career upgrade counting

## Automatic Builder loop

BUILD → TEST → REPAIR → VERIFY → CHECKPOINT → ADVANCE

The QA policy is conservative: repair verified missing/disconnected guards and avoid duplicating active systems.

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
- [x] Expansion activities
- [x] Progression achievements
- [x] Mission chains
- [x] District progression
- [x] Save validator
- [x] V1.2 integrity gate
- [x] Expanded QA/release QA
- [x] Automated browser smoke workflow configured
- [x] Fresh V1.2 browser smoke run passed
- [x] Progression hardening browser coverage passed
- [x] Career upgrade regression fix verified
- [ ] V1.2 release checkpoint
- [ ] Production release

## Release status

V1.2 has passed the fresh automated browser smoke and progression hardening gates. The release checkpoint is the remaining pre-production gate. Production remains gated until an explicit release decision is made.

No external libraries are required by the game itself; the automated browser gate installs Playwright only inside CI.
