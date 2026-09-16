export function isTransientBrokerFailure(status, data = {}) {
  const text = String(data?.error || data?.detail || '').toLowerCase();
  if (Number(status) >= 500) return true;
  return /schema cache|connection terminated|connection timeout|timed out|timeout|temporar(?:y|ily)|retrying/.test(text);
}

export function retryDelayMs(attemptIndex) {
  return [1000, 2500, 5000, 8000][attemptIndex] ?? 8000;
}
