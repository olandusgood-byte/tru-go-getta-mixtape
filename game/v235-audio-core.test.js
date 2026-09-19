(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Audio core API must exist');
  assert(typeof core.normalizeMix==='function','normalizeMix API');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.distanceGain==='function','distanceGain API');
  assert(typeof core.pan==='function','pan API');

  const d=core.normalizeMix({});
  assert(d.master===.8&&d.sfx===.85&&d.ambience===.65,'default mix');
  const c=core.normalizeMix({master:9,sfx:-1,ambience:4,music:2});
  assert(c.master<=1&&c.sfx>=0&&c.ambience<=1&&c.music<=1,'mix clamps');

  const engine=core.profile('engine');
  assert(engine.wave==='sawtooth'&&engine.baseHz>30,'engine profile');
  const foot=core.profile('footstep');
  assert(foot.wave==='noise','footstep profile');
  const storm=core.profile('storm');
  assert(storm.wave==='noise'&&storm.duration>1,'storm profile');

  assert(core.distanceGain(0,20)===1,'near gain');
  assert(core.distanceGain(20,20)<=.1,'far gain');
  assert(core.pan(-10,10)<=-0.9,'left pan');
  assert(core.pan(10,10)>=0.9,'right pan');
  return true;
})();