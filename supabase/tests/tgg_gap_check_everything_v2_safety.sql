-- TGG GAP CHECK EVERYTHING v2 safety
select private.tgg_gap_only_bulk_state() as gap_v2;

select version,status,pass_count,review_count,external_count,blocked_count,next_action,checked_at
from private.tgg_gap_master_snapshots
order by checked_at desc
limit 1;

-- Expected:
-- authenticated_creator_flow is PASS + already_completed=true.
-- duplicate smoke milestones are skipped.
-- blocked_count=0 when current system is healthy.
-- protected CodeSync remains review-only, auto_fix_allowed=false.
-- external activation remains external/deferred, not an internal blocker.
-- nothing_internal_to_repeat=true when safe backlog/build failures/jobs are zero.
-- production auto publish/promotion remain false.
-- AB-006 / V223 preserved.
