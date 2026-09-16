function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function buildStoredSupabaseSession({ accessToken, refreshToken, user, now = Math.floor(Date.now()/1000) }) {
  const claims = decodeJwtPayload(accessToken);
  const exp = Number(claims?.exp || 0);
  if (!accessToken || !user?.id || !exp || exp <= now) return null;
  return {
    access_token: accessToken,
    refresh_token: String(refreshToken || ''),
    expires_in: Math.max(0, exp - now),
    expires_at: exp,
    token_type: 'bearer',
    user
  };
}
