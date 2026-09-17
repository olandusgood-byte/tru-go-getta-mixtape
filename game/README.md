# TRU GO GETTA Game V1.12

This checkpoint extends the credential-free TGG World adapter through property and vehicle discovery while keeping ownership, travel, spawn and upgrade mutations out of the game bundle.

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

## V1.12 Property + Vehicle Discovery

`window.TGGWorldSync` adds:

- `propertyMarket()` — property-market discovery read.
- `propertyUpgrades()` — available property-upgrade catalog read.
- `vehicleProgression()` — vehicle progression/catalog state.
- `vehicleBundle(vehicleId)` — validated vehicle UUID detail read.
- `worldAssetsBundle()` — combined property/upgrades/vehicle discovery packet.

Vehicle detail is backed by an existing TGG World contract that explicitly reports `real_money:false`.

## Explicit exclusions

V1.12 does not expose:

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
- [ ] Trusted Creator OS transport connection
- [ ] Production game deployment/release

## Release status

**V1.12-PROPERTY-VEHICLE-DISCOVERY-STATIC-PASSED.** The next safe internal candidate is progression/achievement/business discovery mapping.
