# TRU GO GETTA Game V1.21

V1.21 is the first true WebGL city foundation. It keeps the verified V1.20 gameplay/economy/NPC systems and replaces only the city presentation layer when WebGL is available.

## Real 3D foundation

- Three.js WebGL renderer pinned to 0.186.0.
- Perspective third-person chase camera.
- Drag-to-orbit camera.
- Wheel zoom.
- Lit/shadowed 3D player character and Manager M.
- Ground plane, road network, sidewalks, district pads, street lights and 3D buildings.
- Fog, tone mapping and emissive city lighting.
- Player mesh reads the existing `TGGGame` x/y/heading state.
- Existing keyboard/D-pad movement remains authoritative.

## Fail-safe visual architecture

The verified V1.20 2.5D city stays underneath as fallback. When WebGL initializes, the 3D canvas takes over and the fallback player/city layers are hidden. If the 3D engine fails to load, the working 2.5D play surface remains usable.

## Safety

The 3D renderer is presentation-only:

- no save writes;
- no cash/XP/REP rewards;
- no career mutation;
- no world RPC mutations;
- no replacement movement/economy store.

## Verification

- [x] V1.21 static contract
- [x] Three.js engine pin
- [x] WebGL canvas boot
- [x] Perspective camera exists
- [x] 3D player follows real game movement
- [x] third-person camera stays above the player
- [x] drag-to-orbit changes camera yaw
- [x] readable V1.20 controls remain intact
- [x] prior gameplay/economy/NPC smoke coverage remains intact
- [x] Static CI PASS
- [x] WebGL Chromium Smoke PASS
- [x] production remains gated

## Release status

**V1.21-3D-WORLD-FOUNDATION-VERIFIED.**

Next internal development layer: **V1.22 3D Collision + Walkable Districts**.
