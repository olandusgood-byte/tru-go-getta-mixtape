#include "Combat/TGGDamageComponent.h"

#include "Combat/TGGDamageMath.h"
#include "Combat/TGGDamagePresentation.h"
#include "GameFramework/Actor.h"
#include "Net/UnrealNetwork.h"

UTGGDamageComponent::UTGGDamageComponent() {
  PrimaryComponentTick.bCanEverTick = false;
  SetIsReplicatedByDefault(true);
}

void UTGGDamageComponent::BeginPlay() {
  Super::BeginPlay();
  if (GetOwner() && GetOwner()->HasAuthority()) {
    MaxHealth = FMath::Max(1.0f, MaxHealth);
    MaxArmor = FMath::Max(0.0f, MaxArmor);
    Health = FMath::Clamp(Health, 0.0f, MaxHealth);
    Armor = FMath::Clamp(Armor, 0.0f, MaxArmor);
    bKnockedOut = Health <= 0.0f;
  }
}

bool UTGGDamageComponent::ApplyDamage(const FTGGDamageRequest& Request) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority() || bKnockedOut) return false;

  FTGGDamageRequest Authoritative = Request;
  Authoritative.CurrentHealth = Health;
  Authoritative.CurrentArmor = Armor;
  Authoritative.bInvulnerable = bInvulnerable;
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Authoritative);
  if (Result.AppliedDamage <= 0.0f) return false;

  const float PreviousHealth = Health;
  const float PreviousArmor = Armor;
  const bool bWasKnockedOut = bKnockedOut;
  Health = Result.RemainingHealth;
  Armor = Result.RemainingArmor;
  bKnockedOut = Result.bKnockedOut;

  OnDamageApplied.Broadcast(Result.HealthDamage, Result.ArmorDamage);
  if (!FMath::IsNearlyEqual(PreviousHealth, Health)) OnHealthChanged.Broadcast(PreviousHealth, Health);
  if (!FMath::IsNearlyEqual(PreviousArmor, Armor)) OnArmorChanged.Broadcast(PreviousArmor, Armor);
  if (!bWasKnockedOut && bKnockedOut) OnKnockedOut.Broadcast();
  return true;
}

bool UTGGDamageComponent::SetInvulnerable(const bool bNewInvulnerable) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority()) return false;
  bInvulnerable = bNewInvulnerable;
  return true;
}

bool UTGGDamageComponent::ResetForRespawn(const float HealthPercent, const float ArmorPercent) {
  AActor* Owner = GetOwner();
  if (!Owner || !Owner->HasAuthority()) return false;

  const float PreviousHealth = Health;
  const float PreviousArmor = Armor;
  Health = MaxHealth * FMath::Clamp(HealthPercent, 0.0f, 1.0f);
  Armor = MaxArmor * FMath::Clamp(ArmorPercent, 0.0f, 1.0f);
  bKnockedOut = false;
  OnHealthChanged.Broadcast(PreviousHealth, Health);
  OnArmorChanged.Broadcast(PreviousArmor, Armor);
  OnRespawnReset.Broadcast();
  return true;
}

float UTGGDamageComponent::GetHealthPercent() const {
  return MaxHealth > 0.0f ? Health / MaxHealth : 0.0f;
}

float UTGGDamageComponent::GetArmorPercent() const {
  return MaxArmor > 0.0f ? Armor / MaxArmor : 0.0f;
}

FTGGDamageHudState UTGGDamageComponent::GetHudState() const {
  return FTGGDamagePresentation::MakeHudState(
      MaxHealth, Health, MaxArmor, Armor, bKnockedOut, bInvulnerable);
}

void UTGGDamageComponent::OnRep_Health(const float PreviousHealth) {
  OnHealthChanged.Broadcast(PreviousHealth, Health);
}

void UTGGDamageComponent::OnRep_Armor(const float PreviousArmor) {
  OnArmorChanged.Broadcast(PreviousArmor, Armor);
}

void UTGGDamageComponent::OnRep_KnockedOut(const bool bPreviousKnockedOut) {
  if (!bPreviousKnockedOut && bKnockedOut) OnKnockedOut.Broadcast();
  if (bPreviousKnockedOut && !bKnockedOut) OnRespawnReset.Broadcast();
}

void UTGGDamageComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const {
  Super::GetLifetimeReplicatedProps(OutLifetimeProps);
  DOREPLIFETIME(UTGGDamageComponent, Health);
  DOREPLIFETIME(UTGGDamageComponent, Armor);
  DOREPLIFETIME(UTGGDamageComponent, bKnockedOut);
  DOREPLIFETIME(UTGGDamageComponent, bInvulnerable);
}
