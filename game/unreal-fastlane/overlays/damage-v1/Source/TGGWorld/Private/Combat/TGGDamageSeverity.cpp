#include "Combat/TGGDamageSeverity.h"

#include "Combat/TGGDamageRequestFactory.h"

#include <algorithm>

float FTGGDamageSeverity::LinearAboveThreshold(
    const float Magnitude,
    const float Threshold,
    const float FullScaleMagnitude,
    const float MaxDamage) {
  const float SafeMaxDamage = std::max(0.0f, MaxDamage);
  if (SafeMaxDamage <= 0.0f || FullScaleMagnitude <= Threshold || Magnitude <= Threshold) {
    return 0.0f;
  }

  const float Alpha = std::clamp(
      (Magnitude - Threshold) / (FullScaleMagnitude - Threshold),
      0.0f,
      1.0f);
  return SafeMaxDamage * Alpha;
}

float FTGGDamageSeverity::DamageOverDuration(
    const float DamagePerSecond,
    const float DurationSeconds,
    const float MaxDamage) {
  const float SafeRate = std::max(0.0f, DamagePerSecond);
  const float SafeDuration = std::max(0.0f, DurationSeconds);
  const float SafeMaxDamage = std::max(0.0f, MaxDamage);
  return std::min(SafeRate * SafeDuration, SafeMaxDamage);
}

FTGGDamageRequest FTGGDamageSeverity::FireForDuration(
    const float DamagePerSecond,
    const float DurationSeconds,
    const float MaxDamage) {
  return FTGGDamageRequestFactory::Fire(
      DamageOverDuration(DamagePerSecond, DurationSeconds, MaxDamage));
}

FTGGDamageRequest FTGGDamageSeverity::EnvironmentForDuration(
    const float DamagePerSecond,
    const float DurationSeconds,
    const float MaxDamage) {
  return FTGGDamageRequestFactory::Environment(
      DamageOverDuration(DamagePerSecond, DurationSeconds, MaxDamage));
}

FTGGDamageRequest FTGGDamageSeverity::FallFromImpactSpeed(
    const float ImpactSpeed,
    const float SafeSpeed,
    const float FullDamageSpeed,
    const float MaxDamage) {
  return FTGGDamageRequestFactory::Fall(
      LinearAboveThreshold(ImpactSpeed, SafeSpeed, FullDamageSpeed, MaxDamage));
}

FTGGDamageRequest FTGGDamageSeverity::VehicleFromRelativeSpeed(
    const float RelativeSpeed,
    const float SafeSpeed,
    const float FullDamageSpeed,
    const float MaxDamage) {
  return FTGGDamageRequestFactory::Vehicle(
      LinearAboveThreshold(RelativeSpeed, SafeSpeed, FullDamageSpeed, MaxDamage));
}
