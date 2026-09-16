#include "Combat/TGGDamageSeverity.h"

#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {
bool Near(float a, float b) { return std::fabs(a - b) < 0.0001f; }
[[noreturn]] void Fail(const char* message) {
  std::cerr << "TGG_DAMAGE_SEVERITY_TESTS: FAIL - " << message << '\n';
  std::exit(1);
}
void Need(bool condition, const char* message) { if (!condition) Fail(message); }
}

int main() {
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(9.0f, 10.0f, 30.0f, 100.0f), 0.0f), "below threshold");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(10.0f, 10.0f, 30.0f, 100.0f), 0.0f), "at threshold");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(20.0f, 10.0f, 30.0f, 100.0f), 50.0f), "midpoint");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(30.0f, 10.0f, 30.0f, 100.0f), 100.0f), "full scale");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(99.0f, 10.0f, 30.0f, 100.0f), 100.0f), "clamp above full scale");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(20.0f, 30.0f, 10.0f, 100.0f), 0.0f), "invalid scale fails closed");
  Need(Near(FTGGDamageSeverity::LinearAboveThreshold(20.0f, 10.0f, 30.0f, -5.0f), 0.0f), "negative max damage clamp");

  const auto fall = FTGGDamageSeverity::FallFromImpactSpeed(25.0f, 10.0f, 30.0f, 80.0f);
  Need(fall.DamageType == ETGGDamageType::Fall, "fall request type");
  Need(fall.HitZone == ETGGHitZone::Generic, "fall generic zone");
  Need(Near(fall.BaseDamage, 60.0f), "fall data-driven severity");

  Need(Near(FTGGDamageSeverity::DamageOverDuration(4.0f, 2.5f, 100.0f), 10.0f), "duration damage");
  Need(Near(FTGGDamageSeverity::DamageOverDuration(40.0f, 5.0f, 75.0f), 75.0f), "duration max clamp");
  Need(Near(FTGGDamageSeverity::DamageOverDuration(-4.0f, 2.5f, 100.0f), 0.0f), "negative rate clamp");
  Need(Near(FTGGDamageSeverity::DamageOverDuration(4.0f, -2.5f, 100.0f), 0.0f), "negative duration clamp");

  const auto fire = FTGGDamageSeverity::FireForDuration(8.0f, 1.5f, 30.0f);
  Need(fire.DamageType == ETGGDamageType::Fire, "fire duration type");
  Need(Near(fire.BaseDamage, 12.0f), "fire duration severity");

  const auto environment = FTGGDamageSeverity::EnvironmentForDuration(3.0f, 10.0f, 20.0f);
  Need(environment.DamageType == ETGGDamageType::Environment, "environment duration type");
  Need(Near(environment.BaseDamage, 20.0f), "environment duration cap");

  const auto vehicle = FTGGDamageSeverity::VehicleFromRelativeSpeed(40.0f, 20.0f, 60.0f, 120.0f);
  Need(vehicle.DamageType == ETGGDamageType::Vehicle, "vehicle request type");
  Need(vehicle.HitZone == ETGGHitZone::Generic, "vehicle generic zone");
  Need(Near(vehicle.BaseDamage, 60.0f), "vehicle data-driven severity");

  std::cout << "TGG_DAMAGE_SEVERITY_TESTS: PASS\n";
  return 0;
}
