export function classifyQaStatus(text) {
  const value = String(text || '');
  if (/PASS\s*·\s*Protected Audio browser QA recorded\./i.test(value)) return { done: true, passed: true };
  if (/QA not complete:/i.test(value)) return { done: true, passed: false };
  return { done: false, passed: false };
}
