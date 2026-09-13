(() => {
  const $=id=>document.getElementById(id);
  const site='https://trugogettamixtapes.blogspot.com/';
  const creator=site+'p/creator-dashboard.html';
  const snapshot=()=>{
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGGCareer?.career||{};
    const text=`${p.name||'PLAYER'} • LVL ${p.level||1} • $${p.cash||0} • ${c.recordings||0} tracks • ${c.mixtapes||0} mixtapes`;
    const el=$('bridgeSnapshot'); if(el)el.textContent=text;
    return text;
  };
  const openHome=()=>window.open(site,'_blank','noopener');
  const openCreator=()=>window.open(creator,'_blank','noopener');
  const openBridge=()=>{snapshot();window.TGGGame?.show?.('bridge');};
  const back=()=>window.TGGGame?.show?.('game');
  window.TGGBridge={site,creator,snapshot,openHome,openCreator,openBridge,back};
  $('bridgeBtn')?.addEventListener('click',openBridge);
  $('bridgeHome')?.addEventListener('click',openHome);
  $('bridgeCreator')?.addEventListener('click',openCreator);
  $('bridgeBack')?.addEventListener('click',back);
})();
