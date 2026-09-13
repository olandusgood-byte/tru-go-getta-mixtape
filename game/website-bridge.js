(() => {
  const CONFIG={site:'https://trugogettamixtapes.blogspot.com',landing:'/p/creator-dashboard.html'};
  const LINKS={home:CONFIG.site,creator:CONFIG.site+CONFIG.landing};
  function open(type){const url=LINKS[type]||CONFIG.site;window.open(url,'_blank','noopener,noreferrer');return url}
  function payload(){const game=window.TGGGame?.getState?.()||{};const career=window.TGGCareer?.career||{};return {version:'1.0',player:game.name||'',level:game.level||1,cash:game.cash||0,xp:game.xp||0,reputation:career.reputation||0,recordings:career.recordings||0,mixtapes:career.mixtapes||0}}
  window.TGGBridge={config:CONFIG,links:LINKS,open,payload};
})();
