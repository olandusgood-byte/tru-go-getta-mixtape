(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 NPC core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.lod==='function','lod API');
  assert(typeof core.normalize==='function','normalize API');

  const a=core.profile(0);
  const b=core.profile(1);
  assert(a.id!==b.id,'profiles vary');
  assert(a.height>=.88&&a.height<=1.14,'height range');
  assert(a.skin>=0&&a.skin<=0xffffff,'skin color');
  assert(a.outfit&&Number.isFinite(a.outfit.top),'outfit colors');

  assert(core.lod(4,'high')==='high','near high LOD');
  assert(core.lod(22,'high')==='medium','mid LOD');
  assert(core.lod(50,'high')==='low','far LOD');
  assert(core.lod(4,'performance')==='medium','performance trims near');
  assert(core.lod(40,'performance')==='low','performance far');

  const n=core.normalize({height:99,shoulders:-2,build:6});
  assert(n.height<=1.2&&n.shoulders>=.78&&n.build<=1.25,'profile clamps');
  return true;
})();