(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 VFX core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.budget==='function','budget API');

  const impact=core.profile('impact');
  assert(impact.id==='impact'&&impact.count>0&&impact.life>0,'impact profile');
  const boost=core.profile('boost');
  assert(boost.id==='boost'&&boost.speed>impact.speed,'boost speed');
  const confetti=core.profile('confetti');
  assert(confetti.gravity>0&&confetti.life>1,'confetti profile');
  const smoke=core.profile('smoke');
  assert(smoke.opacity<1&&smoke.size>0,'smoke profile');

  const n=core.normalize({count:9999,life:-4,speed:99,size:-1,opacity:3,gravity:-9});
  assert(n.count<=120&&n.life>=.1&&n.speed<=30&&n.size>=.02&&n.opacity<=1&&n.gravity>=0,'vfx clamps');

  assert(core.budget('high')>core.budget('balanced'),'high budget');
  assert(core.budget('balanced')>core.budget('performance'),'balanced budget');
  return true;
})();