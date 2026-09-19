(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 NPC Life Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 NPC Life layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.setDensity==='function','density API');
  assert(typeof forge.clear==='function','clear API');
  assert(Array.isArray(forge.behaviors)&&forge.behaviors.includes('idle')&&forge.behaviors.includes('social')&&forge.behaviors.includes('phone')&&forge.behaviors.includes('hype'),'behaviors');
  const s=forge.status();
  assert(s.version==='V2.35 TGG NPC LIFE + CROWD FORGE 100','version');
  assert(s.mode==='native-npc-life-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();