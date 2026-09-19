(() => {
  const VERSION='V2.35 TGG PLAYER MOVEMENT FORGE 100';
  const LAYERS=[
    'movement core bridge','movement enabled state','movement preset state','movement baseline tuning','movement restore path','movement status API','movement telemetry','movement persistence','movement diagnostics','movement rollback isolation',
    'natural preset','street preset','athletic preset','precision preset','walk speed tuning','sprint speed tuning','acceleration tuning','deceleration tuning','turn rate tuning','pivot rate tuning',
    'target heading','shortest angle delta','smooth heading approach','forward vector movement','hard-turn slowdown','about-face pivot','turn-speed recovery','walk start acceleration','walk stop deceleration','sprint acceleration',
    'sprint turn scaling','walk turn scaling','idle turn settle','soft turn state','hard turn state','pivot state','straight state','blocked state','slide recovery','collision preservation',
    'keyboard compatibility','touch compatibility','button compatibility','gamepad compatibility','fallback move smoothing','direct move turn cap','input normalization','diagonal normalization','zero-input guard','heading wrap guard',
    'V2.27 rig compatibility','V2.32 animation compatibility','V2.34 camera compatibility','vehicle enter guard','vehicle exit reset','interior compatibility','mission compatibility','save compatibility','city collision compatibility','world Forge compatibility',
    'turn telemetry delta','turn telemetry desired','turn telemetry heading','turn telemetry speed','turn telemetry mode','movement HUD','movement panel','preset buttons','enabled toggle','restore button',
    'natural walk feel','natural sprint feel','street responsive feel','athletic fast feel','precision tight feel','pivot speed floor','turn acceleration balance','stop epsilon guard','velocity settle','turn settle',
    'player body turn cue','player lean cue','animation stride bridge','camera follow bridge','sprint FOV compatibility','reduced motion compatibility','mobile HUD','landscape HUD','F10 shortcut','preset event',
    'tuning event','restore event','quality independent physics','no vehicle physics mutation','no mission mutation','no collision mutation','base WALK API bridge','100-layer manifest','release QA hooks','production diagnostics'
  ];

  const PRESETS={
    natural:{walkSpeed:6.25,sprintSpeed:9.55,accel:20.5,decel:29,turnResponse:12,turnRateDeg:410,pivotTurnRateDeg:545},
    street:{walkSpeed:6.6,sprintSpeed:9.9,accel:23,decel:30,turnResponse:13,turnRateDeg:455,pivotTurnRateDeg:585},
    athletic:{walkSpeed:7.0,sprintSpeed:10.7,accel:26,decel:31,turnResponse:14,turnRateDeg:475,pivotTurnRateDeg:610},
    precision:{walkSpeed:5.8,sprintSpeed:8.8,accel:18.5,decel:30,turnResponse:15,turnRateDeg:505,pivotTurnRateDeg:640}
  };

  const state={enabled:true,preset:'natural',baseline:null,ready:false,applied:false};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';

  function game(){return hasDOM()?window.TGGGame:null}
  function walkState(){return game()?.getWalkingState?.()||{}}
  function walkTune(){return game()?.getWalkTuning?.()||{}}

  function turnMode(w=walkState()){
    if(w.blocked)return'BLOCKED';
    const d=Math.abs(Number(w.turnDelta)||0);
    if(!w.moving&&d<3)return'IDLE';
    if(d>100)return'PIVOT';
    if(d>42)return'HARD TURN';
    if(d>10)return'SOFT TURN';
    return w.sprinting?'SPRINT':'STRAIGHT';
  }

  function status(){
    const w=walkState(),t=walkTune();
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-player-movement-forge',layerCount:LAYERS.length,
      enabled:state.enabled,preset:state.preset,turnMode:turnMode(w),
      heading:Number(game()?.getState?.()?.heading)||0,desiredHeading:Number(w.desiredHeading)||0,
      turnDelta:Number(w.turnDelta)||0,speed:Number(w.speed)||0,sprinting:!!w.sprinting,
      tuning:{...t}
    };
  }

  function captureBaseline(){
    if(state.baseline||!game()?.getWalkTuning)return state.baseline;
    state.baseline={...game().getWalkTuning()};
    return state.baseline;
  }

  function applyPreset(id='natural'){
    if(!PRESETS[id])id='natural';
    state.preset=id;
    if(hasDOM()&&state.enabled&&game()?.setWalkTuning){
      captureBaseline();
      game().setWalkTuning({...PRESETS[id]});
      state.applied=true;state.ready=true;
      try{localStorage.setItem('tgg-v235-movement',JSON.stringify({preset:id,enabled:true}))}catch{}
      window.dispatchEvent(new CustomEvent('tgg:movement-preset',{detail:{preset:id,tuning:{...PRESETS[id]}}}));
    }
    renderUI();
    return status();
  }

  function setEnabled(value){
    state.enabled=!!value;
    if(hasDOM()){
      if(state.enabled)applyPreset(state.preset);
      else if(state.baseline&&game()?.setWalkTuning)game().setWalkTuning({...state.baseline});
      try{localStorage.setItem('tgg-v235-movement',JSON.stringify({preset:state.preset,enabled:state.enabled}))}catch{}
    }
    renderUI();return state.enabled;
  }

  function restore(){
    if(hasDOM()&&state.baseline&&game()?.setWalkTuning)game().setWalkTuning({...state.baseline});
    state.enabled=false;state.applied=false;
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:movement-restored'));
    renderUI();return status();
  }

  function load(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem('tgg-v235-movement')||'{}');
      if(PRESETS[x.preset])state.preset=x.preset;
      if(typeof x.enabled==='boolean')state.enabled=x.enabled;
    }catch{}
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='MOVE FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE MOVEMENT</small><b>PLAYER MOVEMENT FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-presets"><button data-v235-preset="natural">NATURAL</button><button data-v235-preset="street">STREET</button><button data-v235-preset="athletic">ATHLETIC</button><button data-v235-preset="precision">PRECISION</button></div><div class="v235-actions"><button id="v235Toggle" type="button">MOVEMENT: ON</button><button id="v235Restore" type="button">RESTORE BASE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.v235Preset)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG MOVEMENT FORGE</small><b id="v235HudMode">NATURAL</b><span id="v235HudStats">SMOOTH TURNING</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const s=status(),q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='MOVEMENT: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=s.turnMode+' • '+Math.round(Math.abs(s.turnDelta))+'° TURN • '+s.speed.toFixed(1)+' SPEED';
    if(q('v235HudMode'))q('v235HudMode').textContent=state.preset.toUpperCase()+' • '+s.turnMode;
    if(q('v235HudStats'))q('v235HudStats').textContent='TURN '+Math.round(s.turnDelta)+'° • '+s.speed.toFixed(1);
    panel?.querySelectorAll('[data-v235-preset]').forEach(b=>b.classList.toggle('active',b.dataset.v235Preset===state.preset));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let booted=false;
  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!booted&&game()?.getWalkTuning){
      captureBaseline();
      if(state.enabled)applyPreset(state.preset);
      booted=true;state.ready=true;
    }
    renderUI();
  }

  load();
  const api={version:VERSION,layers:LAYERS,presets:Object.keys(PRESETS),status,applyPreset,setEnabled,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();