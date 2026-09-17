create or replace view public.tgg_provider_activation_staging
with (security_barrier=true)
as
select
  provider_key,
  status,
  endpoint_url,
  updated_at,
  endpoint_url as endpoint,
  verified_at,
  verified_at as last_verified_at
from private.tgg_provider_activation_staging;

revoke all on public.tgg_provider_activation_staging from anon, authenticated;
grant select on public.tgg_provider_activation_staging to service_role;
