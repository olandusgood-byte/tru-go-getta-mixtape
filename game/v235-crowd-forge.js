(() => {
  const VERSION='V2.35 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'crowd core bridge','crowd enabled state','crowd mode state','crowd quality bridge','crowd root group','crowd rebuild API','crowd set mode API','crowd restore API','crowd status API','crowd diagnostics',
    'fan role','artist role','vendor role','local role','promoter role','role speed','role energy','talk chance','dance chance','role labels',
    'npc torso','npc pelvis','npc head','npc hair','left arm','right arm','left leg','right leg','left shoe','right shoe',
    'skin palette','top palette','pants palette','shoe palette','accent palette','hair palette','cloth material','skin material','rubber material','emissive accessory',
    'studio row route','shops route','park route','media route','business route','downtown route','route index','route lerp','route facing','route reset',
    'idle breathing','walk arm swing','walk leg swing','head look','body lean','talk gesture','dance bounce','dance arm lift','promoter point','vendor idle',
    'ambient mode','concert mode','rap mode','studio mode','crowd energy scale','concert dance boost','rap reaction boost','studio talk boost','mode persistence','mode event',
    'player proximity','vehicle proximity','horn reaction','near player look','near player slow','crowd spacing','soft separation','no collision mutation','mission contact preserve','base pedestrian preserve',
    'high density','balanced density','performance density','mobile density trim','reduced motion','weather compatibility','camera compatibility','lighting compatibility','animation compatibility','world compatibility',
    'crowd HUD','crowd panel','mode buttons','enabled toggle','rebuild button','Shift+N shortcut','mobile panel','landscape panel','rollback isolation','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,mode:'ambient',root:null,people:[],qualityBuilt:null,ready:false,
    rebuilds:0,frames:0,lastBuildMs:0,modeChangedAt:0
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
  const seeded=n=>{let x=(n*1664525+1013904223)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000};

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-crowd-forge',crowdMode:state.mode,
      layerCount:LAYERS.length,enabled:state.enabled,quality:quality(),count:state.people.length,
      rebuilds:state.rebuilds,frames:state.frames,lastBuildMs:state.lastBuildMs
    };
  }

  function material(color,roughness=.72,metalness=.05,extra={}){
    const THREE=T();
    return new THREE.MeshStandardMaterial({
      color,roughness,metalness,
      emissive:extra.emissive??0x000000,
      emissiveIntensity:extra.emissiveIntensity??0
    });
  }

  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T(),m=new THREE.Mesh(geo,mat);
    m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    m.castShadow=quality()==='high';m.receiveShadow=true;parent.add(m);return m;
  }

  function palette(i){
    const skins=[0x6f4935,0x875a40,0x9d6a49,0xb77c58,0xcf9672,0x6a4434];
    const tops=[0x121722,0x2b3140,0x3a1d2b,0x172c35,0x332547,0x202020,0x253629];
    const pants=[0x0b0e14,0x141923,0x22242b,0x17202a,0x2b2633];
    const shoes=[0xf0f1f4,0x111318,0x252936,0x8f2238,0x233b4d];
    const accents=[0xc7ff00,0xff466d,0x61d9ff,0xffd45c,0xc56cff,0x4cff88];
    return{
      skin:skins[i%skins.length],top:tops[(i*3)%tops.length],pants:pants[(i*5)%pants.length],
      shoes:shoes[(i*7)%shoes.length],accent:accents[(i*11)%accents.length],hair:0x07090d
    };
  }

  function createNPC(index,roleId,district,routeIndex){
    const THREE=T(),g=new THREE.Group();g.name='tgg-crowd-npc';g.userData.v235=true;
    const p=palette(index),role=core()?.role?.(roleId)||core()?.role?.('local');
    const skin=material(p.skin,.7,.02),top=material(p.top,.8,.04),pants=material(p.pants,.82,.04);
    const shoe=material(p.shoes,.5,.12),hair=material(p.hair,.84,.02);
    const accent=material(p.accent,.32,.28,{emissive:p.accent,emissiveIntensity:.16});

    const body=new THREE.Group();body.position.y=1.58;g.add(body);
    add(body,new THREE.CapsuleGeometry(.28,.62,4,8),top,[0,.08,0],[1,1,1],[0,0,0],'npc-torso');
    add(body,new THREE.BoxGeometry(.54,.24,.38),pants,[0,-.48,0],[1,1,1],[0,0,0],'npc-pelvis');

    const head=new THREE.Group();head.position.y=2.72;g.add(head);
    add(head,new THREE.SphereGeometry(.28,10,8),skin,[0,0,0],[.95,1.03,.94],[0,0,0],'npc-head');
    add(head,new THREE.SphereGeometry(.29,10,6,0,Math.PI*2,0,Math.PI*.48),hair,[0,.055,0],[1,1,1],[0,0,0],'npc-hair');

    const leftArm=new THREE.Group(),rightArm=new THREE.Group();
    leftArm.position.set(-.39,2.0,0);rightArm.position.set(.39,2.0,0);
    add(leftArm,new THREE.CapsuleGeometry(.09,.55,3,6),top,[0,-.34,0],[1,1,1],[0,0,0],'npc-left-arm');
    add(rightArm,new THREE.CapsuleGeometry(.09,.55,3,6),top,[0,-.34,0],[1,1,1],[0,0,0],'npc-right-arm');
    add(leftArm,new THREE.SphereGeometry(.1,7,6),skin,[0,-.72,0],[1,1,1],[0,0,0],'npc-left-hand');
    add(rightArm,new THREE.SphereGeometry(.1,7,6),skin,[0,-.72,0],[1,1,1],[0,0,0],'npc-right-hand');
    g.add(leftArm,rightArm);

    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
    leftLeg.position.set(-.17,1.18,0);rightLeg.position.set(.17,1.18,0);
    add(leftLeg,new THREE.CapsuleGeometry(.11,.64,3,6),pants,[0,-.42,0],[1,1,1],[0,0,0],'npc-left-leg');
    add(rightLeg,new THREE.CapsuleGeometry(.11,.64,3,6),pants,[0,-.42,0],[1,1,1],[0,0,0],'npc-right-leg');
    add(leftLeg,new THREE.BoxGeometry(.24,.13,.38),shoe,[0,-.82,.08],[1,1,1],[0,0,0],'npc-left-shoe');
    add(rightLeg,new THREE.BoxGeometry(.24,.13,.38),shoe,[0,-.82,.08],[1,1,1],[0,0,0],'npc-right-shoe');
    g.add(leftLeg,rightLeg);

    const badge=add(body,new THREE.BoxGeometry(.16,.18,.035),accent,[0,.16,.31],[1,1,1],[0,0,0],'npc-accent');
    const route=core()?.routeFor?.(district,routeIndex)||[[0,0],[1,0],[1,1],[0,1]];
    g.position.set(route[0][0],0,route[0][1]);
    g.userData.role=role;g.userData.roleId=role.id;g.userData.district=district;g.userData.route=route;
    g.userData.routeIndex=1;g.userData.phase=index*.77;g.userData.behavior='walk';
    g.userData.parts={body,head,leftArm,rightArm,leftLeg,rightLeg,badge};
    g.userData.baseSpeed=.45+role.speed*.7;
    g.userData.talkSeed=seeded(1000+index);g.userData.danceSeed=seeded(2000+index);
    return g;
  }

  function districtSet(count){
    const d=['studio-row','shops','park','media','business','downtown'];
    const roles=['fan','artist','vendor','local','promoter'];
    const out=[];
    for(let i=0;i<count;i++)out.push({district:d[i%d.length],role:roles[(i*3+i%2)%roles.length],routeIndex:i});
    return out;
  }

  function clearCrowd(){
    if(state.root?.parent)state.root.parent.remove(state.root);
    state.root?.traverse?.(o=>{o.geometry?.dispose?.();const ms=Array.isArray(o.material)?o.material:[o.material];ms.filter(Boolean).forEach(m=>m.dispose?.())});
    state.root=null;state.people=[];
  }

  function crowdBudget(){
    let n=core()?.densityBudget?.(quality())||10;
    if(hasDOM()&&window.innerWidth<760)n=Math.max(6,Math.floor(n*.72));
    return n;
  }

  function rebuild(){
    if(!hasDOM())return status();
    const s=scene(),THREE=T();if(!s||!THREE)return status();
    const t0=performance.now();clearCrowd();
    const root=new THREE.Group();root.name='tgg-crowd-forge';root.userData.v235=true;
    const defs=districtSet(crowdBudget());
    state.people=defs.map((d,i)=>{const npc=createNPC(i,d.role,d.district,d.routeIndex);root.add(npc);return npc});
    s.add(root);state.root=root;state.root.visible=state.enabled;state.qualityBuilt=quality();
    state.rebuilds++;state.lastBuildMs=Math.round((performance.now()-t0)*10)/10;state.ready=true;renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:crowd-rebuilt',{detail:{count:state.people.length,quality:state.qualityBuilt}}));
    return status();
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }

  function setMode(mode='ambient'){
    const allowed=['ambient','concert','rap','studio'];
    state.mode=allowed.includes(mode)?mode:'ambient';state.modeChangedAt=Date.now();renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:crowd-mode',{detail:{mode:state.mode}}));
    return state.mode;
  }

  function restore(){
    clearCrowd();state.enabled=false;state.mode='ambient';state.ready=false;renderUI();return status();
  }

  function worldPlayer(){
    const g=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(g.x)||50)-50)*.92,z:((Number(g.y)||50)-50)*.92,inVehicle:!!g.inVehicle};
  }

  function behaviorFor(npc,playerDist){
    const role=npc.userData.role||{};
    const mode=state.mode;
    if(mode==='concert'){
      if(npc.userData.district==='media'||npc.userData.roleId==='fan')return'dance';
    }
    if(mode==='rap'&&playerDist<12)return seeded(Math.floor(state.frames/40)+npc.userData.routeIndex+npc.id)%1<.72?'dance':'talk';
    if(mode==='studio'&&npc.userData.district==='studio-row')return'talk';
    if(playerDist<4.6&&role.talkChance>npc.userData.talkSeed)return'talk';
    if(role.id==='vendor'&&playerDist>5)return'idle';
    return'walk';
  }

  function softSeparate(npc){
    let sx=0,sz=0,count=0;
    for(const other of state.people){
      if(other===npc)continue;
      const dx=npc.position.x-other.position.x,dz=npc.position.z-other.position.z,d2=dx*dx+dz*dz;
      if(d2>0&&d2<1.5*1.5){const d=Math.sqrt(d2);sx+=dx/d;sz+=dz/d;count++}
    }
    if(count){npc.position.x+=sx/count*.006;npc.position.z+=sz/count*.006}
  }

  function animateNPC(npc,dt,ts,pw){
    const route=npc.userData.route,idx=npc.userData.routeIndex||0,target=route[idx];
    const dx=target[0]-npc.position.x,dz=target[1]-npc.position.z,dist=Math.hypot(dx,dz);
    const pd=Math.hypot(npc.position.x-pw.x,npc.position.z-pw.z);
    const behavior=behaviorFor(npc,pd);npc.userData.behavior=behavior;
    const parts=npc.userData.parts,role=npc.userData.role||{};
    const reduce=reducedMotion()?.35:1;
    npc.userData.phase+=dt*(2.4+role.energy*5.5)*(behavior==='dance'?1.4:1);
    const ph=npc.userData.phase,sin=Math.sin(ph),cos=Math.cos(ph);

    if(behavior==='walk'){
      if(dist<.28)npc.userData.routeIndex=(idx+1)%route.length;
      else{
        const slow=pd<3.4?.45:1;
        const speed=npc.userData.baseSpeed*slow*dt;
        npc.position.x+=dx/dist*speed;npc.position.z+=dz/dist*speed;
        npc.rotation.y=Math.atan2(dx,dz);
      }
      parts.leftArm.rotation.x=sin*.55*reduce;parts.rightArm.rotation.x=-sin*.55*reduce;
      parts.leftLeg.rotation.x=-sin*.48*reduce;parts.rightLeg.rotation.x=sin*.48*reduce;
      parts.body.rotation.z=cos*.025*reduce;parts.body.position.y=1.58+Math.abs(sin)*.035*reduce;
    }else if(behavior==='talk'){
      if(pd<8){const tx=pw.x-npc.position.x,tz=pw.z-npc.position.z;npc.rotation.y=Math.atan2(tx,tz)}
      parts.rightArm.rotation.x=-.3+sin*.35*reduce;parts.rightArm.rotation.z=-.22+cos*.16*reduce;
      parts.leftArm.rotation.x=.05+cos*.08*reduce;parts.leftLeg.rotation.x=0;parts.rightLeg.rotation.x=0;
      parts.head.rotation.y=sin*.08*reduce;parts.body.rotation.z=cos*.025*reduce;
    }else if(behavior==='dance'){
      parts.leftArm.rotation.x=-.3+sin*.72*reduce;parts.leftArm.rotation.z=.72+cos*.25*reduce;
      parts.rightArm.rotation.x=-.3-cos*.72*reduce;parts.rightArm.rotation.z=-.72+sin*.25*reduce;
      parts.leftLeg.rotation.x=-sin*.18*reduce;parts.rightLeg.rotation.x=sin*.18*reduce;
      parts.body.position.y=1.58+Math.abs(sin)*.11*reduce;parts.body.rotation.z=sin*.12*reduce;
      parts.head.rotation.x=Math.abs(cos)*.08*reduce;
    }else{
      parts.leftArm.rotation.x=Math.sin(ph*.45)*.04*reduce;parts.rightArm.rotation.x=-parts.leftArm.rotation.x;
      parts.leftLeg.rotation.x=0;parts.rightLeg.rotation.x=0;parts.body.position.y=1.58+Math.sin(ph*.35)*.018*reduce;
      if(role.id==='promoter')parts.rightArm.rotation.z=-.45+Math.sin(ph*.55)*.08*reduce;
    }

    softSeparate(npc);
  }

  function reactToHorn(){
    const now=Date.now();
    state.people.forEach((npc,i)=>{npc.userData.talkSeed=seeded(now%997+i);npc.userData.phase+=1.2});
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
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-modes"><button data-v235-mode="ambient">AMBIENT</button><button data-v235-mode="concert">CONCERT</button><button data-v235-mode="rap">RAP CROWD</button><button data-v235-mode="studio">STUDIO</button></div><div class="v235-actions"><button id="v235Toggle" type="button">CROWD: ON</button><button id="v235Rebuild" type="button">REBUILD CROWD</button><button id="v235Restore" type="button">REMOVE CROWD</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.v235Mode)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG CROWD FORGE</small><b id="v235HudMode">AMBIENT</b><span id="v235HudStats">0 NPCS</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.people.length+' NPCS • '+quality().toUpperCase()+' • '+state.mode.toUpperCase();
    if(q('v235HudMode'))q('v235HudMode').textContent=state.mode.toUpperCase();
    if(q('v235HudStats'))q('v235HudStats').textContent=state.people.length+' NPCS • '+quality().toUpperCase();
    panel?.querySelectorAll('[data-v235-mode]').forEach(b=>b.classList.toggle('active',b.dataset.v235Mode===state.mode));
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:concert-start',()=>setMode('concert'));
    window.addEventListener('tgg:concert-complete',()=>setMode('ambient'));
    window.addEventListener('tgg:rap-battle-start',()=>setMode('rap'));
    window.addEventListener('tgg:rap-battle-complete',()=>setMode('ambient'));
    window.addEventListener('tgg:interior-enter',e=>{if(e.detail?.id==='studio')setMode('studio')});
    window.addEventListener('tgg:interior-exit',()=>setMode('ambient'));
    window.addEventListener('tgg:horn',reactToHorn);
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='n'||e.key==='N')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();bridgeEvents();
    if(!state.root&&scene())rebuild();
    if(state.qualityBuilt!==quality())rebuild();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(state.enabled&&state.root){
      const pw=worldPlayer();
      state.people.forEach(n=>animateNPC(n,dt,ts,pw));
      state.frames++;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,roles:['fan','artist','vendor','local','promoter'],status,rebuild,setEnabled,setMode,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();