(() => {
  const $=id=>document.getElementById(id);
  function open(){window.TGGLifestyle?.load?.();window.TGGLifestyle?.render?.();window.TGGGame?.show?.('lifestyleBoard')}
  $('lifestyleBtn')?.addEventListener('click',open);
  $('lifestyleBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  window.TGGLifestyleUI={open,render:()=>window.TGGLifestyle?.render?.()};
  window.TGGLifestyle?.render?.();
})();
