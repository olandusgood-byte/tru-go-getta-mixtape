(() => {
  const core=globalThis.__V236CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.36 Crowd core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.budget==='function','budget API');

  const chill=core.profile('chill');
  assert(chill.id==='chill'&&chill.walkSpeed>0,'chill profile');
  const busy=core.profile('busy');
  assert(busy.id==='busy'&&busy.density>chill.density,'busy density');
  const event=core.profile('event');
  assert(event.id==='event'&&event.density>=busy.density,'event density');

  const n=core.normalize({density:9,walkSpeed:-4,reactionDistance:99,talkChance:-1});
  assert(n.density<=1&&n.walkSpeed>=.2&&n.reactionDistance<=16&&n.talkChance>=0,'crowd clamps');

  assert(core.budget('high',1)>core.budget('balanced',1),'high budget');
  assert(core.budget('balanced',1)>core.budget('performance',1),'balanced budget');
  assert(core.budget('high',.5)<core.budget('high',1),'density scales budget');
  return true;
})();