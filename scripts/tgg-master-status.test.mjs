import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileMasterStatus } from './tgg-master-status.mjs';
import { evidenceHash } from './tgg-evidence-gate.mjs';
import { remediationHash } from './tgg-remediation-gate.mjs';

function inputs() {
  return {
    liveEvidence: {
      schema: 'tgg-production-evidence-input-v1',
      requirements: ['one'],
      evidence: [{ id: 'one', status: 'UNVERIFIED' }],
      controls: { fail_closed: true, destructive_actions: false, auto_remediation: false },
      human_approval: { decision: 'HOLD', approved_by: '', evidence_sha256: '' }
    },
    publicShell: {
      schema: 'tgg-public-shell-evidence-v1',
      results: [{ id: 'shell', status: 'FAIL' }],
      summary: { pass: 0, fail: 1, unverified: 0 }
    },
    remediation: {
      schema: 'tgg-remediation-readiness-v1',
      work_items: [{
        id: 'repair',
        priority: 'P1',
        status: 'READY',
        evidence_refs: ['evidence/public-shell.json#shell'],
        affected_routes: ['/'],
        repair_action: 'Repair the route.',
        acceptance_test: 'Route returns the expected response.',
        repair_asset: 'patches/repair.js',
        patch_ref: '',
        test_ref: '',
        verified_at: ''
      }],
      controls: { fail_closed: true, production_writes: false, destructive_actions: false, auto_remediation: false },
      human_approval: { decision: 'HOLD', approved_by: '', approved_at: '', remediation_sha256: '' }
    },
    integration: {
      schema: 'tgg-integration-readiness-v1',
      decision: 'HOLD',
      candidate_builder: { path: 'scripts/builder.mjs' },
      controls: { fail_closed: true, production_writes: false, destructive_actions: false, auto_remediation: false }
    },
    sourceIntake: {
      schema: 'tgg-source-intake-readiness-v1',
      canonical_source_received: false,
      required_files: ['theme.xml', 'theme.xml.sha256'],
      controls: { production_writes: false, destructive_actions: false, auto_remediation: false }
    },
    publicRpc: { schema: 'tgg-live-public-rpc-contract-v1', read_only: true, contracts: [] }
  };
}

test('current incomplete state reconciles to HOLD', () => {
  const result = reconcileMasterStatus(inputs(), '2026-09-13T00:00:00Z');
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.progress.authenticated_evidence.percent_complete, 0);
  assert.equal(result.progress.public_shell_execution.percent_complete, 100);
  assert.equal(result.progress.remediation.ready, 1);
  assert.equal(result.progress.canonical_source.required, 2);
  assert.equal(result.integrity_errors.length, 0);
});

test('public shell summary drift is detected', () => {
  const value = inputs();
  value.publicShell.summary.fail = 0;
  const result = reconcileMasterStatus(value);
  assert.match(result.integrity_errors.join(' '), /FAIL summary/);
});

test('unsafe controls are surfaced centrally', () => {
  const value = inputs();
  value.remediation.controls.auto_remediation = true;
  const result = reconcileMasterStatus(value);
  assert.equal(result.controls.auto_remediation, true);
  assert.match(result.integrity_errors.join(' '), /auto-remediation/);
});

test('schema drift is fail closed', () => {
  const value = inputs();
  value.publicRpc.schema = 'unknown';
  const result = reconcileMasterStatus(value);
  assert.equal(result.decision, 'HOLD');
  assert.match(result.integrity_errors.join(' '), /public RPC contract/);
});

test('GO requires evidence, fixes, source, integration, and approval together', () => {
  const value = inputs();
  Object.assign(value.liveEvidence.evidence[0], {
    status: 'PASS',
    executed_at: '2026-09-13T00:00:00Z',
    evidence_ref: 'evidence/live.json#one',
    notes: 'Verified.'
  });
  value.liveEvidence.human_approval = {
    decision: 'GO',
    approved_by: 'release-owner',
    approved_at: '2026-09-13T00:01:00Z',
    evidence_sha256: evidenceHash(
      value.liveEvidence.evidence,
      value.liveEvidence.requirements,
      value.liveEvidence.controls
    )
  };
  value.publicShell.results[0].status = 'PASS';
  value.publicShell.summary = { pass: 1, fail: 0, unverified: 0 };
  Object.assign(value.remediation.work_items[0], {
    status: 'FIXED',
    patch_ref: 'commit:abc',
    test_ref: 'workflow:123',
    verified_at: '2026-09-13T00:02:00Z'
  });
  value.remediation.human_approval = {
    decision: 'GO',
    approved_by: 'release-owner',
    approved_at: '2026-09-13T00:03:00Z',
    remediation_sha256: remediationHash(value.remediation.work_items, value.remediation.controls)
  };
  value.sourceIntake.canonical_source_received = true;
  value.integration.decision = 'READY_FOR_HUMAN_REVIEW';
  const result = reconcileMasterStatus(value);
  assert.equal(result.decision, 'GO');
  assert.equal(result.hold_reasons.length, 0);
});
