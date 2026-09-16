import test from 'node:test';
import assert from 'node:assert/strict';
import { stagedEndpointDefaults } from './endpoint-prefill.mjs';

test('maps owner-only provider staging endpoints and ignores secret metadata', () => {
  const expansion = {
    provider_staging: {
      items: [
        {provider_key:'broadcast.sfu_turn', endpoint_url:'wss://tru-go-getta-4oo4iqp6.livekit.cloud', secret_reference:'hidden'},
        {provider_key:'distribution.provider', endpoint_url:'https://api.revelator.com', secret_reference:'hidden'}
      ]
    }
  };
  assert.deepEqual(stagedEndpointDefaults(expansion), {
    livekit: 'wss://tru-go-getta-4oo4iqp6.livekit.cloud',
    dsp: 'https://api.revelator.com'
  });
});

test('returns blanks for missing or malformed staging data', () => {
  assert.deepEqual(stagedEndpointDefaults({}), {livekit:'', dsp:''});
  assert.deepEqual(stagedEndpointDefaults({provider_staging:{items:null}}), {livekit:'', dsp:''});
});
