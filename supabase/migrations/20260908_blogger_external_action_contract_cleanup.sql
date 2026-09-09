-- Normalize Blogger OAuth external-action contract metadata
update public.tgg_provider_handoff
set notes = coalesce(notes,'{}'::jsonb)
  || jsonb_build_object(
       'action_label','Open Blogger Connector',
       'action_url',coalesce(notes->>'connector_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v98-blogger-connector'),
       'acceptance_contract','Connected/healthy Blogger OAuth with public-site fallback; no reauthorization required when status=complete.'
     ),
    updated_at=now()
where provider_key='blogger.oauth'
  and status='complete';
