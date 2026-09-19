-- Review-only drift alert classification safety

select private.tgg_review_only_runtime_drift(public.tgg_runtime_drift_guard()) as review_only_drift;

select alert_key,status,severity,subsystem
from public.tgg_operational_alerts
where status<>'resolved'
order by severity desc,alert_key;

select public.tgg_one_ears_state() as ears;
select public.tgg_one_recorded_completeness() as recorded;

-- Expected:
-- public_bundle_version-only mismatch is review_only_drift=true.
-- no open critical control-plane alert remains from superseded state.
-- one_final:drift_detected is warning for review-only drift.
-- EARS is not restricted solely by protected review-only drift.
-- recorded completeness remains true.
-- canonical manifest is NOT modified.
-- AB-006 / V223 preserved.
