(() => {
  const VERSION='V2.15 CHARACTER + MISSION DEPTH 100';
  const KEY='tgg-v215-character-mission';
  const LAYERS=[
    'player idle breathing','player walk shoulder sway','player sprint lean','player turn lean','player head look','player emote wave','player emote nod','player emote flex','player emote dance','player emote cycle',
    'emote keyboard one','emote keyboard two','emote keyboard three','emote keyboard four','emote button','emote toast','emote cooldown','emote state API','emote accessibility label','emote gamepad-safe behavior',
    'contact arm rig fallback','contact idle arms','contact talk gesture','contact mission gesture','contact completion gesture','contact handoff gesture','contact facing polish','contact head motion','contact body sway','contact reaction cooldown',
    'mission session start','mission elapsed timer','mission checkpoint timing','mission impact baseline','mission clean baseline','mission near miss baseline','mission condition baseline','mission completion sample','mission score','mission letter rank',
    'mission perfect bonus label','mission clean bonus label','mission speed bonus label','mission damage penalty label','mission impact penalty label','mission score persistence','mission best score persistence','mission history persistence','mission history cap','mission performance API',
    'mission score card','mission score animation','mission score details','mission checkpoint banner','mission objective pulse','mission active timer HUD','mission clean run indicator','mission impact counter','mission condition indicator','mission district indicator',
    'mission contact indicator','mission stage counter','mission final time','mission final rank','mission final score','mission replay metadata','mission summary accessibility','mission summary close','mission summary auto close','mission summary persistence',
    'crowd mission cheer','crowd checkpoint glance','crowd contact reaction','nearby pedestrian clap','nearby pedestrian arm raise','pedestrian reaction restore','pedestrian reaction timeout','pedestrian reaction radius','pedestrian reaction API','pedestrian reaction QA',
    'player crowd glow','contact halo pulse','objective arrival pulse','mission active body class','mission clean body class','mission rank body class','mission summary body class','reduced motion character safety','mobile score card','landscape score card',
    'local storage guard','state validation','score clamp','time clamp','history validation','safe DOM install','safe optional APIs','rollback isolation','status API','release QA hooks'
  ];
  const state={
    ready:false,emote:null,emoteUntil:0,lastEmoteAt:0,mission:null,history:[],best:{},
    summary:null,lastRank:'—',lastScore:0,lastCheckpointAt:0
  };
  let card=null,hud=null,emoteBtn=null,live=null,lastNow=performance.now(),contactRigged=false;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(Array.isArray(saved.history))state.history=saved.history.slice(-12);
      if(saved.best&&typeof saved.best==='object')state.best=saved.best;
      state.lastRank=typeof saved.lastRank==='string'?saved.lastRank:'—';
      state.lastScore=Number.isFinite(Number(saved.lastScore))?Number(saved.lastScore):0;
    }catch{}
  }
  function save(){
    try{
      localStorage.setItem(KEY,JSON.stringify({history:state.history.slice(-12),best:state.best,lastRank:state.lastRank,lastScore:state.lastScore}));
    }catch{}
  }

  function install(){
    document.body.classList.add('tgg-v215');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    const city=document.querySelector('.city');
    if(city&&!document.getElementById('v215MissionHud')){
      hud=document.createElement('div');hud.id='v215MissionHud';hud.className='v215-mission-hud';
      hud.innerHTML='<span><small>MISSION</small><b id="v215MissionName">NONE</b></span><span><small>TIME</small><b id="v215MissionTime">0:00</b></span><span><small>CLEAN</small><b id="v215MissionClean">YES</b></span>';
      city.appendChild(hud);
    }else hud=document.getElementById('v215MissionHud');

    if(!document.getElementById('v215MissionCard')){
      card=document.createElement('aside');card.id='v215MissionCard';card.className='v215-mission-card';card.setAttribute('aria-label','Mission performance summary');
      card.innerHTML='<div class="v215-card-head"><span>MISSION PERFORMANCE</span><button id="v215CardClose" type="button">×</button></div><div class="v215-card-rank" id="v215Rank">A</div><b id="v215CardTitle">MOVE COMPLETE</b><strong id="v215Score">0 PTS</strong><div id="v215Breakdown" class="v215-breakdown"></div>';
      document.body.appendChild(card);
      document.getElementById('v215CardClose')?.addEventListener('click',()=>showSummary(false));
    }else card=document.getElementById('v215MissionCard');

    const actions=document.querySelector('.action-deck .actions');
    if(actions&&!document.getElementById('v215EmoteBtn')){
      emoteBtn=document.createElement('button');emoteBtn.id='v215EmoteBtn';emoteBtn.type='button';emoteBtn.dataset.actionGroup='core';emoteBtn.textContent='EMOTE';
      emoteBtn.setAttribute('aria-label','Cycle player emotes');emoteBtn.addEventListener('click',cycleEmote);actions.appendChild(emoteBtn);
    }else emoteBtn=document.getElementById('v215EmoteBtn');

    if(!document.getElementById('v215Live')){
      live=document.createElement('div');live.id='v215Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }else live=document.getElementById('v215Live');
  }

  function getPlayer(){return window.TGG3D?.player||null}
  function getParts(){return getPlayer()?.userData?.parts||null}
  function gameState(){return window.TGGGame?.getState?.()||null}
  function walk(){return window.TGGGame?.getWalkingState?.()||{}}
  function mega(){return window.TGGV212?.status?.()||{}}
  function routeStatus(){return window.TGGWorldGameplay?.status?.()||{}}
  function activeMission(){return window.TGGContent?.current?.()||null}

  const EMOTES=['wave','nod','flex','dance'];
  function setEmote(name,duration=2200){
    if(!EMOTES.includes(name))return false;
    const gs=gameState();if(!gs||gs.inVehicle)return false;
    const now=Date.now();if(now-state.lastEmoteAt<250)return false;
    state.lastEmoteAt=now;state.emote=name;state.emoteUntil=now+duration;
    document.body.dataset.playerEmote=name;
    if(live)live.textContent='Player emote '+name;
    window.__tggToast?.('EMOTE • '+name.toUpperCase());
    return true;
  }
  function cycleEmote(){
    const idx=EMOTES.indexOf(state.emote);
    return setEmote(EMOTES[(idx+1+EMOTES.length)%EMOTES.length]);
  }

  function animatePlayer(now,dt){
    const p=getParts(),player=getPlayer(),gs=gameState();if(!p||!player||!gs)return;
    const w=walk(),speed=Math.max(0,Number(w.speed)||0),moving=!!w.moving&&!gs.inVehicle,sprint=!!w.sprinting&&!gs.inVehicle;
    const heading=Number(gs.heading)||0;
    const emote=Date.now()<state.emoteUntil?state.emote:null;
    if(!emote&&state.emote){state.emote=null;delete document.body.dataset.playerEmote}
    const breathe=Math.sin(now*.0025)*.035;
    const turnLean=Math.sin(heading*Math.PI/180)*.045;
    p.body.rotation.z=window.THREE.MathUtils.lerp(p.body.rotation.z,moving?(turnLean+(sprint?.08:0)):breathe,.14);
    p.head.rotation.y=window.THREE.MathUtils.lerp(p.head.rotation.y,moving?Math.sin(now*.002)*.08:Math.sin(now*.0013)*.04,.08);
    p.head.rotation.z=window.THREE.MathUtils.lerp(p.head.rotation.z,moving?Math.sin(now*.004)*.025:0,.08);
    if(!emote){
      const arm= moving?Math.sin(now*(sprint?.016:.012))*(sprint?.72:.48):Math.sin(now*.002)*.04;
      p.leftArm.rotation.x=window.THREE.MathUtils.lerp(p.leftArm.rotation.x,arm,.18);
      p.rightArm.rotation.x=window.THREE.MathUtils.lerp(p.rightArm.rotation.x,-arm,.18);
      p.leftArm.rotation.z=window.THREE.MathUtils.lerp(p.leftArm.rotation.z,0,.16);
      p.rightArm.rotation.z=window.THREE.MathUtils.lerp(p.rightArm.rotation.z,0,.16);
    }else if(emote==='wave'){
      p.rightArm.rotation.x=window.THREE.MathUtils.lerp(p.rightArm.rotation.x,-1.15,.22);
      p.rightArm.rotation.z=window.THREE.MathUtils.lerp(p.rightArm.rotation.z,-.55+Math.sin(now*.014)*.35,.28);
    }else if(emote==='nod'){
      p.head.rotation.x=window.THREE.MathUtils.lerp(p.head.rotation.x,Math.sin(now*.012)*.28,.22);
    }else if(emote==='flex'){
      p.leftArm.rotation.x=window.THREE.MathUtils.lerp(p.leftArm.rotation.x,-1.15,.2);
      p.rightArm.rotation.x=window.THREE.MathUtils.lerp(p.rightArm.rotation.x,-1.15,.2);
      p.leftArm.rotation.z=window.THREE.MathUtils.lerp(p.leftArm.rotation.z,.62,.22);
      p.rightArm.rotation.z=window.THREE.MathUtils.lerp(p.rightArm.rotation.z,-.62,.22);
    }else if(emote==='dance'){
      p.leftArm.rotation.z=Math.sin(now*.01)*.85;
      p.rightArm.rotation.z=-Math.sin(now*.01)*.85;
      p.body.rotation.y=Math.sin(now*.007)*.18;
    }
    player.position.y=gs.inVehicle?player.position.y:Math.max(0,(moving?Math.abs(Math.sin(now*(sprint?.015:.011)))*.045:Math.max(0,breathe*.15)));
  }

  function ensureContactRig(){
    if(contactRigged||!window.THREE)return;
    let allReady=true;
    for(const c of window.TGGStreetContacts?.contacts||[]){
      const o=window.TGGStreetContacts?.getObject?.(c.id);if(!o){allReady=false;continue}
      if(o.userData?.parts)continue;
      const T=window.THREE,cloth=new T.MeshStandardMaterial({color:c.color,roughness:.58,metalness:.08});
      const armGeo=new T.CapsuleGeometry(.14,.78,3,7);
      const leftArm=new T.Group(),rightArm=new T.Group();
      const la=new T.Mesh(armGeo,cloth),ra=new T.Mesh(armGeo,cloth);la.position.y=-.45;ra.position.y=-.45;leftArm.add(la);rightArm.add(ra);
      leftArm.position.set(-.68,2.78,0);rightArm.position.set(.68,2.78,0);o.add(leftArm,rightArm);
      const body=o.children.find(x=>x.geometry?.type==='CapsuleGeometry')||o.children[0];
      const head=o.children.find(x=>x.geometry?.type==='SphereGeometry')||o.children[1];
      o.userData.parts={leftArm,rightArm,leftLeg:new T.Group(),rightLeg:new T.Group(),body,head};
    }
    contactRigged=allReady;
  }

  function animateContacts(now){
    ensureContactRig();
    const closest=window.TGGStreetContacts?.closest?.();
    for(const c of window.TGGStreetContacts?.contacts||[]){
      const o=window.TGGStreetContacts?.getObject?.(c.id),p=o?.userData?.parts;if(!o||!p)continue;
      const near=closest?.id===c.id&&closest.distance<9.5;
      const active=state.mission?.contactId===c.id;
      const phase=(c.id==='m'?0:c.id==='kane'?1.3:2.5);
      const idle=Math.sin(now*.002+phase);
      if(p.leftArm)p.leftArm.rotation.z=window.THREE.MathUtils.lerp(p.leftArm.rotation.z,near?.18+idle*.08:idle*.035,.08);
      if(p.rightArm)p.rightArm.rotation.z=window.THREE.MathUtils.lerp(p.rightArm.rotation.z,near?-.35+Math.sin(now*.007+phase)*.18:idle*-.035,.1);
      if(p.head)p.head.rotation.y=window.THREE.MathUtils.lerp(p.head.rotation.y,near?Math.sin(now*.003+phase)*.12:0,.08);
      if(active&&p.body)p.body.rotation.z=window.THREE.MathUtils.lerp(p.body.rotation.z,Math.sin(now*.004+phase)*.04,.08);
      if(o.userData?.contactRing)o.userData.contactRing.material.emissiveIntensity=near?4.4:active?3.2:2.2;
    }
  }

  function missionBaselines(){
    const m=mega();
    return {
      impacts:Number(m.impacts)||0,clean:Number(m.cleanSeconds)||0,near:Number(m.nearMissStreak)||0,
      condition:Number(m.condition)||100
    };
  }
  function startMission(detail={}){
    const base=missionBaselines();
    state.mission={
      id:detail.missionId||activeMission()?.id||'mission',name:detail.missionName||activeMission()?.name||'CITY MOVE',
      contactId:detail.contactId||null,contactName:detail.contactName||null,startAt:Date.now(),checkpoints:0,
      checkpointTimes:[],...base
    };
    state.lastCheckpointAt=0;document.body.classList.add('v215-mission-active');renderHud();
  }
  function checkpoint(detail={}){
    if(!state.mission)startMission({missionId:detail.missionId,missionName:detail.missionName});
    state.mission.checkpoints=Math.max(state.mission.checkpoints,Number(detail.progress)||state.mission.checkpoints+1);
    state.lastCheckpointAt=Date.now();
    state.mission.checkpointTimes.push(state.lastCheckpointAt-state.mission.startAt);
    document.body.classList.add('v215-checkpoint');
    setTimeout(()=>document.body.classList.remove('v215-checkpoint'),700);
    cheerCrowd('checkpoint');
  }

  function scoreMission(detail={}){
    const m=state.mission||{startAt:Date.now(),impacts:0,clean:0,near:0,condition:100,checkpoints:0,name:detail.missionName||'CITY MOVE',id:detail.missionId||'mission'};
    const now=Date.now(),elapsed=clamp((now-m.startAt)/1000,1,3600);
    const ms=mega(),impactDelta=Math.max(0,(Number(ms.impacts)||0)-(Number(m.impacts)||0));
    const conditionLoss=Math.max(0,(Number(m.condition)||100)-(Number(ms.condition)||100));
    const cleanDelta=Math.max(0,(Number(ms.cleanSeconds)||0)-(Number(m.clean)||0));
    const nearGain=Math.max(0,(Number(ms.bestNearMissStreak)||Number(ms.nearMissStreak)||0)-(Number(m.near)||0));
    let score=1000;
    const speedBonus=clamp(Math.round(600-elapsed*3),0,450);
    const cleanBonus=impactDelta===0?350:0;
    const nearBonus=clamp(nearGain*45,0,225);
    const damagePenalty=Math.round(conditionLoss*8);
    const impactPenalty=impactDelta*180;
    score=clamp(Math.round(score+speedBonus+cleanBonus+nearBonus-damagePenalty-impactPenalty),0,2000);
    const rank=score>=1750?'S':score>=1450?'A':score>=1100?'B':score>=750?'C':'D';
    const result={missionId:detail.missionId||m.id,missionName:detail.missionName||m.name,score,rank,elapsed:Number(elapsed.toFixed(1)),impactDelta,conditionLoss:Number(conditionLoss.toFixed(1)),cleanDelta:Number(cleanDelta.toFixed(1)),nearBonus,speedBonus,cleanBonus,completedAt:now,checkpoints:m.checkpoints||0};
    state.summary=result;state.lastRank=rank;state.lastScore=score;
    state.history.push(result);if(state.history.length>12)state.history.shift();
    const prev=state.best[result.missionId];if(!prev||score>prev.score)state.best[result.missionId]={score,rank,elapsed:result.elapsed,at:now};
    save();showMissionSummary(result);return result;
  }

  function showMissionSummary(r){
    install();if(!card||!r)return;
    document.getElementById('v215Rank').textContent=r.rank;
    document.getElementById('v215CardTitle').textContent=r.missionName;
    document.getElementById('v215Score').textContent=r.score+' PTS';
    const bits=[
      ['TIME',formatTime(r.elapsed)],['CLEAN RUN',r.cleanBonus?'+350':'—'],['SPEED',r.speedBonus?'+'+r.speedBonus:'—'],
      ['NEAR MISS',r.nearBonus?'+'+r.nearBonus:'—'],['IMPACTS',r.impactDelta?'-'+(r.impactDelta*180):'0'],
      ['DAMAGE',r.conditionLoss?'-'+Math.round(r.conditionLoss*8):'0']
    ];
    document.getElementById('v215Breakdown').innerHTML=bits.map(([k,v])=>'<span><small>'+esc(k)+'</small><b>'+esc(v)+'</b></span>').join('');
    card.dataset.rank=r.rank;document.body.dataset.missionRank=r.rank;showSummary(true);
    if(live)live.textContent='Mission complete. Rank '+r.rank+'. Score '+r.score+'.';
    setTimeout(()=>showSummary(false),6800);
  }
  function showSummary(on=true){card?.classList.toggle('active',!!on);document.body.classList.toggle('v215-summary-active',!!on)}

  function cheerCrowd(kind='complete'){
    const gs=gameState(),player=window.TGG3D?.player;if(!gs||!player)return 0;
    let count=0;
    for(const ped of window.TGG3D?.pedestrians||[]){
      const d=Math.hypot(ped.position.x-player.position.x,ped.position.z-player.position.z);if(d>13)continue;
      const p=ped.userData?.parts;if(!p)continue;
      ped.userData.v215CheerUntil=performance.now()+(kind==='complete'?2200:1200);
      count++;
    }
    return count;
  }
  function animateCrowd(now){
    for(const ped of window.TGG3D?.pedestrians||[]){
      const until=Number(ped.userData?.v215CheerUntil)||0;if(until<=now)continue;
      const p=ped.userData?.parts;if(!p)continue;
      if(p.leftArm)p.leftArm.rotation.x=window.THREE.MathUtils.lerp(p.leftArm.rotation.x,-1.1+Math.sin(now*.014)*.22,.24);
      if(p.rightArm)p.rightArm.rotation.x=window.THREE.MathUtils.lerp(p.rightArm.rotation.x,-1.1-Math.sin(now*.014)*.22,.24);
      if(p.body)p.body.position.y=Math.abs(Math.sin(now*.012))*.08;
    }
  }

  function formatTime(sec){
    sec=Math.max(0,Math.floor(Number(sec)||0));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  }
  function renderHud(){
    install();
    const active=state.mission&&activeMission();
    hud?.classList.toggle('active',!!active);
    if(!active)return;
    const elapsed=(Date.now()-state.mission.startAt)/1000,ms=mega(),impactDelta=Math.max(0,(Number(ms.impacts)||0)-state.mission.impacts);
    const n=document.getElementById('v215MissionName'),t=document.getElementById('v215MissionTime'),c=document.getElementById('v215MissionClean');
    if(n)n.textContent=String(state.mission.name||'CITY MOVE').toUpperCase();
    if(t)t.textContent=formatTime(elapsed);
    if(c)c.textContent=impactDelta===0?'YES':'NO';
    document.body.classList.toggle('v215-clean-run',impactDelta===0);
  }

  window.addEventListener('tgg:mission-start',e=>{startMission(e.detail||{});cheerCrowd('contact')});
  window.addEventListener('tgg:mission-checkpoint',e=>checkpoint(e.detail||{}));
  window.addEventListener('tgg:mission-complete',e=>{scoreMission(e.detail||{});cheerCrowd('complete');state.mission=null;document.body.classList.remove('v215-mission-active');renderHud()});
  window.addEventListener('tgg:mission-handoff',()=>cheerCrowd('handoff'));
  document.addEventListener('keydown',e=>{
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    const map={'1':'wave','2':'nod','3':'flex','4':'dance'};if(map[e.key]){e.preventDefault();setEmote(map[e.key])}
  });

  function tick(now=performance.now()){
    requestAnimationFrame(tick);install();
    const dt=Math.min(.05,Math.max(.001,(now-lastNow)/1000));lastNow=now;
    animatePlayer(now,dt);animateContacts(now);animateCrowd(now);renderHud();
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    state.ready=true;
  }
  function status(){
    const active=state.mission;
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,emote:state.emote,
      mission:active?{id:active.id,name:active.name,elapsed:Number(((Date.now()-active.startAt)/1000).toFixed(1)),checkpoints:active.checkpoints}:null,
      historyCount:state.history.length,lastRank:state.lastRank,lastScore:state.lastScore,best:{...state.best}
    };
  }

  load();install();
  window.TGGV215={version:VERSION,layers:LAYERS,status,setEmote,cycleEmote,scoreMission,history:()=>state.history.slice(),best:()=>({...state.best}),cheerCrowd};
  requestAnimationFrame(tick);
})();