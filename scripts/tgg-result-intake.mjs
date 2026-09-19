import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateEvidenceGate } from './tgg-evidence-gate.mjs';
import { evaluateRemediationGate } from './tgg-remediation-gate.mjs';

const EXECUTION_STATUS = new Set(['PASS', 'FAIL']);
const PLACEHOLDER = /^(?:n\/?a|none|null|todo|tbd|pending|unknown|example|test)$/i;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  return Boolean(clean(value)) && Number.isFinite(Date.parse(clean(value)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetEvidenceApproval(candidate) {
  candidate.human_approval = {
    decision: 'HOLD',
    approved_by: '',
    approved_at: '',
    evidence_sha256: ''
  };
}

function resetRemediationApproval(candidate) {
  candidate.human_approval = {
    decision: 'HOLD',
    approved_by: '',
    approved_at: '',
    remediation_sha256: ''
  };
}

export function applyEvidenceResults(base, submissions) {
  if (base?.schema !== 'tgg-production-evidence-input-v1') throw new Error('Invalid evidence ledger schema.');
  if (!Array.isArray(submissions)) throw new Error('evidence_results must be an array.');
  const records = Array.isArray(base.evidence) ? base.evidence : [];
  const ids = new Set(records.map((item) => clean(item.id)));
  const submitted = new Set();

  for (const item of submissions) {
    const id = clean(item?.id);
    const status = clean(item?.status).toUpperCase();
    if (!id || !ids.has(id)) throw new Error(`${id || '<empty>'}: unknown evidence requirement.`);
    if (submitted.has(id)) throw new Error(`${id}: duplicate submitted evidence result.`);
    if (!EXECUTION_STATUS.has(status)) throw new Error(`${id}: executed result must be PASS or FAIL.`);
    if (!validDate(item?.executed_at)) throw new Error(`${id}: a valid executed_at timestamp is required.`);
    if (!clean(item?.evidence_ref) || PLACEHOLDER.test(clean(item.evidence_ref))) {
      throw new Error(`${id}: a durable non-placeholder evidence_ref is required.`);
    }
    if (!clean(item?.notes)) throw new Error(`${id}: execution notes are required.`);
    submitted.add(id);
  }

  const candidate = clone(base);
  for (const item of submissions) {
    const target = candidate.evidence.find((record) => record.id === clean(item.id));
    Object.assign(target, {
      status: clean(item.status).toUpperCase(),
      executed_at: clean(item.executed_at),
      evidence_ref: clean(item.evidence_ref),
      notes: clean(item.notes)
    });
  }
  if (submissions.length) resetEvidenceApproval(candidate);
  return candidate;
}

export function applyRemediationResults(base, submissions) {
  if (base?.schema !== 'tgg-remediation-readiness-v1') throw new Error('Invalid remediation ledger schema.');
  if (!Array.isArray(submissions)) throw new Error('remediation_results must be an array.');
  const items = Array.isArray(base.work_items) ? base.work_items : [];
  const ids = new Set(items.map((item) => clean(item.id)));
  const submitted = new Set();

  for (const item of submissions) {
    const id = clean(item?.id);
    if (!id || !ids.has(id)) throw new Error(`${id || '<empty>'}: unknown remediation item.`);
    if (submitted.has(id)) throw new Error(`${id}: duplicate submitted remediation result.`);
    if (clean(item?.status).toUpperCase() !== 'FIXED') throw new Error(`${id}: verified remediation result must be FIXED.`);
    if (!clean(item?.patch_ref) || PLACEHOLDER.test(clean(item.patch_ref))) throw new Error(`${id}: patch_ref is required.`);
    if (!clean(item?.test_ref) || PLACEHOLDER.test(clean(item.test_ref))) throw new Error(`${id}: test_ref is required.`);
    if (!validDate(item?.verified_at)) throw new Error(`${id}: a valid verified_at timestamp is required.`);
    submitted.add(id);
  }

  const candidate = clone(base);
  for (const item of submissions) {
    const target = candidate.work_items.find((record) => record.id === clean(item.id));
    Object.assign(target, {
      status: 'FIXED',
      patch_ref: clean(item.patch_ref),
      test_ref: clean(item.test_ref),
      verified_at: clean(item.verified_at)
    });
  }
  if (submissions.length) resetRemediationApproval(candidate);
  return candidate;
}

export function buildResultIntake({ liveEvidence, remediation, results }) {
  if (results?.schema !== 'tgg-execution-results-v1') throw new Error('Invalid execution-results schema.');
  const evidenceResults = results.evidence_results;
  const remediationResults = results.remediation_results;
  if (!Array.isArray(evidenceResults) || !Array.isArray(remediationResults)) {
    throw new Error('Both evidence_results and remediation_results arrays are required.');
  }
  if (!evidenceResults.length && !remediationResults.length) throw new Error('At least one concrete result is required.');

  const evidenceCandidate = applyEvidenceResults(liveEvidence, evidenceResults);
  const remediationCandidate = applyRemediationResults(remediation, remediationResults);
  const evidenceGate = evaluateEvidenceGate(evidenceCandidate);
  const remediationGate = evaluateRemediationGate(remediationCandidate);

  return {
    schema: 'tgg-result-intake-candidate-v1',
    version: 'V5750',
    generated_at: new Date().toISOString(),
    intake_decision: 'ACCEPTED_FOR_REVIEW',
    release_decision: evidenceGate.decision === 'GO' && remediationGate.decision === 'GO' ? 'GO' : 'HOLD',
    accepted_results: {
      evidence: evidenceResults.length,
      remediation: remediationResults.length
    },
    evidence_candidate: evidenceCandidate,
    remediation_candidate: remediationCandidate,
    gate_preview: {
      evidence: evidenceGate,
      remediation: remediationGate
    },
    controls: {
      active_ledgers_modified: false,
      production_writes: false,
      destructive_actions: false,
      auto_remediation: false,
      approvals_invalidated_on_change: true,
      human_review_required: true
    }
  };
}

async function main() {
  const [evidencePath, remediationPath, resultsPath, outputPath] = process.argv.slice(2);
  if (!evidencePath || !remediationPath || !resultsPath || !outputPath) {
    throw new Error('Usage: node scripts/tgg-result-intake.mjs EVIDENCE.json REMEDIATION.json RESULTS.json OUTPUT.json');
  }
  const result = buildResultIntake({
    liveEvidence: JSON.parse(await readFile(evidencePath, 'utf8')),
    remediation: JSON.parse(await readFile(remediationPath, 'utf8')),
    results: JSON.parse(await readFile(resultsPath, 'utf8'))
  });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
