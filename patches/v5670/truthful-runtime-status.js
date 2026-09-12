// V5670 review-only status adapter: optimistic labels fail closed.
(function installTruthfulRuntimeStatus() {
  'use strict';

  function setStatus(element, status, evidenceRef) {
    if (!element) return;
    var normalized = String(status || 'UNVERIFIED').toUpperCase();
    if (normalized !== 'ONLINE' || !evidenceRef) normalized = 'UNVERIFIED';
    element.textContent = normalized;
    element.classList.toggle('tgg-green', normalized === 'ONLINE');
    element.classList.toggle('tgg-hold', normalized !== 'ONLINE');
    element.dataset.evidenceRef = evidenceRef || '';
  }

  function failClosedStaticLabels(root) {
    (root || document).querySelectorAll('.tgg-system strong.tgg-green').forEach(function reset(label) {
      setStatus(label, 'UNVERIFIED', '');
    });
  }

  window.TGGRuntimeStatus = Object.freeze({
    setStatus: setStatus,
    failClosedStaticLabels: failClosedStaticLabels
  });
})();
