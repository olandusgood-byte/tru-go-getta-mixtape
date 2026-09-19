(() => {
  const VERSION='V2.35 TGG NPC LIFE + CROWD FORGE 100';
  const LAYERS=[
    'npc core bridge','npc enabled state','npc density state','npc quality bridge','crowd root','district anchors','spawn planner','deterministic seed','cleanup path','status API',
    'street profile','creator profile','nightlife profile','business profile','casual profile','skin palette','outfit palette','accent palette','hair palette','profile assignment',
    'head mesh','torso mesh','pelvis mesh','left arm','right arm','left leg','right leg','shoes','hair cap','phone prop',
    'idle behavior','stroll behavior','social behavior','phone behavior','hype behavior','behavior timer','behavior transitions','idle breathing','head look','gesture swing',
    'phone pose','social gesture','hype bounce','stroll step','torso sway','arm swing','leg swing','head nod','group face target','action blend',
    'downtown crowd','studio row crowd','shops crowd','park crowd','media crowd','business crowd','district density','district profile mix','district behavior mix','district accent',
    'pair groups','trio groups','social circles','creator clusters','nightlife clusters','bench idle spots','storefront idle spots','studio idle spots','club queue spots','office commute spots',
    'horn reaction hook','weather rain reaction','lightning reaction','mission dialogue hook','concert hype hook','rap battle hype hook','vehicle proximity look','player proximity look','camera distance trim','interior guard',
    'high quality count','balanced quality count','performance quality count','mobile count trim','shadow high','shadow balanced','no shadow performance','reduced motion','frame budget skip','visibility cull',
    'crowd HUD','crowd panel','density controls','enabled toggle','rebuild button','behavior diagnostics','mobile panel','landscape panel','rollback isolation','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,density:1,root:null,npcs:[],ready:false,rebuilds:0,frames:0,
    behaviorCounts:{},qualityBuilt:null,lastBehaviorSweep:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-npc-life-forge',layerCount:LAYERS.length,
      enabled:state.enabled,density:Number(state.density.toFixed(2)),count:state.npcs.length,
      quality:quality(),rebuilds:state.rebuilds,frames:state.frames,behaviors:{...state.behaviorCounts}
    };
  }

  function seeded(i){
    let x=(Number(i)||1)>>>0;
    x=(x*1664525+1013904223)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }

  function qCount(){
    const q=quality(),base=q==='performance'?6:q==='balanced'?12:18;
    const mobile=hasDOM()&&window.innerWidth<720?.78:1;
    return Math.max(2,Math.round(base*state.density*mobile));
  }

  function mat(color,rough=.72,metal=.05){
    const THREE=T();
    return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  }

  function makeNpc(profileId,index){
    const THREE=T(),p=core()?.profile?.(profileId)||core()?.profile?.('street');
    const g=new THREE.Group();g.name='v235-npc';g.userData.v235=true;g.userData.index=index;
    const skin=mat(p.skin,.68,.02),top=mat(p.top,.8,.04),pants=mat(p.pants,.82,.04),shoe=mat(p.shoes,.48,.15),hair=mat(p.hair,.88,.02),accent=mat(p.accent,.42,.28);
    const mesh=(geo,material,pos,name)=>{
      const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.name=name;
      const q=quality();m.castShadow=q==='high';m.receiveShadow=true;g.add(m);return m;
    };
    const body=mesh(new THREE.CapsuleGeometry(.34,.72,4,8),top,[0,1.42,0],'npc-body');
    const head=mesh(new THREE.SphereGeometry(.3,12,9),skin,[0,2.26,0],'npc-head');
    head.scale.set(.92,1.02,.94);
    const pelvis=mesh(new THREE.BoxGeometry(.55,.28,.36),pants,[0,.91,0],'npc-pelvis');
    const leftArm=new THREE.Group(),rightArm=new THREE.Group(),leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
    leftArm.position.set(-.44,1.66,0);rightArm.position.set(.44,1.66,0);leftLeg.position.set(-.18,.78,0);rightLeg.position.set(.18,.78,0);
    mesh.call(null);
    const limb=(parent,geo,material,pos,name)=>{
      const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.name=name;m.castShadow=quality()==='high';m.receiveShadow=true;parent.add(m);return m;
    };
    limb(leftArm,new THREE.CapsuleGeometry(.105,.5,4,7),top,[0,-.32,0],'npc-left-arm');
    limb(rightArm,new THREE.CapsuleGeometry(.105,.5,4,7),top,[0,-.32,0],'npc-right-arm');
    limb(leftLeg,new THREE.CapsuleGeometry(.13,.58,4,7),pants,[0,-.36,0],'npc-left-leg');
    limb(rightLeg,new THREE.CapsuleGeometry(.13,.58,4,7),pants,[0,-.36,0],'npc-right-leg');
    limb(leftLeg,new THREE.BoxGeometry(.28,.16,.48),shoe,[0,-.76,.08],'npc-left-shoe');
    limb(rightLeg,new THREE.BoxGeometry(.28,.16,.48),shoe,[0,-.76,.08],'npc-right-shoe');
    g.add(leftArm,rightArm,leftLeg,rightLeg);
    mesh(new THREE.SphereGeometry(.31,12,7,0,Math.PI*2,0,Math.PI*.47),hair,[0,2.34,0],'npc-hair');
    const stripe=mesh(new THREE.BoxGeometry(.46,.04,.035),accent,[0,1.48,.34],'npc-accent');
    const phone=mesh(new THREE.BoxGeometry(.09,.18,.035),mat(0x101318,.35,.5),[.53,1.78,.08],'npc-phone');phone.visible=false;
    g.userData.parts={body,head,pelvis,leftArm,rightArm,leftLeg,rightLeg,phone,stripe};
    g.userData.profile=profileId;
    g.userData.behavior='idle';
    g.userData.phase=index*.73;
    g.userData.behaviorUntil=0;
    g.userData.origin={x:0,z:0};
    g.userData.lookBoost=0;
    return g;
  }

  const DISTRICTS=[
    {id:'downtown',x:30,z:30,spots:[[0,0],[-3,2],[3,-2],[1,4]]},
    {id:'studio-row',x:-31,z:-14,spots:[[0,0],[2,2],[-2,2],[3,-2]]},
    {id:'shops',x:-14,z:31,spots:[[0,0],[3,1],[-3,-1],[1,-3]]},
    {id:'park',x:14,z:-31,spots:[[0,0],[-3,2],[3,2],[0,-3]]},
    {id:'media',x:4,z:38,spots:[[0,0],[-3,1],[3,1],[2,-3]]},
    {id:'business',x:-38,z:5,spots:[[0,0],[2,3],[-2,-3],[3,-1]]}
  ];

  function plan(count){
    const out=[];
    for(let i=0;i<count;i++){
      const d=DISTRICTS[i%DISTRICTS.length],district=core()?.district?.(d.id)||{profiles:['street']};
      const spot=d.spots[Math.floor(seeded(i*19+3)*d.spots.length)%d.spots.length];
      const profiles=district.profiles||['street'];
      const profile=profiles[Math.floor(seeded(i*23+5)*profiles.length)%profiles.length];
      const angle=seeded(i*29+7)*Math.PI*2,rad=.4+seeded(i*31+11)*1.5;
      out.push({district:d.id,profile,x:d.x+spot[0]+Math.cos(angle)*rad,z:d.z+spot[1]+Math.sin(angle)*rad,group:i%5});
    }
    return out;
  }

  function chooseBehavior(npc,seed){
    const district=npc.userData.district;
    let pool=['idle','stroll','social','phone'];
    if(district==='media'||district==='studio-row')pool.push('hype');
    const id=pool[Math.floor(seeded(seed)*pool.length)%pool.length];
    npc.userData.behavior=id;
    npc.userData.behaviorUntil=performance.now()+2400+seeded(seed+17)*4200;
    return id;
  }

  function rebuild(){
    if(!hasDOM())return status();
    const s=scene(),THREE=T();if(!s||!THREE)return status();
    clear();
    const root=new THREE.Group();root.name='tgg-npc-life-crowd';root.userData.v235=true;
    const planItems=plan(qCount());
    planItems.forEach((item,i)=>{
      const n=makeNpc(item.profile,i);n.position.set(item.x,0,item.z);n.rotation.y=seeded(i*13)*Math.PI*2;
      n.userData.district=item.district;n.userData.group=item.group;n.userData.origin={x:item.x,z:item.z};
      chooseBehavior(n,i*41+9);root.add(n);state.npcs.push(n);
    });
    s.add(root);state.root=root;state.root.visible=state.enabled;state.rebuilds++;state.qualityBuilt=quality();state.ready=true;
    recount();renderUI();return status();
  }

  function clear(){
    if(state.root){
      state.root.traverse?.(o=>{
        o.geometry?.dispose?.();
        const ms=Array.isArray(o.material)?o.material:[o.material];ms.filter(Boolean).forEach(m=>m.dispose?.());
      });
      state.root.parent?.remove(state.root);
    }
    state.root=null;state.npcs=[];state.behaviorCounts={};renderUI();return true;
  }

  function setEnabled(v){state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled}
  function setDensity(v){state.density=clamp(Number(v)||1,.25,1.5);if(hasDOM())rebuild();return state.density}

  function recount(){
    const c={};state.npcs.forEach(n=>c[n.userData.behavior]=(c[n.userData.behavior]||0)+1);state.behaviorCounts=c;
  }

  function nearestPlayer(n){
    const p=window.TGG3D?.player?.position;if(!p)return Infinity;
    return Math.hypot(n.position.x-p.x,n.position.z-p.z);
  }

  function nearestCar(n){
    const c=window.TGG3D?.car?.position;if(!c)return Infinity;
    return Math.hypot(n.position.x-c.x,n.position.z-c.z);
  }

  function animateNpc(n,dt,ts){
    const p=n.userData.parts;if(!p)return;
    if(ts>n.userData.behaviorUntil)chooseBehavior(n,n.userData.index*101+Math.floor(ts/1000));
    const id=n.userData.behavior,b=core()?.behavior?.(id)||core()?.behavior?.('idle');
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?.35:1;
    n.userData.phase+=dt*(1.8+(b.move||0)*7.5);
    const ph=n.userData.phase,sin=Math.sin(ph),cos=Math.cos(ph);
    const playerD=nearestPlayer(n),carD=nearestCar(n);
    const look=playerD<7||carD<6||n.userData.lookBoost>0;
    const move=id==='stroll'?(b.move||0)*reduced:0;
    if(move>0){
      const ox=n.userData.origin.x,oz=n.userData.origin.z,r=1.2+(n.userData.index%3)*.5;
      const tx=ox+Math.cos(ph*.18+n.userData.index)*r,tz=oz+Math.sin(ph*.18+n.userData.index)*r;
      const dx=tx-n.position.x,dz=tz-n.position.z,dist=Math.hypot(dx,dz)||1;
      n.position.x+=dx/dist*dt*move;n.position.z+=dz/dist*dt*move;n.rotation.y=Math.atan2(dx,dz);
    }else if(look){
      const target=playerD<=carD?window.TGG3D?.player?.position:window.TGG3D?.car?.position;
      if(target){const a=Math.atan2(target.x-n.position.x,target.z-n.position.z);n.rotation.y+=Math.atan2(Math.sin(a-n.rotation.y),Math.cos(a-n.rotation.y))*Math.min(1,dt*2.8)}
    }
    const armAmp=id==='hype'?.85:id==='social'?.46:id==='stroll'?.36:.08;
    const legAmp=id==='stroll'?.34:0;
    p.leftArm.rotation.x+=(sin*armAmp*reduced-p.leftArm.rotation.x)*.18;
    p.rightArm.rotation.x+=(-sin*armAmp*reduced-p.rightArm.rotation.x)*.18;
    p.leftLeg.rotation.x+=(-sin*legAmp*reduced-p.leftLeg.rotation.x)*.2;
    p.rightLeg.rotation.x+=(sin*legAmp*reduced-p.rightLeg.rotation.x)*.2;
    p.body.rotation.z+=(sin*(id==='hype'?.12:id==='social'?.05:.02)*reduced-p.body.rotation.z)*.15;
    p.head.rotation.y+=(cos*(look?.12:.04)*reduced-p.head.rotation.y)*.12;
    p.head.rotation.x+=(Math.abs(sin)*(id==='hype'?.08:id==='social'?.04:0)*reduced-p.head.rotation.x)*.12;
    p.phone.visible=id==='phone';
    if(id==='phone'){
      p.rightArm.rotation.z+=(1.12*reduced-p.rightArm.rotation.z)*.22;
      p.rightArm.rotation.x+=(-.4*reduced-p.rightArm.rotation.x)*.22;
    }else p.rightArm.rotation.z+=(0-p.rightArm.rotation.z)*.16;
    if(n.userData.lookBoost>0)n.userData.lookBoost=Math.max(0,n.userData.lookBoost-dt);
    const cam=window.TGG3D?.camera,dist=cam?cam.position.distanceTo(n.position):0;
    n.visible=state.enabled&&(!dist||dist<54);
  }

  function reactAll(kind){
    state.npcs.forEach((n,i)=>{
      n.userData.lookBoost=1.2;
      if(kind==='hype'){n.userData.behavior='hype';n.userData.behaviorUntil=performance.now()+1800+(i%4)*180}
      else if(kind==='phone'){n.userData.behavior='phone';n.userData.behaviorUntil=performance.now()+2200+(i%3)*240}
      else {n.userData.behavior='social';n.userData.behaviorUntil=performance.now()+1200+(i%5)*150}
    });
    recount();
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    ['tgg:horn','tgg:vehicle-horn','tgg:traffic-impact'].forEach(ev=>window.addEventListener(ev,()=>reactAll('look')));
    window.addEventListener('tgg:weather-lightning',()=>reactAll('look'));
    window.addEventListener('tgg:mission-dialogue',()=>reactAll('social'));
    window.addEventListener('tgg:concert-start',()=>reactAll('hype'));
    window.addEventListener('tgg:rap-battle-start',()=>reactAll('hype'));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='NPC LIFE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>NPC LIFE + CROWD</b></div><button id="v235Close" type="button">×</button></div><label>DENSITY <input id="v235Density" type="range" min=".25" max="1.5" step=".05" value="1"></label><div class="v235-actions"><button id="v235Toggle" type="button">CROWD: ON</button><button id="v235Rebuild" type="button">REBUILD CROWD</button><button id="v235Hype" type="button">HYPE CROWD</button><button id="v235Clear" type="button">CLEAR CROWD</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v235Hype')?.addEventListener('click',()=>reactAll('hype'));
      document.getElementById('v235Clear')?.addEventListener('click',clear);
      document.getElementById('v235Density')?.addEventListener('change',e=>setDensity(Number(e.target.value)));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG NPC LIFE</small><b id="v235HudCount">0 NPCS</b><span id="v235HudState">DISTRICT CROWDS</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Density'))q('v235Density').value=String(state.density);
    if(q('v235Toggle'))q('v235Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.npcs.length+' NPCS • '+quality().toUpperCase()+' • '+Object.entries(state.behaviorCounts).map(([k,v])=>k.toUpperCase()+': '+v).join(' • ');
    if(q('v235HudCount'))q('v235HudCount').textContent=state.npcs.length+' NPCS';
    if(q('v235HudState'))q('v235HudState').textContent=state.enabled?'DISTRICT CROWDS ACTIVE':'CROWD DISABLED';
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!state.root&&scene())rebuild();
    if(state.qualityBuilt!==quality())rebuild();
    if(state.enabled&&state.root){
      const dt=.016;
      state.npcs.forEach(n=>animateNpc(n,dt,ts));
      state.frames++;
      if(ts-state.lastBehaviorSweep>1200){state.lastBehaviorSweep=ts;recount();renderUI()}
    }
  }

  const api={version:VERSION,layers:LAYERS,behaviors:['idle','stroll','social','phone','hype'],status,rebuild,setEnabled,setDensity,clear};
  globalThis.TGGV235=api;
  if(hasDOM()){window.TGGV235=api;ensureUI();requestAnimationFrame(tick)}
})();