#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUB="${TMPDIR:-/tmp}/tgg-damage-behavior-stubs"
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
class AActor {
public:
  bool HasAuthority() const { return bAuthority; }
  void SetAuthority(bool bValue) { bAuthority = bValue; }
private:
  bool bAuthority = true;
};
H
cat > "$STUB/Net/UnrealNetwork.h" <<'H'
#pragma once
#define DOREPLIFETIME(Class, Property) do { (void)sizeof(Class); } while (0)
H
: > "$STUB/TGGDamageComponent.generated.h"
: > "$STUB/TGGVehicleDamageComponent.generated.h"
cat > "$STUB/behavior.cpp" <<'CPP'
#include "Combat/TGGDamageComponent.h"
#include "Combat/TGGVehicleDamageComponent.h"
#include "Combat/TGGDamageRequestFactory.h"
#include "GameFramework/Actor.h"
#include <cmath>
#include <cstdlib>
#include <iostream>

static bool Near(float A, float B) { return std::fabs(A-B) < 0.0001f; }
static void Need(bool C, const char* M) { if (!C) { std::cerr << "TGG_DAMAGE_COMPONENT_BEHAVIOR: FAIL - " << M << '\n'; std::exit(1); } }

int main() {
  AActor Server;
  UTGGDamageComponent Character;
  Character.SetOwner(&Server);
  auto Hit = FTGGDamageRequestFactory::Ballistic(25.0f, ETGGHitZone::Torso);
  Need(Character.ApplyDamage(Hit), "character applies authoritative damage");
  Need(Near(Character.Health, 75.0f), "character health reduced");
  Need(Character.SetInvulnerable(true), "server sets invulnerability");
  Need(!Character.ApplyDamage(Hit), "invulnerable character rejects damage");
  Need(Near(Character.Health, 75.0f), "invulnerable health unchanged");
  Need(Character.SetInvulnerable(false), "server clears invulnerability");
  Need(Character.ResetForRespawn(1.0f, 0.5f), "character reset succeeds");
  Need(Near(Character.Health, 100.0f) && Near(Character.Armor, 50.0f), "character reset values");
  auto Heavy = FTGGDamageRequestFactory::Explosion(500.0f);
  Need(Character.ApplyDamage(Heavy), "heavy damage applies");
  Need(Character.bKnockedOut && Near(Character.Health, 0.0f), "character KO");
  Need(!Character.ApplyDamage(Hit), "KO rejects repeated damage");
  Need(Character.ResetForRespawn(), "character respawns");
  Need(!Character.bKnockedOut && Near(Character.Health, 100.0f), "character restored");

  AActor Client;
  Client.SetAuthority(false);
  UTGGDamageComponent ClientCharacter;
  ClientCharacter.SetOwner(&Client);
  Need(!ClientCharacter.ApplyDamage(Hit), "client cannot apply authoritative damage");
  Need(!ClientCharacter.SetInvulnerable(true), "client cannot set invulnerability");
  Need(!ClientCharacter.ResetForRespawn(), "client cannot reset state");

  UTGGVehicleDamageComponent Vehicle;
  Vehicle.SetOwner(&Server);
  auto VehicleHit = FTGGDamageRequestFactory::Vehicle(25.0f);
  Need(Vehicle.ApplyVehicleDamage(VehicleHit), "vehicle damage applies");
  Need(Near(Vehicle.Durability, 75.0f), "vehicle durability reduced");
  Need(Vehicle.ApplyVehicleDamage(Heavy), "vehicle disabling damage applies");
  Need(Vehicle.bDisabled && Near(Vehicle.Durability, 0.0f), "vehicle disabled");
  Need(!Vehicle.ApplyVehicleDamage(VehicleHit), "disabled vehicle rejects repeated damage");
  Need(Vehicle.RestoreDurability(0.5f), "vehicle repair succeeds");
  Need(!Vehicle.bDisabled && Near(Vehicle.Durability, 50.0f), "vehicle restored");

  UTGGVehicleDamageComponent ClientVehicle;
  ClientVehicle.SetOwner(&Client);
  Need(!ClientVehicle.ApplyVehicleDamage(VehicleHit), "client cannot apply vehicle damage");
  Need(!ClientVehicle.RestoreDurability(), "client cannot repair vehicle");

  std::cout << "TGG_DAMAGE_COMPONENT_BEHAVIOR: PASS\n";
}
CPP
g++ -std=c++17 -Wall -Wextra -Werror \
  "$STUB/behavior.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGDamageComponent.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGVehicleDamageComponent.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGDamageMath.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGDamageRequestFactory.cpp" \
  "$ROOT/Source/TGGWorld/Private/Combat/TGGDamagePresentation.cpp" \
  -I"$STUB" -I"$ROOT/Source/TGGWorld/Public" -o "$STUB/behavior"
"$STUB/behavior"
