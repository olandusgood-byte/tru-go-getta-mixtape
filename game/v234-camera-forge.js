(() => {
  const VERSION='V2.34 TGG CAMERA + CINEMATIC FORGE 100';
  const LAYERS=[
    'camera core bridge','camera enabled state','camera preset state','camera renderer wrapper','camera original render','camera pre-render hook','camera post-render restore','camera status API','camera diagnostics','camera rollback isolation',
    'street preset','action preset','cinematic preset','photo preset','preset persistence','preset button UI','preset transition','preset event','preset status','preset restore',
    'speed FOV','sprint FOV','boost FOV','vehicle speed FOV','action FOV','cinematic FOV','FOV clamp','FOV update matrix','FOV restore','FOV diagnostics',
    'steering roll','sprint roll','impact roll','action roll','cinematic roll','roll clamp','roll quaternion apply','roll restore','roll diagnostics','roll quality gate',
    'impact shake','collision shake','mission pulse','checkpoint pulse','concert pulse','rap pulse','lightning pulse','boost punch','sprint bob','camera noise phase',
    'shake x','shake y','shake z','shake decay','shake duration','shake strength','shake quality scaling','reduced motion scaling','shake restore','shake diagnostics',
    'cinematic top bar','cinematic bottom bar','letterbox amount','letterbox transition','vignette overlay','vignette amount','speed vignette','impact vignette','boost vignette','overlay restore',
    'photo lock','photo unlock','photo position snapshot','photo rotation snapshot','photo FOV snapshot','photo render override','photo HUD','photo button','photo persistence guard','photo exit restore',
    'vehicle dynamics bridge','player dynamics bridge','mission event bridge','concert event bridge','rap event bridge','weather lightning bridge','V2.32 compatibility','V2.33 compatibility','no movement mutation','no physics mutation',
    'camera HUD','camera panel','Shift+C shortcut','mobile panel','landscape panel','enabled toggle','restore button','100-layer manifest','release QA hooks','production diagnostics'
  ];

  const core=()=>globalThis.TGGV234Core||globalThis.window?.TGGV234Core;
  const state={
    enabled:true,preset:'street',wrapped:false,originalRender:null,renderer:null,
    impulse:0,impulseUntil:0,impulseKind:null,photoLock:null,frames:0,ready:false
  };
  let panel=null,hud=null,overlay=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-camera-forge',layerCount:LAYERS.length,
      enabled:state.enabled,preset:state.preset,wrapped:state.wrapped,photo:!!state.photoLock,
      impulse:Number(state.impulse.toFixed(3)),frames:state.frames
    };
  }

  function currentCfg(){
    return core()?.preset?.(state.photoLock?'photo':state.preset)||core()?.preset?.('street');
  }

  function renderOverlay(cfg={},speedFactor=0,impact=0,boost=false){
    if(!hasDOM())return;
    ensureOverlay();
    const motionScale=reducedMotion()?.35:1;
    const letterbox=clamp(Number(cfg.letterbox)||0,0,.18);
    const vignette=clamp((Number(cfg.vignette)||0)+speedFactor*.08+impact*.14+(boost?.08:0),0,.72);
    overlay.style.setProperty('--v234-bars',(letterbox*100).toFixed(2)+'vh');
    overlay.style.setProperty('--v234-vignette',String(vignette*motionScale));
    overlay.classList.toggle('photo',!!state.photoLock);
  }

  function pulse(kind='impact',strength=.5,duration=420){
    state.impulse=clamp(Math.max(state.impulse,Number(strength)||.5),0,1.5);
    state.impulseUntil=Date.now()+clamp(Number(duration)||420,120,5000);
    state.impulseKind=String(kind);
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:camera-pulse',{detail:{kind:state.impulseKind,strength:state.impulse,duration}}));
    return state.impulse;
  }

  function applyPreset(id='street'){
    state.preset=core()?.presets?.includes(id)?id:'street';
    if(hasDOM()){
      try{localStorage.setItem('tgg-v234-camera',state.preset)}catch{}
      renderUI();
      window.dispatchEvent(new CustomEvent('tgg:camera-preset',{detail:{preset:state.preset}}));
    }
    return status();
  }

  function saveCamera(cam){
    return {
      position:cam.position.clone(),
      quaternion:cam.quaternion.clone(),
      fov:Number(cam.fov)||58,
      zoom:Number(cam.zoom)||1
    };
  }

  function restoreCamera(cam,snap){
    cam.position.copy(snap.position);
    cam.quaternion.copy(snap.quaternion);
    cam.fov=snap.fov;cam.zoom=snap.zoom;cam.updateProjectionMatrix();
  }

  function togglePhoto(force){
    if(!hasDOM())return false;
    const cam=window.TGG3D?.camera;if(!cam)return false;
    const should=typeof force==='boolean'?force:!state.photoLock;
    if(should&&!state.photoLock){
      state.photoLock=saveCamera(cam);
      pulse('photo',0,200);
    }else if(!should&&state.photoLock){
      state.photoLock=null;
    }
    renderUI();
    return !!state.photoLock;
  }

  function beforeRender(cam,ts){
    if(!state.enabled||!cam)return null;
    const snap=saveCamera(cam);
    const cfg=currentCfg();
    const vd=window.TGG3D?.getVehicleDynamics?.()||{};
    const pd=window.TGG3D?.getPlayerDynamics?.()||{};
    const gs=window.TGGGame?.getState?.()||{};
    const vehicleSpeed=clamp(Math.abs(Number(vd.speed)||0)/10,0,1.4);
    const walkSpeed=clamp((Number(pd.speed)||0)/9.8,0,1.2);
    const speedFactor=gs.inVehicle?vehicleSpeed:walkSpeed;
    const boost=!!vd.boosting;
    const qScale=quality()==='performance'?.45:quality()==='balanced'?.72:1;
    const motionScale=reducedMotion()?.28:1;

    if(state.photoLock){
      cam.position.copy(state.photoLock.position);
      cam.quaternion.copy(state.photoLock.quaternion);
      cam.fov=state.photoLock.fov;cam.zoom=state.photoLock.zoom;cam.updateProjectionMatrix();
      renderOverlay(cfg,0,0,false);
      return snap;
    }

    if(Date.now()>=state.impulseUntil){state.impulse*=.86;if(state.impulse<.01)state.impulse=0}
    const impulse=state.impulse;
    const time=(Number(ts)||performance.now())*.001;
    const noiseX=Math.sin(time*37.1)*.55+Math.sin(time*13.7)*.45;
    const noiseY=Math.sin(time*41.9+1.2)*.62+Math.sin(time*17.3)*.38;
    const noiseZ=Math.sin(time*29.3+2.1);
    const shake=(Number(cfg.shake)||0)*(.22+speedFactor*.42)+impulse*.42;
    const totalShake=shake*qScale*motionScale;

    cam.position.x+=noiseX*totalShake*.12;
    cam.position.y+=noiseY*totalShake*.08+(gs.inVehicle?0:Math.sin(time*8)*walkSpeed*.018*motionScale);
    cam.position.z+=noiseZ*totalShake*.10;

    const fovBoost=(Number(cfg.fovBoost)||0)*(speedFactor*.62+(boost?.42:0))+impulse*2.2;
    cam.fov=clamp(snap.fov+fovBoost*motionScale,42,86);
    cam.updateProjectionMatrix();

    const steer=clamp(Number(vd.steer)||0,-1,1);
    const roll=(steer*vehicleSpeed*(Number(cfg.roll)||0)+noiseZ*impulse*.018)*motionScale;
    if(Math.abs(roll)>.0001)cam.rotateZ(roll);

    if(boost){
      cam.position.y+=.035*motionScale;
      cam.position.z-=.06*motionScale;
    }

    renderOverlay(cfg,speedFactor,impulse,boost);
    state.frames++;
    return snap;
  }

  function wrapRenderer(){
    if(!hasDOM()||state.wrapped)return true;
    const r=window.TGG3D?.renderer;if(!r?.render)return false;
    state.renderer=r;state.originalRender=r.render.bind(r);
    r.render=function(sceneArg,cameraArg){
      const snap=beforeRender(cameraArg,performance.now());
      try{return state.originalRender(sceneArg,cameraArg)}
      finally{if(snap)restoreCamera(cameraArg,snap)}
    };
    state.wrapped=true;state.ready=true;return true;
  }

  function unwrapRenderer(){
    if(state.wrapped&&state.renderer&&state.originalRender){
      state.renderer.render=state.originalRender;
    }
    state.wrapped=false;state.originalRender=null;state.renderer=null;
  }

  function setEnabled(v){
    state.enabled=!!v;
    if(!state.enabled&&hasDOM())renderOverlay(core()?.preset?.('street')||{},0,0,false);
    renderUI();return state.enabled;
  }

  function restore(){
    unwrapRenderer();state.enabled=false;state.photoLock=null;state.impulse=0;state.impulseUntil=0;
    if(hasDOM()){ensureOverlay();overlay.style.setProperty('--v234-bars','0vh');overlay.style.setProperty('--v234-vignette','0');renderUI()}
    return status();
  }

  function ensureOverlay(){
    if(!hasDOM())return null;
    if(overlay&&document.body.contains(overlay))return overlay;
    overlay=document.createElement('div');overlay.id='v234CinematicOverlay';overlay.className='v234-cinematic-overlay';
    overlay.innerHTML='<i class="v234-bar top"></i><i class="v234-bar bottom"></i><i class="v234-vignette"></i>';
    document.body.appendChild(overlay);return overlay;
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    ['tgg:traffic-impact','tgg:vehicle-impact'].forEach(ev=>window.addEventListener(ev,e=>pulse('impact',Math.max(.35,Number(e.detail?.strength)||.55),520)));
    window.addEventListener('tgg:mission-start',()=>pulse('mission',.32,700));
    window.addEventListener('tgg:mission-checkpoint',()=>pulse('checkpoint',.24,450));
    window.addEventListener('tgg:mission-complete',()=>pulse('complete',.38,900));
    window.addEventListener('tgg:concert-start',()=>{applyPreset('cinematic');pulse('concert',.3,1000)});
    window.addEventListener('tgg:rap-battle-start',()=>pulse('rap',.34,800));
    window.addEventListener('tgg:weather-lightning',()=>pulse('lightning',.75,260));
  }

  function load(){
    if(!hasDOM())return;
    try{
      const p=localStorage.getItem('tgg-v234-camera');
      if(core()?.presets?.includes(p))state.preset=p;
    }catch{}
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v234');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    ensureOverlay();
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v234ForgeBtn')){
      const b=document.createElement('button');b.id='v234ForgeBtn';b.className='v234-forge-btn';b.type='button';b.textContent='CAMERA';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v234ForgePanel';panel.className='v234-forge-panel';
      panel.innerHTML='<div class="v234-head"><div><small>TGG NATIVE 3D</small><b>CAMERA + CINEMATIC</b></div><button id="v234Close" type="button">×</button></div><div class="v234-presets"><button data-v234-preset="street">STREET</button><button data-v234-preset="action">ACTION</button><button data-v234-preset="cinematic">CINEMATIC</button></div><div class="v234-actions"><button id="v234Photo" type="button">PHOTO LOCK</button><button id="v234Pulse" type="button">CAMERA PUNCH</button><button id="v234Toggle" type="button">CAMERA FORGE: ON</button><button id="v234Restore" type="button">RESTORE BASE</button></div><div id="v234Stats" class="v234-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v234Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v234-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.v234Preset)));
      document.getElementById('v234Photo')?.addEventListener('click',()=>togglePhoto());
      document.getElementById('v234Pulse')?.addEventListener('click',()=>pulse('manual',.55,550));
      document.getElementById('v234Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v234Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v234ForgeHud';hud.className='v234-forge-hud';
      hud.innerHTML='<small>TGG CAMERA FORGE</small><b id="v234HudPreset">STREET</b><span id="v234HudState">DYNAMIC CAMERA</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v234Photo'))q('v234Photo').textContent=state.photoLock?'EXIT PHOTO':'PHOTO LOCK';
    if(q('v234Toggle'))q('v234Toggle').textContent='CAMERA FORGE: '+(state.enabled?'ON':'OFF');
    if(q('v234Stats'))q('v234Stats').textContent=state.preset.toUpperCase()+' • '+quality().toUpperCase()+' • '+(state.photoLock?'PHOTO LOCK':'DYNAMIC');
    if(q('v234HudPreset'))q('v234HudPreset').textContent=(state.photoLock?'PHOTO':state.preset).toUpperCase();
    if(q('v234HudState'))q('v234HudState').textContent=state.photoLock?'CAMERA LOCKED':'DYNAMIC CAMERA';
    panel?.querySelectorAll('[data-v234-preset]').forEach(b=>b.classList.toggle('active',b.dataset.v234Preset===state.preset&&!state.photoLock));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='c'||e.key==='C')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='p'||e.key==='P'){e.preventDefault();togglePhoto()}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!state.wrapped&&state.enabled)wrapRenderer();renderUI();
  }

  load();
  const api={version:VERSION,layers:LAYERS,presets:['street','action','cinematic','photo'],status,applyPreset,pulse,togglePhoto,setEnabled,restore};
  globalThis.TGGV234=api;
  if(hasDOM()){
    window.TGGV234=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();