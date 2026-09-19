(() => {
  const VERSION='V2.42 TGG SHOW DIRECTOR FORGE 100';
  const PACKS=['director','sequence','camera','lighting','weather','animation','audio','crowd','effects','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV242Core||globalThis.window?.TGGV242Core;
  const state={enabled:true,running:false,sequence:'showcase',cueIndex:-1,cue:null,startedAt:0,cueStartedAt:0,timer:0,auto:true,plays:0,advances:0,history:[],ready:false};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';

  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-show-director-forge',layerCount:LAYERS.length,enabled:state.enabled,running:state.running,sequence:state.sequence,cueIndex:state.cueIndex,cue:state.cue?.id||null,auto:state.auto,plays:state.plays,advances:state.advances,history:state.history.slice(-8)}}
  function clearTimer(){if(state.timer){clearTimeout(state.timer);state.timer=0}}
  function invoke(name,...args){try{return name?.(...args)}catch{return false}}

  function applyCue(c){
    if(!c||!state.enabled)return false;
    state.cue=c;state.cueStartedAt=Date.now();
    invoke(window.TGGV231?.applyMood?.bind(window.TGGV231),c.mood);
    invoke(window.TGGV233?.applyPreset?.bind(window.TGGV233),c.weather);
    invoke(window.TGGV234?.applyPreset?.bind(window.TGGV234),c.camera);
    if(c.pulse)invoke(window.TGGV234?.pulse?.bind(window.TGGV234),...c.pulse);
    invoke(window.TGGV232?.play?.bind(window.TGGV232),c.animation,Math.max(700,c.ms));
    invoke(window.TGGV240?.applyProfile?.bind(window.TGGV240),c.audioProfile);
    invoke(window.TGGV240?.play?.bind(window.TGGV240),c.audio);
    if(c.stage)invoke(window.TGGV241?.start?.bind(window.TGGV241),c.stage);
    if(c.crowd>0)invoke(window.TGGV235?.pulseCrowd?.bind(window.TGGV235),c.crowd);
    invoke(window.TGGV238?.emit?.bind(window.TGGV238),c.effect,{strength:Math.max(.2,c.crowd||.35)});
    state.history.push({sequence:state.sequence,cue:c.id,at:Date.now()});if(state.history.length>30)state.history.shift();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:director-cue',{detail:{sequence:state.sequence,cue:c.id,index:state.cueIndex}}));
    renderUI();return true;
  }

  function schedule(){
    clearTimer();if(!state.running||!state.auto||!state.cue)return;
    state.timer=setTimeout(()=>advance(),state.cue.ms);
  }
  function start(id='showcase',opts={}){
    const seq=core()?.sequence?.(id);if(!seq)return false;
    clearTimer();state.sequence=seq.id;state.running=true;state.startedAt=Date.now();state.cueIndex=0;state.auto=opts.auto!==false;state.plays++;
    applyCue(seq.cues[0]);schedule();renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:director-start',{detail:{sequence:seq.id,duration:seq.duration}}));
    return status();
  }
  function advance(){
    if(!state.running)return false;
    const seq=core()?.sequence?.(state.sequence);if(!seq)return stop();
    const next=state.cueIndex+1;state.advances++;
    if(next>=seq.cues.length){stop({complete:true});return false}
    state.cueIndex=next;applyCue(seq.cues[next]);schedule();return status();
  }
  function stop(opts={}){
    clearTimer();const was=state.running;state.running=false;state.cue=null;state.cueIndex=-1;
    invoke(window.TGGV232?.clear?.bind(window.TGGV232));
    if(opts.stopStage!==false)invoke(window.TGGV241?.stop?.bind(window.TGGV241));
    invoke(window.TGGV234?.applyPreset?.bind(window.TGGV234),'street');
    invoke(window.TGGV240?.applyProfile?.bind(window.TGGV240),'street');
    renderUI();if(was&&hasDOM())window.dispatchEvent(new CustomEvent('tgg:director-stop',{detail:{sequence:state.sequence,complete:!!opts.complete}}));return status();
  }
  function setEnabled(v){state.enabled=!!v;if(!state.enabled)stop();renderUI();return state.enabled}
  function setAuto(v){state.auto=!!v;if(state.running)state.auto?schedule():clearTimer();renderUI();return state.auto}
  function playBeat(id='showcase'){return start(id,{auto:false})}

  function bridge(){
    if(!hasDOM()||bridge.done)return;bridge.done=true;
    window.addEventListener('tgg:mission-start',()=>start('mission-intro'));
    window.addEventListener('tgg:rap-battle-start',()=>start('battle'));
    window.addEventListener('tgg:concert-start',()=>start('concert'));
    window.addEventListener('tgg:live-room-start',()=>start('club'));
    window.addEventListener('tgg:mission-complete',()=>{invoke(window.TGGV234?.pulse?.bind(window.TGGV234),'mission',.5,700);invoke(window.TGGV240?.play?.bind(window.TGGV240),'mission-complete')});
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v242');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v242ForgeBtn')){const b=document.createElement('button');b.id='v242ForgeBtn';b.className='v242-forge-btn';b.textContent='DIRECTOR';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){
      panel=document.createElement('aside');panel.id='v242ForgePanel';panel.className='v242-forge-panel';
      panel.innerHTML='<small>TGG PRESENTATION SYSTEM</small><b>SHOW DIRECTOR FORGE</b><div class="v242-forge-grid"><button data-v242="mission-intro">MISSION INTRO</button><button data-v242="concert">CONCERT</button><button data-v242="battle">RAP BATTLE</button><button data-v242="club">CLUB</button><button data-v242="showcase">SHOWCASE</button><button id="v242Next">NEXT CUE</button></div><div class="v242-cue"><small>CURRENT CUE</small><b id="v242Cue">IDLE</b><span id="v242Stats">READY</span></div><div class="v242-forge-grid"><button id="v242Auto">AUTO: ON</button><button id="v242Stop">STOP</button></div>';
      document.body.appendChild(panel);
      panel.querySelectorAll('[data-v242]').forEach(b=>b.onclick=()=>start(b.dataset.v242));
      document.getElementById('v242Next').onclick=advance;document.getElementById('v242Auto').onclick=()=>setAuto(!state.auto);document.getElementById('v242Stop').onclick=()=>stop();
    }
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v242ForgeHud';hud.className='v242-forge-hud';city.appendChild(hud)}
    bridge();renderUI();
  }
  function renderUI(){
    if(!hasDOM())return;
    const cue=document.getElementById('v242Cue'),stats=document.getElementById('v242Stats'),auto=document.getElementById('v242Auto');
    if(cue)cue.textContent=state.running?(state.sequence.toUpperCase()+' • '+String(state.cue?.id||'').toUpperCase()):'IDLE';
    if(stats)stats.textContent=state.running?('CUE '+(state.cueIndex+1)+' • '+(state.auto?'AUTO':'MANUAL')):'READY • '+state.plays+' RUNS';
    if(auto)auto.textContent='AUTO: '+(state.auto?'ON':'OFF');
    panel?.querySelectorAll('[data-v242]').forEach(b=>b.classList.toggle('active',state.running&&b.dataset.v242===state.sequence));
    if(hud)hud.innerHTML='<small>SHOW DIRECTOR</small><b>'+(state.running?state.sequence.toUpperCase():'READY')+'</b><span>'+(state.running?('CUE '+(state.cueIndex+1)+' • '+String(state.cue?.id||'').toUpperCase()):'CAMERA • LIGHT • AUDIO • CROWD')+'</span>';
  }
  function key(e){if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}}
  const api={version:VERSION,layers:LAYERS,sequences:core()?.sequences||[],status,start,advance,stop,setEnabled,setAuto,playBeat};
  globalThis.TGGV242=api;
  if(hasDOM()){window.TGGV242=api;document.addEventListener('keydown',key);ensureUI();state.ready=true}
})();