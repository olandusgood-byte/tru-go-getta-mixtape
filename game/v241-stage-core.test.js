(() => {
  const core=globalThis.__V241CoreUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.41 Stage core API must exist');
  assert(typeof core.show==='function','show API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.lightBudget==='function','light budget API');
  const concert=core.show('concert');assert(concert.id==='concert'&&concert.crowd>0,'concert show');
  const battle=core.show('battle');assert(battle.id==='battle'&&battle.cypher===true,'battle show');
  const club=core.show('club');assert(club.id==='club','club show');
  const n=core.normalize({crowd:99,lights:99,energy:-2});
  assert(n.crowd<=1&&n.lights<=1&&n.energy>=0,'show clamps');
  assert(core.lightBudget('high')>core.lightBudget('balanced'),'high light budget');
  return true;
})();