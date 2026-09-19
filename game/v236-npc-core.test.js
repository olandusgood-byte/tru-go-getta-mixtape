(() => {
  const core=globalThis.__V236CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.36 NPC core API must exist');
  assert(typeof core.variant==='function','variant API');
  assert(typeof core.lod==='function','lod API');
  assert(typeof core.populationCap==='function','populationCap API');

  const a=core.variant(1),b=core.variant(2);
  assert(a.id==='npc-1'&&b.id==='npc-2','stable ids');
  assert(a.height>=.88&&a.height<=1.15,'height range');
  assert(a.shoulders>=.86&&a.shoulders<=1.14,'shoulder range');
  assert(a.skin>=0&&a.skin<=0xffffff,'skin color');
  assert(a.outfit&&Number.isFinite(a.outfit.top)&&Number.isFinite(a.outfit.accent),'outfit');
  assert(JSON.stringify(a)!==JSON.stringify(b),'variation');

  assert(core.lod(5,'high')==='high','near high');
  assert(core.lod(28,'high')==='medium','mid lod');
  assert(core.lod(55,'high')==='low','far lod');
  assert(core.lod(5,'performance')==='medium','performance trim');

  assert(core.populationCap('high')>core.populationCap('balanced'),'high population');
  assert(core.populationCap('balanced')>core.populationCap('performance'),'balanced population');
  return true;
})();