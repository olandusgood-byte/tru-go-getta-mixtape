(() => {
  const f=globalThis.__V243ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(f,'V2.43 Replay Forge adapter API');assert(Array.isArray(f.layers)&&f.layers.length===100,'exact 100 replay layers');
  ['status','captureNow','mark','replay','stop','clearHistory','setEnabled','setAutoHighlights','exportLast'].forEach(k=>assert(typeof f[k]==='function',k+' API'));
  const s=f.status();assert(s.version==='V2.43 TGG REPLAY + HIGHLIGHT FORGE 100','version');assert(s.mode==='native-replay-highlight-forge','mode');assert(s.enabled===true,'enabled');
  return true;
})();