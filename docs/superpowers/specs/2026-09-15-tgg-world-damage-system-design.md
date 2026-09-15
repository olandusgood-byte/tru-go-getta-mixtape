# TRU GO GETTA WORLD Damage System Design

Generated: 2026-09-15  
Branch: `tgg-world-damage-system`  
Base checkpoint: `e628173` (immutable)  
Target engine: Unreal Engine 5.8

## Goal

Add a reusable, server-authoritative damage foundation for TRU GO GETTA WORLD that supports players, NPCs, vehicles, missions, and future environmental hazards without hard-coding combat rules into characters or mission scripts.

The first vertical slice covers health, armor, typed damage, hit-zone multipliers, knock-out state, respawn/reset, fall/collision/vehicle/environment damage entry points, replicated state, and HUD/event hooks. The system must remain deterministic enough for hosted non-Unreal tests and authoritative enough for multiplayer anti-cheat requirements.

## Non-goals for v1

- Gore, dismemberment, or graphic injury rendering.
- A full weapon inventory or ballistics system.
- Permanent medical/injury persistence across sessions.
- Full destructible-building simulation.
- Friendly-fire/team rules until the existing team/crew model is mapped into Unreal runtime state.
- Changing the evidence-weighted 70% runtime score from source/config work alone.

## Checkpoint safety

`e628173` remains read-only. DAMAGE work is developed on `tgg-world-damage-system` as an additive overlay/new-checkpoint candidate. The current runtime evidence run for `e628173` remains valid and must not be cancelled or reclassified because of DAMAGE source work.

The overlay lives under `game/unreal-fastlane/overlays/damage-v1/`. A later packaging step applies it to a reconstructed source tree and creates a new immutable checkpoint only after compile/test evidence exists.

## Architecture

### 1. Deterministic damage math core

A pure C++ layer performs all damage calculations without requiring Unreal object state. This makes core behavior testable on hosted runners before UE 5.8 packaging is available.

Core inputs:

```cpp
enum class ETGGDamageType : uint8_t {
  Ballistic,
  Melee,
  Fall,
  Fire,
  Explosion,
  Vehicle,
  Environment
};

enum class ETGGHitZone : uint8_t {
  Head,
  Torso,
  Arm,
  Leg,
  Generic
};

struct FTGGDamageRequest {
  float BaseDamage;
  ETGGDamageType DamageType;
  ETGGHitZone HitZone;
  float CurrentHealth;
  float CurrentArmor;
  bool bInvulnerable;
};

struct FTGGDamageResult {
  float AppliedDamage;
  float ArmorDamage;
  float HealthDamage;
  float RemainingArmor;
  float RemainingHealth;
  bool bKnockedOut;
};
```

Rules for v1:

- Negative input damage is clamped to `0`.
- Invulnerable targets take `0` damage.
- Hit-zone multipliers are `Head=2.0`, `Torso=1.0`, `Arm=0.75`, `Leg=0.75`, `Generic=1.0`.
- Armor absorbs incoming modified damage before health, one damage point per armor point.
- Excess damage after armor reaches zero is applied to health.
- Health and armor never fall below `0`.
- `bKnockedOut=true` when remaining health reaches `0` from a positive damaging request.
- Damage type is carried through the request for policy/event routing but does not alter the base scalar in v1; type-specific resistances are an extension point rather than hidden magic numbers.

### 2. Unreal runtime component

`UTGGDamageComponent : UActorComponent` owns authoritative runtime state:

- `MaxHealth`
- `Health`
- `MaxArmor`
- `Armor`
- `bKnockedOut`
- `bInvulnerable`

The component exposes a server-only `ApplyDamage(const FTGGDamageRequest&)` path, delegates deterministic calculation to the math core, updates replicated state, and emits events. Clients never directly set health or armor.

Expected public events/hooks:

- `OnDamageApplied`
- `OnArmorChanged`
- `OnHealthChanged`
- `OnKnockedOut`
- `OnRespawnReset`

### 3. Replication / authority

- Health, armor, and KO state replicate from server to clients.
- Any client-originating hit intent must be validated by an authoritative gameplay system before calling the component.
- The damage component does not trust client-provided final damage values as evidence of a hit.
- `GetLifetimeReplicatedProps` is used for replicated state.
- HUD and cosmetic feedback subscribe to replicated state/events instead of driving state.

### 4. Hit-zone adapter

The core accepts an `ETGGHitZone`. Unreal-side hit resolution maps a validated bone/physical-material hit to that enum.

Unknown bones/materials map to `Generic`, never to `Head`.

The mapping table is data-driven so character meshes can evolve without rewriting damage math.

