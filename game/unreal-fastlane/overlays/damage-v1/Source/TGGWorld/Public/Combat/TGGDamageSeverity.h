#pragma once

#include "Combat/TGGDamageTypes.h"

struct FTGGDamageSeverity {
  static float LinearAboveThreshold(float Magnitude, float Threshold, float FullScaleMagnitude, float MaxDamage);
  static float DamageOverDuration(float DamagePerSecond, float DurationSeconds, float MaxDamage);
  static FTGGDamageRequest FireForDuration(float DamagePerSecond, float DurationSeconds, float MaxDamage);
  static FTGGDamageRequest EnvironmentForDuration(float DamagePerSecond, float DurationSeconds, float MaxDamage);
  static FTGGDamageRequest FallFromImpactSpeed(float ImpactSpeed, float SafeSpeed, float FullDamageSpeed, float MaxDamage);
  static FTGGDamageRequest VehicleFromRelativeSpeed(float RelativeSpeed, float SafeSpeed, float FullDamageSpeed, float MaxDamage);
};
