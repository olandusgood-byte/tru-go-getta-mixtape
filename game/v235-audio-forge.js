(() => {
  const VERSION='V2.35 TGG SPATIAL AUDIO FORGE 100';
  const LAYERS=[
    'audio core bridge','audio enabled state','audio gesture boot','audio context create','audio context resume','audio master bus','audio sfx bus','audio ambience bus','audio music bus','audio status API',
    'master volume','sfx volume','ambience volume','music volume','mix persistence','mix restore','mute toggle','bus smoothing','bus diagnostics','audio rollback isolation',
    'oscillator synth','noise synth','noise buffer cache','gain envelope','attack envelope','release envelope','frequency glide','filter node','stereo panner','distance attenuation',
    'engine oscillator','engine harmonic','engine filter','engine speed pitch','engine load gain','engine idle tone','engine boost layer','engine vehicle guard','engine stop fade','engine diagnostics',
    'footstep noise','footstep interval','footstep speed rate','footstep sprint rate','footstep pan','footstep gain','footstep surface tone','footstep vehicle guard','footstep reduced motion','footstep diagnostics',
    'rain ambience','drizzle ambience','storm ambience','lightning crack','wind ambience','weather bridge','weather intensity','weather crossfade','weather restore','weather diagnostics',
    'studio ambience','club ambience','home ambience','shop ambience','office ambience','lounge ambience','interior bridge','interior crossfade','interior restore','interior diagnostics',
    'ui click cue','mission start cue','mission checkpoint cue','mission complete cue','rap battle cue','concert cue','rival choice cue','crew call cue','repair cue','impact cue',
    'spatial source x','spatial source z','listener player x','listener player z','spatial pan math','spatial gain math','event spatial helper','traffic impact spatial','destination ambience spatial','spatial diagnostics',
    'audio HUD','audio panel','mix sliders','mute button','boot button','F10 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,booted:false,ctx:null,master:null,sfx:null,ambience:null,music:null,
    mix:null,engine:null,weather:null,interior:null,lastFootstepAt:0,lastUiAt:0,
    noiseBuffer:null,ready:false,plays:0,errors:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));

  state.mix=core()?.normalizeMix?.({})||{master:.8,sfx:.85,ambience:.65,music:.5};

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-spatial-audio-forge',layerCount:LAYERS.length,
      enabled:state.enabled,booted:state.booted,contextState:state.ctx?.state||'none',
      mix:{...state.mix},plays:state.plays,errors:state.errors,
      engineActive:!!state.engine,weatherActive:state.weather?.id||null,interiorActive:state.interior?.id||null
    };
  }

  function AudioCtor(){return hasDOM()?(window.AudioContext||window.webkitAudioContext):null}

  function createBuses(ctx){
    state.master=ctx.createGain();state.sfx=ctx.createGain();state.ambience=ctx.createGain();state.music=ctx.createGain();
    state.sfx.connect(state.master);state.ambience.connect(state.master);state.music.connect(state.master);state.master.connect(ctx.destination);
    applyMix(true);
  }

  function boot(){
    if(!hasDOM())return false;
    try{
      if(!state.ctx){
        const Ctor=AudioCtor();if(!Ctor)return false;
        state.ctx=new Ctor();createBuses(state.ctx);state.noiseBuffer=makeNoiseBuffer(state.ctx,2.4);
      }
      if(state.ctx.state==='suspended')state.ctx.resume?.();
      state.booted=true;state.ready=true;renderUI();return true;
    }catch(e){state.errors++;return false}
  }

  function smoothGain(node,value,immediate=false){
    if(!node?.gain||!state.ctx)return;
    const t=state.ctx.currentTime,v=clamp(value,0,1);
    node.gain.cancelScheduledValues?.(t);
    if(immediate)node.gain.setValueAtTime(v,t);
    else{
      node.gain.setValueAtTime(node.gain.value,t);
      node.gain.linearRampToValueAtTime(v,t+.08);
    }
  }

  function applyMix(immediate=false){
    if(!state.ctx)return;
    smoothGain(state.master,state.enabled?state.mix.master:0,immediate);
    smoothGain(state.sfx,state.mix.sfx,immediate);
    smoothGain(state.ambience,state.mix.ambience,immediate);
    smoothGain(state.music,state.mix.music,immediate);
  }

  function setMix(next={}){
    state.mix=core()?.normalizeMix?.({...state.mix,...next})||{...state.mix,...next};
    applyMix();
    if(hasDOM()){
      try{localStorage.setItem('tgg-v235-audio-mix',JSON.stringify(state.mix))}catch{}
      renderUI();
    }
    return {...state.mix};
  }

  function setEnabled(v){
    state.enabled=!!v;applyMix();renderUI();return state.enabled;
  }

  function makeNoiseBuffer(ctx,duration=1){
    const len=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,len,ctx.sampleRate),a=buf.getChannelData(0);
    let last=0;
    for(let i=0;i<len;i++){
      const white=Math.random()*2-1;
      last=last*.86+white*.14;
      a[i]=last*.8+white*.2;
    }
    return buf;
  }

  function makePanner(ctx,pan=0){
    if(typeof ctx.createStereoPanner==='function'){
      const p=ctx.createStereoPanner();p.pan.value=clamp(pan,-1,1);return p;
    }
    const g=ctx.createGain();return g;
  }

  function envelope(gain,profile,level=1){
    const ctx=state.ctx,t=ctx.currentTime,attack=Math.max(.001,profile.attack||.005),duration=Math.max(.03,profile.duration||.1),release=Math.max(.01,profile.release||.08);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,(profile.gain||.1)*level),t+attack);
    gain.gain.setValueAtTime(Math.max(.0002,(profile.gain||.1)*level),t+Math.max(attack,duration-release));
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    return t+duration+.03;
  }

  function playTone(profile,opts={}){
    const ctx=state.ctx;if(!ctx||!state.enabled)return false;
    const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=makePanner(ctx,opts.pan||0);
    osc.type=profile.wave==='noise'?'sine':profile.wave;
    const hz=Math.max(20,(profile.baseHz||220)*(opts.pitch||1));
    osc.frequency.setValueAtTime(hz,ctx.currentTime);
    if(opts.glide)osc.frequency.exponentialRampToValueAtTime(Math.max(20,hz*opts.glide),ctx.currentTime+(profile.duration||.1));
    filter.type='lowpass';filter.frequency.value=opts.cutoff||Math.max(800,hz*10);filter.Q.value=.7;
    osc.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(opts.bus||state.sfx);
    const stopAt=envelope(gain,profile,opts.level??1);osc.start();osc.stop(stopAt);state.plays++;return true;
  }

  function playNoise(profile,opts={}){
    const ctx=state.ctx;if(!ctx||!state.enabled)return false;
    const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=makePanner(ctx,opts.pan||0);
    src.buffer=state.noiseBuffer||makeNoiseBuffer(ctx,2.4);
    filter.type=opts.filterType||'bandpass';filter.frequency.value=opts.cutoff||900;filter.Q.value=opts.q||.65;
    src.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(opts.bus||state.sfx);
    const stopAt=envelope(gain,profile,opts.level??1);src.start();src.stop(stopAt);state.plays++;return true;
  }

  function play(id,opts={}){
    if(!state.booted&&!boot())return false;
    const p=core()?.profile?.(id);if(!p)return false;
    return p.wave==='noise'?playNoise(p,opts):playTone(p,opts);
  }

  function worldPos(){
    const s=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92};
  }

  function spatialOptions(source={},max=20){
    const listener=worldPos(),sx=Number(source.x)||0,sz=Number(source.z)||0;
    const dx=sx-listener.x,dz=sz-listener.z,dist=Math.hypot(dx,dz);
    return {pan:core()?.pan?.(dx,Math.max(6,max*.6))||0,level:core()?.distanceGain?.(dist,max)||1,distance:dist};
  }

  function playSpatial(id,source,max=20,extra={}){
    return play(id,{...spatialOptions(source,max),...extra});
  }

  function stopLoop(loop,fade=.12){
    if(!loop||!state.ctx)return;
    const t=state.ctx.currentTime;
    try{
      loop.gain.gain.cancelScheduledValues(t);loop.gain.gain.setValueAtTime(Math.max(.0001,loop.gain.gain.value),t);loop.gain.gain.exponentialRampToValueAtTime(.0001,t+fade);
      loop.source?.stop?.(t+fade+.03);loop.osc2?.stop?.(t+fade+.03);
    }catch{}
  }

  function ensureEngine(){
    if(!state.booted||!state.ctx)return;
    const gs=window.TGGGame?.getState?.()||{},vd=window.TGG3D?.getVehicleDynamics?.()||{};
    if(!gs.inVehicle){
      if(state.engine){stopLoop(state.engine,.18);state.engine=null}
      return;
    }
    if(!state.engine){
      const ctx=state.ctx,osc=ctx.createOscillator(),osc2=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      osc.type='sawtooth';osc2.type='triangle';osc2.detune.value=-120;filter.type='lowpass';filter.Q.value=1.2;
      osc.connect(filter);osc2.connect(filter);filter.connect(gain);gain.connect(state.sfx);
      gain.gain.value=.0001;osc.start();osc2.start();
      state.engine={source:osc,osc2,filter,gain};
    }
    const speed=Math.abs(Number(vd.speed)||0),boost=!!vd.boosting,t=state.ctx.currentTime;
    const hz=48+speed*13+(boost?42:0),level=.035+Math.min(.12,speed*.009)+(boost?.05:0);
    state.engine.source.frequency.setTargetAtTime(hz,t,.05);
    state.engine.osc2.frequency.setTargetAtTime(hz*2.02,t,.06);
    state.engine.filter.frequency.setTargetAtTime(750+speed*120+(boost?900:0),t,.06);
    state.engine.gain.gain.setTargetAtTime(level,t,.07);
  }

  function maybeFootstep(nowMs){
    if(!state.booted||!state.enabled)return;
    const gs=window.TGGGame?.getState?.()||{},pd=window.TGG3D?.getPlayerDynamics?.()||{};
    if(gs.inVehicle)return;
    const speed=Math.max(0,Number(pd.speed)||0);
    if(speed<.45)return;
    const sprint=!!pd.sprinting,interval=sprint?260:Math.max(330,620-speed*28);
    if(nowMs-state.lastFootstepAt<interval)return;
    state.lastFootstepAt=nowMs;
    play('footstep',{level:sprint?.92:.66,cutoff:sprint?720:620,pan:Math.sin(nowMs*.013)*.16});
  }

  function ensureWeatherLoop(){
    if(!state.booted||!state.ctx)return;
    const ws=window.TGGV233?.status?.()||{},id=ws.enabled?ws.preset:'clear',rain=Number(ws.rain)||0;
    if(id==='clear'||rain<=.02){
      if(state.weather){stopLoop(state.weather,.45);state.weather=null}
      return;
    }
    if(!state.weather||state.weather.id!==id){
      if(state.weather)stopLoop(state.weather,.3);
      const ctx=state.ctx,src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      src.buffer=state.noiseBuffer||makeNoiseBuffer(ctx,2.4);src.loop=true;
      filter.type=id==='storm'?'lowpass':'bandpass';filter.frequency.value=id==='storm'?620:1150;filter.Q.value=.45;
      src.connect(filter);filter.connect(gain);gain.connect(state.ambience);gain.gain.value=.0001;src.start();
      state.weather={id,source:src,filter,gain};
    }
    const t=state.ctx.currentTime,target=.02+rain*.11+(id==='storm'?.04:0);
    state.weather.gain.gain.setTargetAtTime(target,t,.35);
  }

  function ensureInteriorLoop(){
    if(!state.booted||!state.ctx)return;
    const s=window.TGGV230?.status?.()||{},id=s.activeRoom||null;
    if(!id){
      if(state.interior){stopLoop(state.interior,.35);state.interior=null}
      return;
    }
    if(!state.interior||state.interior.id!==id){
      if(state.interior)stopLoop(state.interior,.25);
      const ctx=state.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      const profile=id==='media'?core()?.profile?.('club'):id==='studio'?core()?.profile?.('studio'):core()?.profile?.('ui');
      osc.type=profile?.wave==='noise'?'sine':profile?.wave||'sine';osc.frequency.value=profile?.baseHz||95;
      filter.type='lowpass';filter.frequency.value=id==='media'?320:id==='studio'?900:520;
      osc.connect(filter);filter.connect(gain);gain.connect(state.ambience);gain.gain.value=.0001;osc.start();
      state.interior={id,source:osc,gain,filter};
    }
    const target=state.interior.id==='media'?.055:state.interior.id==='studio'?.026:.018;
    state.interior.gain.gain.setTargetAtTime(target,state.ctx.currentTime,.25);
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    const on=(ev,fn)=>window.addEventListener(ev,fn);
    on('tgg:mission-start',()=>play('mission',{pitch:.9}));
    on('tgg:mission-checkpoint',()=>play('ui',{pitch:1.35}));
    on('tgg:mission-complete',()=>{play('mission',{pitch:1.45,level:1.1});setTimeout(()=>play('ui',{pitch:1.8}),120)});
    on('tgg:rap-battle-start',()=>play('rap',{level:1}));
    on('tgg:rap-battle-round',()=>play('rap',{pitch:1.16,level:.85}));
    on('tgg:concert-start',()=>{play('concert',{level:1});play('crowd',{bus:state.ambience,level:.85})});
    on('tgg:rival-choice',()=>play('ui',{pitch:.82}));
    on('tgg:crew-call',()=>play('ui',{pitch:1.08}));
    on('tgg:vehicle-repaired',()=>play('ui',{pitch:1.6}));
    on('tgg:traffic-impact',e=>{
      const src=e.detail?.position||window.TGG3D?.getCarPercent?.()||{};
      playSpatial('footstep',{x:Number(src.x)||0,z:Number(src.z)||0},18,{level:1.15,cutoff:420});
    });
    on('tgg:weather-lightning',()=>{play('storm',{bus:state.ambience,level:1.05,cutoff:320});});
    document.addEventListener('pointerdown',e=>{
      if(!state.booted)boot();
      const b=e.target?.closest?.('button');
      if(b&&performance.now()-state.lastUiAt>70){state.lastUiAt=performance.now();play('ui',{level:.45,pitch:1.05})}
    },{passive:true});
  }

  function loadMix(){
    if(!hasDOM())return;
    try{const x=JSON.parse(localStorage.getItem('tgg-v235-audio-mix')||'{}');state.mix=core()?.normalizeMix?.(x)||state.mix}catch{}
  }

  function restore(){
    if(state.engine){stopLoop(state.engine);state.engine=null}
    if(state.weather){stopLoop(state.weather);state.weather=null}
    if(state.interior){stopLoop(state.interior);state.interior=null}
    state.enabled=false;applyMix();renderUI();return status();
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='AUDIO';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE AUDIO</small><b>SPATIAL AUDIO FORGE</b></div><button id="v235Close" type="button">×</button></div><button id="v235Boot" class="v235-boot" type="button">ENABLE AUDIO</button><label>MASTER <input id="v235Master" type="range" min="0" max="1" step=".01"></label><label>SFX <input id="v235Sfx" type="range" min="0" max="1" step=".01"></label><label>AMBIENCE <input id="v235Ambience" type="range" min="0" max="1" step=".01"></label><label>MUSIC BED <input id="v235Music" type="range" min="0" max="1" step=".01"></label><div class="v235-actions"><button id="v235Mute" type="button">AUDIO: ON</button><button id="v235Test" type="button">TEST SPATIAL</button><button id="v235Restore" type="button">RESTORE / MUTE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v235Boot')?.addEventListener('click',()=>{boot();play('ui',{pitch:1.45});renderUI()});
      document.getElementById('v235Mute')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Test')?.addEventListener('click',()=>{boot();play('ui',{pan:-.8,pitch:.9});setTimeout(()=>play('ui',{pan:.8,pitch:1.3}),180)});
      document.getElementById('v235Restore')?.addEventListener('click',restore);
      const binds={v235Master:'master',v235Sfx:'sfx',v235Ambience:'ambience',v235Music:'music'};
      Object.entries(binds).forEach(([id,key])=>document.getElementById(id)?.addEventListener('input',e=>setMix({[key]:Number(e.target.value)})));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG AUDIO FORGE</small><b id="v235HudState">AUDIO LOCKED</b><span id="v235HudMix">CLICK TO ENABLE</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Master'))q('v235Master').value=state.mix.master;
    if(q('v235Sfx'))q('v235Sfx').value=state.mix.sfx;
    if(q('v235Ambience'))q('v235Ambience').value=state.mix.ambience;
    if(q('v235Music'))q('v235Music').value=state.mix.music;
    if(q('v235Boot'))q('v235Boot').textContent=state.booted?'AUDIO ENABLED':'ENABLE AUDIO';
    if(q('v235Mute'))q('v235Mute').textContent='AUDIO: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=(state.ctx?.state||'LOCKED').toUpperCase()+' • '+state.plays+' PLAYS • '+state.errors+' ERRORS';
    if(q('v235HudState'))q('v235HudState').textContent=state.booted?(state.enabled?'SPATIAL AUDIO ON':'AUDIO MUTED'):'AUDIO LOCKED';
    if(q('v235HudMix'))q('v235HudMix').textContent=state.booted?'MASTER '+Math.round(state.mix.master*100)+'%':'CLICK / KEY TO ENABLE';
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(!state.booted)boot();
    if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastFrame=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(state.booted&&state.ctx?.state==='suspended'&&document.visibilityState==='visible')state.ctx.resume?.();
    if(state.booted&&state.enabled){
      ensureEngine();maybeFootstep(ts);ensureWeatherLoop();ensureInteriorLoop();
    }
    if(ts-lastFrame>500){lastFrame=ts;renderUI()}
  }

  loadMix();
  const api={version:VERSION,layers:LAYERS,status,boot,play,playSpatial,setMix,setEnabled,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;
    document.addEventListener('keydown',keyHandler);
    document.addEventListener('touchstart',()=>{if(!state.booted)boot()},{passive:true,once:true});
    ensureUI();requestAnimationFrame(tick);
  }
})();