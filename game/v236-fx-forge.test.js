(() => {
  const forge=globalThis.__V236ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.36 FX Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 FX layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.trigger==='function','trigger API');
  assert(typeof forge.clear==='function','clear API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.setIntensity==='function','intensity API');
  assert(Array.isArray(forge.effects)&&forge.effects.includes('tire-smoke')&&forge.effects.includes('impact-sparks')&&forge.effects.includes('stage-haze')&&forge.effects.includes('confetti'),'effects');
  const s=forge.status();
  assert(s.version==='V2.36 TGG FX + PARTICLE FORGE 100','version');
  assert(s.mode==='native-fx-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();