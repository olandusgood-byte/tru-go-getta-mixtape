(() => {
  const forge=globalThis.__V231ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.31 Lighting Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Lighting Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyMood==='function','applyMood API');
  assert(typeof forge.regrade==='function','regrade API');
  assert(typeof forge.restore==='function','restore API');
  assert(typeof forge.setQuality==='function','quality API');
  assert(Array.isArray(forge.moods)&&forge.moods.includes('night')&&forge.moods.includes('golden')&&forge.moods.includes('studio')&&forge.moods.includes('club'),'moods');
  const s=forge.status();
  assert(s.version==='V2.31 TGG LIGHTING + MATERIAL FORGE 100','version');
  assert(s.mode==='native-lighting-forge','mode');
  assert(s.mood==='night','night default');
  assert(s.layerCount===100,'layer count');
  return true;
})();