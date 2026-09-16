(() => {
  function open(){window.TGGEvents?.render?.();window.TGGGame?.show?.('eventsBoard')}
  document.getElementById('eventsBtn')?.addEventListener('click',open);
  document.getElementById('eventsBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  window.TGGEventsUI={open,render:()=>window.TGGEvents?.render?.()};
})();
