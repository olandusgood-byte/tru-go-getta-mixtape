(() => {
  const core=globalThis.__V236CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.36 FX core API must exist');
  assert(typeof core.effect==='function','effect API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.budget==='function','budget API');

  const smoke=core.effect('tire-smoke');
  assert(smoke.id==='tire-smoke'&&smoke.life>0&&smoke.size>0,'tire smoke');
  const sparks=core.effect('impact-sparks');
  assert(sparks.gravity<0&&sparks.speed>0,'impact sparks');
  const haze=core.effect('stage-haze');
  assert(haze.opacity<1&&haze.life>smoke.life,'stage haze');
  const splash=core.effect('rain-splash');
  assert(splash.count>0,'rain splash');
  const confetti=core.effect('confetti');
  assert(confetti.count>0&&confetti.gravity<0,'confetti');

  const n=core.normalize({life:99,size:-2,opacity:9,speed:99,count:9999,gravity:-99});
  assert(n.life<=12&&n.size>=.02&&n.opacity<=1&&n.speed<=18&&n.count<=64&&n.gravity>=-30,'clamps');

  assert(core.budget('high')>core.budget('balanced'),'high budget');
  assert(core.budget('balanced')>core.budget('performance'),'balanced budget');
  return true;
})();