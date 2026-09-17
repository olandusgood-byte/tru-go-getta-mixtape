# TRU GO GETTA Game V1.13

This checkpoint promotes the already-wired progression and business discovery layer on top of the credential-free TGG World property and vehicle discovery adapter, while keeping ownership, travel, spawn and upgrade mutations out of the game bundle.

## Verified layers

- V1.0–V1.4: core game, career, city, inventory gameplay
- V1.5: Character Identity
- V1.6: World Sync Foundation
- V1.7: Online Player State
- V1.8: Career + Economy
- V1.9: Inventory + Equipment
- V1.10: Social + Crew
- V1.11: Mission + Story Discovery
- V1.12: Property + Vehicle Discovery
- V1.13: Progression + Business Discovery

## V1.13 Progression + Business Discovery

V1.13 keeps the V1.12 `window.TGGWorldSync` discovery reads and adds the already-wired `window.TGGBusiness` gameplay layer:

- persistent local business discovery;
- level-gated business catalog;
- business selection/detail UI;
- read-only world asset refresh through `worldAssetsBundle()`;
- no purchase, ownership, travel, spawn, or upgrade mutation bridge.

Vehicle detail is backed by an existing TGG World contract that explicitly reports `real_money:false`.

## Explicit exclusions

V1.13 does not expose:

- property buy/list/cancel;
- property upgrade install/buy;
- fast travel / travel-to;
- vehicle spawn/join/drive;
- vehicle tune/music mutation;
- party travel.

## Safety model

- No automatic network calls or timers.
- Trusted transport injection only.
- No ownership/travel mutation surface.
- No purchase bridge.
- No mission/social mutation bridge.
- No local save overwrite from remote state.
- No service-role/provider secrets.

## Current checkpoint

- [x] Character Identity
- [x] World Sync Foundation
- [x] Player State
- [x] Career + Economy
- [x] Inventory + Equipment
- [x] Social + Crew
- [x] Mission + Story
- [x] Property + Vehicle discovery code
- [x] V1.12 static code gate
- [x] V1.13 progression + business discovery runtime wiring
- [x] V1.13 static code gate target
- [ ] Trusted Creator OS transport connection
- [ ] Production game deployment/release

## Release status

**V1.13-PROGRESSION-BUSINESS-DISCOVERY-STATIC-CANDIDATE.** Browser validation remains manual-only by policy. The next safe internal candidate after static verification is V1.14 live city activities plus read-only vehicle/property gameplay surfaces.
