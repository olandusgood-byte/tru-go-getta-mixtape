# TRU GO GETTA Game V1.26

V1.26 fixes the starter-car input model on top of the verified V1.25 3D car build.

## Car-relative controls

- Up / W accelerates forward in the car's current heading.
- Down / S reverses along the same heading.
- Left / A steers left without strafing.
- Right / D steers right without strafing.
- Building collision still constrains vehicle movement.
- Walking controls remain unchanged when the player is out of the car.

The existing authoritative `tgg-game-v1` state remains the only player/vehicle position store.

## Preserved systems

V1.25 and earlier systems remain intact:

- starter car proximity enter / exit;
- 3D car mesh and wheel animation;
- third-person follow camera;
- animated walking;
- building collision;
- five enterable 3D hubs;
- Manager M mission interaction;
- save / continue;
- career, economy, city events, circuits, district story;
- NPC memory, relationships and contact opportunities;
- read-only Creator OS/world discovery.

## Verification

- [x] V1.26 static contract
- [x] forward movement follows current heading
- [x] reverse movement follows current heading backward
- [x] steering changes heading without lateral strafing
- [x] vehicle collision remains enforced
- [x] car continues following authoritative game state
- [x] player hides while driving and returns after exit
- [x] entering/exiting the car creates no cash or XP reward
- [x] Static CI PASS on `745f433`
- [x] Chromium Smoke PASS on `745f433`
- [x] production remains gated

## Release status

**V1.26-FIXED-DRIVING-CONTROLS-VERIFIED.**

Next internal development layer: **V1.27 Cinematic Camera + Radar**.
