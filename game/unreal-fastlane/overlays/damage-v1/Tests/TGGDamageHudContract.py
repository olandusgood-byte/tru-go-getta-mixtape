from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
h=root/'Source/TGGWorld/Public/Combat/TGGDamageComponent.h'
c=root/'Source/TGGWorld/Private/Combat/TGGDamageComponent.cpp'
text=h.read_text()+"\n"+c.read_text()
required=[
 'OnDamageApplied','OnHealthChanged','OnArmorChanged','OnKnockedOut','OnRespawnReset',
 'GetHealthPercent','GetArmorPercent','FTGGDamageHudState GetHudState() const',
 'FTGGDamagePresentation::MakeHudState'
]
missing=[x for x in required if x not in text]
if missing:
    print('TGG_DAMAGE_HUD_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
if 'UFUNCTION' in text.split('FTGGDamageHudState GetHudState() const')[0].split('\n')[-2:]:
    print('TGG_DAMAGE_HUD_CONTRACT: FAIL - portable HUD snapshot must remain native-only'); sys.exit(1)
print('TGG_DAMAGE_HUD_CONTRACT: PASS')
