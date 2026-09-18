# TRU GO GETTA Game V1.34

V1.34 adds ordered Street Sets and crowd momentum on top of the verified V1.33 street-reputation system without adding another economy or save store.

## Street Sets

- Block To Studio: Downtown Cypher → Studio Sidewalk
- Studio To Ave: Studio Sidewalk → Mixtape Pop-Out
- Full City Set: Downtown Cypher → Studio Sidewalk → Mixtape Pop-Out

Set progress lives inside the existing `tgg-street-events-v1` object under `sets`.

Wrong-order events do not skip a set step.

## Crowd Momentum

Momentum grows from successful street events, with larger gains when the player changes locations instead of repeating the same hotspot.

Momentum states:

- COLD
- WARM
- BUZZING
- LIVE
- LOCKED IN

Momentum can add up to two extra local crowd members to an event. It does not award cash, XP, career reputation, or any remote/world reward.

## Progression

- Run The Set — complete the first ordered Street Set.
- Crowd Momentum — reach 55 Street Set momentum.
- Progression now shows Street Sets and Momentum.

## Verification

- [x] V1.34 static contract
- [x] three Street Sets registered
- [x] ordered progression
- [x] wrong-order event cannot skip a step
- [x] set persistence uses the existing street-event store
- [x] First Street Set achievement
- [x] Full City Set completion
- [x] crowd momentum >=55
- [x] crowd bonus increases from momentum
- [x] Crowd Momentum achievement
- [x] no separate `tgg-street-sets-v1` key
- [x] no cash / XP reward path
- [x] no remote mutation path
- [x] Static CI PASS on `67d8b06`
- [x] Chromium Smoke PASS on `67d8b06`
- [x] production remains gated

## Release status

**V1.34-STREET-SETS-CROWD-MOMENTUM-VERIFIED.**

Next internal development layer: **V1.35 Street Crews + Audience Memory**.
