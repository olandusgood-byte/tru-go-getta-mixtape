# TRU GO GETTA Game V1.33

V1.33 builds local street reputation on top of the verified V1.32 street-event system without adding another cash, XP, reputation-currency, or remote mutation path.

## Street Reputation

Street reputation is calculated from:

- verified local street-event run count;
- crowd hype from completed events.

Ranks:

- NEW FACE
- ON THE RADAR
- LOCAL NAME
- CITY KNOWN
- CITY HEADLINER

Street reputation persists inside the existing `tgg-street-events-v1` state.

## Event Variants

Each hotspot evolves through cosmetic/presentation variants as its local run count increases.

Downtown Cypher:
- Open Circle
- Local Buzz Cypher
- City Circle
- Headline Cypher

Studio Sidewalk:
- Sidewalk Set
- Late Night Set
- Studio Row Feature
- Studio Lockout

Mixtape Pop-Out:
- Block Pop-Out
- Corner Takeover
- Mixtape Ave Live
- City Premiere

Every variant is explicitly `cosmeticOnly: true` with `rewardMultiplier: 1`.

## Progression

- Street Known — reach 30 local street reputation.
- Street Headliner — reach 80 local street reputation.
- Progression now shows Street Rep, Street Rank, and total Street Events.

## Verification

- [x] street reputation API
- [x] street rank calculation
- [x] event variant catalog
- [x] variants stay cosmetic-only
- [x] street reputation save repair
- [x] first run remains Open Circle
- [x] third Downtown run unlocks Local Buzz Cypher
- [x] three runs reach Local Name
- [x] Street Known achievement unlocks
- [x] cash and XP remain unchanged across street-event reputation progression
- [x] no remote mutation path
- [x] Static CI PASS on `bd60f89`
- [x] Chromium Smoke PASS on `bd60f89`
- [x] production remains gated

## Release status

**V1.33-STREET-REPUTATION-EVENT-VARIANTS-VERIFIED.**

Next internal development layer: **V1.34 Street Sets + Crowd Momentum**.
