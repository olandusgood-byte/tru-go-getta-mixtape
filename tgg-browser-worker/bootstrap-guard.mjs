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
    const ownerOk = await verifyOwner(value.access_token);
    if (!ownerOk) {
      console.warn('bootstrap owner validation failed');
      return { ok: false, error: 'bootstrap_owner_unauthorized' };
    }

    const workerOk = await verifyWorker(value.worker_id, value.worker_token);
    if (!workerOk) {
      console.warn('bootstrap worker credential validation failed');
      return { ok: false, error: 'bootstrap_worker_unauthorized' };
    }
  } catch (error) {
    console.warn('bootstrap validation error', error instanceof Error ? error.message : String(error));
    return { ok: false, error: 'bootstrap_validation_error' };
  }

  return { ok: true, value };
}
