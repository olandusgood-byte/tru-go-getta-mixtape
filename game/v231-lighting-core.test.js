(() => {
  const core=globalThis.__V231CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.31 Lighting core API must exist');
  assert(typeof core.mood==='function','mood API');
  assert(typeof core.material==='function','material API');
  assert(typeof core.normalizeScene==='function','normalizeScene API');

  const night=core.mood('night');
  assert(night.id==='night','night mood');
  assert(night.exposure>0&&night.exposure<=2,'night exposure');
  assert(night.fogDensity>0&&night.fogDensity<.05,'night fog');

  const golden=core.mood('golden');
  assert(golden.id==='golden','golden mood');
  assert(golden.keyIntensity>night.keyIntensity,'golden key stronger than night');

  const studio=core.mood('studio');
  assert(studio.id==='studio','studio mood');
  assert(studio.accentIntensity>0,'studio accent');

  const skin=core.material('skin');
  assert(skin.roughness>.45&&skin.roughness<.9,'skin roughness');
  assert(skin.metalness<.1,'skin metalness');
  const chrome=core.material('chrome');
  assert(chrome.metalness>.8&&chrome.roughness<.3,'chrome profile');
  const glass=core.material('glass');
  assert(glass.transparent===true&&glass.opacity<1,'glass profile');

  const clamped=core.normalizeScene({exposure:99,fogDensity:-5,keyIntensity:99,accentIntensity:-1});
  assert(clamped.exposure<=2.2&&clamped.fogDensity>=0&&clamped.keyIntensity<=8&&clamped.accentIntensity>=0,'scene clamps');
  return true;
})();