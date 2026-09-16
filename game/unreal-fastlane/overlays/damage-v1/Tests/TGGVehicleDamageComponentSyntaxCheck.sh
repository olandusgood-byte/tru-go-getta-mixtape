#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUB="${TMPDIR:-/tmp}/tgg-damage-ue-stubs"
rm -rf "$STUB"
mkdir -p "$STUB/Components" "$STUB/GameFramework" "$STUB/Net"
cat > "$STUB/Components/ActorComponent.h" <<'H'
#pragma once
#include <algorithm>
template <typename T> class TArray {};
struct FLifetimeProperty {};
class AActor;
struct FPrimaryComponentTick { bool bCanEverTick = false; };
class UActorComponent {
public:
  virtual ~UActorComponent() = default;
  virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>&) const {}
  virtual void BeginPlay() {}
  AActor* GetOwner() const { return Owner; }
  void SetOwner(AActor* InOwner) { Owner = InOwner; }
  void SetIsReplicatedByDefault(bool) {}
  FPrimaryComponentTick PrimaryComponentTick;
private:
  AActor* Owner = nullptr;
};
struct FMath {
  static float Max(float A, float B) { return std::max(A, B); }
  static float Clamp(float V, float A, float B) { return std::max(A, std::min(V, B)); }
  static bool IsNearlyEqual(float A, float B, float Epsilon = 0.0001f) { return (A > B ? A-B : B-A) <= Epsilon; }
};
struct FStubDelegate { template <typename... Args> void Broadcast(Args...) {} };
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(Name, T1, N1, T2, N2) using Name = FStubDelegate
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE(Name) using Name = FStubDelegate
#define UCLASS(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define GENERATED_BODY() using Super = UActorComponent;
#define TGGWORLD_API
H
cat > "$STUB/GameFramework/Actor.h" <<'H'
#pragma once
class AActor { public: bool HasAuthority() const { return true; } };
H
cat > "$STUB/Net/UnrealNetwork.h" <<'H'
#pragma once
#define DOREPLIFETIME(Class, Property) do { (void)sizeof(Class); } while (0)
H
: > "$STUB/TGGVehicleDamageComponent.generated.h"
g++ -std=c++17 -Wall -Wextra -Werror -fsyntax-only \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGVehicleDamageComponent.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGDamageMath.cpp" \
  -I"$STUB" -I"$ROOT/Source/TGGWorld/Public"
echo 'TGG_VEHICLE_DAMAGE_COMPONENT_CPP_SYNTAX: PASS'
