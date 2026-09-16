from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
h = root/'Source/TGGWorld/Public/Combat/TGGVehicleDamageComponent.h'
c = root/'Source/TGGWorld/Private/Combat/TGGVehicleDamageComponent.cpp'
if not h.exists() or not c.exists():
    print('TGG_VEHICLE_DAMAGE_COMPONENT_CONTRACT: FAIL - component source missing'); sys.exit(1)
text = h.read_text()+"\n"+c.read_text()
required = [
 'UActorComponent','ReplicatedUsing=OnRep_Durability','ReplicatedUsing=OnRep_Disabled',
 'ApplyVehicleDamage','FTGGDamageMath::Resolve','CurrentHealth = Durability','CurrentArmor = 0.0f',
 'bDisabled = Result.bKnockedOut','DOREPLIFETIME(UTGGVehicleDamageComponent, Durability)',
 'DOREPLIFETIME(UTGGVehicleDamageComponent, bDisabled)','OnDisabled.Broadcast()','OnRestored.Broadcast()',
 'BlueprintAuthorityOnly','RestoreDurability','HasAuthority()'
]
missing=[x for x in required if x not in text]
if missing:
    print('TGG_VEHICLE_DAMAGE_COMPONENT_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
if re.search(r'UFUNCTION\([^\n]*\)\s*bool\s+ApplyVehicleDamage\s*\(const\s+FTGGDamageRequest&', text):
    print('TGG_VEHICLE_DAMAGE_COMPONENT_CONTRACT: FAIL - portable request must remain native-only'); sys.exit(1)
if 'Health' in h.read_text() or 'Armor' in h.read_text() or 'KnockedOut' in h.read_text():
    print('TGG_VEHICLE_DAMAGE_COMPONENT_CONTRACT: FAIL - vehicle API must not expose character health/armor/KO semantics'); sys.exit(1)
print('TGG_VEHICLE_DAMAGE_COMPONENT_CONTRACT: PASS')
