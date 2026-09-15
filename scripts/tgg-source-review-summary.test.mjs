import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSourceReview } from './tgg-source-review-summary.mjs';

test('missing source remains an explicit non-execution HOLD', () => {
  const result = summarizeSourceReview({ sourceAvailable: false });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.checks.source_intake, 'NOT_RUN');
  assert.equal(result.checks.candidate, 'NOT_RUN');
});

test('invalid XML remains HOLD and does not become a pass', () => {
  const result = summarizeSourceReview({
    sourceAvailable: true,
    intakeCode: 0,
    xmlCode: 2,
    candidateCode: 2,
    candidateXmlCode: 2,
    candidateDecision: 'NOT_RUN'
  });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.checks.source_intake, 'PASS');
  assert.equal(result.checks.xml_wellformed, 'HOLD');
});

test('a generated HOLD candidate preserves its diagnostic artifacts', () => {
  const result = summarizeSourceReview({
    sourceAvailable: true,
    intakeCode: 0,
    xmlCode: 0,
    candidateCode: 2,
    candidateXmlCode: 0,
    candidateDecision: 'HOLD',
    artifacts: ['candidate-manifest.json', 'TRU_GO_GETTA_CANDIDATE.xml']
  });
  assert.equal(result.decision, 'HOLD');
  assert.deepEqual(result.artifacts, ['TRU_GO_GETTA_CANDIDATE.xml', 'candidate-manifest.json']);
});

test('all checks passing produces review readiness, never deployment approval', () => {
  const result = summarizeSourceReview({
    sourceAvailable: true,
    intakeCode: 0,
    xmlCode: 0,
    candidateCode: 0,
    candidateXmlCode: 0,
    candidateDecision: 'READY_FOR_HUMAN_REVIEW'
  });
  assert.equal(result.decision, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.controls.human_approval_required, true);
  assert.equal(result.controls.production_writes, false);
});

test('a lint-clean but malformed candidate remains HOLD', () => {
  const result = summarizeSourceReview({
    sourceAvailable: true,
    intakeCode: 0,
    xmlCode: 0,
    candidateCode: 0,
    candidateXmlCode: 2,
    candidateDecision: 'READY_FOR_HUMAN_REVIEW'
  });
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.checks.candidate_xml_wellformed, 'HOLD');
});
