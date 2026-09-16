#include "Combat/TGGDamageTelemetry.h"

#include <cstdlib>
#include <iostream>

namespace {
[[noreturn]] void Fail(const char* message) {
  std::cerr << "TGG_DAMAGE_TELEMETRY_TESTS: FAIL - " << message << '\n';
  std::exit(1);
}
void Need(bool condition, const char* message) { if (!condition) Fail(message); }
}

int main() {
  FTGGDamageRequest request{};
  request.BaseDamage = 30.0f;
  request.DamageType = ETGGDamageType::Explosion;
  request.HitZone = ETGGHitZone::Torso;

  FTGGDamageResult result{};
  result.AppliedDamage = 27.0f;
  result.bKnockedOut = false;

  const auto event = FTGGDamageTelemetry::Build(request, result);
  Need(event.DamageType == ETGGDamageType::Explosion, "damage type");
  Need(event.HitZone == ETGGHitZone::Torso, "hit zone");
  Need(event.DamageBucket == 3, "27 damage bucket");
  Need(!event.bKnockedOut, "KO false");

  result.AppliedDamage = 0.0f;
  Need(FTGGDamageTelemetry::Build(request, result).DamageBucket == 0, "zero bucket");
  result.AppliedDamage = 10.0f;
  Need(FTGGDamageTelemetry::Build(request, result).DamageBucket == 1, "10 bucket");
  result.AppliedDamage = 25.0f;
  Need(FTGGDamageTelemetry::Build(request, result).DamageBucket == 2, "25 bucket");
  result.AppliedDamage = 50.0f;
  Need(FTGGDamageTelemetry::Build(request, result).DamageBucket == 3, "50 bucket");
  result.AppliedDamage = 100.0f;
  Need(FTGGDamageTelemetry::Build(request, result).DamageBucket == 4, "100 bucket");
  result.AppliedDamage = 101.0f;
  result.bKnockedOut = true;
  const auto high = FTGGDamageTelemetry::Build(request, result);
  Need(high.DamageBucket == 5, "over 100 bucket");
  Need(high.bKnockedOut, "KO true");

  std::cout << "TGG_DAMAGE_TELEMETRY_TESTS: PASS\n";
  return 0;
}
