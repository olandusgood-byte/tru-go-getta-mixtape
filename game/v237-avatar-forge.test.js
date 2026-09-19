(() => {
  const forge=globalThis.__V237ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.37 Avatar Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Avatar Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyStyle==='function','applyStyle API');
  assert(typeof forge.update==='function','update API');
  assert(typeof forge.restore==='function','restore API');
  const s=forge.status();
  assert(s.version==='V2.37 TGG AVATAR CUSTOMIZATION FORGE 100','version');
  assert(s.mode==='native-avatar-customization-forge','mode');
  assert(s.style==='street','street default');
  assert(s.layerCount===100,'layer count');
  return true;
})();