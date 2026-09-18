# TRU GO GETTA Game V1.32

V1.32 turns the verified V1.31 living street layer into a local 3D event system with crowd reactions, while keeping the existing economy, missions and Creator OS boundaries intact.

## Street Events

Three on-foot hotspots are active in the 3D city:

- Downtown Cypher
- Studio Sidewalk
- Mixtape Pop-Out

Walk into a hotspot and press **G** (or use the contextual prompt) to start the local event.

## Crowd reactions

When a street event starts:

- up to four nearby 3D pedestrians gather around the player;
- the crowd faces the performance;
- arms/body animation shifts into a reaction pose;
- the event HUD moves through BUILD → LIVE → FINISH;
- completing the event releases pedestrians back to their ambient routes;
- local crowd hype and event history persist in `tgg-street-events-v1`.

The street-event layer does **not** award cash, XP or reputation and does not call any Creator OS/world mutation API.

## Preserved stack

Everything verified through V1.31 remains intact:

- smooth car driving, braking, drift, horn and collision;
- cinematic camera + live radar;
- garage customization and handling presets;
- 3D Apartment, Media, Shops, Park, Garage and Recording Studio;
- live navigation;
- six ambient traffic vehicles + six animated pedestrians;
- street conversations and traffic proximity;
- missions, save/continue, economy, city events, circuits and story;
- NPC memory, relationships and contact opportunities;
- read-only world/Creator OS discovery.

## Verification

- [x] V1.32 static contract
- [x] three street-event hotspots
- [x] contextual G-to-start prompt
- [x] 3D crowd gather
- [x] crowd reaction animation
- [x] live event HUD
- [x] event completion + crowd release
- [x] local event persistence
- [x] crowd hype persistence
- [x] no cash / XP reward path
- [x] no remote mutation path
- [x] V1.31 regression suite preserved
- [x] Static CI PASS on `36b5803`
- [x] Chromium Smoke PASS on `36b5803`
- [x] production remains gated

## Release status

**V1.32-STREET-EVENTS-CROWD-REACTIONS-VERIFIED.**

Next internal development layer: **V1.33 Street Reputation + Event Variants**.
