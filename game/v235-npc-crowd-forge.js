(() => {
  const VERSION='V2.35 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'npc core bridge','npc enabled state','npc district state','npc quality budget','npc crowd root','npc rebuild state','npc clear state','npc status API','npc diagnostics','npc rollback isolation',
    'profile bridge','forge schema bridge','profile height','profile shoulders','profile build','profile skin','profile top','profile pants','profile accent','profile hair',
    'downtown plan','studio row plan','shops plan','park plan','media plan','business plan','spawn clamp','spawn heading','spawn id','spawn deterministic',
    'walk behavior','idle behavior','talk behavior','phone behavior','rap behavior','cheer behavior','behavior clock','behavior phase','behavior timer','behavior switch',
    'walk route','walk heading','walk stride','walk arm swing','walk leg swing','idle breathe','idle look','talk gesture','phone pose','rap pose',
    'cheer pose','body bounce','head nod','torso twist','arm variation','leg variation','stance variation','speed variation','reaction weight','animation quality',
    'player proximity','player face tracking','car proximity','car avoidance','horn reaction','impact reaction','mission reaction','rival reaction','rap crowd reaction','concert crowd reaction',
    'audience spawn','audience arc','audience cheer','audience sway','audience focus','audience clear','audience timeout','audience quality trim','audience event bridge','audience diagnostics',
    'near LOD visible','mid LOD visible','far LOD hidden','shadow high','shadow balanced','shadow performance off','frustum cull','update staggering','mobile trim','reduced motion',
    'crowd HUD','crowd panel','district buttons','rebuild button','enabled toggle','clear button','Shift N shortcut','mobile panel','V2.34 compatibility','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,district:'downtown',root:null,audienceRoot:null,people:[],audience:[],
    qualityBuilt:null,ready:false,rebuilds:0,frames:0,reactions:0,lastAudience:null
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-npc-crowd-forge',layerCount:LAYERS.length,
      enabled:state.enabled,district:state.district,quality:quality(),people:state.people.length,
      audience:state.audience.length,rebuilds:state.rebuilds,reactions:state.reactions,frames:state.frames
    };
  }

  function mat(color,kind='cloth'){
    const THREE=T();if(!THREE)return null;
    const presets={
      skin:{roughness:.66,metalness:.02},
      cloth:{roughness:.8,metalness:.04},
      shoe:{roughness:.4,metalness:.15},
      chrome:{roughness:.16,metalness:.88},
      hair:{roughness:.84,metalness:.02}
    };
    const p=presets[kind]||presets.cloth;
    return new THREE.MeshStandardMaterial({color,roughness:p.roughness,metalness:p.metalness});
  }

  function add(parent,geo,material,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE)return null;
    const m=new THREE.Mesh(geo,material);m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    const q=quality();m.castShadow=q==='high';m.receiveShadow=q!=='performance';m.frustumCulled=true;parent.add(m);return m;
  }

  function makeNpc(profileInput,seed=0){
    const THREE=T();if(!THREE)return null;
    const normalized=window.TGGV227Core?.normalizePreset?.(profileInput)||profileInput;
    const p=normalized||core()?.profile?.(seed)||{};
    const root=new THREE.Group();root.name='tgg-crowd-npc';root.userData.v235=true;root.userData.profile=p;

    const skin=mat(p.skin??0x8f5f43,'skin');
    const top=mat(p.outfit?.top??0x111827,'cloth');
    const pants=mat(p.outfit?.pants??0x0b0e14,'cloth');
    const shoes=mat(p.outfit?.shoes??0x10131a,'shoe');
    const accent=mat(p.outfit?.accent??0xc7ff00,'chrome');
    const hair=mat(p.outfit?.hair??0x07090d,'hair');

    const h=Number(p.height)||1,b=Number(p.build)||1,s=Number(p.shoulders)||1,ll=Number(p.legLength)||1,al=Number(p.armLength)||1,hs=Number(p.headScale)||1;

    const body=new THREE.Group();body.name='npc-body';body.position.y=2.02;root.add(body);
    add(body,new THREE.CapsuleGeometry(.5*b,.78*h,5,9),top,[0,0,0],[s,1,1],[0,0,0],'npc-torso');
    add(body,new THREE.BoxGeometry(.72*b,.28,.43),pants,[0,-.78,0],[1,1,1],[0,0,0],'npc-pelvis');
    add(body,new THREE.BoxGeometry(.34,.36,.05),accent,[0,.12,.48],[1,1,1],[0,0,0],'npc-accent');

    const head=new THREE.Group();head.name='npc-head';head.position.y=3.33*h;head.scale.setScalar(hs);root.add(head);
    add(head,new THREE.SphereGeometry(.42,14,10),skin,[0,0,0],[.94,1,.92],[0,0,0],'npc-head-mesh');
    add(head,new THREE.SphereGeometry(.43,14,8,0,Math.PI*2,0,Math.PI*.5),hair,[0,.08,0],[1,.72,1],[0,0,0],'npc-hair');

    const leftArm=new THREE.Group(),rightArm=new THREE.Group();
    leftArm.name='npc-left-arm';rightArm.name='npc-right-arm';
    leftArm.position.set(-.62*s*b,2.48,0);rightArm.position.set(.62*s*b,2.48,0);
    add(leftArm,new THREE.CapsuleGeometry(.13*b,.52*al,4,8),top,[0,-.34*al,0],[1,1,1],[0,0,0],'npc-left-upper-arm');
    add(rightArm,new THREE.CapsuleGeometry(.13*b,.52*al,4,8),top,[0,-.34*al,0],[1,1,1],[0,0,0],'npc-right-upper-arm');
    add(leftArm,new THREE.CapsuleGeometry(.11*b,.42*al,4,8),skin,[0,-.85*al,0],[1,1,1],[0,0,0],'npc-left-forearm');
    add(rightArm,new THREE.CapsuleGeometry(.11*b,.42*al,4,8),skin,[0,-.85*al,0],[1,1,1],[0,0,0],'npc-right-forearm');
    root.add(leftArm,rightArm);

    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
    leftLeg.name='npc-left-leg';rightLeg.name='npc-right-leg';
    leftLeg.position.set(-.22*b,1.28,0);rightLeg.position.set(.22*b,1.28,0);
    add(leftLeg,new THREE.CapsuleGeometry(.17*b,.62*ll,4,8),pants,[0,-.42*ll,0],[1,1,1],[0,0,0],'npc-left-leg-mesh');
    add(rightLeg,new THREE.CapsuleGeometry(.17*b,.62*ll,4,8),pants,[0,-.42*ll,0],[1,1,1],[0,0,0],'npc-right-leg-mesh');
    add(leftLeg,new THREE.BoxGeometry(.35,.2,.55),shoes,[0,-.9*ll,.12],[1,1,1],[0,0,0],'npc-left-shoe');
    add(rightLeg,new THREE.BoxGeometry(.35,.2,.55),shoes,[0,-.9*ll,.12],[1,1,1],[0,0,0],'npc-right-shoe');
    root.add(leftLeg,rightLeg);

    root.userData.parts={leftArm,rightArm,leftLeg,rightLeg,body,head};
    return root;
  }

  function disposeGroup(root){
    if(!root)return;
    root.traverse?.(o=>{
      o.geometry?.dispose?.();
      const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.filter(Boolean).forEach(m=>m.dispose?.());
    });
    root.parent?.remove(root);
  }

  function clearAudience(){
    disposeGroup(state.audienceRoot);state.audienceRoot=null;state.audience=[];state.lastAudience=null;renderUI();return true;
  }

  function clear(){
    disposeGroup(state.root);state.root=null;state.people=[];clearAudience();state.ready=false;renderUI();return true;
  }

  function createPerson(spawn,index){
    const npc=makeNpc(spawn.profile,index);if(!npc)return null;
    npc.position.set(spawn.x,0,spawn.z);npc.rotation.y=spawn.heading||0;
    npc.userData.anchor={x:spawn.x,z:spawn.z};
    npc.userData.id=String(spawn.id||('npc-'+index));
    npc.userData.baseBehavior=spawn.behavior||'idle';
    npc.userData.behavior=npc.userData.baseBehavior;
    npc.userData.phase=index*.71;
    npc.userData.seed=index;
    npc.userData.speedScale=.82+(index%5)*.06;
    npc.userData.nextBehaviorAt=3000+(index%7)*800;
    npc.userData.age=0;
    return npc;
  }

  function rebuild(){
    if(!hasDOM())return status();
    const s=scene(),THREE=T();if(!s||!THREE)return status();
    disposeGroup(state.root);state.root=new THREE.Group();state.root.name='tgg-npc-crowd-root';state.root.userData.v235=true;
    const plan=core()?.spawnPlan?.(state.district,quality())||[];
    state.people=[];
    plan.forEach((spawn,i)=>{
      const npc=createPerson(spawn,i);if(!npc)return;
      state.root.add(npc);state.people.push(npc);
    });
    state.root.visible=state.enabled;s.add(state.root);
    state.qualityBuilt=quality();state.ready=true;state.rebuilds++;renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:crowd-rebuilt',{detail:{district:state.district,count:state.people.length,quality:quality()}}));
    return status();
  }

  function setDistrict(id='downtown'){
    state.district=core()?.districts?.includes(id)?id:'downtown';
    if(hasDOM())rebuild();renderUI();return state.district;
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;if(state.audienceRoot)state.audienceRoot.visible=state.enabled;
    renderUI();return state.enabled;
  }

  function setBehavior(id,behavior,duration=0){
    if(!core()?.behaviors?.includes(behavior))return false;
    const all=[...state.people,...state.audience];
    const npc=all.find(x=>x?.userData?.id===String(id)||x?.name===String(id));
    if(!npc)return false;
    const previous=npc.userData.baseBehavior||npc.userData.behavior||'idle';
    npc.userData.behavior=behavior;
    if(Number(duration)>0&&hasDOM()){
      const token=(npc.userData.behaviorToken||0)+1;
      npc.userData.behaviorToken=token;
      setTimeout(()=>{
        if(npc.userData.behaviorToken===token){
          npc.userData.behavior=previous;
          npc.userData.behaviorToken=0;
        }
      },clamp(Number(duration)||0,150,12000));
    }
    return true;
  }

  function pulseCrowd(kind='cheer',duration=2200){
    const map={concert:'cheer',rap:'rap',mission:'talk',rival:'talk',weather:'idle',phone:'phone',cheer:'cheer'};
    const behavior=map[kind]||kind;
    if(!core()?.behaviors?.includes(behavior))return false;
    const all=[...state.people,...state.audience];
    all.forEach(npc=>{
      const previous=npc.userData.baseBehavior||npc.userData.behavior||'idle';
      npc.userData.behavior=behavior;
      const token=(npc.userData.behaviorToken||0)+1;
      npc.userData.behaviorToken=token;
      if(Number(duration)>0&&hasDOM())setTimeout(()=>{
        if(npc.userData.behaviorToken===token){
          npc.userData.behavior=previous;
          npc.userData.behaviorToken=0;
        }
      },clamp(Number(duration)||2200,150,12000));
    });
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:crowd-pulse',{detail:{kind,behavior,count:all.length,duration}}));
    return behavior;
  }

  function currentPlayerWorld(){
    const gs=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(gs.x)||50)-50)*.92,z:((Number(gs.y)||50)-50)*.92};
  }

  function faceTarget(npc,target,amount=.12){
    const dx=target.x-npc.position.x,dz=target.z-npc.position.z;
    if(Math.abs(dx)+Math.abs(dz)<.001)return;
    const desired=Math.atan2(dx,dz);
    let delta=((desired-npc.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    npc.rotation.y+=delta*amount;
  }

  function neutralize(parts,rate=.16){
    for(const p of [parts.leftArm,parts.rightArm,parts.leftLeg,parts.rightLeg]){
      p.rotation.x+=(0-p.rotation.x)*rate;p.rotation.y+=(0-p.rotation.y)*rate;p.rotation.z+=(0-p.rotation.z)*rate;
    }
    parts.body.rotation.x+=(0-parts.body.rotation.x)*rate;parts.body.rotation.y+=(0-parts.body.rotation.y)*rate;parts.body.rotation.z+=(0-parts.body.rotation.z)*rate;
    parts.head.rotation.x+=(0-parts.head.rotation.x)*rate;parts.head.rotation.y+=(0-parts.head.rotation.y)*rate;parts.head.rotation.z+=(0-parts.head.rotation.z)*rate;
  }

  function animatePerson(npc,dt,ts,index,isAudience=false){
    const parts=npc.userData.parts;if(!parts)return;
    npc.userData.age+=dt;
    const motion=reducedMotion()?.38:1;
    const phase=(npc.userData.phase+=dt*(3.2+npc.userData.speedScale*2.2))*motion;
    let behavior=npc.userData.behavior||'idle';
    const player=currentPlayerWorld();
    const car=window.TGG3D?.car;
    const gs=window.TGGGame?.getState?.()||{};
    const pd=Math.hypot(player.x-npc.position.x,player.z-npc.position.z);
    const cd=car?Math.hypot(car.position.x-npc.position.x,car.position.z-npc.position.z):999;

    if(gs.inVehicle&&cd<5.5&&!isAudience){
      const dx=npc.position.x-car.position.x,dz=npc.position.z-car.position.z,d=Math.max(.01,Math.hypot(dx,dz));
      npc.position.x+=dx/d*dt*2.4;npc.position.z+=dz/d*dt*2.4;behavior='walk';state.reactions++;
    }else if(pd<5.2&&(behavior==='idle'||behavior==='talk'||behavior==='phone')){
      faceTarget(npc,player,.1);
    }

    neutralize(parts,.12);
    if(behavior==='walk'){
      const a=npc.userData.anchor;
      const radius=2.2+(index%4)*.55;
      const target={x:a.x+Math.cos(phase*.22+index)*radius,z:a.z+Math.sin(phase*.19+index*.7)*radius};
      const dx=target.x-npc.position.x,dz=target.z-npc.position.z,d=Math.max(.001,Math.hypot(dx,dz));
      npc.position.x+=dx/d*dt*.7*npc.userData.speedScale;
      npc.position.z+=dz/d*dt*.7*npc.userData.speedScale;
      faceTarget(npc,target,.18);
      const swing=Math.sin(phase*1.8)*.58*motion;
      parts.leftArm.rotation.x=swing;parts.rightArm.rotation.x=-swing;
      parts.leftLeg.rotation.x=-swing*.8;parts.rightLeg.rotation.x=swing*.8;
      parts.body.position.y=2.02+Math.abs(Math.sin(phase*1.8))*.04*motion;
    }else if(behavior==='talk'){
      parts.rightArm.rotation.x=-.35+Math.sin(phase)*.28*motion;
      parts.rightArm.rotation.z=-.32+Math.cos(phase*.8)*.14*motion;
      parts.head.rotation.y=Math.sin(phase*.6)*.09*motion;
      parts.body.rotation.y=Math.sin(phase*.45)*.08*motion;
    }else if(behavior==='phone'){
      parts.leftArm.rotation.x=-.35;parts.leftArm.rotation.z=1.08;
      parts.head.rotation.z=.09;parts.head.rotation.y=-.08;
      parts.body.position.y=2.02+Math.sin(phase*.55)*.015*motion;
    }else if(behavior==='rap'){
      parts.leftArm.rotation.x=-.5+Math.sin(phase*1.7)*.55*motion;
      parts.rightArm.rotation.x=.2-Math.sin(phase*1.7)*.72*motion;
      parts.leftArm.rotation.z=.3;parts.rightArm.rotation.z=-.2;
      parts.body.rotation.y=Math.cos(phase*.9)*.13*motion;
      parts.body.position.y=2.02+Math.abs(Math.sin(phase*1.7))*.065*motion;
      parts.head.rotation.x=Math.abs(Math.sin(phase*1.7))*.08*motion;
    }else if(behavior==='cheer'){
      parts.leftArm.rotation.z=1.1+Math.sin(phase*1.6)*.16*motion;
      parts.rightArm.rotation.z=-1.1-Math.sin(phase*1.6)*.16*motion;
      parts.body.position.y=2.02+Math.abs(Math.sin(phase*1.6))*.09*motion;
      parts.head.rotation.z=Math.sin(phase)*.06*motion;
    }else{
      parts.body.position.y=2.02+Math.sin(phase*.42)*.015*motion;
      parts.head.rotation.y=Math.sin(phase*.31+index)*.07*motion;
    }

    const q=quality(),far=pd>38,mid=pd>25;
    npc.visible=!far;
    npc.traverse?.(o=>{if(o.isMesh)o.castShadow=q==='high'&&!mid});
  }

  function spawnAudience(type='concert',duration=12000){
    if(!hasDOM())return status();
    const s=scene(),THREE=T();if(!s||!THREE)return status();
    clearAudience();
    const center=currentPlayerWorld(),q=quality(),count=q==='performance'?6:q==='balanced'?10:16;
    const g=new THREE.Group();g.name='tgg-event-audience';g.userData.v235=true;
    const list=[];
    for(let i=0;i<count;i++){
      const angle=(i/(count||1))*Math.PI*1.65-Math.PI*.825;
      const radius=5.2+(i%3)*1.05;
      const profile=core()?.profile?.(700+i)||{};
      const spawn={x:center.x+Math.sin(angle)*radius,z:center.z+Math.cos(angle)*radius,heading:angle+Math.PI,profile,behavior:type==='rap'?'rap':'cheer'};
      const npc=createPerson(spawn,100+i);if(!npc)continue;
      npc.userData.behavior=spawn.behavior;npc.userData.anchor={x:npc.position.x,z:npc.position.z};
      g.add(npc);list.push(npc);
    }
    s.add(g);state.audienceRoot=g;state.audience=list;state.lastAudience={type,expires:Date.now()+clamp(Number(duration)||12000,1500,30000)};
    renderUI();window.dispatchEvent(new CustomEvent('tgg:audience-spawned',{detail:{type,count:list.length}}));return status();
  }

  function eventBridges(){
    if(!hasDOM()||eventBridges.done)return;eventBridges.done=true;
    window.addEventListener('tgg:concert-start',()=>spawnAudience('concert',15000));
    window.addEventListener('tgg:concert-complete',()=>setTimeout(clearAudience,1800));
    window.addEventListener('tgg:rap-battle-start',()=>spawnAudience('rap',10000));
    window.addEventListener('tgg:rap-battle-round',()=>{state.audience.forEach(x=>x.userData.behavior='rap')});
    window.addEventListener('tgg:rival-choice',()=>pulseCrowd('rival',1800));
    window.addEventListener('tgg:mission-start',()=>pulseCrowd('phone',2200));
    window.addEventListener('tgg:mission-complete',()=>pulseCrowd('cheer',2600));
    window.addEventListener('tgg:weather-change',e=>{if(['rain','storm'].includes(e.detail?.preset))pulseCrowd('weather',1600)});
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='CROWD';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-districts"><button data-v235-district="downtown">DOWNTOWN</button><button data-v235-district="studio-row">STUDIO</button><button data-v235-district="shops">SHOPS</button><button data-v235-district="park">PARK</button><button data-v235-district="media">MEDIA</button><button data-v235-district="business">BUSINESS</button></div><div class="v235-actions"><button id="v235Audience" type="button">SPAWN AUDIENCE</button><button id="v235Rebuild" type="button">REBUILD CROWD</button><button id="v235Toggle" type="button">CROWD: ON</button><button id="v235Clear" type="button">CLEAR CROWD</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-district]').forEach(b=>b.addEventListener('click',()=>setDistrict(b.dataset.v235District)));
      document.getElementById('v235Audience')?.addEventListener('click',()=>spawnAudience('concert',12000));
      document.getElementById('v235Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Clear')?.addEventListener('click',clear);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG CROWD FORGE</small><b id="v235HudDistrict">DOWNTOWN</b><span id="v235HudStats">0 NPCs</span>';city.appendChild(hud);
    }
    eventBridges();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.people.length+' CITY NPCs • '+state.audience.length+' AUDIENCE • '+quality().toUpperCase();
    if(q('v235HudDistrict'))q('v235HudDistrict').textContent=state.district.toUpperCase();
    if(q('v235HudStats'))q('v235HudStats').textContent=state.people.length+' NPCs • '+state.audience.length+' EVENT';
    panel?.querySelectorAll('[data-v235-district]').forEach(b=>b.classList.toggle('active',b.dataset.v235District===state.district));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='n'||e.key==='N')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if((!state.root||state.qualityBuilt!==quality())&&scene())rebuild();
    if(state.enabled){
      const stride=quality()==='performance'?2:1;
      state.people.forEach((npc,i)=>{if((state.frames+i)%stride===0)animatePerson(npc,dt*stride,ts,i,false)});
      state.audience.forEach((npc,i)=>animatePerson(npc,dt,ts,100+i,true));
      if(state.lastAudience&&Date.now()>state.lastAudience.expires)clearAudience();
      state.frames++;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,districts:['downtown','studio-row','shops','park','media','business'],status,rebuild,setDistrict,setEnabled,clear,spawnAudience,setBehavior,pulseCrowd};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();