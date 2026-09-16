#pragma once

struct FTGGDamageHudState {
  float HealthPercent = 0.0f;
  float ArmorPercent = 0.0f;
  bool bKnockedOut = false;
  bool bInvulnerable = false;
};

struct FTGGDamagePresentation {
  static FTGGDamageHudState MakeHudState(
      float MaxHealth,
      float Health,
      float MaxArmor,
      float Armor,
      bool bKnockedOut,
      bool bInvulnerable);
};
