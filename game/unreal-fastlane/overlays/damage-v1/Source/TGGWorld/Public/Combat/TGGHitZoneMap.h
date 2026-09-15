#pragma once

#include "Combat/TGGDamageTypes.h"

#include <string_view>

struct FTGGHitZoneMap {
  static ETGGHitZone FromName(std::string_view Name);
};
