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
    const ownerResult = await verifyOwner(value.access_token);
    if (!ownerResult?.ok) {
      const safeError = typeof ownerResult?.error === 'string' && ownerResult.error.length <= 80
        ? ownerResult.error
        : 'bootstrap_owner_unauthorized';
      console.warn('bootstrap owner validation failed', safeError);
      return { ok: false, error: safeError };
    }

    const workerResult = await verifyWorker(value.worker_id, value.worker_token);
    if (!workerResult?.ok) {
      const safeError = typeof workerResult?.error === 'string' && workerResult.error.length <= 80
        ? workerResult.error
        : 'bootstrap_worker_unauthorized';
      console.warn('bootstrap worker validation failed', safeError);
      return { ok: false, error: safeError };
    }
  } catch (_error) {
    console.warn('bootstrap validation exception');
    return { ok: false, error: 'bootstrap_validation_error' };
  }

  return { ok: true, value };
}
