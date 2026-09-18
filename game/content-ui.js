(() => {
  const $=id=>document.getElementById(id);
  const render=()=>{
    const state=window.TGGContent?.state;
    const mission=window.TGGContent?.current?.();
    const el=$('contentStatus');
    if(el) el.textContent=mission?`${mission.name} • ${state.progress}/${mission.goal}`:'No active mission.';
  };
  document.querySelectorAll('[data-mission]').forEach(b=>b.onclick=()=>{
    if(window.TGGContent?.start(b.dataset.mission)){
      render();
      window.TGGGame?.show?.('contentBoard');
    }
  });
  $('contentBtn')?.addEventListener('click',()=>{
    render();
    window.TGGGame?.show?.('contentBoard');
  });
  $('advanceContentBtn')?.addEventListener('click',()=>{
    const mission=window.TGGContent?.current?.();
    if(!mission){window.__tggToast?.('NO ACTIVE JOB');return;}
    window.TGGGame?.show?.('game');
    window.__tggToast?.('FOLLOW THE LIVE MARKER • COMPLETE THE JOB IN THE CITY');
  });
  $('contentBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  window.TGGContentUI={render,advance:()=>{
    const result=window.TGGContent?.advance?.();
    render();
    window.TGGGame?.refresh?.();
    return result;
  }};
  render();
})();
