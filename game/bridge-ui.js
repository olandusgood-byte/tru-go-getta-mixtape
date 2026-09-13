(() => {
  const $=id=>document.getElementById(id);
  const site='https://trugogettamixtapes.blogspot.com/';
  const creator=site+'p/creator-dashboard.html';
  $('bridgeBtn')?.addEventListener('click',()=>{const p=window.TGGGame?.getState?.()||{};const c=window.TGGCareer?.career||{};const s=$('bridgeSnapshot');if(s)s.textContent=`${p.name||'PLAYER'} • LVL ${p.level||1} • $${p.cash||0} • ${c.recordings||0} tracks • ${c.mixtapes||0} mixtapes`;window.TGGGame?.show?.('bridge')});
  $('bridgeHome')?.addEventListener('click',()=>window.open(site,'_blank','noopener'));
  $('bridgeCreator')?.addEventListener('click',()=>window.open(creator,'_blank','noopener'));
  $('bridgeBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
})();
