(() => {
  const $=id=>document.getElementById(id);
  function open(){window.TGGInventory?.starterPack?.();window.TGGInventory?.render?.();window.TGGGame?.show?.('inventoryBoard')}
  $('inventoryBtn')?.addEventListener('click',open);
  $('inventoryBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  window.TGGInventoryUI={open,render:()=>window.TGGInventory?.render?.()};
  window.TGGInventory?.render?.();
})();
