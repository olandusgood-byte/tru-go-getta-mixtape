import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeReadiness } from './tgg-readiness-runner.mjs';

function state(decision = 'HOLD') {
  return {
    evidence: { decision },
    remediation: { decision },
    master: { decision, active_production_baseline: 'V5640' },
    packageIntegrity: { integrity_decision: decision === 'GO' ? 'PASS' : 'HOLD' },
    source: { decision: decision === 'GO' ? 'ACCEPTED_FOR_CANDIDATE' : 'MISSING' }
  };
}

test('current incomplete gates produce one HOLD', () => {
  const result = summarizeReadiness(state());
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.current_review_checkpoint, 'V5760');
  assert.equal(result.blockers.length, 5);
});

test('package integrity PASS cannot override a release HOLD', () => {
  const value = state();
  value.packageIntegrity.integrity_decision = 'PASS';
  const result = summarizeReadiness(value);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.blockers.join(' '), /Master release decision/);
});

test('missing canonical source blocks otherwise green gates', () => {
  const value = state('GO');
  value.source.decision = 'MISSING';
  const result = summarizeReadiness(value);
  assert.equal(result.decision, 'HOLD');
  assert.deepEqual(result.blockers, ['Canonical Blogger source is not accepted for candidate generation.']);
});

test('GO requires all five gates together', () => {
  const result = summarizeReadiness(state('GO'));
  assert.equal(result.decision, 'GO');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.controls.production_writes, false);
});
