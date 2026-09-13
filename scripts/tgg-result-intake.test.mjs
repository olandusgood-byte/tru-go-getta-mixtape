import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEvidenceResults, applyRemediationResults, buildResultIntake } from './tgg-result-intake.mjs';

function evidence() {
  return {
    schema: 'tgg-production-evidence-input-v1',
    requirements: ['runtime'],
    evidence: [{ id: 'runtime', status: 'UNVERIFIED', executed_at: '', evidence_ref: '', notes: '' }],
    controls: { fail_closed: true, destructive_actions: false, auto_remediation: false },
    human_approval: { decision: 'GO', approved_by: 'old', approved_at: '2026-09-13T00:00:00Z', evidence_sha256: 'stale' }
  };
}

function remediation() {
  return {
    schema: 'tgg-remediation-readiness-v1',
    work_items: [{
      id: 'repair', priority: 'P1', status: 'READY', evidence_refs: ['evidence://one'],
      affected_routes: ['/'], repair_action: 'Repair.', acceptance_test: 'Test.',
      repair_asset: 'patch.js', patch_ref: '', test_ref: '', verified_at: ''
    }],
    controls: { fail_closed: true, production_writes: false, destructive_actions: false, auto_remediation: false },
    human_approval: { decision: 'GO', approved_by: 'old', approved_at: '2026-09-13T00:00:00Z', remediation_sha256: 'stale' }
  };
}

const executed = {
  id: 'runtime', status: 'PASS', executed_at: '2026-09-13T01:00:00Z',
  evidence_ref: 'run://browser/1', notes: 'Authenticated runtime passed.'
};

const fixed = {
  id: 'repair', status: 'FIXED', patch_ref: 'commit://abc',
  test_ref: 'run://browser/2', verified_at: '2026-09-13T01:10:00Z'
};

test('evidence intake creates a candidate without mutating the active ledger', () => {
  const base = evidence();
  const candidate = applyEvidenceResults(base, [executed]);
  assert.equal(base.evidence[0].status, 'UNVERIFIED');
  assert.equal(candidate.evidence[0].status, 'PASS');
  assert.equal(candidate.human_approval.decision, 'HOLD');
});

test('unknown or duplicate evidence ids are rejected atomically', () => {
  assert.throws(() => applyEvidenceResults(evidence(), [{ ...executed, id: 'unknown' }]), /unknown evidence/);
  assert.throws(() => applyEvidenceResults(evidence(), [executed, executed]), /duplicate submitted/);
});

test('PASS and FAIL both require durable execution evidence', () => {
  assert.throws(() => applyEvidenceResults(evidence(), [{ ...executed, evidence_ref: 'pending' }]), /durable/);
  assert.throws(() => applyEvidenceResults(evidence(), [{ ...executed, status: 'FAIL', executed_at: '' }]), /executed_at/);
});

test('remediation intake requires patch, test, and verification timestamp', () => {
  assert.throws(() => applyRemediationResults(remediation(), [{ ...fixed, patch_ref: '' }]), /patch_ref/);
  assert.throws(() => applyRemediationResults(remediation(), [{ ...fixed, test_ref: '' }]), /test_ref/);
  assert.throws(() => applyRemediationResults(remediation(), [{ ...fixed, verified_at: '' }]), /verified_at/);
});

test('verified remediation becomes FIXED only in a review candidate', () => {
  const base = remediation();
  const candidate = applyRemediationResults(base, [fixed]);
  assert.equal(base.work_items[0].status, 'READY');
  assert.equal(candidate.work_items[0].status, 'FIXED');
  assert.equal(candidate.human_approval.decision, 'HOLD');
});

test('accepted complete results remain HOLD until fresh hash-bound approvals', () => {
  const result = buildResultIntake({
    liveEvidence: evidence(),
    remediation: remediation(),
    results: {
      schema: 'tgg-execution-results-v1',
      evidence_results: [executed],
      remediation_results: [fixed]
    }
  });
  assert.equal(result.intake_decision, 'ACCEPTED_FOR_REVIEW');
  assert.equal(result.release_decision, 'HOLD');
  assert.equal(result.gate_preview.evidence.human_approval_valid, false);
  assert.equal(result.gate_preview.remediation.human_approval_valid, false);
  assert.equal(result.controls.active_ledgers_modified, false);
});
