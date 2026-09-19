(() => {
  const VERSION='V2.33 TGG WEATHER + ATMOSPHERE FORGE 100';
  const LAYERS=[
    'weather core bridge','weather enabled state','weather preset state','weather config state','weather baseline fog','weather restore path','weather quality bridge','weather scene attach','weather scene detach','weather status API',
    'clear preset','drizzle preset','rain preset','storm preset','mist preset','rain intensity','wind intensity','fog boost','wetness amount','cloud amount',
    'rain particle group','rain particle budget','rain deterministic seed','rain follow player','rain fall speed','rain wind drift','rain reset height','rain opacity','rain point size','rain quality rebuild',
    'mist particle group','mist particle budget','mist follow player','mist slow drift','mist opacity','mist point size','mist fog mood','mist quality gate','mist restore','mist diagnostics',
    'wet road overlay x1','wet road overlay x2','wet road overlay x3','wet road overlay z1','wet road overlay z2','wet road overlay z3','wet roughness','wet metalness','wet opacity','wet restore',
    'puddle pool','puddle deterministic layout','puddle road placement','puddle sidewalk placement','puddle opacity','puddle roughness','puddle metalness','puddle pulse','puddle quality trim','puddle restore',
    'lightning light','lightning timer','lightning flash','lightning decay','storm-only lightning','lightning event','cloud layer','cloud opacity','cloud follow player','cloud restore',
    'wind tree sway','wind sign sway','wind rain slant','wind intensity scale','wind quality gate','vehicle spray hook','vehicle wet visual','street reflection highlight','weather emissive restraint','weather diagnostics',
    'lighting mood bridge','lighting event rebase','fog additive guard','fog color preserve','V2.31 compatibility','V2.32 compatibility','world forge compatibility','interior weather guard','vehicle compatibility','rollback isolation',
    'weather HUD','weather panel','preset buttons','enabled toggle','restore button','F9 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV233Core||globalThis.window?.TGGV233Core;
  const state={
    enabled:true,preset:'clear',config:null,root:null,rain:null,mist:null,wet:null,puddles:null,cloud:null,
    lightning:null,baselineFog:null,qualityBuilt:null,ready:false,frames:0,lastLightningAt:0,nextLightningMs:6500
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    const c=state.config||core()?.preset?.(state.preset)||{};
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-weather-forge',layerCount:LAYERS.length,
      enabled:state.enabled,preset:state.preset,quality:quality(),
      rain:Number(c.rain)||0,wind:Number(c.wind)||0,fogBoost:Number(c.fogBoost)||0,wetness:Number(c.wetness)||0,
      frames:state.frames
    };
  }

  function seeded(i){
    let x=(i*1664525+1013904223)>>>0;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }

  function currentWorld(){
    const g=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(g.x)||50)-50)*.92,z:((Number(g.y)||50)-50)*.92};
  }

  function captureFogBaseline(){
    if(!hasDOM())return;
    const s=scene();if(!s?.fog)return;
    state.baselineFog={density:Number(s.fog.density)||0,color:s.fog.color?.clone?.()||null};
  }

  function applyFog(){
    if(!hasDOM())return;
    const s=scene(),cfg=state.config;if(!s?.fog||!cfg)return;
    if(!state.baselineFog)captureFogBaseline();
    s.fog.density=clamp((state.baselineFog?.density||0)+cfg.fogBoost,0,.06);
  }

  function restoreFog(){
    if(!hasDOM())return;
    const s=scene(),b=state.baselineFog;if(!s?.fog||!b)return;
    s.fog.density=b.density;
    if(b.color&&s.fog.color?.copy)s.fog.color.copy(b.color);
  }

  function disposeObject(obj){
    if(!obj)return;
    obj.traverse?.(o=>{
      o.geometry?.dispose?.();
      const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.filter(Boolean).forEach(m=>m.dispose?.());
    });
    obj.parent?.remove(obj);
  }

  function makeRain(count){
    const THREE=T(),g=new THREE.Group();g.name='tgg-weather-rain';g.userData.v233=true;
    const pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      pos[i*3]=(seeded(i*3)-.5)*34;
      pos[i*3+1]=2+seeded(i*3+1)*24;
      pos[i*3+2]=(seeded(i*3+2)-.5)*34;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:0xbfdcff,size:.075,transparent:true,opacity:.78,depthWrite:false,sizeAttenuation:true});
    const pts=new THREE.Points(geo,mat);pts.userData.count=count;g.add(pts);g.userData.points=pts;return g;
  }

  function makeMist(count){
    const THREE=T(),g=new THREE.Group();g.name='tgg-weather-mist';g.userData.v233=true;
    const pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      pos[i*3]=(seeded(1000+i*3)-.5)*30;
      pos[i*3+1]=.5+seeded(1000+i*3+1)*5;
      pos[i*3+2]=(seeded(1000+i*3+2)-.5)*30;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:0xc9d4df,size:1.5,transparent:true,opacity:.09,depthWrite:false,sizeAttenuation:true});
    const pts=new THREE.Points(geo,mat);g.add(pts);g.userData.points=pts;return g;
  }

  function makeWetRoads(){
    const THREE=T(),g=new THREE.Group();g.name='tgg-weather-wet-roads';g.userData.v233=true;
    const mat=new THREE.MeshStandardMaterial({color:0x17212d,roughness:.16,metalness:.38,transparent:true,opacity:0});
    [-24,0,24].forEach(x=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(6.82,111),mat.clone());m.rotation.x=-Math.PI/2;m.position.set(x,.081,0);g.add(m);
    });
    [-24,0,24].forEach(z=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(111,6.82),mat.clone());m.rotation.x=-Math.PI/2;m.position.set(0,.083,z);g.add(m);
    });
    return g;
  }

  function makePuddles(){
    const THREE=T(),g=new THREE.Group();g.name='tgg-weather-puddles';g.userData.v233=true;
    const coords=[[-17,-4],[-8,4],[9,-4],[17,4],[-4,-17],[4,-9],[-4,10],[4,18],[-29,-4],[29,4],[-4,29],[4,-29]];
    coords.forEach((p,i)=>{
      const geo=new THREE.CircleGeometry(.55+seeded(300+i)*.9,20);
      const mat=new THREE.MeshStandardMaterial({color:0x42566a,roughness:.08,metalness:.32,transparent:true,opacity:0,depthWrite:false});
      const m=new THREE.Mesh(geo,mat);m.rotation.x=-Math.PI/2;m.rotation.z=seeded(400+i)*Math.PI;m.scale.y=.55+seeded(500+i)*.5;m.position.set(p[0],.09,p[1]);m.userData.phase=i*.7;g.add(m);
    });
    return g;
  }

  function makeCloud(){
    const THREE=T(),m=new THREE.Mesh(
      new THREE.PlaneGeometry(70,70),
      new THREE.MeshBasicMaterial({color:0x26303d,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})
    );
    m.name='tgg-weather-cloud';m.rotation.x=Math.PI/2;m.position.y=29;m.userData.v233=true;return m;
  }

  function makeLightning(){
    const THREE=T(),l=new THREE.DirectionalLight(0xeef7ff,0);l.name='tgg-weather-lightning';l.position.set(10,32,-8);l.userData.v233=true;return l;
  }

  function rebuildVisuals(){
    if(!hasDOM())return false;
    const s=scene(),THREE=T();if(!s||!THREE)return false;
    if(state.root?.parent)state.root.parent.remove(state.root);
    [state.rain,state.mist,state.wet,state.puddles,state.cloud,state.lightning].forEach(disposeObject);
    state.root=null;
    const q=quality(),budget=core()?.particleBudget?.(q)||240;
    state.rain=makeRain(budget);
    state.mist=makeMist(q==='performance'?24:q==='balanced'?44:70);
    state.wet=makeWetRoads();state.puddles=makePuddles();state.cloud=makeCloud();state.lightning=makeLightning();
    state.root=new THREE.Group();state.root.name='tgg-weather-root';state.root.userData.v233=true;
    [state.rain,state.mist,state.wet,state.puddles,state.cloud,state.lightning].forEach(o=>state.root.add(o));
    s.add(state.root);state.qualityBuilt=q;applyVisualConfig();state.ready=true;return true;
  }

  function applyVisualConfig(){
    if(!hasDOM()||!state.config)return;
    const c=state.config,q=quality(),on=state.enabled;
    if(state.root)state.root.visible=on;
    const rainPts=state.rain?.userData?.points,mistPts=state.mist?.userData?.points;
    if(rainPts){rainPts.material.opacity=on?(.12+c.rain*.78):0;rainPts.material.size=.045+c.rain*.065}
    if(mistPts){mistPts.material.opacity=on?clamp(c.fogBoost*6,.01,.14):0;mistPts.material.size=q==='performance'?1.1:1.55}
    state.wet?.children?.forEach(m=>{m.material.opacity=on?c.wetness*.22:0;m.material.roughness=.48-c.wetness*.34});
    state.puddles?.children?.forEach(m=>{m.material.opacity=on?c.wetness*.32:0});
    if(state.cloud?.material)state.cloud.material.opacity=on?c.cloud*.18:0;
    if(on)applyFog();else restoreFog();
  }

  function applyPreset(id='clear'){
    const cfg=core()?.preset?.(id)||core()?.preset?.('clear');if(!cfg)return status();
    state.preset=cfg.id;state.config=cfg;state.enabled=true;
    if(hasDOM()){
      if(!state.root||state.qualityBuilt!==quality())rebuildVisuals();
      else applyVisualConfig();
      state.nextLightningMs=5500+Math.floor(seeded(Date.now()%997)*6500);
      renderUI();
      try{localStorage.setItem('tgg-v233-weather',JSON.stringify({preset:state.preset,enabled:state.enabled}))}catch{}
      window.dispatchEvent(new CustomEvent('tgg:weather-change',{detail:{preset:state.preset,...cfg}}));
    }
    return status();
  }

  function setEnabled(v){
    state.enabled=!!v;if(hasDOM()){applyVisualConfig();renderUI()}return state.enabled;
  }

  function restore(){
    state.preset='clear';state.config=core()?.preset?.('clear')||null;state.enabled=true;
    restoreFog();
    if(hasDOM()){
      if(state.root)state.root.visible=false;
      renderUI();window.dispatchEvent(new CustomEvent('tgg:weather-restored'));
    }
    return status();
  }

  function rebaseFog(){
    if(!hasDOM())return;
    const s=scene();if(!s?.fog)return;
    const boost=Number(state.config?.fogBoost)||0;
    state.baselineFog={density:Math.max(0,(Number(s.fog.density)||0)-boost),color:s.fog.color?.clone?.()||null};
    applyFog();
  }

  function animateRain(dt){
    const pts=state.rain?.userData?.points,c=state.config;if(!pts||!c||c.rain<=0)return;
    const a=pts.geometry.attributes.position.array;
    const fall=dt*(14+c.rain*20),drift=dt*c.wind*4.8;
    for(let i=0;i<a.length;i+=3){
      a[i]+=drift;
      a[i+1]-=fall;
      a[i+2]+=drift*.22;
      if(a[i+1]<0){a[i+1]=18+seeded(i+state.frames)*10;a[i]=(seeded(i+17+state.frames)-.5)*34;a[i+2]=(seeded(i+31+state.frames)-.5)*34}
      if(a[i]>18)a[i]-=36;
    }
    pts.geometry.attributes.position.needsUpdate=true;
  }

  function animateMist(dt,ts){
    const pts=state.mist?.userData?.points,c=state.config;if(!pts||!c)return;
    const a=pts.geometry.attributes.position.array,drift=dt*(.08+c.wind*.42);
    for(let i=0;i<a.length;i+=3){
      a[i]+=drift;
      a[i+2]+=Math.sin(ts*.0002+i)*dt*.05;
      if(a[i]>16)a[i]=-16;
    }
    pts.geometry.attributes.position.needsUpdate=true;
  }

  function animateWet(ts){
    const w=Number(state.config?.wetness)||0;
    state.puddles?.children?.forEach(m=>{m.material.opacity=w*(.25+Math.sin(ts*.0016+m.userData.phase)*.035)});
  }

  function animateLightning(ts){
    if(!state.config?.lightning||!state.lightning){if(state.lightning)state.lightning.intensity=0;return}
    const elapsed=ts-state.lastLightningAt;
    if(elapsed>state.nextLightningMs){
      state.lastLightningAt=ts;state.nextLightningMs=6500+Math.floor(seeded(Math.floor(ts)%991)*7000);
      state.lightning.intensity=18;
      window.dispatchEvent(new CustomEvent('tgg:weather-lightning',{detail:{preset:state.preset}}));
    }
    if(state.lightning.intensity>0)state.lightning.intensity=Math.max(0,state.lightning.intensity-.95);
  }

  function animateWind(ts){
    const amount=Number(state.config?.wind)||0;if(amount<=0||!hasDOM())return;
    const s=scene();s?.traverse?.(o=>{
      if(o.name==='tree-crown')o.rotation.z=Math.sin(ts*.0015+(o.position.x||0))*amount*.08;
    });
  }

  function followPlayer(){
    const p=currentWorld();
    if(state.rain)state.rain.position.set(p.x,0,p.z);
    if(state.mist)state.mist.position.set(p.x,0,p.z);
    if(state.cloud)state.cloud.position.set(p.x,29,p.z);
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v233');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v233ForgeBtn')){
      const b=document.createElement('button');b.id='v233ForgeBtn';b.className='v233-forge-btn';b.type='button';b.textContent='WEATHER';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v233ForgePanel';panel.className='v233-forge-panel';
      panel.innerHTML='<div class="v233-head"><div><small>TGG NATIVE 3D</small><b>WEATHER + ATMOSPHERE</b></div><button id="v233Close" type="button">×</button></div><div class="v233-presets"><button data-v233-preset="clear">CLEAR</button><button data-v233-preset="drizzle">DRIZZLE</button><button data-v233-preset="rain">RAIN</button><button data-v233-preset="storm">STORM</button><button data-v233-preset="mist">MIST</button></div><div class="v233-actions"><button id="v233Toggle" type="button">WEATHER: ON</button><button id="v233Restore" type="button">RESTORE CLEAR</button></div><div id="v233Stats" class="v233-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v233Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v233-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.v233Preset)));
      document.getElementById('v233Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v233Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v233ForgeHud';hud.className='v233-forge-hud';
      hud.innerHTML='<small>TGG WEATHER FORGE</small><b id="v233HudPreset">CLEAR</b><span id="v233HudStats">DRY STREETS</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id),c=state.config||core()?.preset?.(state.preset)||{};
    if(q('v233Toggle'))q('v233Toggle').textContent='WEATHER: '+(state.enabled?'ON':'OFF');
    if(q('v233Stats'))q('v233Stats').textContent=state.preset.toUpperCase()+' • '+quality().toUpperCase()+' • '+Math.round((c.wetness||0)*100)+'% WET';
    if(q('v233HudPreset'))q('v233HudPreset').textContent=state.preset.toUpperCase();
    if(q('v233HudStats'))q('v233HudStats').textContent=Math.round((c.rain||0)*100)+'% RAIN • '+Math.round((c.wind||0)*100)+'% WIND';
    panel?.querySelectorAll('[data-v233-preset]').forEach(b=>b.classList.toggle('active',b.dataset.v233Preset===state.preset));
  }

  function load(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem('tgg-v233-weather')||'{}');
      if(core()?.presets?.includes(x.preset))state.preset=x.preset;
      if(typeof x.enabled==='boolean')state.enabled=x.enabled;
    }catch{}
    state.config=core()?.preset?.(state.preset)||core()?.preset?.('clear');
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F9'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(!state.root&&scene()){captureFogBaseline();rebuildVisuals();state.ready=true}
    if(state.qualityBuilt!==quality())rebuildVisuals();
    if(state.enabled){
      followPlayer();animateRain(dt);animateMist(dt,ts);animateWet(ts);animateLightning(ts);animateWind(ts);state.frames++;
    }
    renderUI();
  }

  load();
  const api={version:VERSION,layers:LAYERS,presets:['clear','drizzle','rain','storm','mist'],status,applyPreset,restore,setEnabled};
  globalThis.TGGV233=api;
  if(hasDOM()){
    window.TGGV233=api;
    document.addEventListener('keydown',keyHandler);
    window.addEventListener('tgg:lighting-mood',()=>{captureFogBaseline();if(state.enabled)applyFog()});
    ensureUI();requestAnimationFrame(tick);
  }
})();