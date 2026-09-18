(() => {
  const forge=globalThis.__V227ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.27 Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyPreset==='function','applyPreset API');
  assert(typeof forge.applyMorph==='function','applyMorph API');
  assert(typeof forge.restoreLegacy==='function','restoreLegacy API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(Array.isArray(forge.presets)&&forge.presets.includes('street')&&forge.presets.includes('stage')&&forge.presets.includes('luxury'),'three presets');
  const s=forge.status();
  assert(s.version==='V2.27 TGG 3D FORGE 100','version');
  assert(s.mode==='native-forge','native Forge mode');
  assert(s.preset==='street','street default');
  assert(s.layerCount===100,'layer count status');
  return true;
})();