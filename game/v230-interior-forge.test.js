(() => {
  const forge=globalThis.__V230ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.30 Interior Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Interior Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.enter==='function','enter API');
  assert(typeof forge.exit==='function','exit API');
  assert(typeof forge.toggle==='function','toggle API');
  assert(Array.isArray(forge.rooms)&&forge.rooms.includes('studio')&&forge.rooms.includes('home')&&forge.rooms.includes('media'),'room presets');
  const s=forge.status();
  assert(s.version==='V2.30 TGG INTERIOR FORGE 100','version');
  assert(s.mode==='native-interior-forge','native interior mode');
  assert(s.activeRoom===null,'no room active by default');
  assert(s.layerCount===100,'layer count');
  return true;
})();