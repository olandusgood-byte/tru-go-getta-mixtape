#include "Combat/TGGDamageRequestFactory.h"

#include <cstdlib>
#include <iostream>

namespace {
[[noreturn]] void Fail(const char* message) {
  std::cerr << "TGG_DAMAGE_REQUEST_FACTORY_TESTS: FAIL - " << message << '\n';
  std::exit(1);
}
void Require(bool condition, const char* message) { if (!condition) Fail(message); }
}

int main() {
  const auto ballistic = FTGGDamageRequestFactory::Ballistic(25.0f, ETGGHitZone::Head);
  Require(ballistic.DamageType == ETGGDamageType::Ballistic, "ballistic type");
  Require(ballistic.HitZone == ETGGHitZone::Head, "ballistic zone");
  Require(ballistic.BaseDamage == 25.0f, "ballistic damage");

  const auto melee = FTGGDamageRequestFactory::Melee(10.0f, ETGGHitZone::Torso);
  Require(melee.DamageType == ETGGDamageType::Melee, "melee type");
  Require(melee.HitZone == ETGGHitZone::Torso, "melee zone");

  const auto fall = FTGGDamageRequestFactory::Fall(30.0f);
  const auto fire = FTGGDamageRequestFactory::Fire(3.0f);
  const auto explosion = FTGGDamageRequestFactory::Explosion(80.0f);
  const auto vehicle = FTGGDamageRequestFactory::Vehicle(40.0f);
  const auto environment = FTGGDamageRequestFactory::Environment(5.0f);

  Require(fall.DamageType == ETGGDamageType::Fall, "fall type");
  Require(fire.DamageType == ETGGDamageType::Fire, "fire type");
  Require(explosion.DamageType == ETGGDamageType::Explosion, "explosion type");
  Require(vehicle.DamageType == ETGGDamageType::Vehicle, "vehicle type");
  Require(environment.DamageType == ETGGDamageType::Environment, "environment type");

  for (const auto* request : {&fall, &fire, &explosion, &vehicle, &environment}) {
    Require(request->HitZone == ETGGHitZone::Generic, "world damage must default generic hit zone");
    Require(request->CurrentHealth == 0.0f, "factory must not invent health state");
    Require(request->CurrentArmor == 0.0f, "factory must not invent armor state");
    Require(!request->bInvulnerable, "factory must not invent invulnerability state");
  }

  std::cout << "TGG_DAMAGE_REQUEST_FACTORY_TESTS: PASS\n";
  return 0;
}
