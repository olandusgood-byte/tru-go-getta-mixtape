# TRU GO GETTA Game V1.31

V1.31 turns the V1.30 living-city layer into an interactive street layer without adding another economy or remote mutation path.

## Street Life

- six ambient pedestrian contacts are proximity-aware;
- walking near a local surfaces a contextual F-to-talk prompt;
- talks persist in `tgg-street-life-v1`;
- repeated street conversations record local contact history but add no cash, XP or reputation;
- driving near ambient traffic surfaces distance awareness;
- horn input can trigger a nearby-traffic reaction state;
- street prompts remain contextual instead of crowding the permanent controller deck.

## Preserved 3D stack

- local Three.js runtime;
- smooth car controls, drift, horn and speedometer;
- cinematic camera + radar;
- garage customization and handling presets;
- 3D apartment, media, shops, park, garage and recording studio;
- live mission navigation;
- six ambient traffic vehicles and six pedestrians;
- mission, save/continue, city events, circuits, story, NPC memory and contact opportunities.

## Verification

- [x] Street Life API
- [x] six local street contacts
- [x] pedestrian proximity talk
- [x] contact memory persistence
- [x] street talk adds no cash or XP
- [x] traffic proximity HUD
- [x] horn reaction
- [x] horn reaction adds no reward
- [x] mission + save controls preserved
- [x] Static CI PASS on `42348c1`
- [x] Chromium Smoke PASS on `42348c1`
- [x] production remains gated

## Release status

**V1.31-STREET-LIFE-TRAFFIC-PROXIMITY-VERIFIED.**

Next internal development layer: **V1.32 Street Events + Crowd Reactions**.
