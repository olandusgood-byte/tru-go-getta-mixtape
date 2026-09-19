(() => {
  const core=globalThis.__V234CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.34 Camera core API must exist');
  assert(typeof core.preset==='function','preset API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.blend==='function','blend API');

  const street=core.preset('street');
  assert(street.id==='street'&&street.shake>=0,'street preset');
  const cinematic=core.preset('cinematic');
  assert(cinematic.letterbox>0&&cinematic.vignette>street.vignette,'cinematic preset');
  const action=core.preset('action');
  assert(action.fovBoost>street.fovBoost&&action.roll>street.roll,'action preset');
  const photo=core.preset('photo');
  assert(photo.photo===true,'photo preset');

  const n=core.normalize({shake:9,fovBoost:99,roll:8,letterbox:4,vignette:-1});
  assert(n.shake<=1&&n.fovBoost<=18&&n.roll<=.16&&n.letterbox<=.18&&n.vignette>=0,'camera clamps');

  const mid=core.blend(street,action,.5);
  assert(mid.fovBoost>street.fovBoost&&mid.fovBoost<action.fovBoost,'blend fov');
  return true;
})();