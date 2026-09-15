#pragma once

#include "Combat/TGGDamageTypes.h"

struct FTGGDamageMath {
  static float HitZoneMultiplier(ETGGHitZone HitZone);
  static FTGGDamageResult Resolve(const FTGGDamageRequest& Request);
};
