(() => {
  const core=globalThis.__V226CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.26 asset core API must exist');
  assert(typeof core.normalizeConfig==='function','normalizeConfig API');
  assert(typeof core.nextState==='function','nextState API');
  assert(typeof core.isSupportedModelUrl==='function','isSupportedModelUrl API');

  const empty=core.normalizeConfig({});
  assert(empty.playerModelUrl===null,'empty config uses null player model');
  assert(empty.fallbackMode==='procedural','empty config procedural fallback');

  assert(core.isSupportedModelUrl('https://cdn.example.com/player.glb')===true,'https glb supported');
  assert(core.isSupportedModelUrl('https://cdn.example.com/player.gltf')===true,'https gltf supported');
  assert(core.isSupportedModelUrl('http://cdn.example.com/player.glb')===false,'http rejected');
  assert(core.isSupportedModelUrl('javascript:alert(1)')===false,'javascript rejected');
  assert(core.isSupportedModelUrl('https://cdn.example.com/player.png')===false,'non model rejected');

  const configured=core.normalizeConfig({playerModelUrl:'https://cdn.example.com/player.glb'});
  assert(configured.playerModelUrl.endsWith('.glb'),'configured glb preserved');

  let s=core.nextState({status:'idle'},'begin');
  assert(s.status==='loading','begin -> loading');
  s=core.nextState(s,'success',{url:'https://cdn.example.com/player.glb'});
  assert(s.status==='ready'&&s.usingFallback===false,'success -> ready no fallback');
  s=core.nextState({status:'loading'},'failure',{reason:'network'});
  assert(s.status==='fallback'&&s.usingFallback===true,'failure -> fallback');
  s=core.nextState({status:'ready'},'reset');
  assert(s.status==='idle','reset -> idle');

  return true;
})();