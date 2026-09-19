(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 Facial IK Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Facial IK layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyProfile==='function','profile API');
  assert(typeof forge.lookAt==='function','lookAt API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(Array.isArray(forge.profiles)&&forge.profiles.includes('idle')&&forge.profiles.includes('talk')&&forge.profiles.includes('rap')&&forge.profiles.includes('perform'),'profiles');
  const s=forge.status();
  assert(s.version==='V2.35 TGG FACIAL + IK FORGE 100','version');
  assert(s.mode==='native-facial-ik-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.profile==='idle','idle default');
  assert(s.layerCount===100,'layer count');
  return true;
})();