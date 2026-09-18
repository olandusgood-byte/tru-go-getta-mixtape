(() => {
  const core=globalThis.__V233CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.33 Weather core API must exist');
  assert(typeof core.preset==='function','preset API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.particleBudget==='function','particleBudget API');

  const clear=core.preset('clear');
  assert(clear.id==='clear'&&clear.rain===0,'clear preset');
  const rain=core.preset('rain');
  assert(rain.id==='rain'&&rain.rain>0,'rain preset');
  const storm=core.preset('storm');
  assert(storm.id==='storm'&&storm.lightning===true,'storm preset');
  const mist=core.preset('mist');
  assert(mist.fogBoost>0,'mist fog');

  const n=core.normalize({rain:99,wind:-5,fogBoost:9,wetness:5});
  assert(n.rain<=1&&n.wind>=0&&n.fogBoost<=.04&&n.wetness<=1,'weather clamps');

  assert(core.particleBudget('high')>core.particleBudget('balanced'),'high budget');
  assert(core.particleBudget('balanced')>core.particleBudget('performance'),'balanced budget');
  return true;
})();