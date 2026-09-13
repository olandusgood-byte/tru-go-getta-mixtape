import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApprovalEnvelope } from './tgg-approval-envelope.mjs';

function readyInputs() {
  return {
    liveEvidence: {
      schema: 'tgg-production-evidence-input-v1',
      requirements: ['runtime'],
      evidence: [{
        id: 'runtime', status: 'PASS', executed_at: '2026-09-13T01:00:00Z',
        evidence_ref: 'run://browser/1', notes: 'Authenticated pass.'
      }],
      controls: { fail_closed: true, destructive_actions: false, auto_remediation: false },
      human_approval: { decision: 'HOLD', approved_by: '', approved_at: '', evidence_sha256: '' }
    },
    remediation: {
      schema: 'tgg-remediation-readiness-v1',
      work_items: [{
        id: 'repair', priority: 'P1', status: 'FIXED', evidence_refs: ['run://browser/1'],
        affected_routes: ['/'], repair_action: 'Repair.', acceptance_test: 'Test.',
        repair_asset: 'patch.js', patch_ref: 'commit://abc', test_ref: 'run://browser/2',
        verified_at: '2026-09-13T01:10:00Z'
      }],
      controls: { fail_closed: true, production_writes: false, destructive_actions: false, auto_remediation: false },
      human_approval: { decision: 'HOLD', approved_by: '', approved_at: '', remediation_sha256: '' }
    },
    masterStatus: {
      decision: 'HOLD', active_production_baseline: 'V5640', current_review_checkpoint: 'V5770', integrity_errors: [],
      hold_reasons: ['Final human approval is absent or not evidence-bound.']
    },
    packageIntegrity: { integrity_decision: 'PASS' }
  };
}

test('complete prerequisites produce an unsigned human-decision envelope', () => {
  const result = buildApprovalEnvelope(readyInputs(), '2026-09-13T02:00:00Z');
  assert.equal(result.decision, 'READY_FOR_HUMAN_DECISION');
  assert.match(result.bindings.evidence_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.bindings.remediation_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.approval_fields.decision, '');
  assert.equal(result.controls.approval_created, false);
  assert.equal(result.current_review_checkpoint, 'V5770');
});

test('incomplete evidence holds the approval envelope', () => {
  const value = readyInputs();
  value.liveEvidence.evidence[0].status = 'UNVERIFIED';
  value.liveEvidence.evidence[0].executed_at = '';
  value.liveEvidence.evidence[0].evidence_ref = '';
  const result = buildApprovalEnvelope(value);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.blockers.join(' '), /evidence is not approval-ready/);
});

test('non-approval master blockers prevent premature approval', () => {
  const value = readyInputs();
  value.masterStatus.hold_reasons.unshift('Canonical source is missing.');
  const result = buildApprovalEnvelope(value);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.blockers.join(' '), /unresolved non-approval blockers/);
});

test('package drift blocks the envelope', () => {
  const value = readyInputs();
  value.packageIntegrity.integrity_decision = 'HOLD';
  const result = buildApprovalEnvelope(value);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.blockers.join(' '), /integrity is not PASS/);
});

test('evidence changes produce a different approval binding', () => {
  const value = readyInputs();
  const first = buildApprovalEnvelope(value, '2026-09-13T02:00:00Z');
  value.liveEvidence.evidence[0].notes = 'Updated authenticated observation.';
  const second = buildApprovalEnvelope(value, '2026-09-13T02:00:00Z');
  assert.notEqual(first.bindings.evidence_sha256, second.bindings.evidence_sha256);
});
