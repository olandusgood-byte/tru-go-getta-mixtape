(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 Audio Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Audio Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.boot==='function','boot API');
  assert(typeof forge.play==='function','play API');
  assert(typeof forge.setMix==='function','setMix API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  const s=forge.status();
  assert(s.version==='V2.35 TGG SPATIAL AUDIO FORGE 100','version');
  assert(s.mode==='native-spatial-audio-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  assert(s.mix.master>=0&&s.mix.master<=1,'mix exposed');
  return true;
})();