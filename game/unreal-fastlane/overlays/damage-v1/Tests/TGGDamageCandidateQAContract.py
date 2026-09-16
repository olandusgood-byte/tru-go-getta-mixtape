from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
p = root/'scripts/windows/Run-TGGDamageCandidateQA.ps1'
if not p.exists():
    print('TGG_DAMAGE_CANDIDATE_QA_CONTRACT: FAIL - launcher missing')
    sys.exit(1)
text = p.read_text()
required = [
    'Apply-TGGDamageOverlay.ps1',
    'TGG_FASTLANE_PREFLIGHT.ps1',
    'TGG_FASTLANE_FINAL_QA.ps1',
    'PACKAGE_BOOT_OK',
    'CREATOR_DISTRICT_GAMEPLAY_OK',
    'TGG_DAMAGE_CANDIDATE_QA: PASS',
    'checkpoints',
    'e628173',
    'DAMAGE candidate QA refused canonical checkpoint path',
]
missing = [x for x in required if x not in text]
if missing:
    print('TGG_DAMAGE_CANDIDATE_QA_CONTRACT: FAIL - missing: ' + ', '.join(missing)); sys.exit(1)
if "-match '\\\\checkpoints\\\\e628173(?:\\\\|$)'" not in text:
    print('TGG_DAMAGE_CANDIDATE_QA_CONTRACT: FAIL - canonical checkpoint guard is not correctly escaped'); sys.exit(1)
for marker in ['PACKAGE_BOOT_OK','CREATOR_DISTRICT_GAMEPLAY_OK']:
    if f"Test-Path -LiteralPath ${marker}" in text:
        continue
print('TGG_DAMAGE_CANDIDATE_QA_CONTRACT: PASS')
