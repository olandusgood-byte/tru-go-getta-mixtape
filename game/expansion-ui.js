(() => {
  document.getElementById('expansionBtn')?.addEventListener('click',()=>window.TGGGame?.show?.('expansionBoard'));
  document.getElementById('expansionBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  document.querySelectorAll('[data-activity]').forEach(b=>b.addEventListener('click',()=>window.TGGExpansion?.run?.(b.dataset.activity)));
})();
