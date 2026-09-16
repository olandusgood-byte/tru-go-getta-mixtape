export function extractClaimJob(data) {
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload) return null;
  if (Object.prototype.hasOwnProperty.call(payload, 'job')) return payload.job ?? null;
  return payload;
}
