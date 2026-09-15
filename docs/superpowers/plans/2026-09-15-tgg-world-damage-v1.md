# TRU GO GETTA WORLD Damage V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the first DAMAGE vertical slice: deterministic health/armor/hit-zone/KO math now, then Unreal-authoritative replication and adapters on UE 5.8 without modifying checkpoint `e628173` in place.

**Architecture:** DAMAGE is an additive overlay under `game/unreal-fastlane/overlays/damage-v1/`. A pure C++ deterministic core owns calculation rules; Unreal adapters/components own authority, replication, hit resolution, and presentation events. `e628173` remains immutable until a new checkpoint candidate passes real UE 5.8 package/runtime evidence.

**Tech Stack:** C++17 portable core, Unreal Engine 5.8 C++, GitHub Actions hosted C++ contract tests, PowerShell overlay application, existing Windows UE 5.8 evidence runner.

**Spec:** `docs/superpowers/specs/2026-09-15-tgg-world-damage-system-design.md`

## Global Constraints

- Base checkpoint `e628173` is immutable.
- Existing evidence-weighted game completion remains 70% until real packaged runtime evidence passes.
- Final damage resolution is server-authoritative.
- No client-provided final damage value may directly mutate replicated health/armor.
- No EOS, Supabase, Sentry, or other privileged credentials may be committed or logged.
- Portable core must compile without Unreal headers.
- Overlay application must fail closed if `TGGWorld.uproject` or `Source/TGGWorld` is absent.

---

### Task 1: Deterministic Damage Math Core

**Files:**
- Create: `game/unreal-fastlane/overlays/damage-v1/Tests/TGGDamageMathTests.cpp`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageTypes.h`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageMath.h`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGDamageMath.cpp`
- Create: `.github/workflows/tgg-world-damage-contract-check.yml`

**Interfaces:**
- Produces: `ETGGDamageType`, `ETGGHitZone`, `FTGGDamageRequest`, `FTGGDamageResult`, `FTGGDamageMath::Resolve(const FTGGDamageRequest&)`, `FTGGDamageMath::HitZoneMultiplier(ETGGHitZone)`.

- [ ] **Step 1: Write the failing portable test first**

Test real behavior for torso/head/limb multipliers, armor absorption/spillover, invulnerability, negative damage clamp, zero damage, exact KO, non-negative outputs, and deterministic repeated requests.

- [ ] **Step 2: Run hosted CI and verify RED**

Workflow command:

```bash
g++ -std=c++17 -Wall -Wextra -Werror \
  game/unreal-fastlane/overlays/damage-v1/Tests/TGGDamageMathTests.cpp \
  game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGDamageMath.cpp \
  -Igame/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public \
  -o damage-tests
./damage-tests
```

Expected RED before production files exist: compile failure because `Combat/TGGDamageMath.h` is missing.

- [ ] **Step 3: Implement minimal portable production code**

Rules copied from the approved spec: head `2.0`, torso/generic `1.0`, arm/leg `0.75`; clamp negative base damage to zero; invulnerable targets take zero; armor absorbs before health; health/armor clamp to zero; KO when positive resolved damage reduces health to zero.

- [ ] **Step 4: Re-run hosted CI and verify GREEN**

Expected: compiler exit 0 and test binary prints `TGG_DAMAGE_MATH_TESTS: PASS`.

- [ ] **Step 5: Refactor only after GREEN**

Keep public types small and Unreal-independent. Re-run the full workflow after any cleanup.

---

### Task 2: Hit-Zone Mapping Contract

**Files:**
- Create: `game/unreal-fastlane/overlays/damage-v1/Tests/TGGHitZoneMapTests.cpp`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGHitZoneMap.h`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGHitZoneMap.cpp`
- Modify: `.github/workflows/tgg-world-damage-contract-check.yml`

**Interfaces:**
- Consumes: `ETGGHitZone` from Task 1.
- Produces: portable `FTGGHitZoneMap::FromName(std::string_view)` fallback behavior used later by Unreal adapters.

- [ ] **Step 1:** Add failing tests proving known names map correctly and unknown/empty names map to `Generic`.
- [ ] **Step 2:** Verify RED in hosted CI.
- [ ] **Step 3:** Implement the smallest case-normalized mapping table needed by the tests.
- [ ] **Step 4:** Verify all damage + hit-zone tests GREEN.

---

### Task 3: Unreal Damage Component Overlay

**Files:**
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Public/Combat/TGGDamageComponent.h`
- Create: `game/unreal-fastlane/overlays/damage-v1/Source/TGGWorld/Private/Combat/TGGDamageComponent.cpp`
- Create: `game/unreal-fastlane/overlays/damage-v1/Tests/TGGDamageComponentContract.Tests.ps1`

