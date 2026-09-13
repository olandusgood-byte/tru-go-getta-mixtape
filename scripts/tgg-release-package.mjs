import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_FILES = [
  ['evidence/live-evidence-2026-09-12.json', 'authenticated-evidence'],
  ['evidence/public-shell-evidence-2026-09-12.json', 'public-shell-evidence'],
  ['evidence/live-public-rpc-contract-2026-09-12.json', 'public-rpc-contract'],
  ['evidence/authenticated-browser-execution-plan-2026-09-12.json', 'execution-plan'],
  ['evidence/blogger-source-access-2026-09-12.json', 'source-access-evidence'],
  ['evidence/live-dom-source-map-2026-09-12.json', 'source-map-evidence'],
  ['remediation/shell-remediation-2026-09-12.json', 'remediation'],
  ['integration/v5680-integration-readiness.json', 'integration-readiness'],
  ['integration/v5690-source-intake-readiness.json', 'source-intake-readiness'],
  ['status/master-status-2026-09-13.json', 'master-status'],
  ['patches/v5670/blogger-shell-isolation.js', 'repair-asset'],
  ['patches/v5670/auth-first-rpc-gate.js', 'repair-asset'],
  ['patches/v5670/homepage-discovery-adapter.js', 'repair-asset'],
  ['patches/v5670/creator-store-loader-repair.js', 'repair-asset'],
  ['patches/v5670/truthful-runtime-status.js', 'repair-asset'],
  ['scripts/tgg-evidence-gate.mjs', 'control-executable'],
  ['scripts/tgg-approval-envelope.mjs', 'control-executable'],
  ['scripts/tgg-remediation-gate.mjs', 'control-executable'],
  ['scripts/tgg-master-status.mjs', 'control-executable'],
  ['scripts/tgg-readiness-runner.mjs', 'control-executable'],
  ['scripts/tgg-result-intake.mjs', 'control-executable'],
  ['scripts/tgg-source-review-summary.mjs', 'control-executable'],
  ['scripts/tgg-predeploy-lint.mjs', 'control-executable'],
  ['scripts/tgg-blogger-candidate.mjs', 'control-executable'],
  ['scripts/tgg-source-intake.mjs', 'control-executable'],
  ['scripts/tgg_xml_wellformed.py', 'control-executable']
].map(([path, role]) => ({ path, role }));

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeRelativePath(path) {
  const value = String(path || '').replaceAll('\\', '/');
  const normalized = normalize(value).replaceAll('\\', '/');
  return Boolean(value)
    && !isAbsolute(value)
    && normalized !== '..'
    && !normalized.startsWith('../')
    && normalized === value;
}

async function fileRecord(root, definition) {
  if (!safeRelativePath(definition.path)) throw new Error(`Unsafe package path: ${definition.path}`);
  const bytes = await readFile(resolve(root, definition.path));
  return {
    path: definition.path,
    role: definition.role,
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

export async function buildReleasePackage(
  root = '.',
  generatedAt = new Date().toISOString(),
  definitions = RELEASE_FILES
) {
  const files = [];
  for (const definition of definitions) files.push(await fileRecord(root, definition));
  const masterRecord = files.find((entry) => entry.role === 'master-status');
  const master = masterRecord
    ? JSON.parse(await readFile(resolve(root, masterRecord.path), 'utf8'))
    : null;

  return {
    schema: 'tgg-release-readiness-package-v1',
    version: 'V5720',
    generated_at: generatedAt,
    active_production_baseline: master?.active_production_baseline || 'UNKNOWN',
    current_review_checkpoint: master?.current_review_checkpoint || 'UNKNOWN',
    release_decision: master?.decision || 'HOLD',
    files,
    controls: {
      fail_closed: true,
      production_writes: false,
      destructive_actions: false,
      auto_remediation: false,
      human_approval_required: true
    }
  };
}

export async function verifyReleasePackage(
  manifest,
  root = '.',
  definitions = RELEASE_FILES
) {
  const errors = [];
  if (manifest?.schema !== 'tgg-release-readiness-package-v1') errors.push('Unexpected package schema.');
  if (manifest?.version !== 'V5720') errors.push('Unexpected package version.');
  if (!['GO', 'HOLD'].includes(manifest?.release_decision)) errors.push('Release decision must be GO or HOLD.');

  const controls = manifest?.controls || {};
  if (controls.fail_closed !== true) errors.push('fail_closed must remain true.');
  if (controls.production_writes !== false) errors.push('production_writes must remain false.');
  if (controls.destructive_actions !== false) errors.push('destructive_actions must remain false.');
  if (controls.auto_remediation !== false) errors.push('auto_remediation must remain false.');
  if (controls.human_approval_required !== true) errors.push('human_approval_required must remain true.');

  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const expected = new Map(definitions.map((item) => [item.path, item.role]));
  const seen = new Set();
  for (const entry of files) {
    const path = String(entry?.path || '');
    if (!safeRelativePath(path)) {
      errors.push(`Unsafe package path: ${path || '<empty>'}.`);
      continue;
    }
    if (seen.has(path)) errors.push(`Duplicate package path: ${path}.`);
    seen.add(path);
    if (!expected.has(path)) errors.push(`Unexpected package file: ${path}.`);
    if (expected.has(path) && entry.role !== expected.get(path)) errors.push(`${path}: role mismatch.`);
    try {
      const bytes = await readFile(resolve(root, path));
      if (entry.bytes !== bytes.length) errors.push(`${path}: byte count mismatch.`);
      if (entry.sha256 !== sha256(bytes)) errors.push(`${path}: SHA-256 mismatch.`);
    } catch (error) {
      errors.push(`${path}: unable to read package file (${error.code || error.message}).`);
    }
  }
  for (const path of expected.keys()) {
    if (!seen.has(path)) errors.push(`Required package file is missing: ${path}.`);
  }

  const masterPath = definitions.find((entry) => entry.role === 'master-status')?.path;
  if (masterPath) {
    try {
      const master = JSON.parse(await readFile(resolve(root, masterPath), 'utf8'));
      if (manifest.active_production_baseline !== master.active_production_baseline) errors.push('Active baseline disagrees with master status.');
      if (manifest.current_review_checkpoint !== master.current_review_checkpoint) errors.push('Review checkpoint disagrees with master status.');
      if (manifest.release_decision !== master.decision) errors.push('Release decision disagrees with master status.');
    } catch (error) {
      errors.push(`Unable to reconcile master status (${error.message}).`);
    }
  }

  return {
    schema: 'tgg-release-package-verification-v1',
    verified_at: new Date().toISOString(),
    integrity_decision: errors.length ? 'HOLD' : 'PASS',
    release_decision: manifest?.release_decision || 'HOLD',
    file_count: files.length,
    errors
  };
}

async function main() {
  const [mode, path] = process.argv.slice(2);
  if (mode === '--write' && path) {
    const manifest = await buildReleasePackage();
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  if (mode === '--verify' && path) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    const result = await verifyReleasePackage(manifest);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.integrity_decision === 'PASS' ? 0 : 2;
    return;
  }
  throw new Error('Usage: node scripts/tgg-release-package.mjs --write OUTPUT.json | --verify MANIFEST.json');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
