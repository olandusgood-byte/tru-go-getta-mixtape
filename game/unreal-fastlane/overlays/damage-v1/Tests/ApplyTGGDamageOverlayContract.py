from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
p=root/'scripts/windows/Apply-TGGDamageOverlay.ps1'
if not p.exists():
    print('TGG_DAMAGE_OVERLAY_CONTRACT: FAIL - apply script missing')
    sys.exit(1)
text=p.read_text()
required=[
    'TGGWorld.uproject',
    "Source\\TGGWorld",
    'Test-Path -LiteralPath $projectFile',
    'Test-Path -LiteralPath $targetModule',
    'throw',
    'Copy-Item',
    'TGG_DAMAGE_OVERLAY_APPLY: PASS',
    'checkpoints',
    'e628173',
    'DAMAGE overlay refused canonical checkpoint path',
]
missing=[x for x in required if x not in text]
if missing:
    print('TGG_DAMAGE_OVERLAY_CONTRACT: FAIL - missing: '+', '.join(missing)); sys.exit(1)
expected_guard = "-match '\\\\checkpoints\\\\e628173(?:\\\\|$)'"
if expected_guard not in text:
    print('TGG_DAMAGE_OVERLAY_CONTRACT: FAIL - canonical checkpoint regex is not correctly escaped')
    sys.exit(1)
for forbidden in ['TGG_WORLD_UNREAL_FASTLANE_e628173.tar.gz.b64','Remove-Item -Recurse -Force $TargetRoot']:
    if forbidden in text:
        print('TGG_DAMAGE_OVERLAY_CONTRACT: FAIL - unsafe fragment: '+forbidden); sys.exit(1)
print('TGG_DAMAGE_OVERLAY_CONTRACT: PASS')
