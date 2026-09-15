#include "Combat/TGGDamageMath.h"

#include <algorithm>

float FTGGDamageMath::HitZoneMultiplier(const ETGGHitZone HitZone) {
  switch (HitZone) {
    case ETGGHitZone::Head:
      return 2.0f;
    case ETGGHitZone::Arm:
    case ETGGHitZone::Leg:
      return 0.75f;
    case ETGGHitZone::Torso:
    case ETGGHitZone::Generic:
    default:
      return 1.0f;
  }
}

FTGGDamageResult FTGGDamageMath::Resolve(const FTGGDamageRequest& Request) {
  FTGGDamageResult Result{};

  const float CurrentHealth = std::max(0.0f, Request.CurrentHealth);
  const float CurrentArmor = std::max(0.0f, Request.CurrentArmor);
  Result.RemainingHealth = CurrentHealth;
  Result.RemainingArmor = CurrentArmor;

  const float BaseDamage = std::max(0.0f, Request.BaseDamage);
  if (Request.bInvulnerable || BaseDamage <= 0.0f) {
    return Result;
  }

  const float ModifiedDamage = BaseDamage * HitZoneMultiplier(Request.HitZone);
  Result.ArmorDamage = std::min(CurrentArmor, ModifiedDamage);
  Result.RemainingArmor = CurrentArmor - Result.ArmorDamage;

  const float DamageAfterArmor = ModifiedDamage - Result.ArmorDamage;
  Result.HealthDamage = std::min(CurrentHealth, DamageAfterArmor);
  Result.RemainingHealth = CurrentHealth - Result.HealthDamage;
  Result.AppliedDamage = Result.ArmorDamage + Result.HealthDamage;
  Result.bKnockedOut = Result.RemainingHealth <= 0.0f && Result.HealthDamage > 0.0f;

  return Result;
}
