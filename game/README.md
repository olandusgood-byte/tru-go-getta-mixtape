# TRU GO GETTA Game V1.15

V1.15 deepens the existing repeatable city-event system without creating a second economy, a second progression store, or a remote mutation path.

## Verified layers

- V1.0–V1.4: core game, career, city, inventory gameplay
- V1.5: Character Identity
- V1.6: World Sync Foundation
- V1.7: Online Player State
- V1.8: Career + Economy
- V1.9: Inventory + Equipment
- V1.10: Social + Crew
- V1.11: Mission + Story Discovery
- V1.12: Property + Vehicle Discovery
- V1.13: Progression + Business Discovery
- V1.14: Live City + Read-Only World Assets
- V1.15: City Activity Mastery

## V1.15 City Activity Mastery

V1.15 extends the existing `tgg-events-v1` state rather than creating parallel progression:

- per-activity mastery tiers: Rookie → Regular → City Known → Headliner;
- total city-run counter and city rank;
- activity variety streak + best streak;
- persistent migration-safe streak fields inside the existing event save;
- City Regular, City Known and City Headliner achievements through the existing `tgg-progression-v1` store;
- city rank and total runs surfaced on the progression panel;
- explicit progression sync after successful event completion.

Base event economics are unchanged:

- Street Cypher: 180 cash / 35 XP / 10 REP;
- Studio Pop-In: 275 cash / 55 XP / 20 REP;
- Release Rush: 450 cash / 90 XP / 35 REP.

Crew bonuses still route through the existing bonus logic. V1.15 adds no new currency, reward multiplier, purchase surface or real-money behavior.

## Verification

- [x] JavaScript syntax gate
- [x] JSON manifest gate
- [x] V1.15 static contract
- [x] Existing V1.14 read-only world-asset safety checks
- [x] Core create / continue / save / pause controls
- [x] Automated Chromium gameplay smoke
- [x] 3 Street Cypher runs preserve exact +540 base cash
- [x] Street Cypher reaches Regular mastery
- [x] LOCAL NAME city rank at 3 runs
- [x] city-regular achievement unlock
- [x] switching to Studio Pop-In advances activity streak
- [x] production remains gated

## Safety model

- Trusted transport injection only.
- No automatic network polling.
- Property and vehicle surfaces remain inspect-only.
- No purchase, travel, spawn, driving or upgrade mutation bridge.
- No local save overwrite from remote state.
- No service-role/provider secrets.
- Production remains gated.

## Release status

**V1.15-CITY-ACTIVITY-MASTERY-VERIFIED.** Static CI and automated Chromium smoke both passed on commit `5b6919a57d62216eadeee11d9ee11ad24c07f970`.

Next internal development layer: **V1.16 City Circuits + Event Variants**.
