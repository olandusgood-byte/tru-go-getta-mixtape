(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 FX core API must exist');
  assert(typeof core.preset==='function','preset API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.budget==='function','budget API');

  const street=core.preset('street');
  assert(street.id==='street','street preset');
  const stage=core.preset('stage');
  assert(stage.stageHaze>street.stageHaze,'stage haze');
  const storm=core.preset('storm');
  assert(storm.rainSpray>0,'storm spray');
  const performance=core.preset('performance');
  assert(performance.boostFlame>0&&performance.missionBurst>0,'performance fx');

  const n=core.normalize({smoke:99,sparks:-3,dust:8,haze:5});
  assert(n.smoke<=1&&n.sparks>=0&&n.dust<=1&&n.haze<=1,'clamps');

  assert(core.budget('high')>core.budget('balanced'),'high budget');
  assert(core.budget('balanced')>core.budget('performance'),'balanced budget');
  return true;
})();