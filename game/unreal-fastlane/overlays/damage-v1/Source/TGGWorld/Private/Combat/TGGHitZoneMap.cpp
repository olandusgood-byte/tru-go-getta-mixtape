#include "Combat/TGGHitZoneMap.h"

#include <cctype>
#include <string>

namespace {

std::string Normalize(std::string_view Name) {
  std::string Result;
  Result.reserve(Name.size());
  for (const char Character : Name) {
    Result.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(Character))));
  }
  return Result;
}

}  // namespace

ETGGHitZone FTGGHitZoneMap::FromName(const std::string_view Name) {
  const std::string Normalized = Normalize(Name);

  if (Normalized == "head") {
    return ETGGHitZone::Head;
  }
  if (Normalized == "torso" || Normalized == "chest") {
    return ETGGHitZone::Torso;
  }
  if (Normalized == "arm" || Normalized == "upperarm_l" || Normalized == "upperarm_r" ||
      Normalized == "forearm_l" || Normalized == "forearm_r") {
    return ETGGHitZone::Arm;
  }
  if (Normalized == "leg" || Normalized == "thigh_l" || Normalized == "thigh_r" ||
      Normalized == "calf_l" || Normalized == "calf_r") {
    return ETGGHitZone::Leg;
  }

  return ETGGHitZone::Generic;
}
