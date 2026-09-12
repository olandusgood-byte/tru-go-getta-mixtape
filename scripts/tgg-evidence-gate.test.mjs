import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceHash, evaluateEvidenceGate } from './tgg-evidence-gate.mjs';

const controls = {
  fail_closed: true,
  destructive_actions: false,
  auto_remediation: false,
};

function records(status = 'PASS') {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `production_check_${String(index + 1).padStart(2, '0')}`,
    status,
    executed_at: status === 'UNVERIFIED' ? '' : '2026-09-12T12:00:00Z',
    evidence_ref: status === 'UNVERIFIED' ? '' : `run://production/${index + 1}`,
    notes: 'Observed result recorded by the operator.',
  }));
}

test('UNVERIFIED evidence holds the gate', () => {
  const result = evaluateEvidenceGate({ evidence: records('UNVERIFIED'), controls });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.evidence_counts.UNVERIFIED, 10);
});

test('an unexecuted PASS is rejected', () => {
  const evidence = records();
  evidence[0].executed_at = '';
  evidence[0].evidence_ref = 'TBD';
  const result = evaluateEvidenceGate({ evidence, controls });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /PASS requires a valid executed_at/);
  assert.match(result.reasons.join(' '), /non-placeholder evidence_ref/);
});

test('all evidence passing still requires human approval', () => {
  const result = evaluateEvidenceGate({ evidence: records(), controls });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.human_approval_valid, false);
});

test('approval must be bound to the current evidence hash', () => {
  const evidence = records();
  const base = {
    evidence,
    controls,
    human_approval: {
      decision: 'GO',
      approved_by: 'release-owner',
      approved_at: '2026-09-12T12:30:00Z',
      evidence_sha256: evidenceHash(evidence),
    },
  };
  assert.equal(evaluateEvidenceGate(base).decision, 'GO');
  base.evidence[0].notes = 'Evidence changed after approval.';
  assert.equal(evaluateEvidenceGate(base).decision, 'HOLD');
});

test('unsafe control changes hold the gate', () => {
  const evidence = records();
  const result = evaluateEvidenceGate({
    evidence,
    controls: { ...controls, auto_remediation: true },
    human_approval: {
      decision: 'GO',
      approved_by: 'release-owner',
      approved_at: '2026-09-12T12:30:00Z',
      evidence_sha256: evidenceHash(evidence),
    },
  });
  assert.equal(result.decision, 'HOLD');
  assert.match(result.reasons.join(' '), /auto_remediation must remain false/);
});
