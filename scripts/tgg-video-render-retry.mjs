export function isTransientBrokerFailure(status, data = {}) {
  const text = String(data?.error || data?.detail || '').toLowerCase();
  if (Number(status) >= 500) return true;
  return /schema cache|connection terminated|connection timeout|timed out|timeout|temporar(?:y|ily)|retrying/.test(text);
}

export function retryDelayMs(attemptIndex) {
  return [1000, 2500, 5000, 8000][attemptIndex] ?? 8000;
}

export function shouldDeferProbe(operation, status, data = {}) {
  return ['render_worker_register', 'render_worker_claim'].includes(String(operation))
    && isTransientBrokerFailure(status, data);
}

export function isTransientBrokerException(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return name === 'aborterror'
    || name === 'timeouterror'
    || /fetch failed|network|socket|econnreset|econnrefused|etimedout|timed out|timeout|aborted/.test(message);
}
