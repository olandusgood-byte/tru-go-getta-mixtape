(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 Performance Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Performance Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.setMode==='function','setMode API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(typeof forge.sample==='function','sample API');
  assert(Array.isArray(forge.modes)&&forge.modes.includes('auto')&&forge.modes.includes('high')&&forge.modes.includes('balanced')&&forge.modes.includes('performance'),'modes');
  const s=forge.status();
  assert(s.version==='V2.35 TGG PERFORMANCE + LOD FORGE 100','version');
  assert(s.mode==='native-performance-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.selectedMode==='auto','auto default');
  assert(s.layerCount===100,'layer count');
  return true;
})();