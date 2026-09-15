#pragma once

#include <cstdint>

enum class ETGGDamageType : std::uint8_t {
  Ballistic,
  Melee,
  Fall,
  Fire,
  Explosion,
  Vehicle,
  Environment
};

enum class ETGGHitZone : std::uint8_t {
  Head,
  Torso,
  Arm,
  Leg,
  Generic
};

struct FTGGDamageRequest {
  float BaseDamage = 0.0f;
  ETGGDamageType DamageType = ETGGDamageType::Environment;
  ETGGHitZone HitZone = ETGGHitZone::Generic;
  float CurrentHealth = 0.0f;
  float CurrentArmor = 0.0f;
  bool bInvulnerable = false;
};

struct FTGGDamageResult {
  float AppliedDamage = 0.0f;
  float ArmorDamage = 0.0f;
  float HealthDamage = 0.0f;
  float RemainingArmor = 0.0f;
  float RemainingHealth = 0.0f;
  bool bKnockedOut = false;
};
