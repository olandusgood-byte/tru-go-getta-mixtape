#pragma once

#include "Combat/TGGDamageTypes.h"

struct FTGGDamageRequestFactory {
  static FTGGDamageRequest Ballistic(float BaseDamage, ETGGHitZone HitZone);
  static FTGGDamageRequest Melee(float BaseDamage, ETGGHitZone HitZone);
  static FTGGDamageRequest Fall(float BaseDamage);
  static FTGGDamageRequest Fire(float BaseDamage);
  static FTGGDamageRequest Explosion(float BaseDamage);
  static FTGGDamageRequest Vehicle(float BaseDamage);
  static FTGGDamageRequest Environment(float BaseDamage);

private:
  static FTGGDamageRequest Build(float BaseDamage, ETGGDamageType DamageType, ETGGHitZone HitZone);
};
