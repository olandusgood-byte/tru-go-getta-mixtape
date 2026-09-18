# TRU GO GETTA Game V1.25

V1.25 adds the first verified drivable vehicle layer on top of the unified V1.24 3D gameplay slice.

## Starter car + drive mode

- starter car rendered in the 3D city;
- enter / exit vehicle through the same interaction stack;
- saved vehicle state;
- driving speed separate from walking;
- building collision retained while driving;
- vehicle follow camera;
- wheel animation;
- no new reward or economy path.

## Preserved systems

The full V1.24 stack remains intact: animated walking, collision + slide, third-person camera, Manager M interaction, five enterable hubs, missions, save/continue, career/economy, city mastery/circuits/story, NPC memory/relationships, contact opportunities, and read-only Creator OS/world discovery.

## Verification

- [x] starter car mesh
- [x] vehicle state persists
- [x] proximity gate for vehicle entry
- [x] drive mode movement
- [x] building collision while driving
- [x] car follow camera
- [x] wheel animation
- [x] unified vehicle interaction
- [x] no vehicle reward path
- [x] repaired vehicle-exit interpolation
- [x] Static CI PASS on `0c650eb`
- [x] Chromium Smoke PASS on `0c650eb`
- [x] production remains gated

## Release status

**V1.25-STARTER-CAR-DRIVE-MODE-VERIFIED.**

Next internal development layer: **V1.26 Vehicle Handling + Garage**.
