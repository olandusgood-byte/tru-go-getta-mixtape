(() => {
  const forge=globalThis.__V236ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.36 Crowd Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Crowd Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  const s=forge.status();
  assert(s.version==='V2.36 TGG CROWD + NPC FORGE 100','version');
  assert(s.mode==='native-crowd-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();