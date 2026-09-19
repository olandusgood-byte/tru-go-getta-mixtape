(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Surface core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.detailBudget==='function','detailBudget API');
  assert(typeof core.normalize==='function','normalize API');
  const asphalt=core.profile('asphalt');
  assert(asphalt.id==='asphalt'&&asphalt.roughness>.6,'asphalt profile');
  const neon=core.profile('neon');
  assert(neon.emissive===true&&neon.intensity>0,'neon profile');
  const n=core.normalize({opacity:9,roughness:-2,metalness:3,intensity:99});
  assert(n.opacity<=1&&n.roughness>=0&&n.metalness<=1&&n.intensity<=8,'surface clamps');
  assert(core.detailBudget('high')>core.detailBudget('balanced'),'high budget');
  assert(core.detailBudget('balanced')>core.detailBudget('performance'),'balanced budget');
  return true;
})();