### 5. KO and respawn

When health reaches zero:

- `bKnockedOut` becomes true on the authority.
- A KO event is emitted once per transition.
- Movement/input disabling is handled by the owning pawn/controller/game mode, not by the math core.
- The component exposes `ResetForRespawn(float HealthPercent, float ArmorPercent)`.
- Default reset is `100%` health and `0%` armor unless the calling game mode specifies otherwise.

This keeps respawn policy outside the reusable damage component.

### 6. Fall / collision / vehicle / environment inputs

These systems convert domain-specific data into `FTGGDamageRequest`:

- Fall: impact velocity/height curve -> `ETGGDamageType::Fall`.
- Vehicle collision: validated relative speed/impact -> `Vehicle`.
- Fire volumes: periodic server tick -> `Fire`.
- Explosions: server radial damage calculation -> `Explosion`.
- Environmental hazards: mission/world logic -> `Environment`.

The damage component receives the normalized result; it does not calculate physics impact severity itself.

### 7. Vehicles

Vehicles reuse the deterministic math core but receive a separate runtime adapter/component so character KO semantics are not mixed with vehicle disabled/destroyed semantics.

The first DAMAGE vertical slice only establishes the shared request/result math and vehicle damage entry contract. Full subsystem damage (engine/tires/body) is a later layer.

### 8. HUD / feedback contract

The UI consumes normalized events/state:

- health percent
- armor percent
- last damage type
- last hit direction when available from validated Unreal hit data
- KO state

The damage layer does not own widgets. This prevents combat logic from coupling to a particular HUD design.

### 9. Persistence

Moment-to-moment health/armor are runtime state and are not written continuously to Supabase.

Persistent consequences may be recorded by existing mission/career systems after authoritative events such as KO, mission failure, insurance/medical cost, or vehicle destruction. The damage component emits facts; progression systems decide what persists.

### 10. Telemetry / evidence

Telemetry may record sanitized events such as damage type, hit zone, amount bucket, KO transition, and build/checkpoint ID. No access tokens, EOS credentials, email addresses, or raw player identifiers are written to combat logs.

Source completion never advances the existing evidence-weighted game percentage. A DAMAGE checkpoint only becomes runtime-verified after real UE 5.8 compile/package and gameplay evidence.

## Additive file layout

The implementation overlay will use focused files:

- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageTypes.h`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageMath.h`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGDamageMath.cpp`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageComponent.h`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGDamageComponent.cpp`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGHitZoneMap.h`
- `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGHitZoneMap.cpp`
- `game/unreal-fastlane/overlays/damage-v1/Tests/TGGDamageMathTests.cpp`
- `game/unreal-fastlane/overlays/damage-v1/scripts/windows/Apply-TGGDamageOverlay.ps1`
- `game/unreal-fastlane/overlays/damage-v1/README.md`

`Apply-TGGDamageOverlay.ps1` must fail closed if it cannot find `TGGWorld.uproject` and the `Source/TGGWorld` module. It must never silently create a guessed Unreal module path.

## Test strategy

Hosted/portable tests cover:

- head/torso/limb multipliers
- armor fully absorbs damage
- armor spillover to health
- invulnerability
- zero/negative damage
- exact KO transition
- no negative health/armor
- deterministic repeated requests

UE 5.8 runtime tests cover:

- replication of health/armor/KO
- server-only mutation
- event firing once per state transition
- reset/respawn state
- hit-zone mapping fallback to `Generic`
- fall/collision/environment adapter integration
- packaged HUD feedback path

## Security / multiplayer invariants

- Server owns final damage resolution.
- No client may set replicated health/armor fields directly.
- No client-provided damage number is accepted without authoritative validation upstream.
- No privileged runtime credentials are compiled into DAMAGE code or tests.
- Damage logs must not leak private identifiers or auth tokens.

## Rollout order

1. Pure math + portable tests.
2. Replicated character component.
3. Hit-zone mapper.
4. KO/reset hooks.
5. Fall/environment adapters.
6. Vehicle damage contract.
7. HUD/event integration.
8. UE 5.8 compile/package and multiplayer validation.
9. Only after runtime PASS, mint a new immutable checkpoint derived from `e628173` + DAMAGE overlay.

## Acceptance criteria

The DAMAGE v1 source layer is ready for a new checkpoint candidate when all portable tests pass, the overlay applies without modifying the canonical checkpoint, Unreal source compiles on UE 5.8, server authority is preserved, replication works in a two-client test, KO/reset works, and packaged smoke evidence confirms no regression to the existing Creator District vertical slice.
