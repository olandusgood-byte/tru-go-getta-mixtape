(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Crowd core API must exist');
  assert(typeof core.role==='function','role API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.densityBudget==='function','densityBudget API');
  assert(typeof core.routeFor==='function','route API');

  const fan=core.role('fan');
  assert(fan.id==='fan'&&fan.energy>0,'fan role');
  const artist=core.role('artist');
  assert(artist.id==='artist','artist role');
  const vendor=core.role('vendor');
  assert(vendor.id==='vendor','vendor role');

  const n=core.normalize({energy:9,speed:-2,talkChance:5,danceChance:-1});
  assert(n.energy<=1&&n.speed>=0&&n.talkChance<=1&&n.danceChance>=0,'role clamps');

  assert(core.densityBudget('high')>core.densityBudget('balanced'),'high crowd budget');
  assert(core.densityBudget('balanced')>core.densityBudget('performance'),'balanced crowd budget');

  const route=core.routeFor('studio-row',0);
  assert(Array.isArray(route)&&route.length>=4,'studio route');
  return true;
})();