(() => {
  const VERSION='V2.26 REAL ASSET LOADER 100';
  const LAYERS=[
    'asset core bridge','asset config normalize','asset https guard','asset glb guard','asset gltf guard','asset loading state','asset ready state','asset fallback state','asset reset state','asset status API',
    'player model config','player model url slot','player source metadata','player model scale','player model y offset','player model rotation','player model attach','player model detach','player model dedupe','player model replace',
    'procedural fallback preserve','procedural fallback restore','procedural mesh visibility','procedural child registry','real asset group','real asset tag','real asset shadows','real asset frustum','real asset traversal','real asset diagnostics',
    'dynamic GLTF loader','dynamic loader import guard','loader import cache','loader request timeout','loader success handler','loader error handler','loader network fallback','loader parse fallback','loader unsupported fallback','loader reset handler',
    'model bounding box','model auto scale','model floor align','model center align','model rotation apply','model material shadow pass','model mesh count','model texture count','model animation count','model load duration',
    'model quality high','model quality balanced','model quality performance','model mobile scale trim','model mobile shadow trim','model distance visibility','model camera safety','model renderer compatibility','model scene compatibility','model player compatibility',
    'movement preservation','driving preservation','mission preservation','save preservation','career preservation','crew preservation','rival preservation','concert preservation','battle preservation','world event preservation',
    'asset HUD','asset HUD state','asset HUD source','asset HUD fallback','asset HUD ready','asset HUD loading','asset HUD error','asset HUD toggle','asset HUD mobile','asset HUD landscape',
    'asset configure API','asset reset API','asset retry API','asset source API','asset metrics API','asset manifest API','asset event loading','asset event ready','asset event fallback','asset event reset',
    'asset local state','asset session metrics','asset failure reason','asset last url','asset load attempts','asset successful loads','rollback isolation','V2.25 compatibility','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV226Core||globalThis.window?.TGGV226Core;
  const defaultConfig={
    playerModelUrl:null,
    fallbackMode:'procedural',
    scale:1,
    yOffset:0,
    rotationY:0,
    sourceLabel:'Runway character concept • 3D provider pending'
  };

  let config=core()?.normalizeConfig?.(defaultConfig)||{...defaultConfig};
  let machine=core()?.nextState?.({status:'idle'},'reset')||{status:'idle',usingFallback:true,url:null,reason:null};
  let modelRoot=null,realGroup=null,loaderModulePromise=null,hud=null,metrics={
    attempts:0,successes:0,failures:0,lastLoadMs:0,lastReason:null,lastUrl:null,meshCount:0,textureCount:0,animationCount:0
  };
  let proceduralChildren=[];

  function hasDOM(){return typeof window!=='undefined'&&typeof document!=='undefined'}
  function player(){return hasDOM()?window.TGG3D?.player||null:null}
  function scene(){return hasDOM()?window.TGG3D?.scene||null:null}

  function status(){
    return {
      version:VERSION,
      ready:machine.status==='ready'||machine.status==='fallback'||machine.status==='idle',
      layers:LAYERS.length,
      assetStatus:machine.status,
      usingFallback:machine.usingFallback!==false,
      fallbackMode:'procedural',
      playerModelUrl:config.playerModelUrl||null,
      sourceLabel:config.sourceLabel||defaultConfig.sourceLabel,
      metrics:{...metrics}
    };
  }

  function dispatch(type,detail={}){
    if(!hasDOM())return;
    window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,...detail}}));
  }

  function ensureHud(){
    if(!hasDOM())return null;
    if(hud&&document.body.contains(hud))return hud;
    const city=document.querySelector('.city');
    if(!city)return null;
    hud=document.createElement('button');
    hud.id='v226AssetHud';
    hud.className='v226-asset-hud';
    hud.type='button';
    hud.setAttribute('aria-label','Show real asset loader status');
    hud.addEventListener('click',()=>hud.classList.toggle('expanded'));
    city.appendChild(hud);
    renderHud();
    return hud;
  }

  function renderHud(){
    if(!hasDOM())return;
    const el=ensureHud();if(!el)return;
    const s=status();
    const state=s.assetStatus.toUpperCase();
    const mode=s.usingFallback?'PROCEDURAL':'REAL MODEL';
    el.dataset.state=s.assetStatus;
    el.innerHTML='<small>ASSET PIPELINE</small><b>'+state+' • '+mode+'</b><span>'+(s.playerModelUrl?'GLB CONFIGURED':'GLB SLOT READY')+'</span><em>'+String(s.sourceLabel||'')+'</em>';
  }

  function captureProcedural(){
    const p=player();if(!p)return [];
    proceduralChildren=p.children.filter(c=>!c.userData?.v226RealAsset);
    return proceduralChildren;
  }

  function setProceduralVisible(visible){
    if(!proceduralChildren.length)proceduralChildren=captureProcedural();
    proceduralChildren.forEach(c=>{c.visible=!!visible});
  }

  function ensureRealGroup(){
    const p=player();if(!p||!hasDOM())return null;
    if(realGroup&&realGroup.parent===p)return realGroup;
    realGroup=new window.THREE.Group();
    realGroup.name='v226-real-asset-group';
    realGroup.userData.v226RealAsset=true;
    p.add(realGroup);
    return realGroup;
  }

  function disposeModel(){
    if(modelRoot){
      modelRoot.traverse?.(o=>{
        if(o.geometry?.dispose)o.geometry.dispose();
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.filter(Boolean).forEach(m=>{
          Object.values(m).forEach(v=>{if(v&&v.isTexture&&v.dispose)v.dispose()});
          m.dispose?.();
        });
      });
      modelRoot.parent?.remove(modelRoot);
      modelRoot=null;
    }
    metrics.meshCount=0;metrics.textureCount=0;metrics.animationCount=0;
  }

  function restoreFallback(reason=null){
    disposeModel();
    setProceduralVisible(true);
    machine=core()?.nextState?.(machine,'failure',{reason})||{status:'fallback',usingFallback:true,reason};
    metrics.failures+=reason?1:0;metrics.lastReason=reason||null;
    renderHud();dispatch('tgg:asset-fallback',{reason});
    return status();
  }

  function reset(){
    disposeModel();
    setProceduralVisible(true);
    machine=core()?.nextState?.(machine,'reset')||{status:'idle',usingFallback:true,url:null,reason:null};
    metrics.lastReason=null;renderHud();dispatch('tgg:asset-reset');
    return status();
  }

  function configure(next={}){
    const merged={...config,...next};
    const normalized=core()?.normalizeConfig?.(merged)||merged;
    config={...defaultConfig,...merged,...normalized,sourceLabel:String(next.sourceLabel??config.sourceLabel??defaultConfig.sourceLabel)};
    if(next.playerModelUrl===null||next.playerModelUrl==='')config.playerModelUrl=null;
    renderHud();
    return {...config};
  }

  async function getLoader(){
    if(!hasDOM())throw new Error('browser_required');
    if(loaderModulePromise)return loaderModulePromise;
    loaderModulePromise=import('https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/loaders/GLTFLoader.js')
      .then(m=>m.GLTFLoader)
      .catch(err=>{loaderModulePromise=null;throw err});
    return loaderModulePromise;
  }

  function analyze(root,gltf){
    let meshes=0,textures=0;
    const seen=new Set();
    root?.traverse?.(o=>{
      if(o.isMesh){
        meshes++;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.filter(Boolean).forEach(m=>Object.values(m).forEach(v=>{if(v?.isTexture&&!seen.has(v.uuid)){seen.add(v.uuid);textures++}}));
      }
    });
    metrics.meshCount=meshes;metrics.textureCount=textures;metrics.animationCount=Array.isArray(gltf?.animations)?gltf.animations.length:0;
  }

  function alignModel(root){
    if(!hasDOM()||!root)return;
    const THREE=window.THREE;
    root.rotation.y=Number(config.rotationY)||0;
    root.scale.setScalar(Number(config.scale)||1);
    const box=new THREE.Box3().setFromObject(root);
    const size=new THREE.Vector3(),center=new THREE.Vector3();
    box.getSize(size);box.getCenter(center);
    if(Number.isFinite(size.y)&&size.y>0){
      const targetHeight=3.45;
      const factor=targetHeight/size.y;
      root.scale.multiplyScalar(factor);
      box.setFromObject(root);box.getCenter(center);
    }
    box.setFromObject(root);
    const minY=box.min.y;
    box.getCenter(center);
    root.position.x-=center.x;
    root.position.z-=center.z;
    root.position.y+=(Number(config.yOffset)||0)-minY;
  }

  function styleModel(root){
    const high=window.TGGV212?.status?.()?.quality!=='performance';
    root.traverse?.(o=>{
      if(o.isMesh){
        o.castShadow=!!high;o.receiveShadow=true;o.frustumCulled=true;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.filter(Boolean).forEach(m=>{m.needsUpdate=true});
      }
    });
  }

  async function loadModel(url=config.playerModelUrl){
    const valid=core()?.isSupportedModelUrl?.(url);
    if(!valid){
      return restoreFallback(url?'unsupported_model_url':'model_url_missing');
    }
    metrics.attempts++;metrics.lastUrl=url;metrics.lastReason=null;
    machine=core()?.nextState?.(machine,'begin')||{status:'loading',usingFallback:true};
    renderHud();dispatch('tgg:asset-loading',{url});
    const started=performance.now();
    try{
      const GLTFLoader=await getLoader();
      const loader=new GLTFLoader();
      const gltf=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('asset_load_timeout')),20000);
        loader.load(url,x=>{clearTimeout(timeout);resolve(x)},undefined,err=>{clearTimeout(timeout);reject(err||new Error('asset_load_failed'))});
      });
      const root=gltf?.scene||gltf?.scenes?.[0];
      if(!root)throw new Error('gltf_scene_missing');
      disposeModel();
      const g=ensureRealGroup();if(!g)throw new Error('player_group_missing');
      modelRoot=root;root.userData.v226RealAsset=true;g.add(root);
      alignModel(root);styleModel(root);analyze(root,gltf);
      setProceduralVisible(false);
      metrics.successes++;metrics.lastLoadMs=Math.round(performance.now()-started);
      machine=core()?.nextState?.(machine,'success',{url})||{status:'ready',usingFallback:false,url};
      renderHud();dispatch('tgg:asset-ready',{url,metrics:{...metrics}});
      return status();
    }catch(err){
      metrics.lastLoadMs=Math.round(performance.now()-started);
      return restoreFallback(String(err?.message||err||'asset_load_failed'));
    }
  }

  async function retry(){
    reset();
    return loadModel(config.playerModelUrl);
  }

  function source(){
    return {
      sourceLabel:config.sourceLabel||defaultConfig.sourceLabel,
      modelUrl:config.playerModelUrl||null,
      providerState:config.playerModelUrl?'configured':'pending_external_3d'
    };
  }

  function install(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v226');
    const badge=document.querySelector('.v201-badge');
    if(badge)badge.textContent=VERSION;
    ensureHud();
  }

  let lastPlayer=null;
  function tick(){
    if(!hasDOM())return;
    requestAnimationFrame(tick);
    install();
    const p=player();
    if(p&&p!==lastPlayer){
      lastPlayer=p;proceduralChildren=captureProcedural();
      if(config.playerModelUrl&&machine.status==='idle')loadModel(config.playerModelUrl);
    }
    if(modelRoot){
      const quality=window.TGGV212?.status?.()?.quality||'high';
      modelRoot.visible=quality!=='performance'||window.innerWidth>760;
    }
    renderHud();
  }

  const api={version:VERSION,layers:LAYERS,status,configure,reset,retry,loadModel,source};
  globalThis.TGGV226=api;
  if(hasDOM()){
    window.TGGV226=api;
    window.TGGV226AssetConfig={...defaultConfig};
    install();
    requestAnimationFrame(tick);
  }
})();