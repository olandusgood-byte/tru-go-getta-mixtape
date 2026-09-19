(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 NPC core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.behavior==='function','behavior API');
  assert(typeof core.crowdBudget==='function','crowdBudget API');
  assert(typeof core.spawnPlan==='function','spawnPlan API');

  const p=core.profile(7);
  assert(p.id==='npc-7','deterministic id');
  assert(['street','stage','luxury'].includes(p.preset),'valid preset');
  assert(p.height>=.9&&p.height<=1.12,'height range');
  assert(p.skin>=0&&p.skin<=0xffffff,'skin color');
  assert(p.outfit&&Number.isFinite(p.outfit.top),'outfit colors');

  const walk=core.behavior('walk');
  assert(walk.id==='walk'&&walk.speed>0,'walk behavior');
  const idle=core.behavior('idle');
  assert(idle.id==='idle'&&idle.speed===0,'idle behavior');
  const rap=core.behavior('rap');
  assert(rap.special==='rap','rap behavior');

  assert(core.crowdBudget('high')>core.crowdBudget('balanced'),'high crowd');
  assert(core.crowdBudget('balanced')>core.crowdBudget('performance'),'balanced crowd');

  const plan=core.spawnPlan('downtown','balanced');
  assert(Array.isArray(plan)&&plan.length===core.crowdBudget('balanced'),'spawn plan length');
  assert(plan.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.z)&&x.profile),'spawn plan shape');
  return true;
})();