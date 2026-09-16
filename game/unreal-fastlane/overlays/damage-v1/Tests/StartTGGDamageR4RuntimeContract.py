from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]; script=root/'scripts/windows/Start-TGGDamageR4Runtime.ps1'
if not script.exists(): print('TGG_DAMAGE_R4_RUNTIME_CONTRACT: FAIL - launcher missing'); sys.exit(1)
text=script.read_text(); required=['Install-TGGWorldRunner.ps1','-ValidateOnly','Start-TGGDamageR3Runtime.ps1','TGG_DAMAGE_R4_MACHINE_READY: PASS','TGG_DAMAGE_R4_RUNTIME: PASS','RepoRoot','WorkspaceRoot']; missing=[x for x in required if x not in text]
if missing: print('TGG_DAMAGE_R4_RUNTIME_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
for forbidden in ['TGG_EOS_CLIENT_SECRET=','TGG_SUPABASE_TEST_ACCESS_TOKEN=','TGG_SENTRY_UNREAL_ENDPOINT=','git reset --hard','Remove-Item -Recurse -Force']:
    if forbidden in text: print('TGG_DAMAGE_R4_RUNTIME_CONTRACT: FAIL - forbidden: '+forbidden); sys.exit(1)
print('TGG_DAMAGE_R4_RUNTIME_CONTRACT: PASS')
