(() => {
  const core=globalThis.__V236CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.36 VFX core API must exist');
  assert(typeof core.effect==='function','effect API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.budget==='function','budget API');

  const sparks=core.effect('sparks');
  assert(sparks.id==='sparks'&&sparks.life>0&&sparks.speed>0,'sparks profile');
  const smoke=core.effect('tire-smoke');
  assert(smoke.id==='tire-smoke'&&smoke.size>0,'smoke profile');
  const confetti=core.effect('confetti');
  assert(confetti.gravity>0,'confetti gravity');
  const laser=core.effect('laser');
  assert(laser.count>0,'laser profile');

  const n=core.normalize({count:9999,life:-2,speed:999,size:-5,opacity:3,gravity:-4});
  assert(n.count<=256&&n.life>=.1&&n.speed<=40&&n.size>=.01&&n.opacity<=1&&n.gravity>=0,'vfx clamps');

  assert(core.budget('high')>core.budget('balanced'),'high budget');
  assert(core.budget('balanced')>core.budget('performance'),'balanced budget');
  return true;
})();