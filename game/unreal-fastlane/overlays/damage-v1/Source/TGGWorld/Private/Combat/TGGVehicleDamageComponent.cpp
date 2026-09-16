#include "Combat/TGGVehicleDamageComponent.h"

#include "Combat/TGGDamageMath.h"
#include "GameFramework/Actor.h"
#include "Net/UnrealNetwork.h"

UTGGVehicleDamageComponent::UTGGVehicleDamageComponent() {
  PrimaryComponentTick.bCanEverTick = false;
  SetIsReplicatedByDefault(true);
}

void UTGGVehicleDamageComponent::BeginPlay() {
  Super::BeginPlay();
  if (GetOwner() && GetOwner()->HasAuthority()) {
    MaxDurability = FMath::Max(1.0f, MaxDurability);
    Durability = FMath::Clamp(Durability, 0.0f, MaxDurability);
    bDisabled = Durability <= 0.0f;
  }
}

bool UTGGVehicleDamageComponent::ApplyVehicleDamage(const FTGGDamageRequest& Request) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority() || bDisabled) return false;

  FTGGDamageRequest Authoritative = Request;
  Authoritative.CurrentHealth = Durability;
  Authoritative.CurrentArmor = 0.0f;
  Authoritative.bInvulnerable = bInvulnerable;
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Authoritative);
  if (Result.AppliedDamage <= 0.0f) return false;

  const float PreviousDurability = Durability;
  const bool bWasDisabled = bDisabled;
  Durability = Result.RemainingHealth;
  bDisabled = Result.bKnockedOut;

  if (!FMath::IsNearlyEqual(PreviousDurability, Durability)) {
    OnDurabilityChanged.Broadcast(PreviousDurability, Durability);
  }
  if (!bWasDisabled && bDisabled) OnDisabled.Broadcast();
  return true;
}

bool UTGGVehicleDamageComponent::SetInvulnerable(const bool bNewInvulnerable) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority()) return false;
  bInvulnerable = bNewInvulnerable;
  return true;
}

bool UTGGVehicleDamageComponent::RestoreDurability(const float DurabilityPercent) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority()) return false;

  const float PreviousDurability = Durability;
  const bool bWasDisabled = bDisabled;
  Durability = MaxDurability * FMath::Clamp(DurabilityPercent, 0.0f, 1.0f);
  bDisabled = Durability <= 0.0f;
  if (!FMath::IsNearlyEqual(PreviousDurability, Durability)) {
    OnDurabilityChanged.Broadcast(PreviousDurability, Durability);
  }
  if (bWasDisabled && !bDisabled) OnRestored.Broadcast();
  return true;
}

float UTGGVehicleDamageComponent::GetDurabilityPercent() const {
  return MaxDurability > 0.0f ? Durability / MaxDurability : 0.0f;
}

void UTGGVehicleDamageComponent::OnRep_Durability(const float PreviousDurability) {
  OnDurabilityChanged.Broadcast(PreviousDurability, Durability);
}

void UTGGVehicleDamageComponent::OnRep_Disabled(const bool bPreviousDisabled) {
  if (!bPreviousDisabled && bDisabled) OnDisabled.Broadcast();
  if (bPreviousDisabled && !bDisabled) OnRestored.Broadcast();
}

void UTGGVehicleDamageComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const {
  Super::GetLifetimeReplicatedProps(OutLifetimeProps);
  DOREPLIFETIME(UTGGVehicleDamageComponent, Durability);
  DOREPLIFETIME(UTGGVehicleDamageComponent, bDisabled);
  DOREPLIFETIME(UTGGVehicleDamageComponent, bInvulnerable);
}