**Interfaces:**
- Consumes: Task 1 math core.
- Produces: `UTGGDamageComponent` with authority-only mutation, replicated `Health`, `Armor`, `bKnockedOut`, reset path, and Blueprint multicast events.

- [ ] **Step 1:** Add structural contract test first for replication fields, `GetLifetimeReplicatedProps`, authority guard, `ApplyDamage`, `ResetForRespawn`, and no embedded privileged credentials.
- [ ] **Step 2:** Verify RED before component files exist.
- [ ] **Step 3:** Implement component overlay with server-authoritative state and event transitions.
- [ ] **Step 4:** Verify structural contract GREEN.
- [ ] **Step 5:** Do not claim Unreal compile success until UE 5.8 runner compiles it.

---

### Task 4: Safe Overlay Application

**Files:**
- Create: `game/unreal-fastlane/overlays/damage-v1/scripts/windows/Apply-TGGDamageOverlay.ps1`
- Create: `game/unreal-fastlane/overlays/damage-v1/Tests/Apply-TGGDamageOverlay.Tests.ps1`
- Create: `game/unreal-fastlane/overlays/damage-v1/README.md`

**Interfaces:**
- Consumes: overlay files from Tasks 1-3.
- Produces: deterministic application into a reconstructed checkpoint workspace only.

- [ ] **Step 1:** Write failing PowerShell contract tests requiring fail-closed checks for `TGGWorld.uproject` and `Source/TGGWorld`.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement copy/apply logic with no mutation of archive chunks or canonical checkpoint files.
- [ ] **Step 4:** Verify GREEN.

---

### Task 5: UE 5.8 Runtime Verification and New Checkpoint Candidate

**Files:**
- Modify only after Tasks 1-4 are GREEN: damage branch runtime workflow/runbook files as needed.
- Create a new checkpoint directory only after real UE compile/package evidence.

**Interfaces:**
- Consumes: applied DAMAGE overlay.
- Produces: packaged compile/runtime evidence and, only if PASS, a new immutable checkpoint candidate derived from `e628173`.

- [ ] **Step 1:** Apply overlay to reconstructed `e628173` on the dedicated `tgg-ue58` workstation.
- [ ] **Step 2:** Compile UE 5.8 and run component/replication tests.
- [ ] **Step 3:** Run two-client server-authority validation and packaged Creator District regression smoke.
- [ ] **Step 4:** Verify logs/artifacts before making any completion claim.
- [ ] **Step 5:** Mint a new checkpoint only if all required evidence passes; otherwise keep `e628173` as the verified rollback baseline.

## Self-review

- Spec coverage: health, armor, typed damage, hit zones, KO/reset, authority, replication, overlay safety, and runtime evidence are each mapped to tasks.
- Placeholder scan: no implementation step depends on TBD behavior; values and interfaces are explicit.
- Type consistency: Task 2 and Task 3 consume the Task 1 `ETGGHitZone` / request-result types; Task 5 consumes the exact overlay produced by Tasks 1-4.
