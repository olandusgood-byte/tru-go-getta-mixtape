(() => {
  const $=id=>document.getElementById(id);
  function render(){
    const el=$('chainStatus');
    const chain=window.TGGChains?.get?.('first-move');
    if(!el||!chain)return;
    const done=window.TGGChains?.progress?.(chain)||0;
    el.textContent=`${chain.name} • ${done}/${chain.missions.length} missions`;
  }
  function start(){
    const ok=window.TGGChains?.start?.('first-move');
    render();
    if(ok){window.TGGGame?.show?.('contentBoard');window.TGGGame?.refresh?.();}
    return ok;
  }
  function sync(){window.TGGChains?.sync?.();render();}
  $('chainBtn')?.addEventListener('click',()=>{start();window.TGGGame?.show?.('contentBoard');});
  $('contentBtn')?.addEventListener('click',render);
  window.TGGChainUI={start,render,sync};
  render();
})();
