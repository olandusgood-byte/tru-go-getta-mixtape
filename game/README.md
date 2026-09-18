# TRU GO GETTA Game V1.27

V1.27 adds cinematic camera modes and a live city radar on top of the verified V1.26 driving checkpoint.

## Cinematic camera

- Orbit — existing drag-to-orbit camera with wheel zoom.
- Chase — tighter camera locked behind the player or starter car.
- Top — fast overhead city view.
- Camera button cycles modes.
- C key cycles modes from the keyboard.

## Live radar

The radar reads the same authoritative 3D coordinates already used by the game:

- player marker;
- starter-car marker;
- five 3D hub markers;
- current camera mode.

It does not create another movement, save, economy, or reward state.

## Preserved systems

- V1.26 car-relative forward / reverse / steering;
- vehicle and building collision;
- starter-car entry / exit;
- animated walking and NPC facing;
- unified E interaction for M, car, and five hubs;
- missions, save/continue, economy, city events, circuits and story;
- relationship memory and contact opportunities;
- read-only Creator OS/world discovery.

## Verification

- [x] V1.27 static contract
- [x] camera starts in Orbit
- [x] camera button cycles to Chase and Top
- [x] Top mode reaches overhead view
- [x] C key cycles back to Orbit
- [x] live radar renders player and starter car
- [x] five hub markers render on radar
- [x] player radar marker moves with authoritative game state
- [x] camera/radar layer adds no reward or persistence authority
- [x] Static CI PASS on `5e67abf`
- [x] Chromium Smoke PASS on `5e67abf`
- [x] production remains gated

## Release status

**V1.27-CINEMATIC-CAMERA-RADAR-VERIFIED.**

Next internal development layer: **V1.28 Smooth Driving + Living Traffic**.
