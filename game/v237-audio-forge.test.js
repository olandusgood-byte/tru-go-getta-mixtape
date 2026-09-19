(() => {
  const forge=globalThis.__V237ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.37 Audio Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Audio layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.start==='function','start API');
  assert(typeof forge.stop==='function','stop API');
  assert(typeof forge.setVolume==='function','volume API');
  assert(typeof forge.setAmbience==='function','ambience API');
  assert(typeof forge.playCue==='function','cue API');
  assert(Array.isArray(forge.ambiences)&&forge.ambiences.includes('city')&&forge.ambiences.includes('studio')&&forge.ambiences.includes('club')&&forge.ambiences.includes('rain'),'ambiences');
  const s=forge.status();
  assert(s.version==='V2.37 TGG AUDIO + AMBIENCE FORGE 100','version');
  assert(s.mode==='native-audio-forge','mode');
  assert(s.started===false,'must not auto-start audio');
  assert(s.layerCount===100,'layer count');
  return true;
})();