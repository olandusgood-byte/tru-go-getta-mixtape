import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STATUS = new Set(['PASS', 'FAIL', 'UNVERIFIED']);
const PLACEHOLDER = /^(?:n\/?a|none|null|todo|tbd|pending|unknown|example|test)$/i;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  const text = clean(value);
  return Boolean(text) && Number.isFinite(Date.parse(text));
}

function stableEvidence(items) {
  return items
    .map((item) => ({
      id: clean(item.id),
      status: clean(item.status).toUpperCase(),
      executed_at: clean(item.executed_at),
      evidence_ref: clean(item.evidence_ref),
      notes: clean(item.notes),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function evidenceHash(items, requirements = [], controls = {}) {
  const payload = {
    requirements: [...requirements].map(clean).sort(),
    evidence: stableEvidence(items),
    controls: {
      fail_closed: controls.fail_closed === true,
      destructive_actions: controls.destructive_actions === true,
      auto_remediation: controls.auto_remediation === true,
    },
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function evaluateEvidenceGate(input) {
  const reasons = [];
  const items = Array.isArray(input?.evidence) ? input.evidence : [];
  const requirements = Array.isArray(input?.requirements) ? input.requirements.map(clean) : [];
  const controls = input?.controls && typeof input.controls === 'object' ? input.controls : {};
  const approval = input?.human_approval && typeof input.human_approval === 'object'
    ? input.human_approval
    : {};

  const requirementSet = new Set(requirements);
  if (!requirements.length) reasons.push('An explicit requirements manifest is required.');
  if (requirementSet.size !== requirements.length || requirements.some((id) => !id)) {
    reasons.push('Requirement ids must be non-empty and unique.');
  }
  if (items.length !== requirements.length) {
    reasons.push(`Expected ${requirements.length} evidence records; received ${items.length}.`);
  }

  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const id = clean(item?.id);
    const status = clean(item?.status).toUpperCase();
    const ref = clean(item?.evidence_ref);
    const prefix = id || `record_${index + 1}`;

    if (!id) reasons.push(`Evidence record ${index + 1} is missing an id.`);
    if (ids.has(id)) reasons.push(`${prefix}: duplicate evidence id.`);
    if (!requirementSet.has(id)) reasons.push(`${prefix}: id is not present in the requirements manifest.`);
    ids.add(id);
    if (!STATUS.has(status)) reasons.push(`${prefix}: status must be PASS, FAIL, or UNVERIFIED.`);

    if (status === 'PASS') {
      if (!validDate(item?.executed_at)) reasons.push(`${prefix}: PASS requires a valid executed_at timestamp.`);
      if (!ref || PLACEHOLDER.test(ref)) reasons.push(`${prefix}: PASS requires a non-placeholder evidence_ref.`);
    }

    if (status === 'FAIL' && !validDate(item?.executed_at)) {
      reasons.push(`${prefix}: FAIL requires a valid executed_at timestamp.`);
    }
  }

  for (const id of requirements) {
    if (!ids.has(id)) reasons.push(`${id}: required evidence record is missing.`);
  }

  if (controls.fail_closed !== true) reasons.push('controls.fail_closed must remain true.');
  if (controls.destructive_actions !== false) reasons.push('controls.destructive_actions must remain false.');
  if (controls.auto_remediation !== false) reasons.push('controls.auto_remediation must remain false.');

  const hash = evidenceHash(items, requirements, controls);
  const allPassed = requirements.length > 0
    && items.length === requirements.length
    && items.every((item) => clean(item?.status).toUpperCase() === 'PASS');
  const approvalValid = clean(approval.decision).toUpperCase() === 'GO'
    && Boolean(clean(approval.approved_by))
    && validDate(approval.approved_at)
    && clean(approval.evidence_sha256) === hash;

  if (!allPassed) reasons.push('Every declared production evidence requirement must be PASS.');
  if (!approvalValid) reasons.push('A human GO approval bound to the current evidence SHA-256 is required.');

  const counts = { PASS: 0, FAIL: 0, UNVERIFIED: 0, INVALID: 0 };
  for (const item of items) {
    const status = clean(item?.status).toUpperCase();
    if (STATUS.has(status)) counts[status] += 1;
    else counts.INVALID += 1;
  }

  return {
    schema: 'tgg-production-evidence-decision-v1',
    evaluated_at: new Date().toISOString(),
    decision: reasons.length === 0 ? 'GO' : 'HOLD',
    requirement_count: requirements.length,
    evidence_sha256: hash,
    evidence_counts: counts,
    human_approval_valid: approvalValid,
    controls: {
      fail_closed: controls.fail_closed === true,
      destructive_actions: controls.destructive_actions === true,
      auto_remediation: controls.auto_remediation === true,
    },
    reasons: [...new Set(reasons)],
  };
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    throw new Error('Usage: node scripts/tgg-evidence-gate.mjs INPUT.json [OUTPUT.json]');
  }
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = evaluateEvidenceGate(input);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, text, 'utf8');
  process.stdout.write(text);
  process.exitCode = result.decision === 'GO' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
