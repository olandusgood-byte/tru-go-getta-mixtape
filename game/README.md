# TRU GO GETTA Game V1.14

V1.14 turns the existing V1.13 business/world-asset discovery wiring into a usable **Live City + Read-Only World Assets** surface while preserving the same fail-closed production and mutation boundaries.

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
- V1.14: Live City + Read-Only World Assets

## V1.14 Live City + Read-Only World Assets

This layer keeps the existing `window.TGGWorldSync` reads and hardens `window.TGGBusiness`:

- exports the previously hidden world-asset loader and renderer;
- keeps one persistent `tgg-business-v1` state object;
- shows the existing city activity catalog in the business hub;
- exposes a read-only activity snapshot for deterministic QA;
- supports property and vehicle **inspect-only** detail;
- escapes remote asset labels before HTML rendering;
- keeps offline-ready behavior when trusted Creator OS transport is absent;
- exposes no purchase, ownership, travel, spawn, driving, tune, or upgrade mutation bridge.

## Explicit exclusions

V1.14 does not expose:

- property buy/list/cancel;
- property upgrade install/buy;
- fast travel / travel-to;
- vehicle spawn/join/drive;
- vehicle tune/music mutation;
- party travel;
- automatic network polling;
- service-role/provider secrets.

## Safety model

- Trusted transport injection only.
- No automatic network calls or timers.
- Remote property/vehicle payloads are rendered as escaped display data.
- World assets are inspect-only.
- No local save overwrite from remote state.
- No purchase bridge.
- No mission/social mutation bridge.
- Production remains gated.

## Current checkpoint

- [x] Character Identity
- [x] World Sync Foundation
- [x] Player State
- [x] Career + Economy
- [x] Inventory + Equipment
- [x] Social + Crew
- [x] Mission + Story
- [x] Property + Vehicle discovery
- [x] Progression + Business discovery
- [x] V1.14 live-city surface
- [x] V1.14 property/vehicle read-only inspectors
- [x] V1.14 remote-label escaping
- [x] V1.14 runtime/release QA targets
- [x] V1.14 static contract target
- [x] V1.14 static CI confirmation
- [x] V1.14 automated Chromium confirmation
- [ ] Trusted Creator OS transport connection
- [ ] Production game deployment/release

## Release status

**V1.14-LIVE-CITY-READONLY-ASSETS-VERIFIED.** Static CI passed, the missing core control bindings were repaired, and the automated Chromium smoke gate passed on GitHub. Production remains gated; the next development layer is V1.15 City Activity Depth + Safe Local Progression.
