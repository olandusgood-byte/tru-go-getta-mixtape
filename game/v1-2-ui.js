(() => {
  const $=id=>document.getElementById(id);
  function refresh(){
    window.TGGDistricts?.sync?.();
    const c=window.TGGChains?.current?.();
    const done=c?window.TGGChains.progress(c):0;
    const status=$('contentStatus');
    if(status&&c)status.textContent=`${c.name} • ${done}/${c.missions.length} missions`;
  }
  $('chainBtn')?.addEventListener('click',()=>{
    const ok=window.TGGChains?.start?.('first-move');
    refresh();
    if(ok)window.TGGGame?.show?.('contentBoard');
  });
  window.TGGV12UI={refresh};
  window.TGGChains?.sync?.();
  refresh();
})();
