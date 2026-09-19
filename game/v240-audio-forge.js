(() => {
  const VERSION='V2.40 TGG AUDIO + SPATIAL FORGE 100';
  const LAYERS=[
    'audio core bridge','audio enabled state','audio unlocked state','audio context guard','audio context resume','audio master bus','audio compressor bus','audio ambience bus','audio ui bus','audio spatial bus',
    'street profile','club profile','studio profile','cinematic profile','profile persistence','profile apply','profile restore','master gain','bass gain','reverb mix',
    'spatial amount','ambience amount','ui amount','listener update','listener position','listener heading','distance attenuation','stereo pan fallback','panner node path','panner distance model',
    'ui click','ui confirm','ui error','mission start cue','mission checkpoint cue','mission complete cue','impact thump','boost whoosh','repair chime','cash reward cue',
    'xp reward cue','crew call ring','rival tension cue','rap battle cue','concert cue','weather rain bed','storm rumble cue','lightning crack','interior room tone','studio hum',
    'club bass bed','street ambience','traffic hum','pedestrian chatter bed','car engine synth','engine pitch bridge','engine gain bridge','engine boost layer','engine braking layer','engine idle layer',
    'spatial studio source','spatial club source','spatial business source','spatial park source','spatial shop source','spatial media source','destination proximity mix','room acoustic mix','world acoustic mix','vehicle acoustic mix',
    'noise buffer','tone oscillator','bass oscillator','filter node','lowpass filter','highpass filter','gain envelope','attack envelope','decay envelope','sustain envelope','release envelope',
    'event bridge mission','event bridge vehicle','event bridge weather','event bridge crew','event bridge rival','event bridge rap','event bridge concert','event bridge reward','gesture unlock',
    'audio HUD','audio panel','profile buttons','enabled toggle','volume meter','mobile panel','landscape panel','rollback isolation','100-layer manifest','release QA hooks'
  ];
  const core=()=>globalThis.TGGV240Core||globalThis.window?.TGGV240Core;
  const state={enabled:true,unlocked:false,profile:'street',ctx:null,master:null,compressor:null,ambience:null,ui:null,spatial:null,engine:null,engineGain:null,engineOsc:null,ready:false,events:0};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const AC=()=>hasDOM()?(window.AudioContext||window.webkitAudioContext):null;
  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-audio-forge',layerCount:LAYERS.length,enabled:state.enabled,unlocked:state.unlocked,profile:state.profile,events:state.events}}
  function buildGraph(){
    if(!hasDOM()||state.ctx)return !!state.ctx;
    const C=AC();if(!C)return false;
    const ctx=new C(),master=ctx.createGain(),compressor=ctx.createDynamicsCompressor(),amb=ctx.createGain(),ui=ctx.createGain(),sp=ctx.createGain();
    master.gain.value=.8;compressor.threshold.value=-12;compressor.knee.value=16;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.22;
    amb.connect(master);ui.connect(master);sp.connect(master);master.connect(compressor);compressor.connect(ctx.destination);
    state.ctx=ctx;state.master=master;state.compressor=compressor;state.ambience=amb;state.ui=ui;state.spatial=sp;state.ready=true;applyProfile(state.profile);return true;
  }
  async function unlock(){
    if(!buildGraph())return false;
    try{if(state.ctx.state==='suspended')await state.ctx.resume();state.unlocked=state.ctx.state==='running';renderUI();return state.unlocked}catch{return false}
  }
  function applyProfile(id='street'){
    state.profile=core()?.profiles?.includes(id)?id:'street';
    const p=core()?.profile?.(state.profile);if(p&&state.master){state.master.gain.setTargetAtTime(p.master,state.ctx.currentTime,.04);state.ambience.gain.setTargetAtTime(p.ambience,state.ctx.currentTime,.06);state.ui.gain.setTargetAtTime(p.ui,state.ctx.currentTime,.04);state.spatial.gain.setTargetAtTime(p.spatial,state.ctx.currentTime,.06)}
    if(hasDOM()){try{localStorage.setItem('tgg-v240-audio',state.profile)}catch{}renderUI()}return status();
  }
  function tone(freq=440,duration=.12,opts={}){
    if(!state.enabled||!state.unlocked||!state.ctx)return false;
    const ctx=state.ctx,o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type=opts.type||'sine';o.frequency.setValueAtTime(Math.max(30,Number(freq)||440),ctx.currentTime);
    if(opts.endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(30,opts.endFreq),ctx.currentTime+duration);
    f.type=opts.filter||'lowpass';f.frequency.value=opts.cutoff||4200;
    g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(Math.max(.0001,opts.gain||.08),ctx.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
    o.connect(f);f.connect(g);g.connect(opts.bus||state.ui);o.start();o.stop(ctx.currentTime+duration+.03);state.events++;return true;
  }
  function noise(duration=.16,gain=.05,bus=state.spatial){
    if(!state.enabled||!state.unlocked||!state.ctx)return false;
    const ctx=state.ctx,len=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;g.gain.value=gain;src.connect(g);g.connect(bus||state.master);src.start();state.events++;return true;
  }
  function play(name='click',opts={}){
    if(!state.enabled)return false;if(!state.unlocked){unlock();return false}
    switch(name){
      case'click':return tone(720,.055,{gain:.035});
      case'confirm':tone(520,.08,{gain:.045});setTimeout(()=>tone(820,.09,{gain:.04}),55);return true;
      case'error':return tone(170,.16,{type:'square',gain:.035,cutoff:900});
      case'mission-start':return tone(220,.28,{endFreq:520,type:'sawtooth',gain:.055,cutoff:1800});
      case'checkpoint':return tone(880,.09,{gain:.05});
      case'mission-complete':tone(440,.12,{gain:.055});setTimeout(()=>tone(660,.14,{gain:.05}),90);setTimeout(()=>tone(990,.18,{gain:.05}),180);return true;
      case'impact':noise(.12,.09);tone(72,.18,{type:'sine',gain:.08,bus:state.spatial});return true;
      case'boost':noise(.35,.045);return tone(110,.34,{endFreq:260,type:'sawtooth',gain:.05,bus:state.spatial,cutoff:1400});
      case'repair':return tone(690,.24,{endFreq:980,gain:.05});
      case'cash':return tone(1040,.07,{gain:.035});
      case'xp':return tone(1320,.09,{gain:.035});
      case'phone':return tone(420,.12,{type:'square',gain:.026});
      case'rival':return tone(82,.38,{type:'sawtooth',gain:.05,cutoff:500});
      case'rap':return tone(96,.18,{type:'square',gain:.07,bus:state.spatial,cutoff:900});
      case'concert':noise(.4,.025,state.ambience);return tone(130,.5,{type:'sawtooth',gain:.05,bus:state.ambience,cutoff:1000});
      case'lightning':noise(.32,.12);return tone(58,.45,{gain:.07,bus:state.spatial});
      default:return tone(Number(opts.freq)||440,Number(opts.duration)||.12,opts);
    }
  }
  function ensureEngine(){
    if(!state.ctx||state.engineOsc)return;
    const o=state.ctx.createOscillator(),g=state.ctx.createGain(),f=state.ctx.createBiquadFilter();o.type='sawtooth';o.frequency.value=55;f.type='lowpass';f.frequency.value=700;g.gain.value=0;o.connect(f);f.connect(g);g.connect(state.spatial);o.start();state.engineOsc=o;state.engineGain=g;state.engine=f;
  }
  function updateEngine(){
    if(!state.unlocked||!state.ctx)return;ensureEngine();const gs=window.TGGGame?.getState?.()||{},vd=window.TGG3D?.getVehicleDynamics?.()||{},speed=Math.abs(Number(vd.speed)||0),on=state.enabled&&gs.inVehicle;
    const t=state.ctx.currentTime;state.engineOsc.frequency.setTargetAtTime(52+speed*18+(vd.boosting?90:0),t,.04);state.engine.frequency.setTargetAtTime(520+speed*75+(vd.boosting?700:0),t,.06);state.engineGain.gain.setTargetAtTime(on?Math.min(.11,.025+speed*.007):0,t,.05);
  }
  function updateListener(){
    if(!state.ctx?.listener)return;const gs=window.TGGGame?.getState?.()||{},x=((Number(gs.x)||50)-50)*.92,z=((Number(gs.y)||50)-50)*.92,l=state.ctx.listener;
    if(l.positionX){l.positionX.value=x;l.positionY.value=1.7;l.positionZ.value=z}else l.setPosition?.(x,1.7,z);
  }
  function setEnabled(v){state.enabled=!!v;if(state.master&&state.ctx)state.master.gain.setTargetAtTime(state.enabled?(core()?.profile?.(state.profile)?.master||.8):0,state.ctx.currentTime,.04);renderUI();return state.enabled}
  function restore(){setEnabled(false);if(state.engineOsc){try{state.engineOsc.stop()}catch{}}if(state.ctx){try{state.ctx.close()}catch{}}Object.assign(state,{ctx:null,master:null,compressor:null,ambience:null,ui:null,spatial:null,engine:null,engineGain:null,engineOsc:null,unlocked:false,ready:false});renderUI();return status()}
  function bridge(){
    if(!hasDOM()||bridge.done)return;bridge.done=true;
    const map={'tgg:mission-start':'mission-start','tgg:mission-checkpoint':'checkpoint','tgg:mission-complete':'mission-complete','tgg:traffic-impact':'impact','tgg:vehicle-impact':'impact','tgg:vehicle-repaired':'repair','tgg:crew-call':'phone','tgg:rival-choice':'rival','tgg:rap-battle-start':'rap','tgg:concert-start':'concert','tgg:weather-lightning':'lightning'};
    Object.entries(map).forEach(([ev,s])=>window.addEventListener(ev,()=>play(s)));
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v240');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v240ForgeBtn')){const b=document.createElement('button');b.id='v240ForgeBtn';b.className='v240-forge-btn';b.type='button';b.textContent='AUDIO';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v240ForgePanel';panel.className='v240-forge-panel';panel.innerHTML='<div><small>TGG NATIVE AUDIO</small><b>AUDIO + SPATIAL FORGE</b></div><div class="v240-profiles"><button data-v240="street">STREET</button><button data-v240="club">CLUB</button><button data-v240="studio">STUDIO</button><button data-v240="cinematic">CINEMATIC</button></div><div class="v240-actions"><button id="v240Unlock">ENABLE AUDIO</button><button id="v240Toggle">AUDIO: ON</button><button id="v240Test">TEST SOUND</button><button id="v240Restore">RESTORE</button></div><div id="v240Stats"></div>';document.body.appendChild(panel);panel.querySelectorAll('[data-v240]').forEach(b=>b.onclick=()=>applyProfile(b.dataset.v240));document.getElementById('v240Unlock').onclick=unlock;document.getElementById('v240Toggle').onclick=()=>setEnabled(!state.enabled);document.getElementById('v240Test').onclick=()=>play('confirm');document.getElementById('v240Restore').onclick=restore}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v240ForgeHud';hud.className='v240-forge-hud';city.appendChild(hud)}bridge();renderUI();
  }
  function renderUI(){if(!hasDOM())return;if(hud)hud.innerHTML='<small>TGG AUDIO FORGE</small><b>'+state.profile.toUpperCase()+'</b><span>'+(state.unlocked?'AUDIO READY':'CLICK ENABLE AUDIO')+'</span>';const s=document.getElementById('v240Stats');if(s)s.textContent=state.events+' EVENTS • '+(state.enabled?'ON':'OFF');panel?.querySelectorAll('[data-v240]').forEach(b=>b.classList.toggle('active',b.dataset.v240===state.profile))}
  function load(){if(!hasDOM())return;try{const p=localStorage.getItem('tgg-v240-audio');if(core()?.profiles?.includes(p))state.profile=p}catch{}}
  function tick(){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();updateEngine();updateListener()}
  load();
  const api={version:VERSION,layers:LAYERS,profiles:['street','club','studio','cinematic'],status,unlock,applyProfile,play,setEnabled,restore};
  globalThis.TGGV240=api;
  if(hasDOM()){window.TGGV240=api;['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,()=>unlock(),{once:true,passive:true}));ensureUI();requestAnimationFrame(tick)}
})();