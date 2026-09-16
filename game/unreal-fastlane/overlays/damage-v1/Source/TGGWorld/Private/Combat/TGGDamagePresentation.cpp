#include "Combat/TGGDamagePresentation.h"

#include <algorithm>

namespace {
float SafePercent(const float Current, const float Maximum) {
  if (Maximum <= 0.0f) return 0.0f;
  return std::clamp(Current / Maximum, 0.0f, 1.0f);
}
}

FTGGDamageHudState FTGGDamagePresentation::MakeHudState(
    const float MaxHealth,
    const float Health,
    const float MaxArmor,
    const float Armor,
    const bool bKnockedOut,
    const bool bInvulnerable) {
  FTGGDamageHudState State;
  State.HealthPercent = SafePercent(Health, MaxHealth);
  State.ArmorPercent = SafePercent(Armor, MaxArmor);
  State.bKnockedOut = bKnockedOut;
  State.bInvulnerable = bInvulnerable;
  return State;
}
