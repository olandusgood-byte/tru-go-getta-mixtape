(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 VFX Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 VFX layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.emit==='function','emit API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(Array.isArray(forge.effects)&&forge.effects.includes('impact')&&forge.effects.includes('boost')&&forge.effects.includes('confetti')&&forge.effects.includes('repair'),'effects');
  const s=forge.status();
  assert(s.version==='V2.35 TGG VFX + PARTICLE FORGE 100','version');
  assert(s.mode==='native-vfx-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();