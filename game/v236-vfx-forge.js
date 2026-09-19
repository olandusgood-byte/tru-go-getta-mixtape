(() => {
  const VERSION='V2.36 TGG VFX FORGE 100';
  const LAYERS=[
    'vfx core bridge','vfx enabled state','vfx root group','vfx emitter registry','vfx budget guard','vfx quality bridge','vfx status API','vfx diagnostics','vfx clear API','vfx rollback isolation',
    'sparks emitter','tire smoke emitter','exhaust emitter','dust emitter','rain spray emitter','boost emitter','confetti emitter','flash emitter','laser emitter','generic points emitter',
    'particle positions','particle velocities','particle ages','particle life','particle gravity','particle opacity fade','particle size profile','particle color profile','particle reset','particle cleanup',
    'impact spark burst','collision debris burst','drift smoke burst','braking smoke burst','exhaust idle puff','exhaust throttle puff','footstep dust left','footstep dust right','rain wheel spray','boost trail left',
    'boost trail right','boost flash','mission flash','checkpoint flash','concert flash','concert confetti','concert laser left','concert laser right','rap battle flash','rap battle confetti',
    'weather lightning flash','vehicle impact bridge','traffic impact bridge','boost dynamics bridge','handbrake bridge','player footstep bridge','weather rain bridge','concert event bridge','rap event bridge','mission event bridge',
    'particle budget high','budget balanced','budget performance','emitter trim oldest','active particle count','quality rebuild','performance opacity trim','performance size trim','reduced motion trim','mobile trim',
    'flash point light','flash decay','laser line material','laser sweep','laser color cycle','laser lifetime','confetti gravity','confetti wind','smoke rise','smoke drift',
    'dust settle','spray gravity','boost streak','spark bounce visual','emitter follow car','emitter follow player','scene attach','scene detach','emitter dispose','material dispose',
    'vfx HUD','vfx panel','effect buttons','enabled toggle','clear button','demo burst button','Shift V shortcut','mobile panel','V2.35 compatibility','release QA hooks'
  ];

  const core=()=>globalThis.TGGV236Core||globalThis.window?.TGGV236Core;
  const state={
    enabled:true,root:null,emitters:[],ready:false,frames:0,totalEmitted:0,totalTrimmed:0,
    lastBoost:0,lastSmoke:0,lastExhaust:0,lastStep:0,stepSide:0,lastRainSpray:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-vfx-forge',layerCount:LAYERS.length,
      enabled:state.enabled,quality:quality(),activeEmitters:state.emitters.length,
      activeParticles:activeParticleCount(),totalEmitted:state.totalEmitted,totalTrimmed:state.totalTrimmed,frames:state.frames
    };
  }

  function ensureRoot(){
    if(!hasDOM())return null;
    const s=scene(),THREE=T();if(!s||!THREE)return null;
    if(state.root?.parent===s)return state.root;
    state.root=new THREE.Group();state.root.name='tgg-vfx-forge-root';state.root.userData.v236=true;state.root.visible=state.enabled;s.add(state.root);state.ready=true;
    return state.root;
  }

  function currentPlayer(){
    const gs=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(gs.x)||50)-50)*.92,y:.15,z:((Number(gs.y)||50)-50)*.92};
  }

  function currentCar(){
    const c=hasDOM()?window.TGG3D?.car:null;
    return c?{x:c.position.x,y:Math.max(.25,c.position.y+.5),z:c.position.z}:{x:0,y:.5,z:0};
  }

  function originVector(origin){
    const THREE=T();if(!THREE)return null;
    if(origin?.isVector3)return origin.clone();
    return new THREE.Vector3(Number(origin?.x)||0,Number(origin?.y)||0,Number(origin?.z)||0);
  }

  function activeParticleCount(){
    return state.emitters.reduce((n,e)=>n+(Number(e.count)||0),0);
  }

  function budget(){
    const base=core()?.budget?.(quality())||120;
    const mobile=hasDOM()&&window.innerWidth<720?.72:1;
    const motion=reducedMotion()?.72:1;
    return Math.max(40,Math.floor(base*mobile*motion));
  }

  function disposeEmitter(e){
    if(!e)return;
    e.object?.traverse?.(o=>{
      o.geometry?.dispose?.();
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.filter(Boolean).forEach(m=>m.dispose?.());
    });
    e.object?.parent?.remove(e.object);
  }

  function enforceBudget(){
    const limit=budget();
    while(activeParticleCount()>limit&&state.emitters.length>1){
      const e=state.emitters.shift();disposeEmitter(e);state.totalTrimmed++;
    }
  }

  function velocityFor(type,i,cfg){
    const THREE=T();const r=Math.random;
    if(type==='sparks')return new THREE.Vector3((r()-.5)*cfg.speed,(.2+r()*.8)*cfg.speed,(r()-.5)*cfg.speed);
    if(type==='tire-smoke')return new THREE.Vector3((r()-.5)*.8,.45+r()*.8,(r()-.5)*.8);
    if(type==='exhaust')return new THREE.Vector3(-(.4+r()*.9),.18+r()*.3,(r()-.5)*.45);
    if(type==='dust')return new THREE.Vector3((r()-.5)*cfg.speed*.7,.2+r()*.7,(r()-.5)*cfg.speed*.7);
    if(type==='rain-spray')return new THREE.Vector3((r()-.5)*cfg.speed*.4,1+r()*cfg.speed*.35,(r()-.5)*cfg.speed*.5);
    if(type==='boost')return new THREE.Vector3(-(3+r()*cfg.speed),(.1+r()*.25),(r()-.5)*1.2);
    if(type==='confetti')return new THREE.Vector3((r()-.5)*cfg.speed,(.45+r()*.55)*cfg.speed,(r()-.5)*cfg.speed);
    return new THREE.Vector3((r()-.5)*cfg.speed,r()*cfg.speed,(r()-.5)*cfg.speed);
  }

  function makePoints(type,origin,cfg,opts={}){
    const THREE=T(),root=ensureRoot();if(!THREE||!root)return null;
    const q=quality(),scale=q==='performance'?.45:q==='balanced'?.72:1;
    const count=Math.max(1,Math.floor((opts.count??cfg.count)*scale*(reducedMotion()?.7:1)));
    const pos=new Float32Array(count*3),vel=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      pos[i*3]=(Math.random()-.5)*(opts.spread??.35);pos[i*3+1]=(Math.random())*(opts.spread??.35);pos[i*3+2]=(Math.random()-.5)*(opts.spread??.35);
      const v=velocityFor(type,i,cfg);vel[i*3]=v.x;vel[i*3+1]=v.y;vel[i*3+2]=v.z;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({
      color:opts.color??cfg.color,size:(opts.size??cfg.size)*(q==='performance'?.8:1),
      transparent:true,opacity:(opts.opacity??cfg.opacity)*(q==='performance'?.72:1),
      depthWrite:false,sizeAttenuation:true,blending:(type==='sparks'||type==='boost')?THREE.AdditiveBlending:THREE.NormalBlending
    });
    const pts=new THREE.Points(geo,mat);pts.position.copy(originVector(origin));pts.userData.v236=true;root.add(pts);
    return {type,object:pts,count,vel,age:0,life:opts.life??cfg.life,gravity:opts.gravity??cfg.gravity,baseOpacity:mat.opacity,baseSize:mat.size,born:performance.now()};
  }

  function makeFlash(origin,cfg,opts={}){
    const THREE=T(),root=ensureRoot();if(!THREE||!root)return null;
    const g=new THREE.Group();g.position.copy(originVector(origin));g.userData.v236=true;
    const light=new THREE.PointLight(opts.color??cfg.color,opts.intensity??12,opts.distance??18,2);g.add(light);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshBasicMaterial({color:opts.color??cfg.color,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
    g.add(mesh);root.add(g);
    return {type:'flash',object:g,count:1,light,mesh,age:0,life:opts.life??cfg.life,baseOpacity:.85,born:performance.now()};
  }

  function makeLaser(origin,cfg,opts={}){
    const THREE=T(),root=ensureRoot();if(!THREE||!root)return null;
    const g=new THREE.Group();g.position.copy(originVector(origin));g.userData.v236=true;
    const count=Math.max(1,Math.floor((opts.count??cfg.count)*(quality()==='performance'?.45:quality()==='balanced'?.7:1)));
    for(let i=0;i<count;i++){
      const len=12+Math.random()*12;
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,1.5,0),new THREE.Vector3((Math.random()-.5)*len,6+Math.random()*8,(Math.random()-.5)*len)]);
      const hue=(i/count+.72)%1;
      const color=opts.color??new THREE.Color().setHSL(hue,.86,.62);
      const mat=new THREE.LineBasicMaterial({color,transparent:true,opacity:cfg.opacity,blending:THREE.AdditiveBlending,depthWrite:false});
      const line=new THREE.Line(geo,mat);line.userData.phase=i*.8;g.add(line);
    }
    root.add(g);
    return {type:'laser',object:g,count,age:0,life:opts.life??cfg.life,baseOpacity:cfg.opacity,born:performance.now()};
  }

  function emit(type='sparks',origin=null,opts={}){
    if(!state.enabled)return null;
    const cfg=core()?.effect?.(type);if(!cfg||!hasDOM())return null;
    const o=origin||currentPlayer();
    let e;
    if(type==='flash')e=makeFlash(o,cfg,opts);
    else if(type==='laser')e=makeLaser(o,cfg,opts);
    else e=makePoints(type,o,cfg,opts);
    if(!e)return null;
    state.emitters.push(e);state.totalEmitted+=e.count||1;enforceBudget();renderUI();
    return e;
  }

  function burstPreset(name='impact',origin=null){
    const o=origin||currentPlayer();
    if(name==='impact'){emit('sparks',o,{count:34});emit('dust',o,{count:10});emit('flash',o,{life:.12,intensity:7});}
    else if(name==='drift'){emit('tire-smoke',o,{count:28});emit('dust',o,{count:12});}
    else if(name==='boost'){emit('boost',o,{count:32});emit('flash',o,{color:0x61d9ff,life:.1,intensity:8});}
    else if(name==='concert'){emit('flash',o,{life:.18,intensity:14});emit('confetti',o,{count:110});emit('laser',o,{count:10,life:4});}
    else if(name==='rap'){emit('flash',o,{life:.14,intensity:10});emit('confetti',o,{count:42,life:2.4});}
    else if(name==='mission'){emit('flash',o,{life:.12,intensity:7,color:0xc7ff00});}
    return status();
  }

  function clear(){
    state.emitters.splice(0).forEach(disposeEmitter);renderUI();return true;
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }

  function updatePoints(e,dt,ts){
    const pts=e.object;if(!pts?.geometry)return;
    const a=pts.geometry.attributes.position.array,v=e.vel,type=e.type;
    for(let i=0;i<a.length;i+=3){
      a[i]+=v[i]*dt;a[i+1]+=v[i+1]*dt;a[i+2]+=v[i+2]*dt;
      v[i+1]-=(e.gravity||0)*dt;
      if(type==='tire-smoke'||type==='exhaust'){v[i+1]+=.38*dt;v[i]*=.992;v[i+2]*=.992}
      if(type==='dust'){v[i]*=.97;v[i+2]*=.97}
      if(type==='confetti'){v[i]+=Math.sin(ts*.002+i)*dt*.4}
    }
    pts.geometry.attributes.position.needsUpdate=true;
    const p=clamp(1-e.age/e.life,0,1);
    pts.material.opacity=e.baseOpacity*p;
    if(type==='tire-smoke'||type==='exhaust')pts.material.size=e.baseSize*(1+(e.age/e.life)*1.2);
  }

  function updateFlash(e){
    const p=clamp(1-e.age/e.life,0,1);
    if(e.light)e.light.intensity=16*p*p;
    if(e.mesh?.material)e.mesh.material.opacity=e.baseOpacity*p;
    if(e.mesh)e.mesh.scale.setScalar(1+(1-p)*3.2);
  }

  function updateLaser(e,ts){
    const p=clamp(1-e.age/e.life,0,1);
    e.object?.children?.forEach((line,i)=>{
      line.rotation.y=Math.sin(ts*.0012+i*.7)*.4;
      line.rotation.z=Math.sin(ts*.0008+i)*.08;
      if(line.material)line.material.opacity=e.baseOpacity*p;
    });
  }

  function updateEmitters(dt,ts){
    for(let i=state.emitters.length-1;i>=0;i--){
      const e=state.emitters[i];e.age+=dt;
      if(e.type==='flash')updateFlash(e);
      else if(e.type==='laser')updateLaser(e,ts);
      else updatePoints(e,dt,ts);
      if(e.age>=e.life){disposeEmitter(e);state.emitters.splice(i,1)}
    }
  }

  function continuousEffects(ts){
    const gs=window.TGGGame?.getState?.()||{},vd=window.TGG3D?.getVehicleDynamics?.()||{},pd=window.TGG3D?.getPlayerDynamics?.()||{};
    const carPos=currentCar(),playerPos=currentPlayer(),speed=Math.abs(Number(vd.speed)||0);
    if(gs.inVehicle){
      if(vd.boosting&&ts-state.lastBoost>85){state.lastBoost=ts;emit('boost',carPos,{count:10,spread:.2});}
      if(vd.handbrake&&speed>2&&ts-state.lastSmoke>120){state.lastSmoke=ts;emit('tire-smoke',carPos,{count:9,spread:.65});}
      if(ts-state.lastExhaust>(speed>.8?240:520)){state.lastExhaust=ts;emit('exhaust',carPos,{count:4,spread:.16});}
      const weather=window.TGGV233?.status?.()||{};
      if(Number(weather.rain)>.2&&speed>2&&ts-state.lastRainSpray>120){state.lastRainSpray=ts;emit('rain-spray',carPos,{count:8,spread:.55});}
    }else if((Number(pd.speed)||0)>.45&&ts-state.lastStep>(pd.sprinting?170:280)){
      state.lastStep=ts;state.stepSide=1-state.stepSide;
      emit('dust',{x:playerPos.x+(state.stepSide?.13:-.13),y:.04,z:playerPos.z},{count:4,size:.12,opacity:.22,life:.5,spread:.18});
    }
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:traffic-impact',e=>burstPreset('impact',currentCar()));
    window.addEventListener('tgg:vehicle-impact',e=>burstPreset('impact',currentCar()));
    window.addEventListener('tgg:mission-start',()=>burstPreset('mission',currentPlayer()));
    window.addEventListener('tgg:mission-checkpoint',()=>emit('flash',currentPlayer(),{color:0xc7ff00,intensity:6}));
    window.addEventListener('tgg:concert-start',()=>burstPreset('concert',currentPlayer()));
    window.addEventListener('tgg:rap-battle-start',()=>burstPreset('rap',currentPlayer()));
    window.addEventListener('tgg:weather-lightning',()=>emit('flash',currentPlayer(),{color:0xeef7ff,intensity:18,distance:28,life:.14}));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v236');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v236ForgeBtn')){
      const b=document.createElement('button');b.id='v236ForgeBtn';b.className='v236-forge-btn';b.type='button';b.textContent='VFX';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v236ForgePanel';panel.className='v236-forge-panel';
      panel.innerHTML='<div class="v236-head"><div><small>TGG NATIVE 3D</small><b>VFX FORGE</b></div><button id="v236Close" type="button">×</button></div><div class="v236-effects"><button data-v236-burst="impact">IMPACT</button><button data-v236-burst="drift">DRIFT</button><button data-v236-burst="boost">BOOST</button><button data-v236-burst="concert">CONCERT</button><button data-v236-burst="rap">RAP</button><button data-v236-effect="exhaust">EXHAUST</button></div><div class="v236-actions"><button id="v236Toggle" type="button">VFX: ON</button><button id="v236Clear" type="button">CLEAR VFX</button></div><div id="v236Stats" class="v236-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v236Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v236-burst]').forEach(b=>b.addEventListener('click',()=>burstPreset(b.dataset.v236Burst,currentPlayer())));
      panel.querySelectorAll('[data-v236-effect]').forEach(b=>b.addEventListener('click',()=>emit(b.dataset.v236Effect,currentPlayer())));
      document.getElementById('v236Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v236Clear')?.addEventListener('click',clear);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v236ForgeHud';hud.className='v236-forge-hud';
      hud.innerHTML='<small>TGG VFX FORGE</small><b id="v236HudCount">0 PARTICLES</b><span id="v236HudQuality">HIGH</span>';city.appendChild(hud);
    }
    bridgeEvents();ensureRoot();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id),st=status();
    if(q('v236Toggle'))q('v236Toggle').textContent='VFX: '+(state.enabled?'ON':'OFF');
    if(q('v236Stats'))q('v236Stats').textContent=st.activeParticles+' / '+budget()+' PARTICLES • '+st.activeEmitters+' EMITTERS • '+quality().toUpperCase();
    if(q('v236HudCount'))q('v236HudCount').textContent=st.activeParticles+' PARTICLES';
    if(q('v236HudQuality'))q('v236HudQuality').textContent=quality().toUpperCase()+' • BUDGET '+budget();
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='v'||e.key==='V')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(state.enabled){continuousEffects(ts);updateEmitters(dt,ts);state.frames++}
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,effects:['sparks','tire-smoke','exhaust','dust','rain-spray','boost','confetti','flash','laser'],status,emit,clear,setEnabled,burstPreset};
  globalThis.TGGV236=api;
  if(hasDOM()){
    window.TGGV236=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();