(() => {
  const f=globalThis.__V242ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(f,'V2.42 Show Director adapter API must exist');
  assert(Array.isArray(f.layers)&&f.layers.length===100,'exact 100 director layers');
  ['status','start','advance','stop','setEnabled','setAuto','playBeat'].forEach(k=>assert(typeof f[k]==='function',k+' API'));
  const s=f.status();assert(s.version==='V2.42 TGG SHOW DIRECTOR FORGE 100','version');assert(s.mode==='native-show-director-forge','mode');assert(s.layerCount===100,'layer count');assert(s.enabled===true,'enabled default');
  return true;
})();