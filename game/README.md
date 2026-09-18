# TRU GO GETTA Game V1.22

V1.22 upgrades the V1.21 WebGL city with collision-aware movement and an orbit/zoom third-person camera.

## 3D collision

- building collision volumes are generated with the procedural city
- movement checks the next player position before committing state
- blocked movement leaves the player in place and shows a short feedback toast
- the mission/NPC area is intentionally kept clear
- the verified mission path remains reachable

## Camera orbit

- drag the WebGL view with mouse or touch to orbit the camera
- mouse wheel zooms the camera in/out
- pitch and zoom are clamped to usable ranges
- the camera continues to follow the player while preserving the chosen orbit angle

## Preserved gameplay

All verified V1.20/V1.21 systems stay intact, including missions, save/continue, city events, circuits, NPC memory, relationships, opportunities, and read-only world discovery.

## Verification

- [x] V1.22 static contract
- [x] building collision point blocks movement
- [x] road/start position remains open
- [x] collision volumes registered for the 3D city
- [x] mission path remains reachable
- [x] mouse drag changes camera yaw
- [x] wheel input changes camera distance
- [x] WebGL city/player smoke remains green
- [x] Static CI PASS
- [x] Chromium Smoke PASS
- [x] production remains gated

## Release status

**V1.22-3D-COLLISION-CAMERA-ORBIT-VERIFIED.**

Next internal development layer: **V1.23 3D District Landmarks + Enterable Hubs**.
