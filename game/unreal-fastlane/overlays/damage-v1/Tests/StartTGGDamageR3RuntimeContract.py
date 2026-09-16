from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]; script=root/'scripts/windows/Start-TGGDamageR3Runtime.ps1'
if not script.exists(): print('TGG_DAMAGE_R3_RUNTIME_CONTRACT: FAIL - launcher missing'); sys.exit(1)
text=script.read_text(); required=['e628173','TGG_WORLD_UNREAL_FASTLANE_e628173.tar.gz.b64.chunk*','d9873c842d66b0508d0b8e447de8e2cdb95362c5d15e4486e50cbb5e3f51bd58','Get-FileHash','FromBase64String','TGGWorld.uproject','Start-TGGDamageCandidateQA.ps1','TGG_DAMAGE_R3_RUNTIME: PASS','Builds\\Win64-Development\\_smoke']; missing=[x for x in required if x not in text]
if missing: print('TGG_DAMAGE_R3_RUNTIME_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
if "Copy-Item -LiteralPath (Join-Path $smokeRoot '*')" in text: print('TGG_DAMAGE_R3_RUNTIME_CONTRACT: FAIL - evidence wildcard cannot use LiteralPath'); sys.exit(1)
for forbidden in ['Remove-Item -LiteralPath $CheckpointRoot -Recurse','Copy-Item -LiteralPath $CheckpointRoot','TGG_EOS_CLIENT_SECRET=','TGG_SUPABASE_TEST_ACCESS_TOKEN=','TGG_SENTRY_UNREAL_ENDPOINT=']:
    if forbidden in text: print('TGG_DAMAGE_R3_RUNTIME_CONTRACT: FAIL - forbidden: '+forbidden); sys.exit(1)
print('TGG_DAMAGE_R3_RUNTIME_CONTRACT: PASS')
