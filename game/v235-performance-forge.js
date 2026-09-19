(() => {
  const VERSION='V2.35 TGG PERFORMANCE + LOD FORGE 100';
  const LAYERS=[
    'performance core bridge','performance enabled state','performance selected mode','performance active profile','performance FPS sample','performance FPS EMA','performance hysteresis','performance mobile detect','performance status API','performance diagnostics',
    'auto mode','high mode','balanced mode','performance mode','profile persistence','profile transition','profile event','profile cooldown','profile manual lock','profile restore',
    'world forge discovery','world district discovery','world subject position','world distance measure','world mesh distance high','world mesh distance balanced','world mesh distance performance','district visibility cull','district visibility restore','district hysteresis',
    'shadow mesh discovery','shadow forge scope','shadow distance sort','shadow high budget','shadow balanced budget','shadow performance budget','shadow cast trim','shadow receive preserve','shadow baseline cache','shadow restore',
    'rain points discovery','mist points discovery','particle draw range high','particle draw range balanced','particle draw range performance','particle scale apply','particle baseline cache','particle rebuild detect','particle restore','particle diagnostics',
    'renderer discovery','renderer pixel ratio baseline','pixel ratio high','pixel ratio balanced','pixel ratio performance','pixel ratio apply','pixel ratio restore','renderer size preserve','renderer compatibility','renderer diagnostics',
    'character forge always visible','vehicle forge always visible','interior forge always visible','world forge LOD only','weather particle bridge','lighting shadow bridge','camera compatibility','animation compatibility','quality isolation','rollback isolation',
    'FPS 30 sample','FPS 60 sample','frame delta clamp','sample window','sample min frames','auto downgrade','auto upgrade','upgrade delay','downgrade delay','mobile high guard',
    'visibility baseline map','shadow baseline map','particle baseline map','baseline cleanup','scene rescan','new mesh adoption','new particle adoption','world rebuild adoption','weather rebuild adoption','restore all',
    'performance HUD','performance panel','mode buttons','enabled toggle','restore button','F10 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,selectedMode:'auto',activeProfile:'balanced',fpsEMA:60,lastFps:60,
    lastTs:0,frames:0,sampleFrames:0,sampleMs:0,candidate:null,candidateCount:0,
    lastSwitchAt:0,ready:false,scans:0,culledDistricts:0,shadowedMeshes:0,particleCount:0
  };
  const visibilityBaseline=new Map();
  const shadowBaseline=new Map();
  const particleBaseline=new Map();
  let rendererBaseline=null,panel=null,hud=null,lastApply=0;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const renderer=()=>hasDOM()?window.TGG3D?.renderer||null:null;
  const isMobile=()=>hasDOM()&&(window.matchMedia?.('(pointer:coarse)').matches||window.innerWidth<760);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    const p=core()?.profile?.(state.activeProfile)||{};
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-performance-forge',layerCount:LAYERS.length,
      enabled:state.enabled,selectedMode:state.selectedMode,activeProfile:state.activeProfile,
      fps:Number(state.fpsEMA.toFixed(1)),mobile:isMobile(),meshDistance:p.meshDistance||0,
      shadowBudget:p.shadowBudget||0,particleScale:p.particleScale||0,
      culledDistricts:state.culledDistricts,shadowedMeshes:state.shadowedMeshes,
      particleCount:state.particleCount,scans:state.scans
    };
  }

  function profile(){
    return core()?.profile?.(state.activeProfile)||core()?.profile?.('balanced');
  }

  function subjectPosition(){
    const gs=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    if(gs.inVehicle&&window.TGG3D?.car?.position)return window.TGG3D.car.position;
    if(window.TGG3D?.player?.position)return window.TGG3D.player.position;
    return {x:0,y:0,z:0};
  }

  function distanceTo(obj,subject){
    if(!obj||!subject)return Infinity;
    const p=obj.getWorldPosition&&hasDOM()?obj.getWorldPosition(new window.THREE.Vector3()):obj.position||{x:0,z:0};
    return Math.hypot((Number(p.x)||0)-(Number(subject.x)||0),(Number(p.z)||0)-(Number(subject.z)||0));
  }

  function worldRoot(){
    return scene()?.getObjectByName?.('tgg-world-forge')||null;
  }

  function isForgeMesh(o){
    if(!o?.isMesh)return false;
    let p=o;
    while(p&&p!==scene()){
      if(p.userData?.v227Forge||p.userData?.v228Forge||p.userData?.v229||p.userData?.v230||
         ['tgg-forge-player','tgg-forge-car','tgg-world-forge','tgg-interior-forge'].includes(p.name))return true;
      p=p.parent;
    }
    return false;
  }

  function captureVisible(o){
    if(o&&!visibilityBaseline.has(o))visibilityBaseline.set(o,!!o.visible);
  }
  function captureShadow(o){
    if(o&&!shadowBaseline.has(o))shadowBaseline.set(o,!!o.castShadow);
  }
  function captureParticle(points){
    if(!points||particleBaseline.has(points))return;
    const range=points.geometry?.drawRange||{start:0,count:Infinity};
    particleBaseline.set(points,{start:Number(range.start)||0,count:Number.isFinite(range.count)?range.count:Infinity});
  }

  function applyWorldCulling(p){
    const root=worldRoot();if(!root)return;
    const subject=subjectPosition();let culled=0;
    root.children.forEach(child=>{
      if(!child.userData?.district)return;
      captureVisible(child);
      const d=distanceTo(child,subject);
      const margin=child.visible?4:0;
      const visible=d<=p.meshDistance+margin;
      child.visible=visible;
      if(!visible)culled++;
    });
    state.culledDistricts=culled;
  }

  function applyShadows(p){
    const s=scene();if(!s)return;
    const subject=subjectPosition(),items=[];
    s.traverse(o=>{
      if(!isForgeMesh(o))return;
      captureShadow(o);
      items.push({o,d:distanceTo(o,subject)});
    });
    items.sort((a,b)=>a.d-b.d);
    const budget=Math.max(0,Math.min(items.length,Math.round(p.shadowBudget)));
    items.forEach((item,i)=>{item.o.castShadow=i<budget&&shadowBaseline.get(item.o)!==false});
    state.shadowedMeshes=budget;
  }

  function findWeatherPoints(){
    const s=scene();if(!s)return[];
    const out=[];
    for(const name of ['tgg-weather-rain','tgg-weather-mist']){
      const g=s.getObjectByName?.(name);
      g?.traverse?.(o=>{if(o.isPoints)out.push(o)});
    }
    return out;
  }

  function applyParticles(p){
    const pts=findWeatherPoints();let shown=0;
    pts.forEach(points=>{
      captureParticle(points);
      const attr=points.geometry?.attributes?.position;
      const total=Number(attr?.count)||0;
      const count=Math.max(1,Math.min(total,Math.floor(total*p.particleScale)));
      points.geometry?.setDrawRange?.(0,count);
      shown+=count;
    });
    state.particleCount=shown;
  }

  function captureRenderer(){
    const r=renderer();if(!r||rendererBaseline)return;
    rendererBaseline={pixelRatio:Number(r.getPixelRatio?.())||Number(window.devicePixelRatio)||1};
  }

  function applyPixelRatio(){
    const r=renderer();if(!r?.setPixelRatio)return;
    captureRenderer();
    const dpr=Math.max(1,Number(window.devicePixelRatio)||1);
    const cap=state.activeProfile==='high'?1.75:state.activeProfile==='balanced'?1.35:1;
    const target=Math.min(dpr,cap);
    if(Math.abs((Number(r.getPixelRatio?.())||1)-target)>.02)r.setPixelRatio(target);
  }

  function restoreWorld(){
    for(const [o,v] of visibilityBaseline.entries())if(o)o.visible=v;
    visibilityBaseline.clear();state.culledDistricts=0;
  }
  function restoreShadows(){
    for(const [o,v] of shadowBaseline.entries())if(o)o.castShadow=v;
    shadowBaseline.clear();state.shadowedMeshes=0;
  }
  function restoreParticles(){
    for(const [points,b] of particleBaseline.entries()){
      if(points?.geometry?.setDrawRange)points.geometry.setDrawRange(b.start,b.count);
    }
    particleBaseline.clear();state.particleCount=0;
  }
  function restoreRenderer(){
    const r=renderer();if(r?.setPixelRatio&&rendererBaseline)r.setPixelRatio(rendererBaseline.pixelRatio);
    rendererBaseline=null;
  }

  function restoreAll(){
    restoreWorld();restoreShadows();restoreParticles();restoreRenderer();
  }

  function setActiveProfile(id,reason='manual'){
    const next=core()?.profiles?.includes(id)?id:'balanced';
    if(next===state.activeProfile)return false;
    state.activeProfile=next;state.lastSwitchAt=Date.now();state.candidate=null;state.candidateCount=0;
    if(hasDOM()){
      applyBudgets(true);renderUI();
      window.dispatchEvent(new CustomEvent('tgg:performance-profile',{detail:{profile:next,reason,fps:state.fpsEMA}}));
    }
    return true;
  }

  function setMode(mode='auto'){
    state.selectedMode=['auto','high','balanced','performance'].includes(mode)?mode:'auto';
    if(state.selectedMode==='auto'){
      const next=core()?.select?.({fps:state.fpsEMA,mobile:isMobile()})||'balanced';
      setActiveProfile(next,'auto-mode');
    }else setActiveProfile(state.selectedMode,'manual');
    if(hasDOM()){
      try{localStorage.setItem('tgg-v235-performance',state.selectedMode)}catch{}
      renderUI();
    }
    return status();
  }

  function sample(fpsValue){
    const fps=clamp(Number(fpsValue)||0,1,240);
    state.lastFps=fps;state.fpsEMA=state.frames?state.fpsEMA*.82+fps*.18:fps;
    if(!state.enabled||state.selectedMode!=='auto')return state.activeProfile;
    const candidate=core()?.select?.({fps:state.fpsEMA,mobile:isMobile()})||'balanced';
    if(candidate===state.activeProfile){state.candidate=null;state.candidateCount=0;return state.activeProfile}
    if(candidate!==state.candidate){state.candidate=candidate;state.candidateCount=1}
    else state.candidateCount++;
    const rank={performance:0,balanced:1,high:2};
    const downgrade=rank[candidate]<rank[state.activeProfile];
    const needed=downgrade?2:5;
    const cooldown=downgrade?1000:5000;
    if(state.candidateCount>=needed&&Date.now()-state.lastSwitchAt>=cooldown)setActiveProfile(candidate,downgrade?'fps-downgrade':'fps-upgrade');
    return state.activeProfile;
  }

  function applyBudgets(force=false){
    if(!hasDOM()||!state.enabled)return;
    const now=performance.now();if(!force&&now-lastApply<500)return;lastApply=now;
    const p=profile();applyWorldCulling(p);applyShadows(p);applyParticles(p);applyPixelRatio();state.scans++;state.ready=true;
  }

  function setEnabled(v){
    state.enabled=!!v;
    if(!state.enabled)restoreAll();else applyBudgets(true);
    renderUI();return state.enabled;
  }

  function restore(){
    state.enabled=false;restoreAll();renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:performance-restored'));
    return status();
  }

  function load(){
    if(!hasDOM())return;
    try{
      const m=localStorage.getItem('tgg-v235-performance');
      if(['auto','high','balanced','performance'].includes(m))state.selectedMode=m;
    }catch{}
    if(state.selectedMode!=='auto')state.activeProfile=state.selectedMode;
    else state.activeProfile=core()?.select?.({fps:60,mobile:isMobile()})||'balanced';
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='PERF';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>PERFORMANCE + LOD FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-modes"><button data-v235-mode="auto">AUTO</button><button data-v235-mode="high">HIGH</button><button data-v235-mode="balanced">BALANCED</button><button data-v235-mode="performance">PERFORMANCE</button></div><div class="v235-actions"><button id="v235Toggle" type="button">LOD FORGE: ON</button><button id="v235Restore" type="button">RESTORE BASE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.v235Mode)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG PERFORMANCE FORGE</small><b id="v235HudMode">BALANCED</b><span id="v235HudStats">60 FPS</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='LOD FORGE: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.activeProfile.toUpperCase()+' • '+state.fpsEMA.toFixed(1)+' FPS • '+state.culledDistricts+' DISTRICTS CULLED • '+state.shadowedMeshes+' SHADOWS';
    if(q('v235HudMode'))q('v235HudMode').textContent=state.activeProfile.toUpperCase()+(state.selectedMode==='auto'?' • AUTO':'');
    if(q('v235HudStats'))q('v235HudStats').textContent=state.fpsEMA.toFixed(0)+' FPS • '+state.particleCount+' PARTICLES';
    panel?.querySelectorAll('[data-v235-mode]').forEach(b=>b.classList.toggle('active',b.dataset.v235Mode===state.selectedMode));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(state.lastTs){
      const dt=Math.min(100,Math.max(1,ts-state.lastTs));state.sampleFrames++;state.sampleMs+=dt;
      if(state.sampleMs>=1000){
        const fps=state.sampleFrames*1000/state.sampleMs;sample(fps);state.sampleFrames=0;state.sampleMs=0;
      }
    }
    state.lastTs=ts;state.frames++;
    if(state.enabled)applyBudgets(false);
    renderUI();
  }

  load();
  const api={version:VERSION,layers:LAYERS,modes:['auto','high','balanced','performance'],status,setMode,setEnabled,restore,sample};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();