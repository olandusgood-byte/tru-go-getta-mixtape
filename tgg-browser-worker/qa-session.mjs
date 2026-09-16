export function buildSessionRestoreInput(session) {
  const access_token = String(session?.access_token || '').trim();
  const refresh_token = String(session?.refresh_token || '').trim();
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}
