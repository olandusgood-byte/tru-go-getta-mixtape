(() => {
  const VERSION='V2.25 RIVAL CREWS + STORY CHOICES 100';
  const KEY='tgg-v225-rival-crews';
  const POS={x:14,z:-31};
  const COOLDOWN_MS=300000;
  const LAYERS=[
    'rival crew hotspot','rival crew ring','rival crew beacon','rival crew banner','rival crew proximity','rival crew interact','rival crew on-foot guard','rival crew priority guard','rival crew cooldown','rival crew persistence',
    'rival leader NPC','rival hype NPC','rival producer NPC','rival idle animation','rival arm animation','rival facing behavior','rival name plate','rival role plate','rival shadow trim','rival quality trim',
    'respect choice','compete choice','collab choice','respect state','rivalry state','chemistry state','relationship tier','choice persistence','choice history','choice history cap',
    'respect reward','compete XP reward','collab cash reward','career REP bridge','crew chemistry gate','collab unlock guard','choice cooldown guard','double choice guard','encounter open event','encounter close event',
    'choice event','tier change event','relationship milestone','watching tier','rivals tier','respected tier','allies tier','dialogue watching','dialogue rivals','dialogue respected',
    'dialogue allies','leader dialogue','choice detail copy','choice consequence copy','choice unavailable copy','choice reward copy','story choice panel','story choice close','story choice title','story choice subtitle',
    'relationship meters','rivalry meter','respect meter','chemistry meter','relationship badge','choice buttons','choice disabled state','choice keyboard escape','choice accessibility live','choice mobile layout',
    'choice landscape layout','reduced motion safety','rival HUD','rival HUD distance','rival HUD tier','rival HUD cooldown','rival HUD choice','rival HUD pulse','city interaction compatibility','mission compatibility',
    'street contact compatibility','world event compatibility','concert compatibility','crew HQ compatibility','rap battle compatibility','career story compatibility','vehicle compatibility','interior compatibility','navigation compatibility','save compatibility',
    'core API bridge','core state validation','core clamp behavior','core collab gate','core relationship mapping','core history cap','rollback isolation','status API','100-layer manifest','release QA hooks'
  ];

  const state={
    ready:false,rival:null,lastEncounterAt:0,panelOpen:false,lastTier:'WATCHING',choiceLocked:false,
    encounters:0,lastChoice:null,history:[]
  };

  let group=null,panel=null,hud=null,live=null,originalInteract=null,wrapped=false,lastRender=0;
  const T=()=>window.THREE;
  const now=()=>Date.now();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function core(){return window.TGGV225Core||globalThis.TGGV225Core}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.rival=core()?.createState?.(saved.rival||{})||null;
      state.lastEncounterAt=Math.max(0,Number(saved.lastEncounterAt)||0);
      state.encounters=Math.max(0,Number(saved.encounters)||0);
      state.lastChoice=typeof saved.lastChoice==='string'?saved.lastChoice:null;
      state.history=Array.isArray(saved.history)?saved.history.slice(-20):[];
    }catch{}
    if(!state.rival)state.rival=core()?.createState?.()||{rivalry:25,respect:10,chemistry:0,history:[]};
    state.lastTier=core()?.relationshipTier?.(state.rival)||'WATCHING';
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({
      rival:state.rival,lastEncounterAt:state.lastEncounterAt,encounters:state.encounters,lastChoice:state.lastChoice,history:state.history.slice(-20)
    }))}catch{}
  }

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;state._m=state._m||{};if(state._m[key])return state._m[key];
    return state._m[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.6,metalness:opts.metalness??.2,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
  }

  function labelSprite(text,color='#ff466d'){
    const THREE=T();if(!THREE)return null;
    const c=document.createElement('canvas');c.width=640;c.height=150;const x=c.getContext('2d');
    x.fillStyle='#070a10e8';x.fillRect(0,0,640,150);x.strokeStyle=color;x.lineWidth=6;x.strokeRect(5,5,630,140);
    x.fillStyle='#fff';x.font='900 34px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,320,62);
    x.fillStyle=color;x.font='800 20px Arial';x.fillText('RIVAL CREW',320,107);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(6.3,1.5,1);s.position.y=4.7;return s;
  }

  function makeRival(name,role,color,x,z){
    const THREE=T(),g=new THREE.Group();
    const bodyMat=mat('body-'+name,color,{roughness:.55});
    const skin=mat('skin-'+name,name==='ROOK'?0x82523a:name==='NYX'?0xa66f4c:0x6f4534,{roughness:.74});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.52,1.18,4,8),bodyMat);body.position.y=1.65;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.43,14,10),skin);head.position.y=2.92;g.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.45,12,8,0,Math.PI*2,0,Math.PI*.47),mat('hair',0x08090c,{roughness:.7}));hair.position.y=3.04;g.add(hair);
    [-.68,.68].forEach((ax,i)=>{const arm=new THREE.Group(),m=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.75,3,7),bodyMat);m.position.y=-.42;arm.add(m);arm.position.set(ax,2.32,0);g.add(arm);if(i===0)g.userData.leftArm=arm;else g.userData.rightArm=arm});
    const plate=labelSprite(name+' • '+role,'#'+new THREE.Color(color).getHexString());if(plate){plate.scale.set(3.5,.84,1);plate.position.y=3.82;g.add(plate)}
    g.position.set(x,0,z);g.userData.rivalName=name;g.userData.role=role;return g;
  }

  function boot(){
    if(group||!T()||!window.TGG3D?.scene)return false;
    const THREE=T(),scene=window.TGG3D.scene;group=new THREE.Group();group.position.set(POS.x,0,POS.z);group.userData.v225=true;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.0,3.0,.14,36),mat('base',0x12151d,{metalness:.4,roughness:.42}));base.position.y=.07;group.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.1,.075,10,42),mat('ring',0xff466d,{emissive:0xff466d,emissiveIntensity:2.3}));ring.rotation.x=Math.PI/2;ring.position.y=.18;group.add(ring);
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,4.4,10),new THREE.MeshBasicMaterial({color:0xff466d,transparent:true,opacity:.22}));beacon.position.y=2.2;group.add(beacon);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(6.2,2.6,.18),mat('wall',0x10141c,{emissive:0x7b1730,emissiveIntensity:.7}));wall.position.set(0,1.5,-2.1);group.add(wall);
    const banner=labelSprite('NIGHT SHIFT','#ff466d');if(banner)group.add(banner);
    const rivals=[
      makeRival('ROOK','Leader',0xff466d,-1.15,.25),
      makeRival('NYX','Producer',0xc56cff,0,.6),
      makeRival('ACE','Hype',0x61d9ff,1.15,.25)
    ];
    rivals.forEach(r=>group.add(r));
    group.userData.ring=ring;group.userData.beacon=beacon;group.userData.wall=wall;group.userData.rivals=rivals;
    scene.add(group);return true;
  }

  function playerWorld(){
    const s=window.TGGGame?.getState?.()||{};
    return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92};
  }
  function distance(){
    const p=playerWorld();return Math.hypot(p.x-POS.x,p.z-POS.z);
  }
  function cooldownLeft(){return Math.max(0,state.lastEncounterAt+COOLDOWN_MS-now())}
  function blocked(){
    if(window.TGGWorldGameplay?.near?.())return true;
    if(window.TGGStreetContacts?.nearest?.())return true;
    const ev=window.TGGV220?.status?.();if(ev&&Number(ev.distance)<=5.5)return true;
    const ci=window.TGGV219?.status?.()?.nearest;if(ci&&Number(ci.distance)<=4.8)return true;
    const show=window.TGGV222?.status?.();if(show&&Number(show.distance)<=6)return true;
    const hq=window.TGGV224?.status?.();if(hq&&Number(hq.distance)<=6)return true;
    return false;
  }
  function crewChemistry(){return clamp(Number(window.TGGV224?.status?.()?.chemistry)||0,0,100)}
  function tier(){return core()?.relationshipTier?.(state.rival)||'WATCHING'}

  const DIALOGUE={
    WATCHING:'Rook: We see you moving. The city is still deciding what your name means.',
    RIVALS:'Rook: Every room is a scoreboard now. Bring your best every time.',
    RESPECTED:'Rook: You move clean. We can compete without wasting each other’s time.',
    ALLIES:'Rook: Different crews, same city. There might be money in moving together.'
  };

  function install(){
    document.body.classList.add('tgg-v225');
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.25 RIVAL CREWS + STORY CHOICES 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v225RivalPanel';panel.className='v225-rival-panel';
      panel.innerHTML='<div class="v225-head"><div><small>NIGHT SHIFT • RIVAL CREW</small><b id="v225Tier">WATCHING</b></div><button id="v225Close" type="button">×</button></div><div class="v225-dialogue"><span>R</span><p id="v225Dialogue"></p></div><div class="v225-meters"><label>RIVALRY <b id="v225RivalryText">25%</b><i><em id="v225RivalryFill"></em></i></label><label>RESPECT <b id="v225RespectText">10%</b><i><em id="v225RespectFill"></em></i></label><label>CHEMISTRY <b id="v225ChemText">0%</b><i><em id="v225ChemFill"></em></i></label></div><div class="v225-choices"><button data-v225-choice="respect"><b>RESPECT</b><span>Lower tension • build respect • +REP</span></button><button data-v225-choice="compete"><b>COMPETE</b><span>Raise rivalry • prove the crew • +XP</span></button><button data-v225-choice="collab"><b>COLLAB</b><span>Requires 60 crew chemistry or 75 rival respect</span></button></div><small id="v225Cooldown"></small>';
      document.body.appendChild(panel);
      document.getElementById('v225Close')?.addEventListener('click',closePanel);
      panel.querySelectorAll('[data-v225-choice]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.v225Choice)));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v225RivalHud';hud.className='v225-rival-hud';
      hud.innerHTML='<small>RIVAL CREW</small><b>NIGHT SHIFT</b><span id="v225HudInfo">WATCHING</span>';city.appendChild(hud);
    }
    if(!live){live=document.createElement('div');live.id='v225Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live)}
  }

  function openEncounter(){
    install();
    if(window.TGGGame?.getActiveScreen?.()!=='game')return false;
    if(window.TGGGame?.getState?.()?.inVehicle){window.__tggToast?.('EXIT THE CAR TO FACE NIGHT SHIFT');return false}
    if(blocked())return false;
    if(distance()>6.2){window.__tggToast?.('GET CLOSER TO NIGHT SHIFT');return false}
    const left=cooldownLeft();
    if(left>0){window.__tggToast?.('RIVAL CREW COOLDOWN — '+Math.ceil(left/60000)+' MIN');return false}
    state.panelOpen=true;state.choiceLocked=false;state.encounters++;panel.classList.add('active');renderPanel();
    window.dispatchEvent(new CustomEvent('tgg:rival-encounter-open',{detail:{crew:'night-shift',tier:tier(),encounter:state.encounters}}));
    return true;
  }
  function closePanel(){
    if(state.panelOpen)window.dispatchEvent(new CustomEvent('tgg:rival-encounter-close',{detail:{crew:'night-shift',choice:state.lastChoice,tier:tier()}}));
    state.panelOpen=false;panel?.classList.remove('active');
  }

  function applyRewards(next){
    if(next.cashDelta>0)window.TGGGame?.reward?.(next.cashDelta,0);
    if(next.xpDelta>0)window.TGGGame?.reward?.(0,next.xpDelta);
    if(next.repDelta>0)window.TGGCareer?.addRep?.(next.repDelta);
  }

  function choose(choice){
    if(!state.panelOpen||state.choiceLocked)return false;
    const before=tier(),ctx={crewChemistry:crewChemistry()};
    if(choice==='collab'&&!core()?.canCollaborate?.(state.rival,ctx)){
      window.__tggToast?.('COLLAB LOCKED — BUILD CREW CHEMISTRY OR RIVAL RESPECT');return false;
    }
    const next=core()?.applyChoice?.(state.rival,choice,ctx);if(!next||next.lastChoice!==choice)return false;
    state.choiceLocked=true;state.rival=next;state.lastChoice=choice;state.lastEncounterAt=now();applyRewards(next);
    const after=tier();
    const entry={choice,before,after,at:state.lastEncounterAt,rivalry:next.rivalry,respect:next.respect,chemistry:next.chemistry};
    state.history.push(entry);state.history=state.history.slice(-20);save();
    window.dispatchEvent(new CustomEvent('tgg:rival-choice',{detail:{...entry,crew:'night-shift'}}));
    if(after!==before)window.dispatchEvent(new CustomEvent('tgg:rival-tier-change',{detail:{crew:'night-shift',from:before,to:after}}));
    const reward=choice==='respect'?'+5 REP':choice==='compete'?'+18 XP':'+$80 • +8 REP';
    window.__tggToast?.('NIGHT SHIFT — '+choice.toUpperCase()+' • '+reward);
    renderPanel();setTimeout(closePanel,900);return true;
  }

  function renderPanel(){
    install();const r=state.rival||core()?.createState?.(),t=tier(),chem=crewChemistry();
    const q=id=>document.getElementById(id);
    q('v225Tier')&&(q('v225Tier').textContent=t);q('v225Dialogue')&&(q('v225Dialogue').textContent=DIALOGUE[t]||DIALOGUE.WATCHING);
    q('v225RivalryText')&&(q('v225RivalryText').textContent=Math.round(r.rivalry)+'%');q('v225RespectText')&&(q('v225RespectText').textContent=Math.round(r.respect)+'%');q('v225ChemText')&&(q('v225ChemText').textContent=Math.round(chem)+'%');
    q('v225RivalryFill')&&(q('v225RivalryFill').style.width=r.rivalry+'%');q('v225RespectFill')&&(q('v225RespectFill').style.width=r.respect+'%');q('v225ChemFill')&&(q('v225ChemFill').style.width=chem+'%');
    const collab=panel?.querySelector('[data-v225-choice="collab"]');if(collab)collab.disabled=!core()?.canCollaborate?.(r,{crewChemistry:chem})||state.choiceLocked;
    panel?.querySelectorAll('[data-v225-choice]').forEach(b=>{if(b.dataset.v225Choice!=='collab')b.disabled=state.choiceLocked});
    q('v225Cooldown')&&(q('v225Cooldown').textContent=state.choiceLocked?'CHOICE LOCKED • NEXT ENCOUNTER IN 5 MIN':'Your choice changes the relationship.');
    panel.dataset.tier=t.toLowerCase();
  }

  function wrapInteract(){
    if(wrapped||!window.TGG3D?.interactNearest)return;originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(window.TGGGame?.getActiveScreen?.()!=='game')return originalInteract?.()??false;
      if(state.panelOpen)return true;
      if(!blocked()&&distance()<=6.2)return openEncounter();
      return originalInteract?.()??false;
    };wrapped=true;
  }

  function animate(ts){
    if(!group)return;
    const t=tier(),active=distance()<=8;
    group.userData.ring.material.emissiveIntensity=(t==='RIVALS'?3.3:t==='ALLIES'?2.8:2.1)+(active?Math.sin(ts*.008)*.5:0);
    group.userData.beacon.material.opacity=.12+Math.abs(Math.sin(ts*.002))*.18;
    group.userData.wall.material.emissiveIntensity=t==='RIVALS'?1.25:t==='ALLIES'?.95:.65;
    group.userData.rivals.forEach((r,i)=>{
      r.rotation.y=Math.sin(ts*.0008+i)*.12;
      if(r.userData.leftArm)r.userData.leftArm.rotation.x=Math.sin(ts*.006+i)*.25;
      if(r.userData.rightArm)r.userData.rightArm.rotation.x=-Math.sin(ts*.006+i)*.25;
      r.position.y=Math.abs(Math.sin(ts*.004+i))*.018;
    });
  }

  function updateHud(){
    const show=window.TGGGame?.getActiveScreen?.()==='game'&&distance()<=11&&!blocked(),left=cooldownLeft();
    hud?.classList.toggle('active',!!show);
    const info=document.getElementById('v225HudInfo');
    if(show&&info)info.textContent=left>0?tier()+' • '+Math.ceil(left/60000)+'M':tier()+' • '+(distance()<=6.2?'F / INTERACT':Math.round(distance()*3.2)+' M');
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='Escape'&&state.panelOpen)closePanel();
  }
  document.addEventListener('keydown',keyHandler);

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);install();boot();wrapInteract();animate(ts);updateHud();
    if(state.panelOpen&&ts-lastRender>100){lastRender=ts;renderPanel()}
    state.ready=!!group&&!!core();
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.25 RIVAL CREWS + STORY CHOICES 100';
  }

  function status(){
    const r=state.rival||core()?.createState?.();
    return{
      version:VERSION,ready:state.ready,layers:LAYERS.length,crew:'NIGHT SHIFT',tier:tier(),
      rivalry:Number(r?.rivalry||0),respect:Number(r?.respect||0),chemistry:Number(r?.chemistry||0),
      crewChemistry:crewChemistry(),encounters:state.encounters,lastChoice:state.lastChoice,
      cooldownMs:cooldownLeft(),distance:Number(distance().toFixed(2)),historyCount:state.history.length,panelOpen:state.panelOpen
    };
  }

  load();install();
  window.TGGV225={version:VERSION,layers:LAYERS,status,openEncounter,closePanel,choose,distance,tier};
  requestAnimationFrame(tick);
})();