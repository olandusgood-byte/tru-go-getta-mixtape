-- TGG authenticated E2E evidence reconciliation safety

select private.tgg_authenticated_e2e_reconcile() as reconcile;

select milestone_key,name,status,acceptance,updated_at
from public.tgg_build_milestones
where release_id='433251c2-3ca3-4d95-a535-8b438f0e094c'
  and milestone_key in ('growth-autopilot-validation','authenticated-user-e2e')
order by milestone_key;

select public.tgg_veil_audit_state() as veil_audit;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- Growth Autopilot milestone complete; no rebuild required.
-- Authenticated E2E remains active until real allowed portal entry + Creator OS return evidence exists.
-- No fabricated VEIL audit rows.
-- Logout is code-verified only; logout event is not falsely claimed.
-- Recorded minute train runs the E2E reconciler automatically.
-- No production/high-risk/canonical authority changes.
-- AB-006 / V223 preserved.
