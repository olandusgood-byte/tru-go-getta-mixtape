(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 NPC Crowd Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 NPC layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.rebuild==='function','rebuild API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.setBehavior==='function','behavior API');
  assert(typeof forge.pulseCrowd==='function','pulse API');
  const s=forge.status();
  assert(s.version==='V2.35 TGG NPC + CROWD FORGE 100','version');
  assert(s.mode==='native-npc-crowd-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.layerCount===100,'layer count');
  return true;
})();