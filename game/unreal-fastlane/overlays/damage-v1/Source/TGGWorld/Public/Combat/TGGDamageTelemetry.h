#pragma once

#include "Combat/TGGDamageTypes.h"

#include <cstdint>

struct FTGGDamageTelemetryEvent {
  ETGGDamageType DamageType = ETGGDamageType::Environment;
  ETGGHitZone HitZone = ETGGHitZone::Generic;
  std::uint8_t DamageBucket = 0;
  bool bKnockedOut = false;
};

struct FTGGDamageTelemetry {
  static FTGGDamageTelemetryEvent Build(const FTGGDamageRequest& Request, const FTGGDamageResult& Result);
  static std::uint8_t Bucket(float AppliedDamage);
};
