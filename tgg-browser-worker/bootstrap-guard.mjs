function clean(value) {
  return String(value ?? '').trim();
}

export async function authorizeBootstrap(body, { verifyOwner, verifyWorker }) {
  const value = {
    worker_id: clean(body?.worker_id),
    worker_token: clean(body?.worker_token),
    access_token: clean(body?.access_token),
    refresh_token: clean(body?.refresh_token)
  };

  if (!value.worker_id || value.worker_token.length < 20 || !value.access_token) {
    return { ok: false, error: 'invalid_bootstrap' };
  }

  try {
    if (!(await verifyOwner(value.access_token))) {
      return { ok: false, error: 'bootstrap_unauthorized' };
    }
    if (!(await verifyWorker(value.worker_id, value.worker_token))) {
      return { ok: false, error: 'bootstrap_unauthorized' };
    }
  } catch {
    return { ok: false, error: 'bootstrap_unauthorized' };
  }

  return { ok: true, value };
}
