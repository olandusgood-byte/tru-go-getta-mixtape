(() => {
  const VERSION='V2.39 TGG PERFORMANCE + LOD FORGE 100';
  const LAYERS=[
    ...['performance core bridge','performance control mode','performance active tier','performance fps state','performance baseline snapshot','performance apply API','performance auto API','performance restore API','performance status API','performance persistence'],
    ...['high tier','balanced tier','performance tier','auto tier','tier hysteresis','tier promote threshold','tier demote threshold','tier stabilization','tier transition event','tier diagnostics'],
    ...['fps sampler','fps rolling window','fps average','fps minimum','fps maximum','frame delta clamp','frame sample count','sample reset','visibility pause','fps HUD'],
    ...['renderer pixel ratio','pixel ratio high','pixel ratio balanced','pixel ratio performance','pixel ratio clamp','pixel ratio baseline','renderer resize guard','camera aspect preserve','canvas resolution update','renderer diagnostics'],
    ...['shadow master toggle','shadow high','shadow balanced','shadow performance off','cast shadow trim','receive shadow preserve','shadow baseline','shadow restore','lighting quality bridge','lighting tier sync'],
    ...['crowd high density','crowd balanced density','crowd performance density','crowd bridge','crowd rebuild guard','crowd far freeze bridge','crowd restore','crowd diagnostics','npc budget sync','npc shadow trim'],
    ...['effects high enable','effects balanced enable','effects performance disable','effects bridge','effects clear on disable','effects restore','weather preserve high','weather preserve balanced','weather preserve performance','weather bridge'],
    ...['world LOD scan','world near range','world mid range','world far range','world child visibility','world shadow trim','world LOD interval','world LOD restore','interior exclusion','world diagnostics'],
    ...['material update trim','animation quality coexistence','camera quality coexistence','audio unaffected','mission unaffected','physics unaffected','movement unaffected','storage exception guard','rollback isolation','quality event'],
    ...['performance panel','mode buttons','manual apply','auto tune button','restore button','F12 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks']
  ];
  const core=()=>globalThis.TGGV239Core||globalThis.window?.TGGV239Core;
  const state={controlMode:'auto',tier:'balanced',baseline:null,frames:[],fps:60,minFps:60,maxFps:60,lastTs:0,lastEval:0,lastLod:0,ready:false,applies:0};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-performance-forge',layerCount:LAYERS.length,controlMode:state.controlMode,tier:state.tier,fps:Number(state.fps.toFixed(1)),minFps:Number(state.minFps.toFixed(1)),maxFps:Number(state.maxFps.toFixed(1)),applies:state.applies}}
  function renderer(){return hasDOM()?window.TGG3D?.renderer||null:null}
  function captureBaseline(){
    if(!hasDOM()||state.baseline)return state.baseline;const r=renderer();if(!r)return null;
    state.baseline={pixelRatio:r.getPixelRatio?.()||window.devicePixelRatio||1,shadowEnabled:!!r.shadowMap?.enabled,crowdEnabled:window.TGGV236?.status?.()?.enabled!==false,effectsEnabled:window.TGGV238?.status?.()?.enabled!==false,lightingQuality:window.TGGV231?.status?.()?.quality||'auto'};
    return state.baseline;
  }
  function playerPos(){const p=window.TGG3D?.player;return p?{x:p.position.x,z:p.position.z}:{x:0,z:0}}
  function scanWorld(cfg){
    if(!hasDOM())return;const root=window.TGGV229?.status?.().ready?window.TGG3D?.scene?.getObjectByName?.('tgg-world-forge'):null;if(!root)return;
    const p=playerPos(),far=Number(cfg.far)||44;
    root.children.forEach(ch=>{if(!ch.userData?.district)return;const d=Math.hypot(ch.position.x-p.x,ch.position.z-p.z);ch.visible=d<=far;ch.traverse?.(o=>{if(o.isMesh)o.castShadow=cfg.shadows&&d<far*.65})});
  }
  function applyTier(id='balanced'){
    const cfg=core()?.tier?.(id)||core()?.tier?.('balanced');if(!cfg)return status();state.tier=cfg.id;
    if(!hasDOM())return status();captureBaseline();const r=renderer();
    if(r){const cap=Math.min(window.devicePixelRatio||1,cfg.pixelRatio);if(r.setPixelRatio)r.setPixelRatio(cap);if(r.shadowMap)r.shadowMap.enabled=cfg.shadows}
    window.TGGV231?.setQuality?.(cfg.id);
    const npc=window.TGGV236;if(npc){if(cfg.crowd<.55)npc.setEnabled?.(false);else{npc.setEnabled?.(true);npc.refresh?.()}}
    if(cfg.fx)window.TGGV238?.setEnabled?.(true);else{window.TGGV238?.setEnabled?.(false);window.TGGV238?.clear?.()}
    if(window.TGGV233?.status?.()?.enabled===false&&cfg.weather)window.TGGV233?.setEnabled?.(true);
    scanWorld(cfg);state.applies++;state.ready=true;
    try{localStorage.setItem('tgg-v239-performance',JSON.stringify({mode:state.controlMode,tier:state.tier}))}catch{}
    window.dispatchEvent(new CustomEvent('tgg:performance-tier',{detail:{tier:state.tier,fps:state.fps}}));renderUI();return status();
  }
  function setMode(mode='auto'){
    state.controlMode=['auto','high','balanced','performance'].includes(mode)?mode:'auto';
    if(state.controlMode!=='auto')applyTier(state.controlMode);else autoTune(true);
    renderUI();return state.controlMode;
  }
  function autoTune(force=false){
    const next=core()?.chooseTier?.(state.fps,state.tier)||state.tier;
    if(force||next!==state.tier)applyTier(next);return next;
  }
  function restore(){
    if(!hasDOM()){state.controlMode='auto';return status()}const b=state.baseline,r=renderer();
    if(b&&r){r.setPixelRatio?.(Math.min(window.devicePixelRatio||1,b.pixelRatio));if(r.shadowMap)r.shadowMap.enabled=b.shadowEnabled}
    if(b){window.TGGV236?.setEnabled?.(b.crowdEnabled);if(b.crowdEnabled)window.TGGV236?.refresh?.();window.TGGV238?.setEnabled?.(b.effectsEnabled);window.TGGV231?.setQuality?.(b.lightingQuality)}
    const root=window.TGG3D?.scene?.getObjectByName?.('tgg-world-forge');root?.children?.forEach(ch=>{ch.visible=true;ch.traverse?.(o=>{if(o.isMesh)o.castShadow=true})});
    state.controlMode='auto';state.tier='balanced';renderUI();return status();
  }
  function sample(ts){
    if(!state.lastTs){state.lastTs=ts;return}const dt=ts-state.lastTs;state.lastTs=ts;if(dt<=0||dt>250)return;
    const fps=1000/dt;state.frames.push(fps);if(state.frames.length>90)state.frames.shift();const sorted=[...state.frames].sort((a,b)=>a-b);state.fps=state.frames.reduce((a,b)=>a+b,0)/state.frames.length;state.minFps=sorted[Math.floor(sorted.length*.08)]||state.fps;state.maxFps=sorted[Math.floor(sorted.length*.92)]||state.fps;
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v239');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v239ForgeBtn')){const b=document.createElement('button');b.id='v239ForgeBtn';b.className='v239-forge-btn';b.textContent='PERF';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v239ForgePanel';panel.className='v239-forge-panel';panel.innerHTML='<small>TGG RUNTIME</small><b>PERFORMANCE + LOD FORGE</b><div class="v239-grid"><button data-mode="auto">AUTO</button><button data-mode="high">HIGH</button><button data-mode="balanced">BALANCED</button><button data-mode="performance">PERFORMANCE</button></div><div class="v239-grid"><button id="v239Tune">AUTO TUNE NOW</button><button id="v239Restore">RESTORE BASE</button></div><div id="v239Stats"></div>';document.body.appendChild(panel);panel.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.getElementById('v239Tune').onclick=()=>autoTune(true);document.getElementById('v239Restore').onclick=restore}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v239ForgeHud';hud.className='v239-forge-hud';city.appendChild(hud)}renderUI();
  }
  function renderUI(){if(!hasDOM())return;if(hud)hud.innerHTML='<small>TGG PERFORMANCE</small><b>'+state.tier.toUpperCase()+' • '+state.fps.toFixed(0)+' FPS</b><span>'+state.controlMode.toUpperCase()+' CONTROL</span>';const s=document.getElementById('v239Stats');if(s)s.textContent='AVG '+state.fps.toFixed(1)+' • LOW '+state.minFps.toFixed(1)+' • HIGH '+state.maxFps.toFixed(1);panel?.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.controlMode))}
  function keyHandler(e){if(e.key==='F12'){e.preventDefault();panel?.classList.toggle('active')}}
  function load(){if(!hasDOM())return;try{const x=JSON.parse(localStorage.getItem('tgg-v239-performance')||'{}');if(['auto','high','balanced','performance'].includes(x.mode))state.controlMode=x.mode;if(['high','balanced','performance'].includes(x.tier))state.tier=x.tier}catch{}}
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();captureBaseline();sample(ts);
    if(state.controlMode==='auto'&&ts-state.lastEval>2500&&state.frames.length>30){state.lastEval=ts;autoTune(false)}
    if(ts-state.lastLod>1000){state.lastLod=ts;scanWorld(core()?.tier?.(state.tier)||{})}
    state.ready=true;renderUI();
  }
  load();const api={version:VERSION,layers:LAYERS,modes:['auto','high','balanced','performance'],status,setMode,applyTier,autoTune,restore};globalThis.TGGV239=api;
  if(hasDOM()){window.TGGV239=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();