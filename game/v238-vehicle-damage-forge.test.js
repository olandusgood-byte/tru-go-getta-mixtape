(() => {
  const forge=globalThis.__V238ForgeUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.38 Vehicle Damage Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Vehicle Damage Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyInterior==='function','interior API');
  assert(typeof forge.refreshDamage==='function','damage API');
  assert(typeof forge.restore==='function','restore API');
  const s=forge.status();
  assert(s.version==='V2.38 TGG VEHICLE DAMAGE + INTERIOR FORGE 100','version');
  assert(s.mode==='native-vehicle-damage-interior-forge','mode');
  assert(s.interior==='street','street default');
  assert(s.layerCount===100,'layer count');
  return true;
})();