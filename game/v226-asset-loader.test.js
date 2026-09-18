(() => {
  const adapter=globalThis.__V226AdapterUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(adapter,'V2.26 adapter API must exist');
  assert(Array.isArray(adapter.layers)&&adapter.layers.length===100,'exact 100 asset layers');
  assert(typeof adapter.status==='function','status API');
  assert(typeof adapter.configure==='function','configure API');
  assert(typeof adapter.reset==='function','reset API');
  const s=adapter.status();
  assert(s.version==='V2.26 REAL ASSET LOADER 100','version');
  assert(['idle','loading','ready','fallback'].includes(s.assetStatus),'valid asset status');
  assert(s.fallbackMode==='procedural','procedural fallback');
  return true;
})();