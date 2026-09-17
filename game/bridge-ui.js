(() => {
  const $=id=>document.getElementById(id);
  const site='https://trugogettamixtapes.blogspot.com/';
  const creator=site+'p/artist-dashboard_0633467215.html';
  const worldSyncStatus=()=>{
    const s=window.TGGWorldSync?.status?.()||{status:'offline_ready',connected:false,version:'1.9.0'};
    const text=s.connected?`CONNECTED • ${s.status.toUpperCase()} • v${s.version}`:`LOCAL READY • v${s.version} • transport not connected`;
    const el=$('worldSyncStatus');if(el)el.textContent=text;
    return {text,...s};
  };
  const snapshot=()=>{
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGGCareer?.career||{};
    const text=`${p.name||'PLAYER'} • LVL ${p.level||1} • ${p.cash||0} • ${c.recordings||0} tracks • ${c.mixtapes||0} mixtapes`;
    const el=$('bridgeSnapshot'); if(el)el.textContent=text;
    worldSyncStatus();
    return text;
  };
  const openHome=()=>window.open(site,'_blank','noopener');
  const openCreator=()=>window.open(creator,'_blank','noopener');
  const openBridge=()=>{snapshot();window.TGGGame?.show?.('bridge');};
  const back=()=>window.TGGGame?.show?.('game');
  window.TGGBridge={site,creator,snapshot,worldSyncStatus,openHome,openCreator,openBridge,back};
  $('bridgeBtn')?.addEventListener('click',openBridge);
  $('bridgeHome')?.addEventListener('click',openHome);
  $('bridgeCreator')?.addEventListener('click',openCreator);
  $('worldSyncBtn')?.addEventListener('click',()=>{const packet=window.TGGWorldSync?.snapshot?.();const s=worldSyncStatus();window.__tggToast?.(packet&&s?'WORLD STATE BRIDGE READY':'WORLD SYNC NOT READY');});
  $('bridgeBack')?.addEventListener('click',back);
})();
