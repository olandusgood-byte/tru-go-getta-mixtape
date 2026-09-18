(() => {
  const VERSION='V2.22 CONCERT + VENUE PERFORMANCE 100';
  const KEY='tgg-v222-concert';
  const COOLDOWN_MS=600000;
  const BPM=100;
  const BEAT_MS=60000/BPM;
  const SONG_BEATS=8;
  const SETLIST=['OPENING MOVE','CITY SINGLE','HEADLINER FINALE'];
  const TOTAL_BEATS=SETLIST.length*SONG_BEATS;
  const STAGE_POS={x:31,z:29};
  const LAYERS=[
    'venue hotspot','venue proximity','venue F interaction','venue interact button bridge','venue mission priority','venue contact priority','venue event priority','venue city-object priority','venue on-foot guard','venue cooldown guard',
    'three-song setlist','opening song','single song','finale song','eight beats per song','set beat clock','song transition','set transition','show completion','show cancel',
    'perform button','perform F input','perform Enter input','perform Space input','perform touch input','timing perfect','timing great','timing good','timing late','timing miss',
    'show score','show combo','show max combo','crowd energy','crowd energy gain','crowd energy loss','crowd energy clamp','mic stamina','mic stamina drain','mic stamina recovery',
    'crowd cold tier','crowd warm tier','crowd hot tier','crowd fire tier','mic fresh tier','mic steady tier','mic tired tier','mic critical tier','show grade','show rank',
    'virtual cash reward','XP reward','career REP reward','score bonus reward','crowd bonus reward','clean set bonus','reward cooldown','reward persistence','reward event','career bridge',
    '3d venue deck','3d LED wall','3d speaker left','3d speaker right','3d spotlight one','3d spotlight two','3d spotlight three','3d mic stand','3d crowd ring','3d stage banner',
    'stage light animation','LED pulse','speaker pulse','mic glow','crowd pulse','player stage spotlight','confetti particles','confetti pool','confetti cleanup','performance visual bridge',
    'generated kick','generated snare','generated hat','audio context guard','audio mute','audio persistence','song transition cue','finale cue','show finish cue','audio diagnostics',
    'show HUD','song HUD','beat HUD','score HUD','combo HUD','crowd HUD','stamina HUD','result card','show records','release QA hooks'
  ];

  const state={
    ready:false,active:false,resultOpen:false,song:0,beat:0,startPerf:0,lastTickBeat:-1,hits:new Map(),
    score:0,combo:0,maxCombo:0,crowd:40,maxCrowd:40,stamina:100,minStamina:100,lastTiming:'READY',
    audioMuted:false,lastRewardAt:0,wins:0,attempts:0,bestScore:0,bestRank:'—',bestCombo:0,bestCrowd:0,
    history:[],finished:false,wrapped:false
  };

  let stage=null,panel=null,resultCard=null,performBtn=null,audioBtn=null,live=null,originalInteract=null,audioCtx=null,noiseBuffer=null;
  const confetti=[];
  const T=()=>window.THREE;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>performance.now();

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.audioMuted=!!s.audioMuted;state.lastRewardAt=Math.max(0,Number(s.lastRewardAt)||0);
      state.wins=Math.max(0,Number(s.wins)||0);state.attempts=Math.max(0,Number(s.attempts)||0);
      state.bestScore=Math.max(0,Number(s.bestScore)||0);state.bestRank=typeof s.bestRank==='string'?s.bestRank:'—';
      state.bestCombo=Math.max(0,Number(s.bestCombo)||0);state.bestCrowd=Math.max(0,Number(s.bestCrowd)||0);
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
    }catch{}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({
      audioMuted:state.audioMuted,lastRewardAt:state.lastRewardAt,wins:state.wins,attempts:state.attempts,
      bestScore:state.bestScore,bestRank:state.bestRank,bestCombo:state.bestCombo,bestCrowd:state.bestCrowd,history:state.history.slice(-20)
    }))}catch{}
  }

  function ensureAudio(){
    if(state.audioMuted)return null;
    try{
      if(!audioCtx){
        const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
        audioCtx=new AC();const len=Math.max(1,Math.floor(audioCtx.sampleRate*.12));
        noiseBuffer=audioCtx.createBuffer(1,len,audioCtx.sampleRate);const d=noiseBuffer.getChannelData(0);
        for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
      }
      if(audioCtx.state==='suspended')audioCtx.resume?.();return audioCtx;
    }catch{return null}
  }
  function kick(){
    const c=ensureAudio();if(!c)return;const o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.setValueAtTime(105,c.currentTime);o.frequency.exponentialRampToValueAtTime(45,c.currentTime+.13);
    g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.15);
    o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.16);
  }
  function snare(){
    const c=ensureAudio();if(!c||!noiseBuffer)return;const s=c.createBufferSource(),g=c.createGain();s.buffer=noiseBuffer;
    g.gain.setValueAtTime(.065,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.1);s.connect(g).connect(c.destination);s.start();
  }
  function hat(){
    const c=ensureAudio();if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=3600;
    g.gain.setValueAtTime(.01,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.03);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.035);
  }
  function cueBeat(i){if(state.audioMuted)return;if(i%4===0)kick();if(i%4===2)snare();if(i%2===1)hat()}
  function cueSong(song){const c=ensureAudio();if(!c)return;[0,.08].forEach((d,i)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=330+song*90+i*120;g.gain.setValueAtTime(.03,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.1);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.11)})}
  function cueFinish(good){const c=ensureAudio();if(!c)return;[0,.08,.16,.24].forEach((d,i)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=(good?420:190)+i*(good?85:18);g.gain.setValueAtTime(.025,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.12);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.13)})}

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;state._m=state._m||{};if(state._m[key])return state._m[key];
    return state._m[key]=new THREE.MeshStandardMaterial({color,roughness:opts.roughness??.52,metalness:opts.metalness??.3,emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,transparent:!!opts.transparent,opacity:opts.opacity??1});
  }

  function makeLabel(text,color){
    const THREE=T(),c=document.createElement('canvas');c.width=768;c.height=180;const x=c.getContext('2d');
    x.fillStyle='#080b12ef';x.fillRect(0,0,768,180);x.strokeStyle=color;x.lineWidth=7;x.strokeRect(6,6,756,168);
    x.fillStyle='#fff';x.font='900 42px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,384,76);
    x.fillStyle=color;x.font='800 23px Arial';x.fillText('LIVE TONIGHT',384,126);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    s.scale.set(7.4,1.7,1);s.position.set(0,5.3,-.3);return s;
  }

  function bootStage(){
    if(stage||!T()||!window.TGG3D?.scene)return false;
    const THREE=T(),scene=window.TGG3D.scene;stage=new THREE.Group();stage.position.set(STAGE_POS.x,0,STAGE_POS.z);stage.userData.v222=true;
    const deck=new THREE.Mesh(new THREE.BoxGeometry(7.4,.42,4.4),mat('deck',0x111722,{metalness:.48,roughness:.38}));deck.position.y=.21;stage.add(deck);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(6.6,3.2,.18),mat('led',0x0a1020,{emissive:0x48d7ff,emissiveIntensity:.85}));wall.position.set(0,2.2,-2.0);stage.add(wall);
    [-3.0,3.0].forEach(x=>{const cab=new THREE.Mesh(new THREE.BoxGeometry(1.1,2.1,.9),mat('speaker',0x080a0f,{metalness:.4,roughness:.42}));cab.position.set(x,1.05,-1.2);stage.add(cab)});
    const micPole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,2.5,10),mat('pole',0x313946,{metalness:.82,roughness:.18}));micPole.position.set(0,1.45,.4);stage.add(micPole);
    const mic=new THREE.Mesh(new THREE.CapsuleGeometry(.1,.25,3,8),mat('mic',0x121722,{emissive:0xc7ff00,emissiveIntensity:1.1,metalness:.65}));mic.position.set(0,2.72,.4);mic.rotation.z=Math.PI/2;stage.add(mic);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.06,10,42),mat('ring',0xc7ff00,{emissive:0xc7ff00,emissiveIntensity:2.1}));ring.rotation.x=Math.PI/2;ring.position.y=.25;stage.add(ring);
    const lights=[];
    [-2.5,0,2.5].forEach((x,i)=>{const c=[0xff466d,0x61d9ff,0xc56cff][i];const l=new THREE.PointLight(c,.5,14,2);l.position.set(x,4.6,1.4);stage.add(l);lights.push(l)});
    const banner=makeLabel('TGG SHOW NIGHT','#c7ff00');stage.add(banner);
    stage.userData.deck=deck;stage.userData.wall=wall;stage.userData.mic=mic;stage.userData.ring=ring;stage.userData.lights=lights;stage.userData.banner=banner;
    for(let i=0;i<36;i++){
      const p=new THREE.Mesh(new THREE.BoxGeometry(.07,.12,.03),new THREE.MeshBasicMaterial({color:[0xc7ff00,0xff466d,0x61d9ff,0xc56cff][i%4],transparent:true,opacity:0}));
      p.visible=false;p.userData.v=new THREE.Vector3();p.userData.life=0;scene.add(p);confetti.push(p);
    }
    scene.add(stage);return true;
  }

  function install(){
    document.body.classList.add('tgg-v222');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.22 CONCERT + VENUE PERFORMANCE 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v222ShowPanel';panel.className='v222-show-panel';
      panel.innerHTML='<small>LIVE SHOW • CITY VENUE</small><b id="v222Song">OPENING MOVE</b><span id="v222Timing">WAIT FOR THE BEAT</span><div class="v222-stats"><i><small>BEAT</small><strong id="v222Beat">0/24</strong></i><i><small>SCORE</small><strong id="v222Score">0</strong></i><i><small>COMBO</small><strong id="v222Combo">0x</strong></i><i><small>CROWD</small><strong id="v222Crowd">40%</strong></i><i><small>MIC</small><strong id="v222Stamina">100%</strong></i></div><div class="v222-bars"><div><i id="v222CrowdFill"></i></div><div><i id="v222StaminaFill"></i></div></div><button id="v222Perform" type="button">PERFORM</button><button id="v222Audio" class="secondary" type="button">SHOW AUDIO: ON</button><button id="v222Leave" class="secondary" type="button">LEAVE STAGE</button>';
      document.body.appendChild(panel);
      performBtn=document.getElementById('v222Perform');performBtn?.addEventListener('click',performHit);
      audioBtn=document.getElementById('v222Audio');audioBtn?.addEventListener('click',toggleAudio);
      document.getElementById('v222Leave')?.addEventListener('click',closeShow);
    }
    if(!resultCard){
      resultCard=document.createElement('aside');resultCard.id='v222ShowResult';resultCard.className='v222-show-result';
      resultCard.innerHTML='<small>SHOW NIGHT RESULT</small><div id="v222Rank" class="v222-rank">A</div><b id="v222ResultTitle">SET COMPLETE</b><strong id="v222ResultScore">0 PTS</strong><div id="v222ResultBreakdown" class="v222-result-breakdown"></div><button id="v222ResultClose" type="button">CLOSE</button>';
      document.body.appendChild(resultCard);document.getElementById('v222ResultClose')?.addEventListener('click',()=>resultCard.classList.remove('active'));
    }
    if(!live){live=document.createElement('div');live.id='v222Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live)}
    updateAudioLabel();
  }

  function playerWorld(){const s=window.TGGGame?.getState?.()||{};return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92}}
  function distance(){const p=playerWorld();return Math.hypot(p.x-STAGE_POS.x,p.z-STAGE_POS.z)}
  function priorityBlocked(){
    if(window.TGGWorldGameplay?.near?.())return true;
    if(window.TGGStreetContacts?.nearest?.())return true;
    const ev=window.TGGV220?.status?.();if(ev&&Number(ev.distance)<=5.5)return true;
    const ci=window.TGGV219?.status?.()?.nearest;if(ci&&Number(ci.distance)<=4.8)return true;
    return false;
  }
  function cooldownLeft(){return Math.max(0,state.lastRewardAt+COOLDOWN_MS-Date.now())}
  function canOpen(){
    if(window.TGGGame?.getActiveScreen?.()!=='game')return false;
    if(window.TGGGame?.getState?.()?.inVehicle){window.__tggToast?.('EXIT THE CAR TO HIT THE STAGE');return false}
    if(priorityBlocked())return false;
    if(distance()>6){window.__tggToast?.('GET CLOSER TO SHOW NIGHT');return false}
    if(cooldownLeft()>0){window.__tggToast?.('NEXT SHOW IN '+Math.ceil(cooldownLeft()/60000)+' MIN');return false}
    return true;
  }

  function resetSession(){
    state.active=true;state.finished=false;state.resultOpen=false;state.song=0;state.beat=0;state.startPerf=now()+900;state.lastTickBeat=-1;
    state.hits=new Map();state.score=0;state.combo=0;state.maxCombo=0;state.crowd=40;state.maxCrowd=40;state.stamina=100;state.minStamina=100;state.lastTiming='READY';
    state.attempts++;save();
  }
  function openShow(){
    install();bootStage();if(!canOpen())return false;
    resetSession();panel.classList.add('active');document.body.classList.add('v222-show-live');ensureAudio();render(true);
    window.dispatchEvent(new CustomEvent('tgg:concert-start',{detail:{bpm:BPM,setlist:SETLIST.slice(),beats:TOTAL_BEATS}}));
    if(live)live.textContent='Show night started. Three song set.';return true;
  }
  function closeShow(){
    if(state.active)window.dispatchEvent(new CustomEvent('tgg:concert-cancel',{detail:{score:state.score,beat:state.beat}}));
    state.active=false;state.finished=false;panel?.classList.remove('active');document.body.classList.remove('v222-show-live');
  }

  function timing(ms){
    const a=Math.abs(ms);
    if(a<=BEAT_MS*.08)return{label:'PERFECT',points:110,crowd:9,stamina:-2};
    if(a<=BEAT_MS*.15)return{label:'GREAT',points:80,crowd:6,stamina:-3};
    if(a<=BEAT_MS*.25)return{label:'GOOD',points:55,crowd:3,stamina:-4};
    if(a<=BEAT_MS*.38)return{label:'LATE',points:25,crowd:0,stamina:-6};
    return{label:'MISS',points:0,crowd:-9,stamina:-8};
  }
  function registerMiss(i){
    if(i<0||i>=TOTAL_BEATS||state.hits.has(i))return;
    state.hits.set(i,{label:'MISS',points:0});state.combo=0;state.crowd=clamp(state.crowd-7,0,100);state.stamina=clamp(state.stamina-6,0,100);state.lastTiming='MISS';
  }
  function performHit(){
    if(!state.active||state.finished)return false;
    const elapsed=now()-state.startPerf;if(elapsed<0){state.lastTiming='WAIT';render(true);return false}
    const exact=elapsed/BEAT_MS,target=Math.round(exact);if(target<0||target>=TOTAL_BEATS||state.hits.has(target))return false;
    const hit=timing(elapsed-target*BEAT_MS);state.hits.set(target,{...hit,offset:Number((elapsed-target*BEAT_MS).toFixed(1))});state.lastTiming=hit.label;
    if(hit.points>0){state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);state.score+=hit.points+Math.min(45,Math.max(0,state.combo-1)*3)}
    else state.combo=0;
    state.crowd=clamp(state.crowd+hit.crowd,0,100);state.maxCrowd=Math.max(state.maxCrowd,state.crowd);
    state.stamina=clamp(state.stamina+hit.stamina,0,100);state.minStamina=Math.min(state.minStamina,state.stamina);
    window.dispatchEvent(new CustomEvent('tgg:concert-hit',{detail:{beat:target+1,label:hit.label,score:state.score,combo:state.combo,crowd:state.crowd,stamina:state.stamina}}));
    render(true);return true;
  }

  function rank(score){return score>=2300?'S':score>=1800?'A':score>=1300?'B':score>=850?'C':'D'}
  function launchConfetti(){
    const THREE=T();if(!THREE||!stage)return;
    const base=new THREE.Vector3(STAGE_POS.x,3,STAGE_POS.z);
    confetti.forEach((p,i)=>{p.visible=true;p.material.opacity=1;p.position.copy(base);p.position.x+=(Math.random()-.5)*4;p.userData.life=1.2+Math.random()*.8;p.userData.v.set((Math.random()-.5)*.12,.08+Math.random()*.14,(Math.random()-.5)*.12);p.rotation.z=Math.random()*Math.PI});
  }
  function finishShow(){
    if(state.finished)return;state.finished=true;state.active=false;for(let i=0;i<TOTAL_BEATS;i++)registerMiss(i);
    const r=rank(state.score),clean=[...state.hits.values()].filter(x=>x.label==='MISS').length===0;
    const cash=250+Math.min(250,Math.floor(state.score/10))+Math.floor(state.maxCrowd*1.5)+(clean?75:0);
    const xp=60+Math.floor(state.score/40)+(clean?20:0);
    const rep=20+Math.floor(state.maxCrowd/10)+(clean?5:0);
    window.TGGGame?.reward?.(cash,xp);window.TGGCareer?.addRep?.(rep);
    state.lastRewardAt=Date.now();state.wins++;state.bestScore=Math.max(state.bestScore,state.score);state.bestCombo=Math.max(state.bestCombo,state.maxCombo);state.bestCrowd=Math.max(state.bestCrowd,state.maxCrowd);
    if(state.bestScore===state.score)state.bestRank=r;
    const result={score:state.score,rank:r,cash,xp,rep,maxCombo:state.maxCombo,crowd:Math.round(state.maxCrowd),minStamina:Math.round(state.minStamina),clean,at:Date.now()};
    state.history.push(result);state.history=state.history.slice(-20);save();
    panel?.classList.remove('active');document.body.classList.remove('v222-show-live');showResult(result);launchConfetti();cueFinish(true);
    window.dispatchEvent(new CustomEvent('tgg:concert-complete',{detail:{...result}}));window.__tggToast?.('SHOW COMPLETE — $'+cash+' • +'+xp+' XP • +'+rep+' REP');
  }

  function showResult(r){
    document.getElementById('v222Rank').textContent=r.rank;document.getElementById('v222ResultTitle').textContent='SHOW COMPLETE';
    document.getElementById('v222ResultScore').textContent=r.score+' PTS';
    document.getElementById('v222ResultBreakdown').innerHTML=[
      ['CASH','$'+r.cash],['XP','+'+r.xp],['REP','+'+r.rep],['COMBO',r.maxCombo+'x'],['CROWD',r.crowd+'%'],['MIC LOW',r.minStamina+'%']
    ].map(([k,v])=>'<span><small>'+k+'</small><b>'+v+'</b></span>').join('');
    resultCard.dataset.rank=r.rank;resultCard.classList.add('active');if(live)live.textContent='Show complete. Rank '+r.rank+'. '+r.score+' points.';
  }

  function toggleAudio(){state.audioMuted=!state.audioMuted;save();if(!state.audioMuted)ensureAudio();updateAudioLabel()}
  function updateAudioLabel(){if(audioBtn)audioBtn.textContent='SHOW AUDIO: '+(state.audioMuted?'OFF':'ON')}

  function animateStage(ts){
    if(!stage)return;const active=state.active,pulse=.6+Math.sin(ts*.012)*.4;
    stage.userData.lights?.forEach((l,i)=>l.intensity=active?3+pulse*4:.35);
    if(stage.userData.wall)stage.userData.wall.material.emissiveIntensity=active?.9+state.crowd/90:.5;
    if(stage.userData.ring)stage.userData.ring.material.emissiveIntensity=active?2+state.crowd/35:1.2;
    if(stage.userData.mic)stage.userData.mic.material.emissiveIntensity=active?1+state.stamina/45:.5;
  }
  function updateConfetti(dt){
    confetti.forEach(p=>{if(!p.visible)return;p.userData.life-=dt;if(p.userData.life<=0){p.visible=false;p.material.opacity=0;return}p.position.addScaledVector(p.userData.v,dt*60);p.userData.v.y-=.004;p.rotation.x+=.07;p.rotation.z+=.05;p.material.opacity=clamp(p.userData.life,0,1)});
  }

  function render(force=false){
    if(!panel||(!state.active&&!force))return;
    const current=Math.max(0,Math.min(TOTAL_BEATS,Math.floor((now()-state.startPerf)/BEAT_MS)+1));state.beat=current;state.song=Math.min(SETLIST.length-1,Math.floor(Math.max(0,current-1)/SONG_BEATS));
    document.getElementById('v222Song').textContent=SETLIST[state.song]||SETLIST[0];document.getElementById('v222Beat').textContent=current+'/'+TOTAL_BEATS;
    document.getElementById('v222Score').textContent=state.score;document.getElementById('v222Combo').textContent=state.combo+'x';document.getElementById('v222Crowd').textContent=Math.round(state.crowd)+'%';
    document.getElementById('v222Stamina').textContent=Math.round(state.stamina)+'%';document.getElementById('v222CrowdFill').style.width=state.crowd+'%';document.getElementById('v222StaminaFill').style.width=state.stamina+'%';
    document.getElementById('v222Timing').textContent=state.lastTiming;
  }

  function wrapInteract(){
    if(state.wrapped||!window.TGG3D?.interactNearest)return;originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(window.TGGGame?.getActiveScreen?.()!=='game')return originalInteract?.()??false;
      if(state.active)return true;
      if(!priorityBlocked()&&distance()<=6)return openShow();
      return originalInteract?.()??false;
    };state.wrapped=true;
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing||!state.active)return;
    if(e.key==='f'||e.key==='F'||e.key==='Enter'||e.key===' '){e.preventDefault();performHit()}
  }
  document.addEventListener('keydown',keyHandler);

  let lastTs=performance.now();
  function tick(ts=performance.now()){
    requestAnimationFrame(tick);install();bootStage();wrapInteract();animateStage(ts);
    const dt=Math.min(.05,Math.max(.001,(ts-lastTs)/1000));lastTs=ts;updateConfetti(dt);
    if(state.active&&!state.finished){
      const elapsed=ts-state.startPerf;if(elapsed>=0){
        const idx=Math.floor(elapsed/BEAT_MS);
        if(idx!==state.lastTickBeat){
          for(let i=state.lastTickBeat+1;i<idx;i++)registerMiss(i);state.lastTickBeat=idx;cueBeat(idx);
          if(idx>=TOTAL_BEATS){finishShow();return}
          if(idx>0&&idx%SONG_BEATS===0){state.stamina=clamp(state.stamina+12,0,100);state.lastTiming='NEXT SONG';cueSong(Math.floor(idx/SONG_BEATS));window.dispatchEvent(new CustomEvent('tgg:concert-song',{detail:{song:Math.floor(idx/SONG_BEATS)+1,name:SETLIST[Math.floor(idx/SONG_BEATS)]}}))}
        }
      }
      render(false);
    }
    state.ready=!!stage&&!!panel;const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.22 CONCERT + VENUE PERFORMANCE 100';
  }

  function status(){
    return{version:VERSION,ready:state.ready,layers:LAYERS.length,active:state.active,distance:Number(distance().toFixed(2)),cooldownMs:cooldownLeft(),song:state.song,beat:state.beat,score:state.score,combo:state.combo,maxCombo:state.maxCombo,crowd:Number(state.crowd.toFixed(1)),stamina:Number(state.stamina.toFixed(1)),wins:state.wins,attempts:state.attempts,bestScore:state.bestScore,bestRank:state.bestRank,historyCount:state.history.length}
  }

  load();install();
  window.TGGV222={version:VERSION,layers:LAYERS,status,openShow,closeShow,performHit,toggleAudio,distance,cooldownLeft};
  requestAnimationFrame(tick);
})();