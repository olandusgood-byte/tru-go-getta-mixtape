#include "Combat/TGGDamageTelemetry.h"

std::uint8_t FTGGDamageTelemetry::Bucket(const float AppliedDamage) {
  if (AppliedDamage <= 0.0f) return 0;
  if (AppliedDamage <= 10.0f) return 1;
  if (AppliedDamage <= 25.0f) return 2;
  if (AppliedDamage <= 50.0f) return 3;
  if (AppliedDamage <= 100.0f) return 4;
  return 5;
}

FTGGDamageTelemetryEvent FTGGDamageTelemetry::Build(
    const FTGGDamageRequest& Request,
    const FTGGDamageResult& Result) {
  FTGGDamageTelemetryEvent Event;
  Event.DamageType = Request.DamageType;
  Event.HitZone = Request.HitZone;
  Event.DamageBucket = Bucket(Result.AppliedDamage);
  Event.bKnockedOut = Result.bKnockedOut;
  return Event;
}
