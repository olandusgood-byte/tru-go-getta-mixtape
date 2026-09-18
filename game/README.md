# TRU GO GETTA Game V1.18

V1.18 makes the district-story layer visibly playable by adding NPC route encounters and persistent local district memory.

## NPC route

- Downtown / GET SEEN → M (Manager)
- Studio Row / GET SHARP → Kane (Producer)
- Mixtape Ave / GET HEARD → DJ V (DJ)

The City Events screen now auto-renders both the District Story card and NPC Route Memory card.

## Local memory

The existing route creates local, reward-free memory in `tgg-route-memory-v1`:

- district visits;
- story beats seen;
- unique NPC contacts;
- last NPC / beat per district;
- deduplicated encounter records.

Repeatedly talking to the same NPC on the same route beat does not create duplicate encounter history.

## Remote memory

Optional remote refresh uses only:

- `tgg_world_npc_encounters`
- `tgg_world_memory_history`

The route-memory module has no cash, XP, REP, economy-apply, mission-completion, story-write or social-write authority.

## Verification

- [x] story + memory cards auto-render in City Events
- [x] M encounter recorded once
- [x] Kane appears on GET SHARP
- [x] DJ V appears on GET HEARD
- [x] Downtown / Studio Row / Mixtape Ave visits persist
- [x] three unique route contacts recorded
- [x] `know-the-city` achievement unlocks
- [x] full route payout remains the existing 905 cash
- [x] remote memory uses only NPC encounters + memory history reads
- [x] Static CI PASS on `95b30b9`
- [x] Chromium Smoke PASS on `95b30b9`
- [x] production remains gated

## Release status

**V1.18-NPC-ROUTE-ENCOUNTERS-DISTRICT-MEMORY-VERIFIED.**

Next internal development layer: **V1.19 NPC Dialogue States + Relationship Memory**.
