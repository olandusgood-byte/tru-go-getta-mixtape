(() => {
  const forge=globalThis.__V229ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.29 World Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 World Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyPreset==='function','applyPreset API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(typeof forge.setEnabled==='function','setEnabled API');
  assert(Array.isArray(forge.presets)&&forge.presets.includes('downtown')&&forge.presets.includes('studio-row')&&forge.presets.includes('shops'),'district presets');
  const s=forge.status();
  assert(s.version==='V2.29 TGG WORLD FORGE 100','version');
  assert(s.mode==='native-world-forge','native world mode');
  assert(s.layerCount===100,'layer count');
  assert(s.enabled===true,'enabled default');
  return true;
})();