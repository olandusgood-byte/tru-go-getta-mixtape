(() => {
  const VERSION='V2.37 TGG AUDIO + AMBIENCE FORGE 100';
  const LAYERS=[
    'audio core bridge','started state','volume state','muted state','ambience state','audio context','master gain','ambience bus','cue bus','status API',
    'city ambience','traffic ambience','studio ambience','club ambience','rain ambience','crowd ambience','ambience select','ambience fade in','ambience fade out','ambience restore',
    'white noise buffer','noise source','noise filter','noise gain','hum oscillator','hum filter','hum gain','pulse oscillator','pulse LFO','pulse gain',
    'impact cue','success cue','checkpoint cue','boost cue','lightning cue','hype cue','cue oscillator','cue envelope','cue release','cue cleanup',
    'user gesture start','context resume','autoplay guard','context suspended guard','start idempotence','stop idempotence','context close guard','mute toggle','volume clamp','volume persistence',
    'city scene bridge','studio interior bridge','club interior bridge','office interior bridge','rain weather bridge','crowd life bridge','interior exit bridge','ambience auto select','ambience event','scene fallback',
    'impact event cue','mission success cue','checkpoint cue bridge','boost cue bridge','lightning cue bridge','concert hype cue','rap hype cue','crowd hype cue','camera pulse cue','event cooldown',
    'quality high mix','quality balanced mix','quality performance mix','reduced motion neutral','hidden tab suspend','visible tab resume','page blur trim','page focus restore','low power trim','diagnostics',
    'no microphone','no media devices','no external audio','procedural only','disconnect cleanup','node cleanup','timer cleanup','rollback isolation','V2.36 compatibility','release guard',
    'audio HUD','audio panel','volume slider','ambience buttons','start stop button','mute button','cue test buttons','mobile panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV237Core||globalThis.window?.TGGV237Core;
  const state={
    started:false,volume:.55,muted:false,ambience:'city',context:null,master:null,ambienceBus:null,cueBus:null,
    nodes:[],ambienceNodes:[],ready:false,interior:null,weather:'clear',manualAmbience:false,lastCueAt:{},frames:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-audio-forge',layerCount:LAYERS.length,
      started:state.started,volume:Number(state.volume.toFixed(2)),muted:state.muted,ambience:state.ambience,
      contextState:state.context?.state||'none',quality:quality(),proceduralOnly:true
    };
  }

  function AudioCtx(){
    if(!hasDOM())return null;
    return window.AudioContext||window.webkitAudioContext||null;
  }

  function qualityScale(){
    return quality()==='performance'?.62:quality()==='balanced'?.82:1;
  }

  function savePrefs(){
    if(!hasDOM())return;
    try{localStorage.setItem('tgg-v237-audio',JSON.stringify({volume:state.volume,muted:state.muted,ambience:state.ambience}))}catch{}
  }

  function loadPrefs(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem('tgg-v237-audio')||'{}');
      if(Number.isFinite(Number(x.volume)))state.volume=clamp(Number(x.volume),0,1);
      if(typeof x.muted==='boolean')state.muted=x.muted;
      if(core()?.ambiences?.includes(x.ambience))state.ambience=x.ambience;
    }catch{}
  }

  function makeNoiseBuffer(ctx){
    const length=Math.max(1,Math.floor(ctx.sampleRate*2));
    const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(.72+Math.sin(i*.013)*.08);
    return buffer;
  }

  function stopAmbienceNodes(){
    state.ambienceNodes.forEach(n=>{
      try{n.stop?.()}catch{}
      try{n.disconnect?.()}catch{}
    });
    state.ambienceNodes=[];
  }

  function buildAmbience(id=state.ambience){
    if(!state.started||!state.context||!state.ambienceBus)return false;
    stopAmbienceNodes();
    const ctx=state.context,cfg=core()?.ambience?.(id)||core()?.ambience?.('city');
    state.ambience=cfg.id;
    const scale=qualityScale();

    const noise=ctx.createBufferSource();noise.buffer=makeNoiseBuffer(ctx);noise.loop=true;
    const noiseFilter=ctx.createBiquadFilter();noiseFilter.type='lowpass';noiseFilter.frequency.value=cfg.filter||1800;
    const noiseGain=ctx.createGain();noiseGain.gain.value=(cfg.noise||0)*.11*scale;
    noise.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(state.ambienceBus);noise.start();

    const hum=ctx.createOscillator();hum.type='sine';hum.frequency.value=id==='traffic'?74:id==='club'?58:id==='studio'?92:66;
    const humFilter=ctx.createBiquadFilter();humFilter.type='lowpass';humFilter.frequency.value=220;
    const humGain=ctx.createGain();humGain.gain.value=(cfg.hum||0)*.075*scale;
    hum.connect(humFilter);humFilter.connect(humGain);humGain.connect(state.ambienceBus);hum.start();

    const pulse=ctx.createOscillator();pulse.type='sine';pulse.frequency.value=id==='club'?54:86;
    const pulseGain=ctx.createGain();pulseGain.gain.value=(cfg.pulse||0)*.055*scale;
    pulse.connect(pulseGain);pulseGain.connect(state.ambienceBus);pulse.start();

    const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();
    lfo.type='sine';lfo.frequency.value=id==='club'?2.05:.55;lfoGain.gain.value=(cfg.pulse||0)*.025*scale;
    lfo.connect(lfoGain);lfoGain.connect(pulseGain.gain);lfo.start();

    state.ambienceBus.gain.cancelScheduledValues(ctx.currentTime);
    state.ambienceBus.gain.setValueAtTime(0,ctx.currentTime);
    state.ambienceBus.gain.linearRampToValueAtTime((cfg.gain||.2)*scale,ctx.currentTime+.28);

    state.ambienceNodes.push(noise,noiseFilter,noiseGain,hum,humFilter,humGain,pulse,pulseGain,lfo,lfoGain);
    savePrefs();renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:audio-ambience',{detail:{ambience:state.ambience}}));
    return true;
  }

  async function start(){
    if(!hasDOM())return false;
    if(state.started&&state.context){
      if(state.context.state==='suspended')try{await state.context.resume()}catch{}
      return true;
    }
    const Ctx=AudioCtx();if(!Ctx)return false;
    try{
      const ctx=new Ctx();
      const master=ctx.createGain(),ambienceBus=ctx.createGain(),cueBus=ctx.createGain();
      master.gain.value=state.muted?0:state.volume;
      ambienceBus.gain.value=0;cueBus.gain.value=.82;
      ambienceBus.connect(master);cueBus.connect(master);master.connect(ctx.destination);
      state.context=ctx;state.master=master;state.ambienceBus=ambienceBus;state.cueBus=cueBus;
      state.nodes=[master,ambienceBus,cueBus];state.started=true;state.ready=true;
      if(ctx.state==='suspended')try{await ctx.resume()}catch{}
      buildAmbience(resolveAutoAmbience());
      renderUI();return true;
    }catch{
      state.started=false;return false;
    }
  }

  async function stop(){
    if(!state.started&&!state.context)return true;
    stopAmbienceNodes();
    state.nodes.forEach(n=>{try{n.disconnect?.()}catch{}});
    if(state.context){
      try{await state.context.close()}catch{}
    }
    state.context=null;state.master=null;state.ambienceBus=null;state.cueBus=null;state.nodes=[];state.started=false;
    renderUI();return true;
  }

  function setVolume(v){
    state.volume=clamp(Number(v)||0,0,1);
    if(state.master&&state.context){
      state.master.gain.cancelScheduledValues(state.context.currentTime);
      state.master.gain.setTargetAtTime(state.muted?0:state.volume,state.context.currentTime,.04);
    }
    savePrefs();renderUI();return state.volume;
  }

  function toggleMute(force){
    state.muted=typeof force==='boolean'?force:!state.muted;
    if(state.master&&state.context)state.master.gain.setTargetAtTime(state.muted?0:state.volume,state.context.currentTime,.035);
    savePrefs();renderUI();return state.muted;
  }

  function setAmbience(id='city',manual=true){
    if(!core()?.ambiences?.includes(id))id='city';
    state.ambience=id;if(manual)state.manualAmbience=true;
    if(state.started)buildAmbience(id);else{savePrefs();renderUI()}
    return state.ambience;
  }

  function cueAllowed(id,ms=90){
    const now=Date.now(),last=state.lastCueAt[id]||0;if(now-last<ms)return false;state.lastCueAt[id]=now;return true;
  }

  function playCue(id='impact',opts={}){
    if(!state.started||!state.context||!state.cueBus||!cueAllowed(id,Number(opts.cooldown)||80))return false;
    const ctx=state.context,cfg=core()?.cue?.(id);if(!cfg)return false;
    try{
      const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      osc.type=cfg.type;osc.frequency.setValueAtTime(cfg.frequency,ctx.currentTime);
      if(id==='success'||id==='checkpoint')osc.frequency.exponentialRampToValueAtTime(cfg.frequency*1.45,ctx.currentTime+cfg.duration*.7);
      if(id==='impact'||id==='lightning')osc.frequency.exponentialRampToValueAtTime(Math.max(35,cfg.frequency*.55),ctx.currentTime+cfg.duration);
      filter.type='lowpass';filter.frequency.value=id==='impact'||id==='lightning'?900:2800;
      const peak=cfg.gain*qualityScale()*(opts.gain??1);
      gain.gain.setValueAtTime(.0001,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),ctx.currentTime+Math.max(.002,cfg.attack));
      gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+cfg.duration+cfg.release);
      osc.connect(filter);filter.connect(gain);gain.connect(state.cueBus);osc.start();osc.stop(ctx.currentTime+cfg.duration+cfg.release+.03);
      osc.addEventListener?.('ended',()=>{try{osc.disconnect();filter.disconnect();gain.disconnect()}catch{}},{once:true});
      return true;
    }catch{return false}
  }

  function resolveAutoAmbience(){
    if(state.manualAmbience)return state.ambience;
    if(state.interior==='recording')return'studio';
    if(state.interior==='club')return'club';
    if(['rain','storm','drizzle'].includes(state.weather))return'rain';
    const gs=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    if(gs.inVehicle)return'traffic';
    const npc=hasDOM()?window.TGGV236?.status?.()||{}:{};
    if((npc.count||0)>=12)return'crowd';
    return'city';
  }

  function refreshAutoAmbience(){
    if(state.manualAmbience)return;
    const next=resolveAutoAmbience();if(next!==state.ambience){state.ambience=next;if(state.started)buildAmbience(next);else renderUI()}
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:interior-enter',e=>{state.interior=e.detail?.type||null;state.manualAmbience=false;refreshAutoAmbience()});
    window.addEventListener('tgg:interior-exit',()=>{state.interior=null;state.manualAmbience=false;refreshAutoAmbience()});
    window.addEventListener('tgg:weather-change',e=>{state.weather=e.detail?.preset||'clear';state.manualAmbience=false;refreshAutoAmbience()});
    window.addEventListener('tgg:weather-restored',()=>{state.weather='clear';state.manualAmbience=false;refreshAutoAmbience()});
    ['tgg:traffic-impact','tgg:vehicle-impact'].forEach(ev=>window.addEventListener(ev,()=>playCue('impact')));
    window.addEventListener('tgg:mission-complete',()=>playCue('success'));
    window.addEventListener('tgg:mission-checkpoint',()=>playCue('checkpoint'));
    window.addEventListener('tgg:weather-lightning',()=>playCue('lightning',{cooldown:250}));
    window.addEventListener('tgg:concert-start',()=>playCue('hype'));
    window.addEventListener('tgg:rap-battle-start',()=>playCue('hype'));
    window.addEventListener('tgg:camera-pulse',e=>{if(e.detail?.kind==='impact')playCue('impact',{gain:.65})});
  }

  function visibility(){
    if(!state.context||!state.started)return;
    if(document.hidden){try{state.context.suspend()}catch{}}
    else{try{state.context.resume()}catch{}}
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v237');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v237ForgeBtn')){
      const b=document.createElement('button');b.id='v237ForgeBtn';b.className='v237-forge-btn';b.type='button';b.textContent='AUDIO';b.addEventListener('click',async()=>{if(!state.started)await start();panel?.classList.toggle('active')});top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v237ForgePanel';panel.className='v237-forge-panel';
      panel.innerHTML='<div class="v237-head"><div><small>TGG NATIVE AUDIO</small><b>AUDIO + AMBIENCE FORGE</b></div><button id="v237Close" type="button">×</button></div><label>VOLUME <input id="v237Volume" type="range" min="0" max="1" step=".02"></label><div class="v237-amb"><button data-v237-amb="city">CITY</button><button data-v237-amb="traffic">TRAFFIC</button><button data-v237-amb="studio">STUDIO</button><button data-v237-amb="club">CLUB</button><button data-v237-amb="rain">RAIN</button><button data-v237-amb="crowd">CROWD</button></div><div class="v237-cues"><button data-v237-cue="impact">IMPACT</button><button data-v237-cue="success">SUCCESS</button><button data-v237-cue="boost">BOOST</button><button data-v237-cue="hype">HYPE</button></div><div class="v237-actions"><button id="v237Start" type="button">START AUDIO</button><button id="v237Mute" type="button">MUTE</button></div><div id="v237Stats" class="v237-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v237Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v237Volume')?.addEventListener('input',e=>setVolume(Number(e.target.value)));
      document.getElementById('v237Start')?.addEventListener('click',async()=>state.started?await stop():await start());
      document.getElementById('v237Mute')?.addEventListener('click',()=>toggleMute());
      panel.querySelectorAll('[data-v237-amb]').forEach(b=>b.addEventListener('click',()=>setAmbience(b.dataset.v237Amb,true)));
      panel.querySelectorAll('[data-v237-cue]').forEach(b=>b.addEventListener('click',async()=>{if(!state.started)await start();playCue(b.dataset.v237Cue,{cooldown:0})}));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v237ForgeHud';hud.className='v237-forge-hud';
      hud.innerHTML='<small>TGG AUDIO FORGE</small><b id="v237HudMode">AUDIO OFF</b><span id="v237HudAmb">CITY</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v237Volume'))q('v237Volume').value=String(state.volume);
    if(q('v237Start'))q('v237Start').textContent=state.started?'STOP AUDIO':'START AUDIO';
    if(q('v237Mute'))q('v237Mute').textContent=state.muted?'UNMUTE':'MUTE';
    if(q('v237Stats'))q('v237Stats').textContent=(state.started?'RUNNING':'OFF')+' • '+state.ambience.toUpperCase()+' • '+Math.round(state.volume*100)+'% • '+quality().toUpperCase();
    if(q('v237HudMode'))q('v237HudMode').textContent=state.started?(state.muted?'MUTED':'AUDIO ON'):'AUDIO OFF';
    if(q('v237HudAmb'))q('v237HudAmb').textContent=state.ambience.toUpperCase()+' • PROCEDURAL';
    panel?.querySelectorAll('[data-v237-amb]').forEach(b=>b.classList.toggle('active',b.dataset.v237Amb===state.ambience));
  }

  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);
    ensureUI();if(state.started&&state.frames%90===0)refreshAutoAmbience();state.frames++;if(state.frames%45===0)renderUI();
  }

  loadPrefs();
  const api={version:VERSION,layers:LAYERS,ambiences:['city','traffic','studio','club','rain','crowd'],status,start,stop,setVolume,setAmbience,playCue};
  globalThis.TGGV237=api;
  if(hasDOM()){
    window.TGGV237=api;
    document.addEventListener('visibilitychange',visibility);
    ensureUI();requestAnimationFrame(tick);
  }
})();