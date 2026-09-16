from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
h = root/'Source/TGGWorld/Public/Combat/TGGDamageComponent.h'
c = root/'Source/TGGWorld/Private/Combat/TGGDamageComponent.cpp'
if not h.exists() or not c.exists():
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - component source missing'); sys.exit(1)
text = h.read_text()+"\n"+c.read_text()
required = [
 'UActorComponent','ReplicatedUsing=OnRep_Health','ReplicatedUsing=OnRep_Armor','ReplicatedUsing=OnRep_KnockedOut',
 'GetLifetimeReplicatedProps','HasAuthority()','ApplyDamage','ResetForRespawn','FTGGDamageMath::Resolve',
 'DOREPLIFETIME(UTGGDamageComponent, Health)','DOREPLIFETIME(UTGGDamageComponent, Armor)',
 'DOREPLIFETIME(UTGGDamageComponent, bKnockedOut)','OnKnockedOut.Broadcast()','OnRespawnReset.Broadcast()'
]
missing=[x for x in required if x not in text]
reset_decl = re.search(r'UFUNCTION\(BlueprintCallable,\s*BlueprintAuthorityOnly,\s*Category="TGG\|Damage"\)\s*bool\s+ResetForRespawn', text)
if not reset_decl:
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - respawn reset must be BlueprintAuthorityOnly')
    sys.exit(1)
if re.search(r'UFUNCTION\([^\n]*\)\s*bool\s+ApplyDamage\s*\(const\s+FTGGDamageRequest&', text):
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - portable request must not be exposed through UFUNCTION'); sys.exit(1)
if missing:
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
if 'BlueprintReadWrite, Category="TGG|Damage")\n  bool bInvulnerable' in text:
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - invulnerability must not be client-writable')
    sys.exit(1)
for fragment in ['SetInvulnerable', 'bInvulnerable = bNewInvulnerable']:
    if fragment not in text:
        print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - missing authority invulnerability setter: ' + fragment)
        sys.exit(1)
setter = re.search(r'bool\s+UTGGDamageComponent::SetInvulnerable\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}', text, re.S)
if not setter or 'HasAuthority()' not in setter.group('body'):
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - invulnerability setter must be authority-guarded')
    sys.exit(1)
if 'if (bPreviousKnockedOut && !bKnockedOut) OnRespawnReset.Broadcast();' not in text:
    print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - clients must receive respawn-reset event on KO replication clear')
    sys.exit(1)
for secret in ['TGG_EOS_CLIENT_SECRET','TGG_SUPABASE_TEST_ACCESS_TOKEN','TGG_SENTRY_UNREAL_ENDPOINT']:
    if re.search(secret+r'\s*=\s*[\"\']', text):
        print('TGG_DAMAGE_COMPONENT_CONTRACT: FAIL - embedded secret marker'); sys.exit(1)
print('TGG_DAMAGE_COMPONENT_CONTRACT: PASS')
