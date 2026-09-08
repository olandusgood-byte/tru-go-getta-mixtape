-- AB-005 Launch Gate read-only contract checks.
-- Intended for review/static validation; contains no production mutation.

-- Function contract:
--   public.tgg_ab005_launch_gate()
--   SECURITY INVOKER
--   authenticated EXECUTE only
--   read-only result

-- Expected response keys:
--   ok, consumer, read_only, eligible, staging,
--   production_gate_required, production_promoted

-- Expected staging keys:
--   id, staging_key, status, checkpoint_key, clean_pass,
--   rollback_reference, rollback_cutoff, verified_at, created_at

-- Production invariant:
--   production_gate_required = true
--   production_promoted = false

-- AB-005 eligibility invariant:
--   status = passed
--   checkpoint_key is present
--   ab005_clean_pass = true
--
-- The authoritative advancement routine remains:
--   public.ab005_advance_after_clean_pass(uuid)
--
-- No production advancement routine is introduced by this consumer.
