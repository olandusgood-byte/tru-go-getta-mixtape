import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evidenceHash, evaluateEvidenceGate } from './tgg-evidence-gate.mjs';
import { remediationHash, evaluateRemediationGate } from './tgg-remediation-gate.mjs';
import { verifyReleasePackage } from './tgg-release-package.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function evidencePreflight(input, now) {
  const candidate = clone(input);
  const hash = evidenceHash(candidate.evidence || [], candidate.requirements || [], candidate.controls || {});
  candidate.human_approval = {
    decision: 'GO',
    approved_by: '__preflight_only__',
    approved_at: now,
    evidence_sha256: hash
  };
  return { ready: evaluateEvidenceGate(candidate).decision === 'GO', hash };
}

function remediationPreflight(input, now) {
  const candidate = clone(input);
  const hash = remediationHash(candidate.work_items || [], candidate.controls || {});
  candidate.human_approval = {
    decision: 'GO',
    approved_by: '__preflight_only__',
    approved_at: now,
    remediation_sha256: hash
  };
  return { ready: evaluateRemediationGate(candidate).decision === 'GO', hash };
}

export function buildApprovalEnvelope({ liveEvidence, remediation, masterStatus, packageIntegrity }, now = new Date().toISOString()) {
  const evidence = evidencePreflight(liveEvidence, now);
  const fixes = remediationPreflight(remediation, now);
  const masterOnlyNeedsApproval = masterStatus?.decision === 'HOLD'
    && Array.isArray(masterStatus?.integrity_errors)
    && masterStatus.integrity_errors.length === 0
    && Array.isArray(masterStatus?.hold_reasons)
    && masterStatus.hold_reasons.length === 1
    && masterStatus.hold_reasons[0] === 'Final human approval is absent or not evidence-bound.';
  const packageReady = packageIntegrity?.integrity_decision === 'PASS';
  const ready = evidence.ready && fixes.ready && masterOnlyNeedsApproval && packageReady;
  const blockers = [];
  if (!evidence.ready) blockers.push('Authenticated evidence is not approval-ready.');
  if (!fixes.ready) blockers.push('Remediation is not approval-ready.');
  if (!masterOnlyNeedsApproval) blockers.push('Master status has unresolved non-approval blockers.');
  if (!packageReady) blockers.push('Release-package integrity is not PASS.');

  return {
    schema: 'tgg-human-approval-envelope-v1',
    version: 'V5760',
    generated_at: now,
    active_production_baseline: masterStatus?.active_production_baseline || 'UNKNOWN',
    current_review_checkpoint: masterStatus?.current_review_checkpoint || 'UNKNOWN',
    decision: ready ? 'READY_FOR_HUMAN_DECISION' : 'HOLD',
    bindings: {
      evidence_sha256: evidence.hash,
      remediation_sha256: fixes.hash,
      release_package_integrity: packageIntegrity?.integrity_decision || 'HOLD'
    },
    approval_fields: {
      decision: '',
      approved_by: '',
      approved_at: '',
      evidence_sha256: evidence.hash,
      remediation_sha256: fixes.hash
    },
    controls: {
      approval_created: false,
      approval_applied: false,
      production_writes: false,
      destructive_actions: false,
      auto_remediation: false,
      explicit_human_decision_required: true
    },
    blockers
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const [evidencePath, remediationPath, masterPath, packagePath, outputPath] = process.argv.slice(2);
  if (!evidencePath || !remediationPath || !masterPath || !packagePath || !outputPath) {
    throw new Error('Usage: node scripts/tgg-approval-envelope.mjs EVIDENCE.json REMEDIATION.json MASTER.json PACKAGE.json OUTPUT.json');
  }
  const packageManifest = await readJson(packagePath);
  const result = buildApprovalEnvelope({
    liveEvidence: await readJson(evidencePath),
    remediation: await readJson(remediationPath),
    masterStatus: await readJson(masterPath),
    packageIntegrity: await verifyReleasePackage(packageManifest)
  });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.decision === 'READY_FOR_HUMAN_DECISION' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
