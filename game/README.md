# TRU GO GETTA Game V1.28

V1.28 adds verified driving feel upgrades on top of the existing 3D city and starter-car stack.

## Driving upgrades

- SPACE handbrake state
- handbrake steering boost for tighter drift rotation
- visible skid-mark fade-in while drifting above speed threshold
- H horn input with in-browser audio fallback
- live DRIVE MODE HUD: PARK / IDLE / CRUISE / BRAKE / DRIFT
- starter car, chase camera, radar, speedometer, steering, headlights and brake lights preserved

## Verification

- [x] V1.28 static contract
- [x] starter car exists and is reachable
- [x] enter car switches to chase camera
- [x] forward driving exceeds drift threshold
- [x] SPACE sets handbrake in authoritative driving state
- [x] handbrake state syncs into 3D vehicle dynamics
- [x] HUD reports DRIFT
- [x] skid visuals activate
- [x] H horn returns success and shows HONK
- [x] handbrake releases cleanly
- [x] exit car restores orbit camera
- [x] mission and save controls remain present
- [x] Static CI PASS
- [x] Chromium Smoke PASS on `11a2944`
- [x] production remains gated

## Release status

**V1.28-DRIFT-HORN-VERIFIED.**

Next internal development layer: **V1.29 Bulk World Upgrade**.
