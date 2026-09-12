import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STATUS = new Set(['OPEN', 'READY', 'BLOCKED', 'FIXED']);
const PRIORITY = new Set(['P0', 'P1', 'P2', 'P3']);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  const text = clean(value);
  return Boolean(text) && Number.isFinite(Date.parse(text));
}

function stableItems(items) {
  return items
    .map((item) => ({
      id: clean(item.id),
      priority: clean(item.priority).toUpperCase(),
      status: clean(item.status).toUpperCase(),
      evidence_refs: Array.isArray(item.evidence_refs) ? [...item.evidence_refs].map(clean).sort() : [],
      affected_routes: Array.isArray(item.affected_routes) ? [...item.affected_routes].map(clean).sort() : [],
      repair_action: clean(item.repair_action),
      acceptance_test: clean(item.acceptance_test),
      repair_asset: clean(item.repair_asset),
      patch_ref: clean(item.patch_ref),
      test_ref: clean(item.test_ref),
      verified_at: clean(item.verified_at),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function remediationHash(items, controls = {}) {
  const payload = {
    work_items: stableItems(items),
    controls: {
      fail_closed: controls.fail_closed === true,
      production_writes: controls.production_writes === true,
      destructive_actions: controls.destructive_actions === true,
      auto_remediation: controls.auto_remediation === true,
    },
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function evaluateRemediationGate(input) {
  const reasons = [];
  const items = Array.isArray(input?.work_items) ? input.work_items : [];
  const controls = input?.controls && typeof input.controls === 'object' ? input.controls : {};
  const approval = input?.human_approval && typeof input.human_approval === 'object'
    ? input.human_approval
    : {};

  if (input?.schema !== 'tgg-remediation-readiness-v1') {
    reasons.push('schema must be tgg-remediation-readiness-v1.');
  }
  if (!items.length) reasons.push('At least one remediation work item is required.');

  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const id = clean(item?.id);
    const status = clean(item?.status).toUpperCase();
    const priority = clean(item?.priority).toUpperCase();
    const prefix = id || `work_item_${index + 1}`;
    const evidenceRefs = Array.isArray(item?.evidence_refs) ? item.evidence_refs.map(clean).filter(Boolean) : [];
    const routes = Array.isArray(item?.affected_routes) ? item.affected_routes.map(clean).filter(Boolean) : [];

    if (!id) reasons.push(`Work item ${index + 1} is missing an id.`);
    if (ids.has(id)) reasons.push(`${prefix}: duplicate work item id.`);
    ids.add(id);
    if (!STATUS.has(status)) reasons.push(`${prefix}: invalid status.`);
    if (!PRIORITY.has(priority)) reasons.push(`${prefix}: invalid priority.`);
    if (!evidenceRefs.length) reasons.push(`${prefix}: at least one evidence reference is required.`);
    if (!routes.length) reasons.push(`${prefix}: at least one affected route is required.`);
    if (!clean(item?.repair_action)) reasons.push(`${prefix}: repair_action is required.`);
    if (!clean(item?.acceptance_test)) reasons.push(`${prefix}: acceptance_test is required.`);

    if (status === 'READY' && !clean(item?.repair_asset)) {
      reasons.push(`${prefix}: READY requires repair_asset.`);
    }

    if (status === 'FIXED') {
      if (!clean(item?.patch_ref)) reasons.push(`${prefix}: FIXED requires patch_ref.`);
      if (!clean(item?.test_ref)) reasons.push(`${prefix}: FIXED requires test_ref.`);
      if (!validDate(item?.verified_at)) reasons.push(`${prefix}: FIXED requires a valid verified_at timestamp.`);
    }
  }

  if (controls.fail_closed !== true) reasons.push('controls.fail_closed must remain true.');
  if (controls.production_writes !== false) reasons.push('controls.production_writes must remain false.');
  if (controls.destructive_actions !== false) reasons.push('controls.destructive_actions must remain false.');
  if (controls.auto_remediation !== false) reasons.push('controls.auto_remediation must remain false.');

  const hash = remediationHash(items, controls);
  const allFixed = items.length > 0
    && items.every((item) => clean(item?.status).toUpperCase() === 'FIXED');
  const approvalValid = clean(approval.decision).toUpperCase() === 'GO'
    && Boolean(clean(approval.approved_by))
    && validDate(approval.approved_at)
    && clean(approval.remediation_sha256) === hash;

  if (!allFixed) reasons.push('Every remediation work item must be FIXED.');
  if (!approvalValid) reasons.push('A human GO approval bound to the remediation SHA-256 is required.');

  const counts = { OPEN: 0, READY: 0, BLOCKED: 0, FIXED: 0, INVALID: 0 };
  for (const item of items) {
    const status = clean(item?.status).toUpperCase();
    if (STATUS.has(status)) counts[status] += 1;
    else counts.INVALID += 1;
  }

  return {
    schema: 'tgg-remediation-decision-v1',
    evaluated_at: new Date().toISOString(),
    decision: reasons.length === 0 ? 'GO' : 'HOLD',
    remediation_sha256: hash,
    work_item_count: items.length,
    work_item_counts: counts,
    human_approval_valid: approvalValid,
    controls: {
      fail_closed: controls.fail_closed === true,
      production_writes: controls.production_writes === true,
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
    throw new Error('Usage: node scripts/tgg-remediation-gate.mjs INPUT.json [OUTPUT.json]');
  }
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = evaluateRemediationGate(input);
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
