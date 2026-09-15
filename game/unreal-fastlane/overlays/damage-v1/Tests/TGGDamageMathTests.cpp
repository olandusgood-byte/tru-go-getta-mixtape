#include "Combat/TGGDamageMath.h"

#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {

bool NearlyEqual(float A, float B, float Epsilon = 0.0001f) {
  return std::fabs(A - B) <= Epsilon;
}

[[noreturn]] void Fail(const char* Message) {
  std::cerr << "TGG_DAMAGE_MATH_TESTS: FAIL - " << Message << '\n';
  std::exit(1);
}

void Require(bool Condition, const char* Message) {
  if (!Condition) {
    Fail(Message);
  }
}

FTGGDamageRequest Request(
    float BaseDamage,
    ETGGHitZone HitZone,
    float Health = 100.0f,
    float Armor = 0.0f,
    bool Invulnerable = false,
    ETGGDamageType DamageType = ETGGDamageType::Ballistic) {
  FTGGDamageRequest Value{};
  Value.BaseDamage = BaseDamage;
  Value.DamageType = DamageType;
  Value.HitZone = HitZone;
  Value.CurrentHealth = Health;
  Value.CurrentArmor = Armor;
  Value.bInvulnerable = Invulnerable;
  return Value;
}

void TestHitZoneMultipliers() {
  Require(NearlyEqual(FTGGDamageMath::HitZoneMultiplier(ETGGHitZone::Head), 2.0f), "head multiplier must be 2.0");
  Require(NearlyEqual(FTGGDamageMath::HitZoneMultiplier(ETGGHitZone::Torso), 1.0f), "torso multiplier must be 1.0");
  Require(NearlyEqual(FTGGDamageMath::HitZoneMultiplier(ETGGHitZone::Arm), 0.75f), "arm multiplier must be 0.75");
  Require(NearlyEqual(FTGGDamageMath::HitZoneMultiplier(ETGGHitZone::Leg), 0.75f), "leg multiplier must be 0.75");
  Require(NearlyEqual(FTGGDamageMath::HitZoneMultiplier(ETGGHitZone::Generic), 1.0f), "generic multiplier must be 1.0");
}

void TestArmorFullyAbsorbsDamage() {
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Request(20.0f, ETGGHitZone::Torso, 100.0f, 50.0f));
  Require(NearlyEqual(Result.AppliedDamage, 20.0f), "applied damage should preserve torso damage");
  Require(NearlyEqual(Result.ArmorDamage, 20.0f), "armor should absorb full damage");
  Require(NearlyEqual(Result.HealthDamage, 0.0f), "health should not take damage while armor remains");
  Require(NearlyEqual(Result.RemainingArmor, 30.0f), "remaining armor should be 30");
  Require(NearlyEqual(Result.RemainingHealth, 100.0f), "remaining health should stay 100");
  Require(!Result.bKnockedOut, "target should not be knocked out");
}

void TestArmorSpilloverToHealth() {
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Request(40.0f, ETGGHitZone::Torso, 100.0f, 15.0f));
  Require(NearlyEqual(Result.ArmorDamage, 15.0f), "armor damage should stop at current armor");
  Require(NearlyEqual(Result.HealthDamage, 25.0f), "excess damage should spill into health");
  Require(NearlyEqual(Result.RemainingArmor, 0.0f), "armor should clamp at zero");
  Require(NearlyEqual(Result.RemainingHealth, 75.0f), "health should be 75 after spillover");
}

void TestHeadAndLimbDamage() {
  const FTGGDamageResult Head = FTGGDamageMath::Resolve(Request(25.0f, ETGGHitZone::Head));
  const FTGGDamageResult Arm = FTGGDamageMath::Resolve(Request(40.0f, ETGGHitZone::Arm));
  const FTGGDamageResult Leg = FTGGDamageMath::Resolve(Request(40.0f, ETGGHitZone::Leg));
  Require(NearlyEqual(Head.HealthDamage, 50.0f), "head damage should double base damage");
  Require(NearlyEqual(Arm.HealthDamage, 30.0f), "arm damage should use 0.75 multiplier");
  Require(NearlyEqual(Leg.HealthDamage, 30.0f), "leg damage should use 0.75 multiplier");
}

