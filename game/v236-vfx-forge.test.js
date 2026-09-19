(() => {
  const forge=globalThis.__V236ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.36 VFX Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 VFX layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.emit==='function','emit API');
  assert(typeof forge.clear==='function','clear API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.burstPreset==='function','burst preset API');
  assert(Array.isArray(forge.effects)&&forge.effects.includes('sparks')&&forge.effects.includes('tire-smoke')&&forge.effects.includes('confetti')&&forge.effects.includes('laser'),'effects');
  const s=forge.status();
  assert(s.version==='V2.36 TGG VFX FORGE 100','version');
  assert(s.mode==='native-vfx-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();