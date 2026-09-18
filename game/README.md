# TRU GO GETTA Game V1.22

V1.22 upgrades the verified V1.21 WebGL city with real building collision and player-controlled third-person camera orbit/zoom.

## 3D collision

- 63 building collision bounds generated from the procedural city blocks.
- The existing `TGGGame.move()` path checks `TGGWorld3D.canMove()` before changing game state.
- Blocked movement leaves the authoritative player coordinates unchanged.
- Collision shows a clear **BUILDING BLOCKED — USE THE STREET** message.
- The M mission destination remains intentionally collision-safe and reachable.

## Camera controls

- Drag mouse/touch across the WebGL scene to orbit.
- Mouse wheel zooms between safe min/max distances.
- Double-click resets camera.
- Third-person follow continues while preserving the player's movement direction.
- Camera state is exposed read-only for QA.

## Preserved systems

All verified V1.21/V1.20 systems remain intact: missions, save/continue, city events, circuits, story routes, M/Kane/DJ V, relationship memory, contact opportunities, economy rules, and read-only Creator OS/world discovery.

## Verification

- [x] V1.22 static contract
- [x] 20+ building colliders present (63 in current procedural city)
- [x] known building position blocks movement
- [x] blocked movement does not change authoritative game coordinates
- [x] M mission point remains reachable
- [x] drag/touch orbit changes camera yaw
- [x] wheel zoom changes camera distance
- [x] camera reset returns yaw 0 / distance 10
- [x] focused V1.22 Chromium gate PASS
- [x] inherited full gameplay Chromium regression PASS on same runtime
- [x] production remains gated

## Release status

**V1.22-3D-COLLISION-CAMERA-ORBIT-VERIFIED.**

Next internal development layer: **V1.23 3D Walk Cycle + NPC Facing**.
