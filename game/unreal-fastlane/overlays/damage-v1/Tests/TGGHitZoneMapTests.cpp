#include "Combat/TGGHitZoneMap.h"

#include <cstdlib>
#include <iostream>

namespace {

[[noreturn]] void Fail(const char* Message) {
  std::cerr << "TGG_HIT_ZONE_MAP_TESTS: FAIL - " << Message << '\n';
  std::exit(1);
}

void Require(bool Condition, const char* Message) {
  if (!Condition) {
    Fail(Message);
  }
}

void TestKnownNames() {
  Require(FTGGHitZoneMap::FromName("head") == ETGGHitZone::Head, "head must map to Head");
  Require(FTGGHitZoneMap::FromName("HEAD") == ETGGHitZone::Head, "mapping must be case-insensitive");
  Require(FTGGHitZoneMap::FromName("torso") == ETGGHitZone::Torso, "torso must map to Torso");
  Require(FTGGHitZoneMap::FromName("chest") == ETGGHitZone::Torso, "chest must map to Torso");
  Require(FTGGHitZoneMap::FromName("arm") == ETGGHitZone::Arm, "arm must map to Arm");
  Require(FTGGHitZoneMap::FromName("upperarm_l") == ETGGHitZone::Arm, "upperarm_l must map to Arm");
  Require(FTGGHitZoneMap::FromName("leg") == ETGGHitZone::Leg, "leg must map to Leg");
  Require(FTGGHitZoneMap::FromName("calf_r") == ETGGHitZone::Leg, "calf_r must map to Leg");
}

void TestUnknownFallsBackToGeneric() {
  Require(FTGGHitZoneMap::FromName("") == ETGGHitZone::Generic, "empty name must map to Generic");
  Require(FTGGHitZoneMap::FromName("mystery_bone") == ETGGHitZone::Generic, "unknown name must map to Generic");
  Require(FTGGHitZoneMap::FromName("skull_decal_helper") == ETGGHitZone::Generic, "unknown head-like text must not become Head");
}

}  // namespace

int main() {
  TestKnownNames();
  TestUnknownFallsBackToGeneric();
  std::cout << "TGG_HIT_ZONE_MAP_TESTS: PASS\n";
  return 0;
}
