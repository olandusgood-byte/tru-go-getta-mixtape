(() => {
  const forge=globalThis.__V233ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.33 Weather Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Weather Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyPreset==='function','applyPreset API');
  assert(typeof forge.restore==='function','restore API');
  assert(typeof forge.setEnabled==='function','setEnabled API');
  assert(Array.isArray(forge.presets)&&forge.presets.includes('clear')&&forge.presets.includes('rain')&&forge.presets.includes('storm')&&forge.presets.includes('mist'),'presets');
  const s=forge.status();
  assert(s.version==='V2.33 TGG WEATHER + ATMOSPHERE FORGE 100','version');
  assert(s.mode==='native-weather-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.preset==='clear','clear default');
  assert(s.layerCount===100,'layer count');
  return true;
})();