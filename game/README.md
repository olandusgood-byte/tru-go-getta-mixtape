# TRU GO GETTA Game V1.19

V1.19 turns the V1.18 encounter memory into deterministic NPC relationship and dialogue states without creating another save store or another reward system.

## Relationship tiers

Each NPC relationship is derived from two things only:

1. the player has actually met that NPC through the district story route;
2. mastery of that NPC's linked city activity.

Tiers:

- STRANGER
- INTRO
- FAMILIAR
- TRUSTED
- INNER CIRCLE

Linked activities:

- M → Street Cypher
- Kane → Studio Pop-In
- DJ V → Release Rush

Repeatedly pressing TALK does not increase relationship status. Activity mastery does.

## Persistence

Relationships remain inside the existing `tgg-route-memory-v1` state under `relationships`. No `tgg-relationship-v1` store is created.

## Safety / economy

The relationship module:

- cannot award cash;
- cannot award XP;
- cannot award reputation;
- cannot apply economy rewards;
- cannot write remote story/social state;
- only changes local dialogue/relationship memory.

## Verification

- [x] M starts Stranger before meeting
- [x] meeting M with existing Regular mastery produces Familiar
- [x] repeated M talk remains Familiar with unchanged run count
- [x] fifth Street Cypher advances M to Trusted
- [x] Trusted M dialogue changes
- [x] Trusted Contact achievement unlocks
- [x] relationships persist in `tgg-route-memory-v1`
- [x] no separate relationship store
- [x] Static CI PASS on `31d8ac1`
- [x] Chromium Smoke PASS on `31d8ac1`
- [x] production remains gated

## Release status

**V1.19-NPC-DIALOGUE-RELATIONSHIP-MEMORY-VERIFIED.**

Next internal development layer: **V1.20 NPC Favor Hooks + Contact Opportunities**.
