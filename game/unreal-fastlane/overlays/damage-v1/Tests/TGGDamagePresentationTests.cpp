#include "Combat/TGGDamagePresentation.h"

#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {
bool Near(float a, float b) { return std::fabs(a - b) < 0.0001f; }
[[noreturn]] void Fail(const char* message) {
  std::cerr << "TGG_DAMAGE_PRESENTATION_TESTS: FAIL - " << message << '\n';
  std::exit(1);
}
void Need(bool condition, const char* message) { if (!condition) Fail(message); }
}

int main() {
  const auto state = FTGGDamagePresentation::MakeHudState(200.0f, 150.0f, 100.0f, 25.0f, false, true);
  Need(Near(state.HealthPercent, 0.75f), "health percent");
  Need(Near(state.ArmorPercent, 0.25f), "armor percent");
  Need(!state.bKnockedOut, "KO state");
  Need(state.bInvulnerable, "invulnerability state");

  const auto clamped = FTGGDamagePresentation::MakeHudState(100.0f, 150.0f, 50.0f, -10.0f, true, false);
  Need(Near(clamped.HealthPercent, 1.0f), "health clamp");
  Need(Near(clamped.ArmorPercent, 0.0f), "armor clamp");
  Need(clamped.bKnockedOut, "clamped KO state");

  const auto zeroMax = FTGGDamagePresentation::MakeHudState(0.0f, 50.0f, 0.0f, 50.0f, false, false);
  Need(Near(zeroMax.HealthPercent, 0.0f), "zero max health safe");
  Need(Near(zeroMax.ArmorPercent, 0.0f), "zero max armor safe");

  std::cout << "TGG_DAMAGE_PRESENTATION_TESTS: PASS\n";
  return 0;
}
