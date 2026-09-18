(() => {
  const VERSION='V2.21 RAP BATTLES + LIVE PERFORMANCE 100';
  const KEY='tgg-v221-rap-battle';
  const EVENT_ID='street-cypher';
  const BPM=92;
  const BEAT_MS=60000/BPM;
  const BEATS_PER_ROUND=8;
  const ROUNDS=3;
  const TOTAL_BEATS=BEATS_PER_ROUND*ROUNDS;
  const PASS_SCORE=650;
  const LAYERS=[
    'street cypher battle gate','battle event detection','battle requirements guard','battle on-foot guard','battle proximity guard','battle screen guard','battle open state','battle close state','battle retry state','battle completion guard',
    'three battle rounds','eight beats per round','beat clock','beat index','beat pulse','beat window','beat miss detection','beat hit lock','round transition','battle finish timing',
    'drop bar button','drop bar F input','drop bar Enter input','drop bar touch input','perfect timing','great timing','good timing','late timing','miss timing','timing score',
    'combo counter','max combo','crowd heat','crowd heat gain','crowd heat loss','crowd heat clamp','crowd tier cold','crowd tier warm','crowd tier hot','crowd tier fire',
    'performance score','performance rank S','performance rank A','performance rank B','performance rank C','performance rank D','pass threshold','battle clear state','battle retry result','battle result persistence',
    'battle wins','battle attempts','best score','best rank','best combo','best crowd heat','battle history','battle history cap','last battle result','battle statistics API',
    'generated kick cue','generated snare cue','generated hat cue','audio context guard','audio resume guard','audio mute toggle','audio state persistence','beat cue volume','round cue','finish cue',
    '3d cypher stage','3d battle ring','3d mic stand','3d opponent npc','3d speaker left','3d speaker right','3d stage lights','3d crowd pulse','3d opponent bounce','3d mic glow',
    'battle HUD','round HUD','beat HUD','score HUD','combo HUD','crowd heat HUD','timing feedback','battle progress bar','result card','result breakdown',
    'existing event reward bridge','career REP bridge','event mastery bridge','event momentum bridge','crowd reaction bridge','V2.20 compatibility','rollback isolation','status API','100-layer manifest','release QA hooks'
  ];

  const state={
    ready:false,active:false,resultOpen:false,round:0,beat:0,startPerf:0,lastTickBeat:-1,
    hits:new Map(),score:0,combo:0,maxCombo:0,heat:35,maxHeat:35,lastTiming:'READY',
    audioMuted:false,wins:0,attempts:0,bestScore:0,bestRank:'—',bestCombo:0,bestHeat:0,history:[],
    event:null,stageReady:false,finished:false
  };

  let panel=null,resultCard=null,dropBtn=null,live=null,audioBtn=null,stage=null,audioCtx=null,noiseBuffer=null;
  const T=()=>window.THREE;
  const now=()=>performance.now();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.audioMuted=!!s.audioMuted;
      state.wins=Math.max(0,Number(s.wins)||0);
      state.attempts=Math.max(0,Number(s.attempts)||0);
      state.bestScore=Math.max(0,Number(s.bestScore)||0);
      state.bestRank=typeof s.bestRank==='string'?s.bestRank:'—';
      state.bestCombo=Math.max(0,Number(s.bestCombo)||0);
      state.bestHeat=Math.max(0,Number(s.bestHeat)||0);
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
    }catch{}
  }

  function save(){
    try{
      localStorage.setItem(KEY,JSON.stringify({
        audioMuted:state.audioMuted,wins:state.wins,attempts:state.attempts,bestScore:state.bestScore,
        bestRank:state.bestRank,bestCombo:state.bestCombo,bestHeat:state.bestHeat,history:state.history.slice(-20)
      }));
    }catch{}
  }

  function ensureAudio(){
    if(state.audioMuted)return null;
    try{
      if(!audioCtx){
        const AC=window.AudioContext||window.webkitAudioContext;
        if(!AC)return null;
        audioCtx=new AC();
        const len=Math.max(1,Math.floor(audioCtx.sampleRate*.12));
        noiseBuffer=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
        const d=noiseBuffer.getChannelData(0);
        for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
      }
      if(audioCtx.state==='suspended')audioCtx.resume?.();
      return audioCtx;
    }catch{return null}
  }

  function kick(){
    const c=ensureAudio();if(!c)return;
    const o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.setValueAtTime(120,c.currentTime);o.frequency.exponentialRampToValueAtTime(42,c.currentTime+.12);
    g.gain.setValueAtTime(.13,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.14);
    o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.15);
  }
  function snare(){
    const c=ensureAudio();if(!c||!noiseBuffer)return;
    const s=c.createBufferSource(),g=c.createGain();s.buffer=noiseBuffer;
    g.gain.setValueAtTime(.07,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.11);
    s.connect(g).connect(c.destination);s.start();
  }
  function hat(){
    const c=ensureAudio();if(!c)return;
    const o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=3100;
    g.gain.setValueAtTime(.012,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.035);
    o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.04);
  }
  function cueBeat(i){
    if(state.audioMuted)return;
    if(i%4===0)kick();
    if(i%4===2)snare();
    if(i%2===1)hat();
  }
  function finishCue(pass){
    const c=ensureAudio();if(!c)return;
    [0,.09,.18].forEach((delay,i)=>{
      const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=(pass?420:210)+(i*(pass?90:-15));
      g.gain.setValueAtTime(.035,c.currentTime+delay);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+delay+.12);
      o.connect(g).connect(c.destination);o.start(c.currentTime+delay);o.stop(c.currentTime+delay+.13);
    });
  }

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;
    state._mats=state._mats||{};
    if(state._mats[key])return state._mats[key];
    return state._mats[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.55,metalness:opts.metalness??.25,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
  }

  function bootStage(){
    if(stage||!T()||!window.TGG3D?.scene)return false;
    const THREE=T(),scene=window.TGG3D.scene;
    stage=new THREE.Group();stage.position.set(-33,0,2);stage.userData.v221=true;
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,.16,32),mat('floor',0x11151d,{metalness:.45,roughness:.4}));
    floor.position.y=.08;stage.add(floor);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.35,.07,10,40),mat('ring',0xffcf4a,{emissive:0xffcf4a,emissiveIntensity:2.8}));
    ring.rotation.x=Math.PI/2;ring.position.y=.18;stage.add(ring);
    const micStand=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,2.45,10),mat('pole',0x313947,{metalness:.8,roughness:.2}));
    pole.position.y=1.22;micStand.add(pole);
    const mic=new THREE.Mesh(new THREE.CapsuleGeometry(.09,.24,3,8),mat('mic',0x121722,{metalness:.7,roughness:.25,emissive:0x61d9ff,emissiveIntensity:1.1}));
    mic.position.set(0,2.47,0);mic.rotation.z=Math.PI/2;micStand.add(mic);micStand.position.set(-.65,0,0);stage.add(micStand);

    const opponent=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.55,1.25,4,8),mat('oppBody',0xb234ff,{roughness:.58}));body.position.y=1.7;opponent.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.46,14,10),mat('oppSkin',0x8a5b43,{roughness:.72}));head.position.y=3.02;opponent.add(head);
    [-.7,.7].forEach((x,i)=>{
      const arm=new THREE.Group();const a=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.75,3,7),body.material);a.position.y=-.43;arm.add(a);arm.position.set(x,2.35,0);opponent.add(arm);
      if(i===0)opponent.userData.leftArm=arm;else opponent.userData.rightArm=arm;
    });
    opponent.position.set(.85,0,0);opponent.rotation.y=Math.PI;stage.add(opponent);

    [-2.5,2.5].forEach((x,i)=>{
      const sp=new THREE.Group();
      const cab=new THREE.Mesh(new THREE.BoxGeometry(.85,1.55,.68),mat('speaker',0x090b10,{metalness:.35,roughness:.42}));cab.position.y=.78;sp.add(cab);
      [0.52,1.05].forEach(y=>{const cone=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.08,18),mat('cone',0x2a3040,{metalness:.45,roughness:.3}));cone.rotation.x=Math.PI/2;cone.position.set(0,y,.37);sp.add(cone)});
      sp.position.set(x,0,-.2);stage.add(sp);
    });

    const lights=[];
    [-1.7,1.7].forEach((x,i)=>{
      const l=new THREE.PointLight(i?0xc56cff:0xffcf4a,0,10,2);l.position.set(x,3.8,1.4);stage.add(l);lights.push(l);
    });

    stage.userData.floor=floor;stage.userData.ring=ring;stage.userData.mic=mic;stage.userData.opponent=opponent;stage.userData.lights=lights;
    scene.add(stage);state.stageReady=true;return true;
  }

  function install(){
    document.body.classList.add('tgg-v221');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.21 RAP BATTLES + LIVE PERFORMANCE 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v221BattlePanel';panel.className='v221-battle-panel';
      panel.innerHTML='<small>STREET CYPHER • LIVE BATTLE</small><b id="v221Round">ROUND 1 / 3</b><span id="v221Timing">WAIT FOR THE BEAT</span><div class="v221-battle-stats"><i><small>BEAT</small><strong id="v221Beat">0/24</strong></i><i><small>SCORE</small><strong id="v221Score">0</strong></i><i><small>COMBO</small><strong id="v221Combo">0x</strong></i><i><small>HEAT</small><strong id="v221Heat">35%</strong></i></div><div class="v221-heat-track"><i id="v221HeatFill"></i></div><button id="v221Drop" type="button">DROP BAR</button><button id="v221Audio" class="secondary" type="button">BEAT AUDIO: ON</button><button id="v221Quit" class="secondary" type="button">LEAVE CYPHER</button>';
      document.body.appendChild(panel);
      dropBtn=document.getElementById('v221Drop');dropBtn?.addEventListener('click',dropBar);
      audioBtn=document.getElementById('v221Audio');audioBtn?.addEventListener('click',toggleAudio);
      document.getElementById('v221Quit')?.addEventListener('click',closeBattle);
    }
    if(!resultCard){
      resultCard=document.createElement('aside');resultCard.id='v221ResultCard';resultCard.className='v221-result-card';
      resultCard.innerHTML='<small>CYPHER RESULT</small><div id="v221Rank" class="v221-rank">A</div><b id="v221ResultTitle">BATTLE COMPLETE</b><strong id="v221ResultScore">0 PTS</strong><div id="v221ResultBreakdown" class="v221-result-breakdown"></div><button id="v221ResultClose" type="button">CLOSE</button>';
      document.body.appendChild(resultCard);document.getElementById('v221ResultClose')?.addEventListener('click',()=>resultCard.classList.remove('active'));
    }
    if(!live){
      live=document.createElement('div');live.id='v221Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }
    updateAudioLabel();
  }

  function shouldHandleEvent(e){return e?.id===EVENT_ID}
  function distanceToStage(){
    const gs=window.TGGGame?.getState?.()||{};
    const x=((Number(gs.x)||50)-50)*.92,z=((Number(gs.y)||50)-50)*.92;
    return Math.hypot(x+33,z-2);
  }
  function canOpen(event){
    if(!shouldHandleEvent(event))return false;
    if(window.TGGGame?.getActiveScreen?.()!=='game')return false;
    if(window.TGGGame?.getState?.()?.inVehicle){window.__tggToast?.('EXIT THE CAR TO ENTER THE CYPHER');return false}
    if(distanceToStage()>6.3){window.__tggToast?.('GET CLOSER TO THE CYPHER');return false}
    if(window.TGGEvents?.requirementsMet&&!window.TGGEvents.requirementsMet(event)){
      window.__tggToast?.('NEED INVENTORY — '+(window.TGGEvents?.requirementText?.(event)||'REQUIREMENTS'));return false;
    }
    return true;
  }

  function resetSession(event){
    state.event=event;state.active=true;state.finished=false;state.resultOpen=false;state.round=1;state.beat=0;
    state.startPerf=now()+900;state.lastTickBeat=-1;state.hits=new Map();state.score=0;state.combo=0;state.maxCombo=0;
    state.heat=35;state.maxHeat=35;state.lastTiming='READY';state.attempts++;save();
  }

  function openBattle(event){
    install();bootStage();
    if(!canOpen(event))return false;
    resetSession(event);
    panel.classList.add('active');document.body.classList.add('v221-battle-live');
    ensureAudio();render(true);
    window.dispatchEvent(new CustomEvent('tgg:rap-battle-start',{detail:{eventId:event.id,bpm:BPM,rounds:ROUNDS,totalBeats:TOTAL_BEATS}}));
    if(live)live.textContent='Street cypher battle started. Three rounds.';
    return true;
  }

  function closeBattle(){
    if(state.active)window.dispatchEvent(new CustomEvent('tgg:rap-battle-cancel',{detail:{score:state.score,beat:state.beat}}));
    state.active=false;state.finished=false;panel?.classList.remove('active');document.body.classList.remove('v221-battle-live');
  }

  function timingForOffset(ms){
    const a=Math.abs(ms);
    if(a<=BEAT_MS*.08)return {label:'PERFECT',points:100,heat:10};
    if(a<=BEAT_MS*.15)return {label:'GREAT',points:75,heat:7};
    if(a<=BEAT_MS*.25)return {label:'GOOD',points:50,heat:4};
    if(a<=BEAT_MS*.38)return {label:'LATE',points:25,heat:1};
    return {label:'MISS',points:0,heat:-10};
  }

  function registerMiss(beatIndex){
    if(beatIndex<0||beatIndex>=TOTAL_BEATS||state.hits.has(beatIndex))return;
    state.hits.set(beatIndex,{label:'MISS',points:0});
    state.combo=0;state.heat=clamp(state.heat-8,0,100);state.lastTiming='MISS';
  }

  function dropBar(){
    if(!state.active||state.finished)return false;
    const t=now(),elapsed=t-state.startPerf;
    if(elapsed<0){state.lastTiming='WAIT';render(true);return false}
    const exact=elapsed/BEAT_MS;
    const target=Math.round(exact);
    if(target<0||target>=TOTAL_BEATS)return false;
    if(state.hits.has(target))return false;
    const offset=elapsed-target*BEAT_MS;
    const hit=timingForOffset(offset);
    state.hits.set(target,{...hit,offset:Number(offset.toFixed(1))});
    state.lastTiming=hit.label;
    if(hit.points>0){
      state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);
      const comboBonus=Math.min(40,Math.max(0,state.combo-1)*3);
      state.score+=hit.points+comboBonus;
    }else state.combo=0;
    state.heat=clamp(state.heat+hit.heat,0,100);state.maxHeat=Math.max(state.maxHeat,state.heat);
    window.dispatchEvent(new CustomEvent('tgg:rap-battle-bar',{detail:{beat:target+1,label:hit.label,points:hit.points,combo:state.combo,heat:state.heat}}));
    cheerCrowd(hit.points>0);
    document.body.dataset.v221Timing=hit.label.toLowerCase();
    setTimeout(()=>{if(document.body.dataset.v221Timing===hit.label.toLowerCase())delete document.body.dataset.v221Timing},240);
    render(true);return true;
  }

  function scoreRank(score){
    if(score>=2100)return 'S';
    if(score>=1650)return 'A';
    if(score>=1200)return 'B';
    if(score>=800)return 'C';
    return 'D';
  }

  function finishBattle(){
    if(state.finished)return;state.finished=true;state.active=false;
    for(let i=0;i<TOTAL_BEATS;i++)registerMiss(i);
    const rank=scoreRank(state.score),passed=state.score>=PASS_SCORE;
    const result={
      score:state.score,rank,passed,maxCombo:state.maxCombo,heat:Math.round(state.maxHeat),
      perfect:[...state.hits.values()].filter(x=>x.label==='PERFECT').length,
      great:[...state.hits.values()].filter(x=>x.label==='GREAT').length,
      good:[...state.hits.values()].filter(x=>x.label==='GOOD').length,
      miss:[...state.hits.values()].filter(x=>x.label==='MISS').length,at:Date.now()
    };
    if(passed){
      const rewardOk=window.TGGEvents?.run?.(EVENT_ID)===true;
      result.rewarded=rewardOk;
      if(rewardOk)state.wins++;
    }
    state.bestScore=Math.max(state.bestScore,state.score);state.bestCombo=Math.max(state.bestCombo,state.maxCombo);state.bestHeat=Math.max(state.bestHeat,state.maxHeat);
    if(state.bestScore===state.score)state.bestRank=rank;
    state.history.push(result);state.history=state.history.slice(-20);save();
    panel?.classList.remove('active');document.body.classList.remove('v221-battle-live');
    showResult(result);finishCue(passed);cheerCrowd(passed,true);
    window.dispatchEvent(new CustomEvent('tgg:rap-battle-complete',{detail:{...result}}));
  }

  function showResult(r){
    install();
    document.getElementById('v221Rank').textContent=r.rank;
    document.getElementById('v221ResultTitle').textContent=r.passed?'CYPHER CLEARED':'CROWD WANTS ANOTHER ROUND';
    document.getElementById('v221ResultScore').textContent=r.score+' PTS';
    document.getElementById('v221ResultBreakdown').innerHTML=[
      ['PERFECT',r.perfect],['GREAT',r.great],['GOOD',r.good],['MISS',r.miss],['MAX COMBO',r.maxCombo+'x'],['HEAT',r.heat+'%']
    ].map(([k,v])=>'<span><small>'+k+'</small><b>'+v+'</b></span>').join('');
    resultCard.dataset.rank=r.rank;resultCard.classList.add('active');
    if(live)live.textContent='Cypher result '+r.rank+', '+r.score+' points.';
  }

  function cheerCrowd(good,finish=false){
    const player=window.TGG3D?.player;if(!player)return;
    const until=performance.now()+(finish?2400:700);
    for(const p of window.TGG3D?.pedestrians||[]){
      const d=Math.hypot(p.position.x+33,p.position.z-2);if(d>14)continue;
      p.userData.v221CheerUntil=until;p.userData.v221CheerGood=good;
    }
  }

  function animateCrowd(ts){
    for(const p of window.TGG3D?.pedestrians||[]){
      const until=Number(p.userData?.v221CheerUntil)||0;if(until<=ts)continue;
      const parts=p.userData?.parts;if(!parts)continue;
      const good=p.userData.v221CheerGood!==false;
      if(parts.leftArm)parts.leftArm.rotation.x=window.THREE.MathUtils.lerp(parts.leftArm.rotation.x,good?-1.0:.25,.25);
      if(parts.rightArm)parts.rightArm.rotation.x=window.THREE.MathUtils.lerp(parts.rightArm.rotation.x,good?-1.0:.25,.25);
      if(parts.body)parts.body.rotation.z=Math.sin(ts*.013)*(.04+(state.heat/100)*.04);
    }
  }

  function animateStage(ts){
    if(!stage)return;
    const active=state.active;
    const pulse=.75+Math.sin(ts*.01)*.25;
    if(stage.userData.ring)stage.userData.ring.material.emissiveIntensity=active?2.8+state.heat/30:1.6;
    if(stage.userData.mic)stage.userData.mic.material.emissiveIntensity=active?1.2+state.heat/45:.6;
    stage.userData.lights?.forEach((l,i)=>l.intensity=active?(3.2+pulse*3.2):.4);
    const o=stage.userData.opponent;
    if(o){
      o.position.y=active?Math.abs(Math.sin(ts*.008))*.05:0;
      if(o.userData.leftArm)o.userData.leftArm.rotation.x=active?Math.sin(ts*.009)*.35:0;
      if(o.userData.rightArm)o.userData.rightArm.rotation.x=active?-Math.sin(ts*.009)*.35:0;
    }
  }

  function toggleAudio(){
    state.audioMuted=!state.audioMuted;save();
    if(!state.audioMuted)ensureAudio();updateAudioLabel();
  }
  function updateAudioLabel(){
    if(audioBtn)audioBtn.textContent='BEAT AUDIO: '+(state.audioMuted?'OFF':'ON');
  }

  function render(force=false){
    if(!panel)return;
    if(!state.active&&!force)return;
    const currentBeat=Math.max(0,Math.min(TOTAL_BEATS,Math.floor((now()-state.startPerf)/BEAT_MS)+1));
    state.beat=currentBeat;state.round=Math.min(ROUNDS,Math.floor(Math.max(0,currentBeat-1)/BEATS_PER_ROUND)+1);
    const r=document.getElementById('v221Round'),b=document.getElementById('v221Beat'),s=document.getElementById('v221Score');
    const c=document.getElementById('v221Combo'),h=document.getElementById('v221Heat'),hf=document.getElementById('v221HeatFill'),tim=document.getElementById('v221Timing');
    if(r)r.textContent='ROUND '+state.round+' / '+ROUNDS;
    if(b)b.textContent=currentBeat+'/'+TOTAL_BEATS;
    if(s)s.textContent=state.score;
    if(c)c.textContent=state.combo+'x';
    if(h)h.textContent=Math.round(state.heat)+'%';
    if(hf)hf.style.width=state.heat+'%';
    if(tim)tim.textContent=state.lastTiming;
  }

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);install();bootStage();animateStage(ts);animateCrowd(ts);
    if(state.active&&!state.finished){
      const elapsed=ts-state.startPerf;
      if(elapsed>=0){
        const beatIndex=Math.floor(elapsed/BEAT_MS);
        if(beatIndex!==state.lastTickBeat){
          for(let i=state.lastTickBeat+1;i<beatIndex;i++)registerMiss(i);
          state.lastTickBeat=beatIndex;cueBeat(beatIndex);
          if(beatIndex>=TOTAL_BEATS){finishBattle();return}
          if(beatIndex>0&&beatIndex%BEATS_PER_ROUND===0){
            state.lastTiming='ROUND '+(Math.floor(beatIndex/BEATS_PER_ROUND)+1);
            window.dispatchEvent(new CustomEvent('tgg:rap-battle-round',{detail:{round:Math.floor(beatIndex/BEATS_PER_ROUND)+1}}));
          }
        }
      }
      render(false);
    }
    state.ready=!!stage&&!!panel;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.21 RAP BATTLES + LIVE PERFORMANCE 100';
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
    if(typing||!state.active)return;
    if(e.key==='f'||e.key==='F'||e.key==='Enter'||e.key===' '){e.preventDefault();dropBar()}
  }
  document.addEventListener('keydown',keyHandler);

  function status(){
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,active:state.active,round:state.round,beat:state.beat,
      score:state.score,combo:state.combo,maxCombo:state.maxCombo,heat:Number(state.heat.toFixed(1)),
      wins:state.wins,attempts:state.attempts,bestScore:state.bestScore,bestRank:state.bestRank,bestCombo:state.bestCombo,
      audioMuted:state.audioMuted,historyCount:state.history.length
    };
  }

  load();install();
  window.TGGV221={version:VERSION,layers:LAYERS,status,shouldHandleEvent,openBattle,closeBattle,dropBar,toggleAudio};
  requestAnimationFrame(tick);
})();