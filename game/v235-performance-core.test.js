(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Performance core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.select==='function','select API');

  const high=core.profile('high');
  assert(high.id==='high'&&high.meshDistance>40,'high profile');
  const balanced=core.profile('balanced');
  assert(balanced.meshDistance<high.meshDistance,'balanced shorter');
  const perf=core.profile('performance');
  assert(perf.shadowBudget<balanced.shadowBudget,'performance shadows');
  assert(perf.particleScale<balanced.particleScale,'performance particles');

  const n=core.normalize({meshDistance:999,shadowBudget:-5,particleScale:5,targetFps:400});
  assert(n.meshDistance<=90&&n.shadowBudget>=0&&n.particleScale<=1&&n.targetFps<=120,'clamps');

  assert(core.select({fps:62,mobile:false})==='high','desktop high');
  assert(core.select({fps:44,mobile:false})==='balanced','desktop balanced');
  assert(core.select({fps:28,mobile:false})==='performance','desktop performance');
  assert(core.select({fps:55,mobile:true})!=='high','mobile avoids high');
  return true;
})();