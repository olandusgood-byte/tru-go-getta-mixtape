import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRemediationGate, remediationHash } from './tgg-remediation-gate.mjs';

const controls = {
  fail_closed: true,
  production_writes: false,
  destructive_actions: false,
  auto_remediation: false,
};

function item(status = 'OPEN') {
  return {
    id: 'shell_isolation',
    priority: 'P0',
    status,
    evidence_refs: ['evidence://public-shell/2026-09-12'],
    affected_routes: ['/p/messages.html'],
    repair_action: 'Scope global widgets away from application pages.',
    acceptance_test: 'Application route renders once without homepage leakage.',
    repair_asset: status === 'READY' ? 'patches/v5670/blogger-shell-isolation.js' : '',
    patch_ref: status === 'FIXED' ? 'commit://abc123' : '',
    test_ref: status === 'FIXED' ? 'run://browser/123' : '',
    verified_at: status === 'FIXED' ? '2026-09-12T21:00:00Z' : '',
  };
}

function manifest(status = 'OPEN') {
  return {
    schema: 'tgg-remediation-readiness-v1',
    work_items: [item(status)],
    controls,
    human_approval: {
      decision: 'HOLD',
      approved_by: '',
      approved_at: '',
      remediation_sha256: '',
    },
  };
}

test('open remediation work holds the gate', () => {
  const result = evaluateRemediationGate(manifest());
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.work_item_counts.OPEN, 1);
});

test('a claimed fix without patch, test, and timestamp is rejected', () => {
  const input = manifest('FIXED');
  input.work_items[0].patch_ref = '';
  input.work_items[0].test_ref = '';
  input.work_items[0].verified_at = '';
  const result = evaluateRemediationGate(input);
  assert.match(result.reasons.join(' '), /FIXED requires patch_ref/);
  assert.match(result.reasons.join(' '), /FIXED requires test_ref/);
  assert.match(result.reasons.join(' '), /valid verified_at/);
});

test('fixed work still requires human approval', () => {
  const result = evaluateRemediationGate(manifest('FIXED'));
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.human_approval_valid, false);
});

test('ready work requires a concrete repair asset', () => {
  const input = manifest('READY');
  input.work_items[0].repair_asset = '';
  const result = evaluateRemediationGate(input);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /READY requires repair_asset/);
});

test('approval is invalidated when remediation evidence changes', () => {
  const input = manifest('FIXED');
  input.human_approval = {
    decision: 'GO',
    approved_by: 'release-owner',
    approved_at: '2026-09-12T21:10:00Z',
    remediation_sha256: remediationHash(input.work_items, controls),
  };
  assert.equal(evaluateRemediationGate(input).decision, 'GO');
  input.work_items[0].test_ref = 'run://browser/changed';
  assert.equal(evaluateRemediationGate(input).decision, 'HOLD');
});

test('unsafe controls hold the gate', () => {
  const input = manifest('FIXED');
  input.controls.auto_remediation = true;
  input.human_approval = {
    decision: 'GO',
    approved_by: 'release-owner',
    approved_at: '2026-09-12T21:10:00Z',
    remediation_sha256: remediationHash(input.work_items, input.controls),
  };
  const result = evaluateRemediationGate(input);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /auto_remediation must remain false/);
});
