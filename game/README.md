# TRU GO GETTA Game V1.17

V1.17 routes verified local circuits through district unlocks and adds a read-only story discovery layer over the existing Creator OS transport.

## V1.17 District Story Routing

The new `tgg-district-story-v1` state maps the full City Run through:

- Downtown — GET SEEN — Street Cypher
- Studio Row — GET SHARP — Studio Pop-In
- Mixtape Ave — GET HEARD — Release Rush

The route cannot start until every required district is unlocked. At Level 2, Mixtape Ave blocks the route. At Level 3, the route can start and the active story beat follows the existing circuit's expected event.

## Read-only remote story

The optional story refresh uses only the existing read APIs:

- `tgg_world_creative_missions`
- `tgg_world_npc_encounters`
- `tgg_world_story_control`
- `tgg_world_memory_history`

The local story router exposes no mission accept/complete, story-arc start/claim, location join, evidence, purchase or reward mutation path.

## Verification

- [x] V1.17 static contract
- [x] District Story save repair
- [x] Level-2 Mixtape Ave route lock
- [x] Level-3 district unlock opens route
- [x] GET SEEN → GET SHARP → GET HEARD beat routing
- [x] full district story completion
- [x] district-story achievement
- [x] route module has no cash / XP / REP authority
- [x] event rewards remain the existing 180 + 275 + 450 cash
- [x] remote story calls restricted to the four read-only RPCs
- [x] Static CI PASS on `ff06ac4`
- [x] Chromium Smoke PASS on `ff06ac4`
- [x] production remains gated

## Release status

**V1.17-DISTRICT-CIRCUITS-STORY-ROUTING-VERIFIED.**

Next internal development layer: **V1.18 NPC Route Encounters + District Memory**.
