#include "Combat/TGGDamageRequestFactory.h"

FTGGDamageRequest FTGGDamageRequestFactory::Build(const float BaseDamage, const ETGGDamageType DamageType, const ETGGHitZone HitZone) {
  FTGGDamageRequest Request{};
  Request.BaseDamage = BaseDamage;
  Request.DamageType = DamageType;
  Request.HitZone = HitZone;
  Request.CurrentHealth = 0.0f;
  Request.CurrentArmor = 0.0f;
  Request.bInvulnerable = false;
  return Request;
}

FTGGDamageRequest FTGGDamageRequestFactory::Ballistic(const float BaseDamage, const ETGGHitZone HitZone) {
  return Build(BaseDamage, ETGGDamageType::Ballistic, HitZone);
}
FTGGDamageRequest FTGGDamageRequestFactory::Melee(const float BaseDamage, const ETGGHitZone HitZone) {
  return Build(BaseDamage, ETGGDamageType::Melee, HitZone);
}
FTGGDamageRequest FTGGDamageRequestFactory::Fall(const float BaseDamage) {
  return Build(BaseDamage, ETGGDamageType::Fall, ETGGHitZone::Generic);
}
FTGGDamageRequest FTGGDamageRequestFactory::Fire(const float BaseDamage) {
  return Build(BaseDamage, ETGGDamageType::Fire, ETGGHitZone::Generic);
}
FTGGDamageRequest FTGGDamageRequestFactory::Explosion(const float BaseDamage) {
  return Build(BaseDamage, ETGGDamageType::Explosion, ETGGHitZone::Generic);
}
FTGGDamageRequest FTGGDamageRequestFactory::Vehicle(const float BaseDamage) {
  return Build(BaseDamage, ETGGDamageType::Vehicle, ETGGHitZone::Generic);
}
FTGGDamageRequest FTGGDamageRequestFactory::Environment(const float BaseDamage) {
  return Build(BaseDamage, ETGGDamageType::Environment, ETGGHitZone::Generic);
}
