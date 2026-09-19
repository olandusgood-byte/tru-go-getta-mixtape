# TRU GO GETTA Game V1.20

V1.20 turns earned NPC relationships into local contact opportunities that reuse existing city events instead of creating a second reward system.

## Contact opportunities

- Manager Introduction — M — requires TRUSTED — complete through Release Rush
- Producer Lock-In — Kane — requires FAMILIAR — complete through Studio Pop-In
- DJ Test Spin — DJ V — requires FAMILIAR — complete through Release Rush

Opportunity state is stored inside the existing `tgg-route-memory-v1` object under `opportunities`.

## Completion rules

Starting an opportunity records the linked event's current run count. The opportunity only completes after that existing event successfully runs again and its run count advances.

The opportunity layer itself:

- awards no cash;
- awards no XP;
- awards no reputation;
- calls no economy reward API;
- creates no separate localStorage key;
- adds no remote mutation API.

## Verification

- [x] Manager Introduction unlocks at M = Trusted
- [x] Producer Lock-In unlocks at Kane = Familiar
- [x] DJ Test Spin remains locked while DJ V = Intro
- [x] opportunity UI auto-renders in City Events
- [x] Manager Introduction starts successfully
- [x] Release Rush completes Manager Introduction
- [x] completion adds exactly the existing 450 cash
- [x] no opportunity bonus payout
- [x] no separate opportunity save store
- [x] Opportunity Knocks achievement unlocks
- [x] Static CI PASS
- [x] Chromium Smoke PASS on `6095ecc`
- [x] production remains gated

## Release status

**V1.20-NPC-FAVOR-HOOKS-CONTACT-OPPORTUNITIES-VERIFIED.**

Next internal development layer: **V1.21 Contact Chains + Opportunity History**.
