export function stagedEndpointDefaults(expansion) {
  const items = Array.isArray(expansion?.provider_staging?.items)
    ? expansion.provider_staging.items
    : [];
  const out = { livekit: '', dsp: '' };
  for (const item of items) {
    const endpoint = typeof item?.endpoint_url === 'string' ? item.endpoint_url.trim() : '';
    if (!endpoint) continue;
    if (item.provider_key === 'broadcast.sfu_turn') out.livekit = endpoint;
    if (item.provider_key === 'distribution.provider') out.dsp = endpoint;
  }
  return out;
}
