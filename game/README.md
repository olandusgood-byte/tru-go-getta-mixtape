# TRU GO GETTA Game V1.29

V1.29 consolidates the latest 3D world upgrades into a verified playtest checkpoint.

## Bulk world upgrade

- persistent TGG Garage using `tgg-garage-v1`
- live car paint + wheel finish
- Street / Sport / Drift handling presets
- tighter vehicle collision margin than walking
- local bundled Three.js runtime
- real 3D Recording Studio interior
- Manager M proximity dialogue
- on-screen Drift / Handbrake control
- on-screen Horn control
- V1.28 driving stack preserved

## Verification

- [x] local Three.js revision 152 loads without CDN dependency
- [x] garage opens from the city
- [x] paint / wheels / tune apply to the live 3D car
- [x] garage state persists through reload
- [x] drift tune updates authoritative drive tuning
- [x] vehicle collision footprint is stricter than walking
- [x] Manager M proximity dialogue appears near M
- [x] 3D studio renderer boots and displays a canvas
- [x] on-screen drift control changes handbrake state
- [x] on-screen horn control triggers HONK
- [x] mission and save controls remain intact
- [x] Static CI PASS
- [x] Chromium Smoke PASS on `4eab567`
- [x] production remains gated

## Release status

**V1.29-BULK-WORLD-UPGRADE-VERIFIED.**

Next internal development layer: **V1.30 City Interiors + Traffic Interaction**.
