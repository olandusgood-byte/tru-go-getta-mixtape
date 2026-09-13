import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateEvidenceGate } from './tgg-evidence-gate.mjs';
import { evaluateRemediationGate } from './tgg-remediation-gate.mjs';

function countByStatus(items) {
  return items.reduce((counts, item) => {
    const status = String(item && item.status || 'INVALID').toUpperCase();
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function percent(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

export function reconcileMasterStatus(inputs, now = new Date().toISOString()) {
  const {
    liveEvidence,
    publicShell,
    remediation,
    integration,
    sourceIntake,
    publicRpc
  } = inputs;
  const integrityErrors = [];
  const reasons = [];

  const expectedSchemas = [
    [liveEvidence, 'tgg-production-evidence-input-v1', 'live evidence'],
    [publicShell, 'tgg-public-shell-evidence-v1', 'public shell evidence'],
    [remediation, 'tgg-remediation-readiness-v1', 'remediation'],
    [integration, 'tgg-integration-readiness-v1', 'integration'],
    [sourceIntake, 'tgg-source-intake-readiness-v1', 'source intake'],
    [publicRpc, 'tgg-live-public-rpc-contract-v1', 'public RPC contract']
  ];
  for (const [document, schema, label] of expectedSchemas) {
    if (!document || document.schema !== schema) integrityErrors.push(`${label}: expected schema ${schema}.`);
  }

  const requirements = Array.isArray(liveEvidence?.requirements) ? liveEvidence.requirements : [];
  const evidence = Array.isArray(liveEvidence?.evidence) ? liveEvidence.evidence : [];
  const evidenceCounts = countByStatus(evidence);
  if (requirements.length !== evidence.length) integrityErrors.push('Live evidence count does not match the requirements manifest.');
  if (new Set(requirements).size !== requirements.length) integrityErrors.push('Live requirement ids are not unique.');

  const publicResults = Array.isArray(publicShell?.results) ? publicShell.results : [];
  const publicCounts = countByStatus(publicResults);
  for (const status of ['PASS', 'FAIL', 'UNVERIFIED']) {
    const declared = Number(publicShell?.summary?.[status.toLowerCase()] || 0);
    if (declared !== Number(publicCounts[status] || 0)) {
      integrityErrors.push(`Public shell ${status} summary does not match its result records.`);
    }
  }

  const workItems = Array.isArray(remediation?.work_items) ? remediation.work_items : [];
  const remediationCounts = countByStatus(workItems);
  const requiredSourceFiles = Array.isArray(sourceIntake?.required_files) ? sourceIntake.required_files : [];
  const sourceReceived = sourceIntake?.canonical_source_received === true;
  const evidenceGate = evaluateEvidenceGate(liveEvidence);
  const remediationGate = evaluateRemediationGate(remediation);

  const controls = {
    fail_closed: liveEvidence?.controls?.fail_closed === true
      && integration?.controls?.fail_closed === true,
    production_writes: integration?.controls?.production_writes === true
      || sourceIntake?.controls?.production_writes === true,
    destructive_actions: liveEvidence?.controls?.destructive_actions === true
      || remediation?.controls?.destructive_actions === true
      || integration?.controls?.destructive_actions === true
      || sourceIntake?.controls?.destructive_actions === true,
    auto_remediation: liveEvidence?.controls?.auto_remediation === true
      || remediation?.controls?.auto_remediation === true
      || integration?.controls?.auto_remediation === true
      || sourceIntake?.controls?.auto_remediation === true
  };
  if (!controls.fail_closed) integrityErrors.push('Fail-closed controls are not consistently enabled.');
  if (controls.production_writes) integrityErrors.push('A production-write control is enabled.');
  if (controls.destructive_actions) integrityErrors.push('A destructive-action control is enabled.');
  if (controls.auto_remediation) integrityErrors.push('An auto-remediation control is enabled.');
  if (publicRpc?.read_only !== true) integrityErrors.push('Public RPC contract evidence is not marked read-only.');

  const evidencePassed = Number(evidenceCounts.PASS || 0);
  const publicPassed = Number(publicCounts.PASS || 0);
  const fixed = Number(remediationCounts.FIXED || 0);
  const humanApprovalValid = evidenceGate.human_approval_valid === true
    && remediationGate.human_approval_valid === true;

  if (evidencePassed !== requirements.length) reasons.push(`${requirements.length - evidencePassed} authenticated requirements are not PASS.`);
  if (publicPassed !== publicResults.length) reasons.push(`${publicResults.length - publicPassed} public-shell executions are not PASS.`);
  if (fixed !== workItems.length) reasons.push(`${workItems.length - fixed} remediation items are not FIXED.`);
  if (!sourceReceived) reasons.push(`${requiredSourceFiles.length} canonical Blogger source files are missing.`);
  if (integration?.decision !== 'READY_FOR_HUMAN_REVIEW') reasons.push('Blogger integration is not READY_FOR_HUMAN_REVIEW.');
  if (!humanApprovalValid) reasons.push('Final human approval is absent or not evidence-bound.');

  return {
    schema: 'tgg-master-status-v1',
    generated_at: now,
    active_production_baseline: 'V5640',
    current_review_checkpoint: 'V5740',
    decision: integrityErrors.length || reasons.length ? 'HOLD' : 'GO',
    progress: {
      authenticated_evidence: {
        completed: evidencePassed,
        total: requirements.length,
        percent_complete: percent(evidencePassed, requirements.length)
      },
      public_shell_execution: {
        completed: publicResults.length,
        total: publicResults.length,
        percent_complete: publicResults.length ? 100 : 0,
        results: {
          pass: Number(publicCounts.PASS || 0),
          fail: Number(publicCounts.FAIL || 0),
          unverified: Number(publicCounts.UNVERIFIED || 0)
        }
      },
      remediation: {
        fixed,
        ready: Number(remediationCounts.READY || 0),
        open: Number(remediationCounts.OPEN || 0),
        total: workItems.length,
        percent_fixed: percent(fixed, workItems.length)
      },
      canonical_source: {
        received: sourceReceived ? requiredSourceFiles.length : 0,
        required: requiredSourceFiles.length,
        percent_complete: sourceReceived ? 100 : 0
      }
    },
    contracts: {
      public_rpc_verified: publicRpc?.read_only === true && Array.isArray(publicRpc?.contracts),
      candidate_builder_ready: Boolean(integration?.candidate_builder?.path),
      evidence_gate_decision: evidenceGate.decision,
      remediation_gate_decision: remediationGate.decision,
      human_approval_valid: humanApprovalValid
    },
    controls,
    integrity_errors: integrityErrors,
    hold_reasons: reasons
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const outputPath = process.argv[2];
  const result = reconcileMasterStatus({
    liveEvidence: await readJson('evidence/live-evidence-2026-09-12.json'),
    publicShell: await readJson('evidence/public-shell-evidence-2026-09-12.json'),
    remediation: await readJson('remediation/shell-remediation-2026-09-12.json'),
    integration: await readJson('integration/v5680-integration-readiness.json'),
    sourceIntake: await readJson('integration/v5690-source-intake-readiness.json'),
    publicRpc: await readJson('evidence/live-public-rpc-contract-2026-09-12.json')
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, output, 'utf8');
  process.stdout.write(output);
  process.exitCode = result.decision === 'GO' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
