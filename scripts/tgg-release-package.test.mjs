import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReleasePackage, verifyReleasePackage } from './tgg-release-package.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tgg-package-'));
  const definitions = [{ path: 'master.json', role: 'master-status' }];
  await writeFile(join(root, 'master.json'), JSON.stringify({
    active_production_baseline: 'V5640',
    current_review_checkpoint: 'V5720',
    decision: 'HOLD'
  }));
  const manifest = await buildReleasePackage(root, '2026-09-13T00:00:00Z', definitions);
  return { root, definitions, manifest };
}

test('valid package integrity passes while release remains HOLD', async () => {
  const { root, definitions, manifest } = await fixture();
  const result = await verifyReleasePackage(manifest, root, definitions);
  assert.equal(result.integrity_decision, 'PASS');
  assert.equal(result.release_decision, 'HOLD');
});

test('changed content invalidates the package hash', async () => {
  const { root, definitions, manifest } = await fixture();
  await writeFile(join(root, 'master.json'), '{"decision":"GO"}');
  const result = await verifyReleasePackage(manifest, root, definitions);
  assert.equal(result.integrity_decision, 'HOLD');
  assert.match(result.errors.join(' '), /SHA-256 mismatch/);
});

test('missing required package entries fail closed', async () => {
  const { root, definitions, manifest } = await fixture();
  manifest.files = [];
  const result = await verifyReleasePackage(manifest, root, definitions);
  assert.equal(result.integrity_decision, 'HOLD');
  assert.match(result.errors.join(' '), /Required package file is missing/);
});

test('path traversal is rejected before file access', async () => {
  const { root, definitions, manifest } = await fixture();
  manifest.files[0].path = '../master.json';
  const result = await verifyReleasePackage(manifest, root, definitions);
  assert.equal(result.integrity_decision, 'HOLD');
  assert.match(result.errors.join(' '), /Unsafe package path/);
});

test('unsafe control drift invalidates package integrity', async () => {
  const { root, definitions, manifest } = await fixture();
  manifest.controls.production_writes = true;
  const result = await verifyReleasePackage(manifest, root, definitions);
  assert.equal(result.integrity_decision, 'HOLD');
  assert.match(result.errors.join(' '), /production_writes/);
});
