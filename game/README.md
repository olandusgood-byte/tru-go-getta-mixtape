# TRU GO GETTA Game V1.22

V1.22 turns the V1.21 WebGL city into a walkable 3D space with building collision and live district awareness.

## 3D movement

- Authoritative `TGGGame.move()` now asks the 3D world to constrain proposed movement.
- Building footprints block the player.
- Diagonal movement can slide along an open axis instead of stopping unnecessarily.
- Existing x/y save coordinates remain the single player-position store.
- WebGL failure still falls back to the verified 2.5D movement surface.

## District awareness

The 3D HUD reports the nearest live district while you move:

- Studio Row
- Downtown
- Mixtape Ave

## Mission alignment

Manager M's 3D model now uses the same x=72 / y=36 target that the existing mission system checks, so the visible NPC and gameplay objective agree.

## Verification

- [x] V1.22 static contract
- [x] collision map loaded from the same building footprints used by the renderer
- [x] known building footprint blocks occupancy
- [x] collision resolver slides when one axis is open
- [x] real keyboard movement is stopped by a building
- [x] collision counter increments
- [x] Downtown live district badge updates
- [x] Manager M 3D position matches mission coordinates
- [x] all V1.21 camera/player WebGL checks remain green
- [x] Static CI PASS
- [x] 3D Collision Chromium Smoke PASS
- [x] production remains gated

## Release status

**V1.22-3D-COLLISION-WALKABLE-DISTRICTS-VERIFIED.**

Next internal development layer: **V1.23 3D Animation + Interaction Prompts**.
