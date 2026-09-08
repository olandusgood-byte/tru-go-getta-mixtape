-- AB-006 regression contract.
-- This file is intentionally descriptive/static: production promotion is not performed here.

-- Required authorization function:
-- public.ab006_authorize_production(uuid, text, text)

-- Required security contract:
-- SECURITY INVOKER
-- authenticated execution only; public and anon revoked
-- admin role required through public.profiles

-- Required eligibility contract:
-- staging status = passed
-- smoke_summary.ab005_clean_pass = true
-- checkpoint_key is present and resolves to public.tgg_release_checkpoints

-- Required authorization record contract:
-- public.tgg_production_authorizations
-- authorization_key is unique
-- status is approved/revoked/consumed
-- authorized_by records the admin actor

-- Required production boundary:
-- production_authorized may become true only after explicit admin authorization
-- production_promoted remains false
-- production_deploy_performed remains false
-- this function must not call a production deployment/promote routine

-- Required AB-005 handoff:
-- tgg_ab005_launch_gate remains read_only=true
-- tgg_ab005_launch_gate remains production_gate_required=true
-- tgg_ab005_launch_gate remains production_promoted=false
