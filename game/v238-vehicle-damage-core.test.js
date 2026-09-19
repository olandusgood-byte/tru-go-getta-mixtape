(() => {
  const core=globalThis.__V238CoreUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.38 Vehicle Damage core API must exist');
  assert(typeof core.normalizeDamage==='function','normalizeDamage');
  assert(typeof core.damageTier==='function','damageTier');
  assert(typeof core.panelState==='function','panelState');
  assert(typeof core.interior==='function','interior API');
  assert(core.normalizeDamage(999)===100&&core.normalizeDamage(-4)===0,'damage clamp');
  assert(core.damageTier(95)==='clean','clean tier');
  assert(core.damageTier(60)==='scuffed','scuffed tier');
  assert(core.damageTier(35)==='damaged','damaged tier');
  assert(core.damageTier(10)==='critical','critical tier');
  const hood=core.panelState(25,'hood');assert(hood.rotation>0&&hood.scratch>0,'hood damage');
  const luxury=core.interior('luxury');assert(luxury.id==='luxury'&&luxury.accent>0,'luxury interior');
  return true;
})();