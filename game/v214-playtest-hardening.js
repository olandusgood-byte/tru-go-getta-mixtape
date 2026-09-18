(() => {
  const VERSION='V2.14 PLAYTEST HARDENING 100';
  const SNAP='tgg-v214-last-known-good';
  const LAYERS=[
    'global pointer release','global pointer cancel','window blur input clear','visibility input clear','touch end input clear','touch cancel input clear','escape pause','escape resume','fullscreen action','fullscreen state sync',
    'diagnostics toggle','diagnostics keyboard shortcut','fps sampler','fps average','quality readout','webgl state readout','online state readout','storage state readout','gamepad state readout','mission state readout',
    'vehicle condition readout','traffic count readout','pedestrian count readout','particle count readout','district readout','error count readout','warning count readout','release health readout','diagnostic refresh throttle','diagnostic aria label',
    'webgl context lost alert','webgl context restore alert','context loss prevention','renderer availability guard','renderer shadow fallback','performance shadow trim','balanced shadow restore','high shadow restore','extra pedestrian shadow trim','extra traffic shadow trim',
    'gamepad connect alert','gamepad disconnect alert','impact gamepad rumble','mission gamepad rumble','repair gamepad rumble','controller vibration guard','controller effect fallback','navigator gamepad guard','controller diagnostics','controller status persistence',
    'local storage probe','storage exception guard','last known good snapshot','snapshot mission complete','snapshot repair','snapshot visibility hide','snapshot interval','snapshot timestamp','snapshot diagnostics','snapshot size guard',
    'player coordinate guard','player heading guard','player cash guard','player xp guard','player level guard','vehicle speed guard','vehicle state guard','nan state repair','bounds state repair','state repair toast',
    'online event tracking','offline event tracking','offline status badge','online status badge','window error capture','rejection capture','error ring buffer','warning ring buffer','error diagnostic count','error nonblocking behavior',
    'mobile safe area top','mobile safe area bottom','touch target minimum','touch action safety','landscape control compaction','portrait diagnostic compaction','small screen overlay trim','reduced motion hardening','focus visible outlines','high contrast diagnostics',
    'visibility particle pause bridge','performance population bridge','performance effects bridge','quality class bridge','fullscreen css bridge','diagnostic css bridge','status api','layer manifest api','snapshot api','release QA hooks'
  ];
  const state={
    ready:false,fps:0,quality:'high',webgl:'ready',online:navigator.onLine!==false,
    storageHealthy:true,gamepad:false,gamepadId:'',errors:[],warnings:[],snapshots:0,
    lastSnapshotAt:0,lastRepairAt:0,lastFrame:performance.now(),frames:[],diagOpen:false
  };
  let panel=null,diagBtn=null,fullBtn=null,refreshTimer=0,snapshotTimer=0,lastRender=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const $=id=>document.getElementById(id);

  function install(){
    document.body.classList.add('tgg-v214');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    const top=document.querySelector('.topbar');
    if(top&&!$('v214FullBtn')){
      fullBtn=document.createElement('button');fullBtn.id='v214FullBtn';fullBtn.className='v214-mini-btn';fullBtn.type='button';fullBtn.textContent='FULL';
      fullBtn.setAttribute('aria-label','Toggle fullscreen play mode');fullBtn.addEventListener('click',toggleFullscreen);top.appendChild(fullBtn);
    }else fullBtn=$('v214FullBtn');
    if(top&&!$('v214DiagBtn')){
      diagBtn=document.createElement('button');diagBtn.id='v214DiagBtn';diagBtn.className='v214-mini-btn';diagBtn.type='button';diagBtn.textContent='DIAG';
      diagBtn.setAttribute('aria-label','Open playtest diagnostics');diagBtn.addEventListener('click',toggleDiag);top.appendChild(diagBtn);
    }else diagBtn=$('v214DiagBtn');
    if(!$('v214DiagPanel')){
      panel=document.createElement('aside');panel.id='v214DiagPanel';panel.className='v214-diag-panel';panel.setAttribute('aria-label','Playtest diagnostics');
      panel.innerHTML='<div class="v214-diag-head"><b>PLAYTEST HEALTH</b><button id="v214DiagClose" type="button">×</button></div><div id="v214DiagGrid" class="v214-diag-grid"></div><div class="v214-diag-actions"><button id="v214SnapshotBtn" type="button">SAVE SNAPSHOT</button><button id="v214RecoverBtn" type="button">STATE GUARD</button></div>';
      document.body.appendChild(panel);
      $('v214DiagClose')?.addEventListener('click',()=>setDiag(false));
      $('v214SnapshotBtn')?.addEventListener('click',()=>snapshot('manual'));
      $('v214RecoverBtn')?.addEventListener('click',()=>guardPlayerState(true));
    }else panel=$('v214DiagPanel');
    document.body.classList.toggle('v214-offline',!state.online);
    document.body.classList.toggle('v214-fullscreen',!!document.fullscreenElement);
  }

  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    }catch(e){warn('fullscreen',e?.message||'Fullscreen unavailable');window.__tggToast?.('FULLSCREEN NOT AVAILABLE');}
  }
  function setDiag(on){
    state.diagOpen=!!on;panel?.classList.toggle('active',state.diagOpen);diagBtn?.classList.toggle('active',state.diagOpen);renderDiag(true);
  }
  function toggleDiag(){setDiag(!state.diagOpen)}

  function storageProbe(){
    try{
      const k='tgg-v214-storage-probe';localStorage.setItem(k,'1');localStorage.removeItem(k);state.storageHealthy=true;
    }catch(e){state.storageHealthy=false;warn('storage',e?.message||'localStorage unavailable')}
    return state.storageHealthy;
  }

  function gameState(){return window.TGGGame?.getState?.()||null}
  function safeNum(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
  function guardPlayerState(showToast=false){
    const s=gameState();if(!s)return false;
    let fixed=false;
    const x=safeNum(s.x,50),y=safeNum(s.y,55),heading=safeNum(s.heading,0);
    const nx=clamp(x,3,94),ny=clamp(y,8,88),nh=((heading%360)+360)%360;
    if(s.x!==nx){s.x=nx;fixed=true}if(s.y!==ny){s.y=ny;fixed=true}if(s.heading!==nh){s.heading=nh;fixed=true}
    const cash=Math.max(0,safeNum(s.cash,0)),xp=Math.max(0,safeNum(s.xp,0)),level=Math.max(1,Math.floor(safeNum(s.level,1)));
    if(s.cash!==cash){s.cash=cash;fixed=true}if(s.xp!==xp){s.xp=xp;fixed=true}if(s.level!==level){s.level=level;fixed=true}
    const d=window.TGGGame?.getDrivingState?.();
    if(d&&(!Number.isFinite(Number(d.speed))||!Number.isFinite(Number(d.steer)))){
      window.TGGGame?.recoverVehicle?.();fixed=true;
    }
    if(fixed){window.TGGGame?.refresh?.();window.TGGGame?.save?.(true);if(showToast)window.__tggToast?.('STATE GUARD REPAIRED GAME STATE')}
    else if(showToast)window.__tggToast?.('STATE GUARD — HEALTHY');
    return fixed;
  }

  function compactSnapshot(reason){
    const gs=gameState(),mega=window.TGGV212?.status?.()||{},polish=window.TGGV213?.status?.()||{},world=window.TGGWorldGameplay?.status?.()||{};
    return {version:VERSION,reason,at:Date.now(),game:gs?{
      name:String(gs.name||'PLAYER').slice(0,80),style:String(gs.style||'Artist').slice(0,80),x:safeNum(gs.x,50),y:safeNum(gs.y,55),
      cash:Math.max(0,safeNum(gs.cash,0)),xp:Math.max(0,safeNum(gs.xp,0)),level:Math.max(1,safeNum(gs.level,1)),
      heading:safeNum(gs.heading,0),inVehicle:!!gs.inVehicle
    }:null,condition:safeNum(mega.condition,100),district:polish.district||null,mission:world.missionId||world.mission||null};
  }
  function snapshot(reason='auto'){
    if(!storageProbe())return false;
    try{
      const data=compactSnapshot(reason),raw=JSON.stringify(data);
      if(raw.length>18000){warn('snapshot','Snapshot exceeded size guard');return false}
      localStorage.setItem(SNAP,raw);state.snapshots++;state.lastSnapshotAt=data.at;return true;
    }catch(e){warn('snapshot',e?.message||'Snapshot failed');return false}
  }
  function lastSnapshot(){try{return JSON.parse(localStorage.getItem(SNAP)||'null')}catch{return null}}

  function error(source,message){
    state.errors.push({at:Date.now(),source:String(source).slice(0,80),message:String(message).slice(0,300)});
    if(state.errors.length>20)state.errors.shift();
  }
  function warn(source,message){
    state.warnings.push({at:Date.now(),source:String(source).slice(0,80),message:String(message).slice(0,300)});
    if(state.warnings.length>20)state.warnings.shift();
  }

  function clearInputs(){try{window.TGGFinalBuild?.clearInputs?.()}catch(e){error('clearInputs',e?.message||e)}}
  function haptic(strong=.45,weak=.25,duration=120){
    try{
      const pads=[...(navigator.getGamepads?.()||[])].filter(Boolean);
      const p=pads[0];if(!p)return false;
      const a=p.vibrationActuator;
      if(a?.playEffect){a.playEffect('dual-rumble',{duration,strongMagnitude:clamp(strong,0,1),weakMagnitude:clamp(weak,0,1)});return true}
      if(a?.pulse){a.pulse(clamp(strong,0,1),duration);return true}
    }catch(e){warn('haptic',e?.message||e)}
    return false;
  }

  function bindEvents(){
    if(bindEvents.done)return;bindEvents.done=true;
    ['pointerup','pointercancel','touchend','touchcancel'].forEach(type=>window.addEventListener(type,clearInputs,{passive:true}));
    window.addEventListener('blur',clearInputs);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();snapshot('hidden')}});
    document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('v214-fullscreen',!!document.fullscreenElement));
    document.addEventListener('keydown',e=>{
      const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
      if(typing)return;
      if(e.key==='F10'){e.preventDefault();toggleDiag();return}
      if(e.key==='Escape'){
        const active=window.TGGGame?.getActiveScreen?.();
        if(active==='game'){e.preventDefault();window.TGGGame?.show?.('pause')}
        else if(active==='pause'){e.preventDefault();window.TGGGame?.show?.('game')}
      }
    });
    window.addEventListener('online',()=>{state.online=true;document.body.classList.remove('v214-offline');renderDiag(true)});
    window.addEventListener('offline',()=>{state.online=false;document.body.classList.add('v214-offline');renderDiag(true)});
    window.addEventListener('gamepadconnected',e=>{state.gamepad=true;state.gamepadId=e.gamepad?.id||'Controller';window.__tggToast?.('CONTROLLER CONNECTED');renderDiag(true)});
    window.addEventListener('gamepaddisconnected',()=>{state.gamepad=false;state.gamepadId='';window.__tggToast?.('CONTROLLER DISCONNECTED');clearInputs();renderDiag(true)});
    window.addEventListener('tgg:traffic-impact',()=>haptic(.8,.5,190));
    window.addEventListener('tgg:mission-complete',()=>{haptic(.55,.35,150);snapshot('mission-complete')});
    window.addEventListener('tgg:vehicle-repaired',()=>{state.lastRepairAt=Date.now();haptic(.25,.5,120);snapshot('repair')});
    window.addEventListener('error',e=>error('window',e.message||'window error'));
    window.addEventListener('unhandledrejection',e=>error('promise',e.reason?.message||String(e.reason||'unhandled rejection')));
    const canvas=window.TGG3D?.renderer?.domElement;
    canvas?.addEventListener('webglcontextlost',e=>{e.preventDefault();state.webgl='lost';clearInputs();window.__tggToast?.('3D CONTEXT LOST — RECOVERING');renderDiag(true)});
    canvas?.addEventListener('webglcontextrestored',()=>{state.webgl='restored';window.__tggToast?.('3D CONTEXT RESTORED');setTimeout(()=>state.webgl='ready',1200);renderDiag(true)});
  }

  function sampleFPS(now){
    const dt=now-state.lastFrame;state.lastFrame=now;
    if(dt>0&&dt<250)state.frames.push(dt);
    if(state.frames.length>90)state.frames.shift();
    if(state.frames.length>=30){
      const avg=state.frames.reduce((a,b)=>a+b,0)/state.frames.length;state.fps=Math.round(1000/avg);
    }
  }
  function updateQualityBridge(){
    const q=window.TGGV212?.status?.()?.quality||window.TGGFinalBuild?.status?.()?.quality||'high';state.quality=q;
    document.body.dataset.playtestQuality=q;
    const renderer=window.TGG3D?.renderer;
    if(renderer?.shadowMap)renderer.shadowMap.enabled=q!=='performance';
    const trim=q==='performance';
    (window.TGG3D?.pedestrians||[]).forEach(o=>{if(o.userData?.v213)o.traverse?.(n=>{if('castShadow'in n)n.castShadow=!trim})});
    (window.TGG3D?.traffic||[]).forEach(o=>{if(o.userData?.v213)o.traverse?.(n=>{if('castShadow'in n)n.castShadow=!trim})});
  }
  function detectGamepad(){
    try{
      const p=[...(navigator.getGamepads?.()||[])].find(Boolean);
      state.gamepad=!!p;state.gamepadId=p?.id||'';
    }catch{}
  }

  function healthRows(){
    const gs=gameState(),d=window.TGGGame?.getDrivingState?.()||{},mega=window.TGGV212?.status?.()||{},polish=window.TGGV213?.status?.()||{},world=window.TGGWorldGameplay?.status?.()||{};
    return [
      ['FPS',state.fps||'—'],['QUALITY',String(state.quality).toUpperCase()],['WEBGL',String(state.webgl).toUpperCase()],
      ['NETWORK',state.online?'ONLINE':'OFFLINE'],['STORAGE',state.storageHealthy?'OK':'BLOCKED'],['GAMEPAD',state.gamepad?'CONNECTED':'NONE'],
      ['SCREEN',window.TGGGame?.getActiveScreen?.()||'—'],['CAR',gs?.inVehicle?'DRIVING':'ON FOOT'],['SPEED',Math.round(Math.abs(safeNum(d.speed,0))*7.2)+' MPH'],
      ['CONDITION',Math.round(safeNum(mega.condition,100))+'%'],['DISTRICT',polish.district||'—'],['TRAFFIC',polish.trafficTotal??window.TGG3D?.traffic?.length??0],
      ['PEDESTRIANS',polish.pedestrianTotal??window.TGG3D?.pedestrians?.length??0],['PARTICLES',polish.activeParticles??0],['MISSION',world.missionId||world.mission||'NONE'],
      ['SNAPSHOTS',state.snapshots],['ERRORS',state.errors.length],['WARNINGS',state.warnings.length]
    ];
  }
  function renderDiag(force=false){
    if(!state.diagOpen&&!force)return;
    const now=performance.now();if(!force&&now-lastRender<300)return;lastRender=now;
    install();const grid=$('v214DiagGrid');if(!grid)return;
    grid.innerHTML=healthRows().map(([k,v])=>'<span><small>'+String(k)+'</small><b>'+String(v)+'</b></span>').join('');
  }

  function tick(now=performance.now()){
    requestAnimationFrame(tick);install();bindEvents();sampleFPS(now);detectGamepad();guardPlayerState(false);updateQualityBridge();renderDiag(false);
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    state.ready=true;
  }
  function status(){
    return {version:VERSION,ready:state.ready,layers:LAYERS.length,fps:state.fps,quality:state.quality,webgl:state.webgl,
      online:state.online,storageHealthy:state.storageHealthy,gamepad:state.gamepad,errors:state.errors.length,warnings:state.warnings.length,
      snapshots:state.snapshots,lastSnapshotAt:state.lastSnapshotAt,lastSnapshot:lastSnapshot()};
  }

  storageProbe();install();bindEvents();
  snapshotTimer=setInterval(()=>snapshot('interval'),45000);
  window.TGGV214={version:VERSION,layers:LAYERS,status,snapshot,lastSnapshot,guardPlayerState,haptic,toggleDiag,toggleFullscreen};
  requestAnimationFrame(tick);
})();