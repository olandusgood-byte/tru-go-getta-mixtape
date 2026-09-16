import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoredSupabaseSession } from './access-session.mjs';

function jwt(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `e30.${b64}.sig`;
}

test('builds a browser Supabase session from a valid access token without requiring refresh validation', () => {
  const now = Math.floor(Date.now()/1000);
  const access = jwt({ sub:'user-1', exp: now+3600, iat: now });
  const user = { id:'user-1', app_metadata:{tgg_role:'owner'} };
  const session = buildStoredSupabaseSession({ accessToken:access, refreshToken:'revoked-but-opaque', user, now });
  assert.equal(session.access_token, access);
  assert.equal(session.refresh_token, 'revoked-but-opaque');
  assert.equal(session.expires_at, now+3600);
  assert.equal(session.expires_in, 3600);
  assert.equal(session.token_type, 'bearer');
  assert.deepEqual(session.user, user);
});
