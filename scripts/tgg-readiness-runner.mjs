import { basename, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateEvidenceGate } from './tgg-evidence-gate.mjs';
import { reconcileMasterStatus } from './tgg-master-status.mjs';
import { evaluateRemediationGate } from './tgg-remediation-gate.mjs';
import { verifyReleasePackage } from './tgg-release-package.mjs';
import { evaluateSourceIntake, parseChecksumFile } from './tgg-source-intake.mjs';

export function summarizeReadiness({ evidence, remediation, master, packageIntegrity, source }) {
  const blockers = [];
  if (evidence?.decision !== 'GO') blockers.push('Authenticated production evidence gate is HOLD.');
  if (remediation?.decision !== 'GO') blockers.push('Remediation gate is HOLD.');
  if (master?.decision !== 'GO') blockers.push('Master release decision is HOLD.');
  if (packageIntegrity?.integrity_decision !== 'PASS') blockers.push('Release-package integrity is not PASS.');
  if (source?.decision !== 'ACCEPTED_FOR_CANDIDATE') blockers.push('Canonical Blogger source is not accepted for candidate generation.');

  return {
    schema: 'tgg-unified-readiness-decision-v1',
    evaluated_at: new Date().toISOString(),
    active_production_baseline: master?.active_production_baseline || 'UNKNOWN',
    current_review_checkpoint: 'V5770',
    decision: blockers.length ? 'HOLD' : 'GO',
    gates: {
      authenticated_evidence: evidence?.decision || 'HOLD',
      remediation: remediation?.decision || 'HOLD',
      master_status: master?.decision || 'HOLD',
      package_integrity: packageIntegrity?.integrity_decision || 'HOLD',
      canonical_source: source?.decision || 'MISSING'
    },
    controls: {
      fail_closed: true,
      production_writes: false,
      destructive_actions: false,
      auto_remediation: false,
      human_approval_required: true
    },
    blockers
  };
}

async function readJson(root, path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

async function inspectSource(root, sourceIntake) {
  const required = Array.isArray(sourceIntake?.required_files) ? sourceIntake.required_files : [];
  if (required.length !== 2) {
    return { decision: 'HOLD', reasons: ['Expected exactly two canonical source files.'] };
  }
  try {
    const source = await readFile(resolve(root, required[0]), 'utf8');
    const checksum = parseChecksumFile(await readFile(resolve(root, required[1]), 'utf8'));
    return evaluateSourceIntake({
      content: source,
      expectedSha256: checksum.sha256,
      expectedFilename: checksum.filename,
      actualFilename: basename(required[0])
    });
  } catch (error) {
    return {
      decision: error.code === 'ENOENT' ? 'MISSING' : 'HOLD',
      reasons: [error.code === 'ENOENT'
        ? 'Canonical Blogger XML and companion SHA-256 are not both present.'
        : `Canonical source inspection failed: ${error.message}`]
    };
  }
}

export async function runReadiness(root = '.') {
  const liveEvidence = await readJson(root, 'evidence/live-evidence-2026-09-12.json');
  const publicShell = await readJson(root, 'evidence/public-shell-evidence-2026-09-12.json');
  const remediationInput = await readJson(root, 'remediation/shell-remediation-2026-09-12.json');
  const integration = await readJson(root, 'integration/v5680-integration-readiness.json');
  const sourceIntake = await readJson(root, 'integration/v5690-source-intake-readiness.json');
  const publicRpc = await readJson(root, 'evidence/live-public-rpc-contract-2026-09-12.json');
  const packageManifest = await readJson(root, 'package/v5720-release-readiness.json');

  const evidence = evaluateEvidenceGate(liveEvidence);
  const remediation = evaluateRemediationGate(remediationInput);
  const master = reconcileMasterStatus({
    liveEvidence,
    publicShell,
    remediation: remediationInput,
    integration,
    sourceIntake,
    publicRpc
  });
  const packageIntegrity = await verifyReleasePackage(packageManifest, root);
  const source = await inspectSource(root, sourceIntake);
  return summarizeReadiness({ evidence, remediation, master, packageIntegrity, source });
}

async function main() {
  const result = await runReadiness(process.argv[2] || '.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.decision === 'GO' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
