(() => {
  const safe=(v)=>Math.max(0,Number(v)||0);
  function bonuses(){return {cash:safe(window.TGGCrew?.bonus?.('cash')),xp:safe(window.TGGCrew?.bonus?.('xp')),rep:safe(window.TGGCrew?.bonus?.('rep'))}}
  function reward(base={cash:0,xp:0,rep:0}){const b=bonuses();return {cash:safe(base.cash)+b.cash,xp:safe(base.xp)+b.xp,rep:safe(base.rep)+b.rep,crew:b}}
  function apply(base={cash:0,xp:0,rep:0}){const r=reward(base);window.TGGGame?.reward?.(r.cash,r.xp);window.TGGCareer?.addRep?.(r.rep);return r}
  window.TGGEconomy={bonuses,reward,apply};
})();