void TestInvulnerability() {
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Request(999.0f, ETGGHitZone::Head, 100.0f, 25.0f, true));
  Require(NearlyEqual(Result.AppliedDamage, 0.0f), "invulnerability should make applied damage zero");
  Require(NearlyEqual(Result.RemainingHealth, 100.0f), "invulnerability should preserve health");
  Require(NearlyEqual(Result.RemainingArmor, 25.0f), "invulnerability should preserve armor");
  Require(!Result.bKnockedOut, "invulnerable target should not be knocked out");
}

void TestZeroAndNegativeDamageClamp() {
  const FTGGDamageResult Zero = FTGGDamageMath::Resolve(Request(0.0f, ETGGHitZone::Head, 80.0f, 10.0f));
  const FTGGDamageResult Negative = FTGGDamageMath::Resolve(Request(-50.0f, ETGGHitZone::Head, 80.0f, 10.0f));
  Require(NearlyEqual(Zero.AppliedDamage, 0.0f), "zero base damage should stay zero");
  Require(NearlyEqual(Negative.AppliedDamage, 0.0f), "negative base damage should clamp to zero");
  Require(NearlyEqual(Negative.RemainingHealth, 80.0f), "negative damage must not heal or hurt health");
  Require(NearlyEqual(Negative.RemainingArmor, 10.0f), "negative damage must not change armor");
  Require(!Negative.bKnockedOut, "negative damage must not knock out target");
}

void TestExactKnockoutAndClamps() {
  const FTGGDamageResult Result = FTGGDamageMath::Resolve(Request(125.0f, ETGGHitZone::Torso, 100.0f, 10.0f));
  Require(NearlyEqual(Result.ArmorDamage, 10.0f), "KO request should consume remaining armor first");
  Require(NearlyEqual(Result.HealthDamage, 100.0f), "health damage should clamp to current health");
  Require(NearlyEqual(Result.RemainingArmor, 0.0f), "KO armor should not go negative");
  Require(NearlyEqual(Result.RemainingHealth, 0.0f), "KO health should not go negative");
  Require(Result.bKnockedOut, "positive damaging request that reaches zero health should knock out target");
}

void TestDeterministicRepeatedRequests() {
  const FTGGDamageRequest Input = Request(17.0f, ETGGHitZone::Leg, 63.0f, 8.0f, false, ETGGDamageType::Vehicle);
  const FTGGDamageResult A = FTGGDamageMath::Resolve(Input);
  const FTGGDamageResult B = FTGGDamageMath::Resolve(Input);
  Require(NearlyEqual(A.AppliedDamage, B.AppliedDamage), "repeated applied damage must be deterministic");
  Require(NearlyEqual(A.ArmorDamage, B.ArmorDamage), "repeated armor damage must be deterministic");
  Require(NearlyEqual(A.HealthDamage, B.HealthDamage), "repeated health damage must be deterministic");
  Require(NearlyEqual(A.RemainingArmor, B.RemainingArmor), "repeated remaining armor must be deterministic");
  Require(NearlyEqual(A.RemainingHealth, B.RemainingHealth), "repeated remaining health must be deterministic");
  Require(A.bKnockedOut == B.bKnockedOut, "repeated KO state must be deterministic");
}

}  // namespace

int main() {
  TestHitZoneMultipliers();
  TestArmorFullyAbsorbsDamage();
  TestArmorSpilloverToHealth();
  TestHeadAndLimbDamage();
  TestInvulnerability();
  TestZeroAndNegativeDamageClamp();
  TestExactKnockoutAndClamps();
  TestDeterministicRepeatedRequests();
  std::cout << "TGG_DAMAGE_MATH_TESTS: PASS\n";
  return 0;
}
