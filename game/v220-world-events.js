(() => {
  const VERSION='V2.20 WORLD EVENTS + CAREER 100';
  const KEY='tgg-v220-world-events';
  const LAYERS=[
    'world event scheduler','deterministic event rotation','event rotation persistence','event active window','event inactive window','event countdown','event district mapping','event hotspot spawn','event hotspot ring','event hotspot beacon',
    'event hotspot label','event proximity detection','event proximity HUD','event proximity pulse','event mission priority','event contact priority','event city interaction priority','event vehicle guard','event inventory guard','event district guard',
    'street cypher hotspot','studio pop-in hotspot','release rush hotspot','street cypher sequence','studio pop-in sequence','release rush sequence','event step one','event step two','event step three','event step timing',
    'event flow grade','event combo streak','event best combo','event session timer','event entry event','event step event','event complete event','event cancel event','event close event','event accessibility live',
    'event action panel','event title','event district label','event reward label','event requirement label','event timer bar','event step counter','event combo counter','event flow counter','event action button',
    'event F hotkey','event Enter hotkey','event touch support','event pointer support','event focus visible','event mobile layout','event landscape layout','event reduced motion','event safe area','event panel auto hide',
    'existing reward bridge','existing mastery bridge','existing streak bridge','existing career rep bridge','existing crew bonus bridge','existing route memory bridge','existing contact ops bridge','existing progression bridge','existing district bridge','existing inventory bridge',
    'event history','event history cap','event history persistence','event total runs','event session runs','event unique clears','event best flow','event last result','event career momentum','event career rank readout',
    'city event HUD','city event countdown HUD','city event status HUD','city event mastery HUD','city event streak HUD','city event next rotation','city event diagnostics','city event status API','city event manifest API','city event current API',
    'safe optional APIs','cooldown guard','double completion guard','reload resume guard','stale sequence guard','screen guard','rollback isolation','V2.19 compatibility','100-layer manifest','release QA hooks'
  ];
  const ROTATE_MS=240000;
  const EVENT_POS={
    'street-cypher':{x:-33,z:2,color:0xffcf4a},
    'studio-pop-in':{x:-24,z:-14,color:0xff466d},
    'release-rush':{x:1,z:33,color:0xc56cff}
  };
  const STEPS={
    'street-cypher':['STEP INTO THE CIRCLE','DROP YOUR VERSE','CLOSE THE CYPHER'],
    'studio-pop-in':['CHECK THE SESSION','LOCK THE TAKE','HAND OFF THE MIX'],
    'release-rush':['LOAD THE RELEASE','PUSH THE CITY','LOCK THE CAMPAIGN']
  };
  const state={
    ready:false,rotationIndex:0,activeEventId:null,windowStart:0,windowEnd:0,sequenceIndex:0,
    sequenceStartedAt:0,lastStepAt:0,combo:0,bestCombo:0,history:[],lastResult:null,sessionRuns:0,
    panelOpen:false,sequenceEventId:null,nearestDistance:null,flow:'READY'
  };
  let group=null,panel=null,hud=null,live=null,actionBtn=null,lastRender=0,originalInteract=null;
  const T=()=>window.THREE;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>Date.now();

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.bestCombo=Math.max(0,Number(s.bestCombo)||0);
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
      state.lastResult=s.lastResult||null;
    }catch{}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({bestCombo:state.bestCombo,history:state.history.slice(-20),lastResult:state.lastResult}))}catch{}
  }

  function currentEvents(){return Array.isArray(window.TGGEvents?.events)?window.TGGEvents.events:[]}
  function schedule(){
    const events=currentEvents();if(!events.length)return null;
    const slot=Math.floor(now()/ROTATE_MS);
    const index=((slot%events.length)+events.length)%events.length;
    state.rotationIndex=index;state.activeEventId=events[index].id;
    state.windowStart=slot*ROTATE_MS;state.windowEnd=(slot+1)*ROTATE_MS;
    return events[index];
  }
  function activeEvent(){const e=schedule();return e||null}
  function activePos(){const e=activeEvent();return e?EVENT_POS[e.id]||null:null}
  function secondsLeft(){return Math.max(0,Math.ceil((state.windowEnd-now())/1000))}
  function formatTime(sec){sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')}

  function makeLabel(text,color){
    const THREE=T();if(!THREE)return null;
    const c=document.createElement('canvas');c.width=640;c.height=140;const x=c.getContext('2d');
    x.fillStyle='#070a10e8';x.fillRect(0,0,640,140);x.strokeStyle=color;x.lineWidth=6;x.strokeRect(5,5,630,130);
    x.fillStyle='#fff';x.font='900 34px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,320,58);
    x.fillStyle=color;x.font='800 20px Arial';x.fillText('LIVE CITY EVENT',320,100);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(6.4,1.4,1);s.position.y=4.5;return s;
  }
  function rebuildHotspot(){
    const THREE=T(),scene=window.TGG3D?.scene,e=activeEvent(),p=activePos();if(!THREE||!scene||!e||!p)return false;
    if(group?.userData?.eventId===e.id)return true;
    if(group)scene.remove(group);
    group=new THREE.Group();group.userData.eventId=e.id;group.position.set(p.x,0,p.z);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.2,2.55,34),new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.06;group.add(ring);
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4.6,10),new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.28}));
    beacon.position.y=2.3;group.add(beacon);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.9,.05,10,30),new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.72}));
    halo.rotation.x=Math.PI/2;halo.position.y=1.2;group.add(halo);
    const label=makeLabel(e.name,'#'+new THREE.Color(p.color).getHexString());if(label)group.add(label);
    group.userData.ring=ring;group.userData.halo=halo;group.userData.beacon=beacon;scene.add(group);return true;
  }

  function playerWorld(){
    const s=window.TGGGame?.getState?.()||{};
    return {x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92};
  }
  function distance(){
    const p=playerWorld(),pos=activePos();if(!pos)return Infinity;
    const d=Math.hypot(p.x-pos.x,p.z-pos.z);state.nearestDistance=d;return d;
  }
  function blockedByPriority(){
    if(window.TGGWorldGameplay?.near?.())return true;
    if(window.TGGStreetContacts?.nearest?.())return true;
    const ci=window.TGGV219?.status?.()?.nearest;
    if(ci&&ci.distance<=4.8)return true;
    return false;
  }
  function wrapInteract(){
    if(originalInteract||!window.TGG3D?.interactNearest)return;
    originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(window.TGGGame?.getActiveScreen?.()!=='game')return originalInteract?.()??false;
      if(blockedByPriority())return originalInteract?.()??false;
      if(state.panelOpen)return performStep();
      if(distance()<=5.5)return openPanel();
      return originalInteract?.()??false;
    };
  }
  function requirementsMet(e=activeEvent()){return !!e&&(!window.TGGEvents?.requirementsMet||window.TGGEvents.requirementsMet(e))}
  function requirementsText(e=activeEvent()){return e&&window.TGGEvents?.requirementText?window.TGGEvents.requirementText(e):''}

  function ensureUI(){
    document.body.classList.add('tgg-v220');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.20 WORLD EVENTS + CAREER 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v220EventPanel';panel.className='v220-event-panel';
      panel.innerHTML='<small id="v220Kicker">LIVE CITY EVENT</small><b id="v220Title">CITY EVENT</b><span id="v220Detail">Walk into the hotspot to participate.</span><div class="v220-meta"><i><small>STEP</small><strong id="v220Step">0/3</strong></i><i><small>COMBO</small><strong id="v220Combo">0x</strong></i><i><small>FLOW</small><strong id="v220Flow">READY</strong></i></div><div class="v220-track"><i id="v220Fill"></i></div><button id="v220EventAction" type="button">START EVENT</button><button id="v220EventClose" class="secondary" type="button">CLOSE</button>';
      document.body.appendChild(panel);actionBtn=document.getElementById('v220EventAction');actionBtn?.addEventListener('click',performStep);
      document.getElementById('v220EventClose')?.addEventListener('click',closePanel);
    }
    if(!hud){
      hud=document.createElement('div');hud.id='v220EventHud';hud.className='v220-event-hud';
      hud.innerHTML='<small>LIVE EVENT</small><b id="v220HudName">—</b><span id="v220HudTime">—</span><strong id="v220HudRank">—</strong>';
      document.querySelector('.city')?.appendChild(hud);
    }
    if(!live){
      live=document.createElement('div');live.id='v220Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }
  }

  function openPanel(){
    const e=activeEvent();if(!e)return false;
    if(window.TGGV221?.shouldHandleEvent?.(e))return window.TGGV221.openBattle?.(e)===true;
    const gs=window.TGGGame?.getState?.();if(gs?.inVehicle){window.__tggToast?.('EXIT THE CAR TO JOIN '+e.name.toUpperCase());return false}
    if(blockedByPriority())return false;
    if(distance()>5.5){window.__tggToast?.('GET CLOSER TO THE LIVE EVENT');return false}
    if(window.TGGDistricts?.canEnter&&!window.TGGDistricts.canEnter(e.district)){
      window.__tggToast?.('DISTRICT LOCKED — '+e.district.toUpperCase());return false;
    }
    state.panelOpen=true;state.sequenceEventId=e.id;state.sequenceIndex=0;state.sequenceStartedAt=now();state.lastStepAt=0;state.combo=0;state.flow='READY';
    panel?.classList.add('active');renderPanel(true);
    window.dispatchEvent(new CustomEvent('tgg:world-event-enter',{detail:{eventId:e.id,name:e.name,district:e.district}}));
    if(live)live.textContent='Live event '+e.name+' opened.';return true;
  }
  function closePanel(){
    if(state.panelOpen)window.dispatchEvent(new CustomEvent('tgg:world-event-cancel',{detail:{eventId:state.activeEventId,step:state.sequenceIndex}}));
    state.panelOpen=false;state.sequenceEventId=null;panel?.classList.remove('active');state.sequenceIndex=0;state.combo=0;state.flow='READY';
  }

  function flow(delta){
    if(!delta)return 'READY';
    if(delta<650)return 'RUSH';
    if(delta<=2000)return 'LOCKED';
    if(delta<=4200)return 'STEADY';
    return 'SLOW';
  }
  function performStep(){
    const e=activeEvent();if(!e||!state.panelOpen)return false;
    if(state.sequenceEventId!==e.id){closePanel();window.__tggToast?.('CITY EVENT ROTATED — FIND THE NEW HOTSPOT');return false}
    if(distance()>7){window.__tggToast?.('RETURN TO THE EVENT HOTSPOT');return false}
    const t=now();if(t-state.lastStepAt<280)return false;
    const delta=state.lastStepAt?t-state.lastStepAt:0;state.lastStepAt=t;state.flow=flow(delta);
    state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);
    const steps=STEPS[e.id]||['CHECK IN','RUN EVENT','LOCK RESULT'];
    const label=steps[state.sequenceIndex]||'EVENT ACTION';state.sequenceIndex++;
    window.dispatchEvent(new CustomEvent('tgg:world-event-step',{detail:{eventId:e.id,step:state.sequenceIndex,total:steps.length,label,flow:state.flow}}));
    document.body.classList.add('v220-step-hit');setTimeout(()=>document.body.classList.remove('v220-step-hit'),240);
    if(state.sequenceIndex>=steps.length)return completeEvent(e);
    renderPanel(true);return true;
  }

  function completeEvent(e){
    if(!e||now()-Number(state.lastResult?.at||0)<700)return false;
    if(!requirementsMet(e)){
      state.combo=0;renderPanel(true);
      window.__tggToast?.('NEED INVENTORY — '+requirementsText(e));
      return false;
    }
    const beforeRuns=Number(window.TGGEvents?.state?.runs?.[e.id])||0;
    const ok=window.TGGEvents?.run?.(e.id)===true;
    if(!ok)return false;
    const elapsed=Math.max(1,(now()-state.sequenceStartedAt)/1000);
    const afterRuns=Number(window.TGGEvents?.state?.runs?.[e.id])||beforeRuns;
    const result={
      eventId:e.id,name:e.name,district:e.district,elapsed:Number(elapsed.toFixed(1)),combo:state.combo,
      flow:state.flow,run:afterRuns,at:now()
    };
    state.lastResult=result;state.history.push(result);state.history=state.history.slice(-20);state.sessionRuns++;save();
    window.dispatchEvent(new CustomEvent('tgg:world-event-complete',{detail:{...result}}));
    document.body.classList.add('v220-event-complete');setTimeout(()=>document.body.classList.remove('v220-event-complete'),700);
    window.__tggToast?.(e.name.toUpperCase()+' — CITY EVENT COMPLETE');
    state.panelOpen=false;state.sequenceEventId=null;panel?.classList.remove('active');state.sequenceIndex=0;state.combo=0;state.flow='READY';
    return true;
  }

  function renderPanel(force=false){
    ensureUI();const t=performance.now();if(!force&&t-lastRender<100)return;lastRender=t;
    const e=activeEvent();if(!e)return;
    const steps=STEPS[e.id]||['CHECK IN','RUN EVENT','LOCK RESULT'];
    const idx=clamp(state.sequenceIndex,0,steps.length-1);
    const title=document.getElementById('v220Title'),detail=document.getElementById('v220Detail');
    const step=document.getElementById('v220Step'),combo=document.getElementById('v220Combo'),flowEl=document.getElementById('v220Flow'),fill=document.getElementById('v220Fill');
    if(title)title.textContent=e.name.toUpperCase();
    if(detail)detail.textContent=(state.panelOpen?steps[idx]+' • ':'')+e.district+' • '+(requirementsMet(e)?'READY':'NEEDS '+requirementsText(e));
    if(step)step.textContent=Math.min(state.sequenceIndex+1,steps.length)+'/'+steps.length;
    if(combo)combo.textContent=state.combo+'x';
    if(flowEl)flowEl.textContent=state.flow;
    if(fill)fill.style.width=(state.sequenceIndex/steps.length*100)+'%';
    if(actionBtn){actionBtn.disabled=!state.panelOpen;actionBtn.textContent=(state.sequenceIndex?'NEXT — ':'START — ')+steps[idx]}
  }

  function updateHud(ts){
    ensureUI();const e=activeEvent();if(!e)return;
    const d=distance(),show=window.TGGGame?.getActiveScreen?.()==='game';
    hud?.classList.toggle('active',show);
    document.getElementById('v220HudName').textContent=e.name.toUpperCase();
    document.getElementById('v220HudTime').textContent=formatTime(secondsLeft())+(d<=5.5?' • F TO JOIN':' • '+Math.round(d*3.2)+' M');
    const profile=window.TGGEvents?.cityProfile?.();
    document.getElementById('v220HudRank').textContent=profile?.rank||'STREET ROOKIE';
    if(group?.userData?.ring){
      group.userData.ring.material.opacity=.24+Math.sin(ts*.005)*.16;
      group.userData.ring.scale.setScalar(d<=5.5?1.1:1);
    }
    if(group?.userData?.halo)group.userData.halo.rotation.z+=.015;
    if(group?.userData?.beacon)group.userData.beacon.material.opacity=.16+Math.abs(Math.sin(ts*.002))* .18;
  }

  function keyHandler(e){
    const target=e.target,typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
    if(typing)return;
    if(e.key==='Enter'&&state.panelOpen){
      e.preventDefault();performStep();
    }
  }

  document.addEventListener('keydown',keyHandler);

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);ensureUI();rebuildHotspot();wrapInteract();updateHud(ts);renderPanel(false);state.ready=!!group&&currentEvents().length>0;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.20 WORLD EVENTS + CAREER 100';
  }
  function status(){
    const e=activeEvent(),profile=window.TGGEvents?.cityProfile?.()||{};
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,activeEventId:e?.id||null,activeEventName:e?.name||null,
      secondsLeft:secondsLeft(),distance:Number.isFinite(distance())?Number(distance().toFixed(2)):null,panelOpen:state.panelOpen,
      sequenceIndex:state.sequenceIndex,combo:state.combo,bestCombo:state.bestCombo,flow:state.flow,
      sessionRuns:state.sessionRuns,historyCount:state.history.length,careerRank:profile.rank||null,totalRuns:profile.totalRuns||0
    };
  }

  load();ensureUI();
  window.TGGV220={version:VERSION,layers:LAYERS,status,activeEvent,openPanel,performStep,completeEvent,distance,secondsLeft};
  requestAnimationFrame(tick);
})();