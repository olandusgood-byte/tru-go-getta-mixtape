(() => {
  const forge=globalThis.__V241ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.41 Stage Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Stage Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.start==='function','start API');
  assert(typeof forge.stop==='function','stop API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(typeof forge.setEnabled==='function','enabled API');
  const s=forge.status();
  assert(s.version==='V2.41 TGG STAGE + PERFORMANCE FORGE 100','version');
  assert(s.mode==='native-stage-performance-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();