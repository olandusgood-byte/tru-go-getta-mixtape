(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 Player Movement Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 movement layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyPreset==='function','applyPreset API');
  assert(typeof forge.setEnabled==='function','setEnabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(Array.isArray(forge.presets)&&forge.presets.includes('natural')&&forge.presets.includes('street')&&forge.presets.includes('athletic')&&forge.presets.includes('precision'),'movement presets');
  const s=forge.status();
  assert(s.version==='V2.35 TGG PLAYER MOVEMENT FORGE 100','version');
  assert(s.mode==='native-player-movement-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.preset==='natural','natural default');
  assert(s.layerCount===100,'layer count');
  return true;
})();