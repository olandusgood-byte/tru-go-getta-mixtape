(() => {
  const forge=globalThis.__V228ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.28 Vehicle Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Vehicle Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyPreset==='function','applyPreset API');
  assert(typeof forge.applyTuning==='function','applyTuning API');
  assert(typeof forge.restoreLegacy==='function','restoreLegacy API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(Array.isArray(forge.presets)&&forge.presets.includes('street')&&forge.presets.includes('sport')&&forge.presets.includes('luxury'),'three vehicle presets');
  const s=forge.status();
  assert(s.version==='V2.28 TGG VEHICLE FORGE 100','version');
  assert(s.mode==='native-vehicle-forge','native vehicle mode');
  assert(s.preset==='street','street default');
  assert(s.layerCount===100,'layer count status');
  return true;
})();