# TRU GO GETTA Game V1.16

V1.16 adds ordered city circuits and mastery-based event variants on top of the verified V1.15 city-activity system.

## Verified layers

- V1.0–V1.14: core game, creator identity, online/read-only world discovery and browser-safe gameplay
- V1.15: City Activity Mastery
- V1.16: City Circuits + Event Variants

## V1.16 City Circuits

Two ordered local circuits now run through the existing event system:

- First Lap: Street Cypher → Studio Pop-In
- City Run: Street Cypher → Studio Pop-In → Release Rush

Circuit progress persists in `tgg-circuits-v1`, is covered by save repair, and only advances when the expected successful event completes. Wrong-order event completions never skip a circuit step.

## Event variants

Mastery changes presentation only. Every variant is `cosmeticOnly: true` with `rewardMultiplier: 1`; the circuit module itself cannot award cash, XP or reputation.

## Verification

- [x] JavaScript syntax gate
- [x] JSON manifest gate
- [x] V1.16 static contract
- [x] circuit persistence + save repair
- [x] ordered route advancement
- [x] wrong-order event does not advance route
- [x] First Lap completion in automated Chromium
- [x] circuit achievement unlock
- [x] existing V1.14 read-only world-asset/XSS protections
- [x] existing V1.15 economy invariants
- [x] Static CI PASS on `6cf3c2e`
- [x] Chromium Smoke PASS on `6cf3c2e`
- [x] production remains gated

## Release status

**V1.16-CITY-CIRCUITS-EVENT-VARIANTS-VERIFIED.**

Next internal development layer: **V1.17 District Circuits + Story Routing**.
