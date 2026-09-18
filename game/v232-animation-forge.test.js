(() => {
  const forge=globalThis.__V232ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.32 Animation Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Animation Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.play==='function','play API');
  assert(typeof forge.clear==='function','clear API');
  assert(typeof forge.setEnabled==='function','setEnabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(Array.isArray(forge.clips)&&forge.clips.includes('idle')&&forge.clips.includes('walk')&&forge.clips.includes('run')&&forge.clips.includes('rap'),'clips');
  const s=forge.status();
  assert(s.version==='V2.32 TGG ANIMATION FORGE 100','version');
  assert(s.mode==='native-animation-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();