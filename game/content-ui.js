(() => {
  const $=id=>document.getElementById(id);
  document.querySelectorAll('[data-mission]').forEach(b=>b.onclick=()=>{
    if(window.TGGContent?.start(b.dataset.mission)) window.TGGGame?.show?.('contentBoard');
  });
  $('contentBtn')?.addEventListener('click',()=>window.TGGGame?.show?.('contentBoard'));
  $('contentBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  $('advanceContentBtn')?.addEventListener('click',()=>window.TGGContent?.advance?.());
  window.TGGContentUI={advance:()=>window.TGGContent?.advance?.()};
})();
