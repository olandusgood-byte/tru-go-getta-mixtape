(() => {
  const VERSION='V2.35 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'npc core bridge','npc enabled state','npc quality bridge','npc rebuild state','npc crowd root','npc crowd dispose','npc status API','npc diagnostics','npc rollback isolation','npc production guard',
    'district downtown plan','district studio plan','district shops plan','district park plan','district media plan','district business plan','district round robin','district population cap','district home anchor','district visual-only guard',
    'native rig bridge','native profile bridge','native street preset','native stage preset','native luxury preset','native skin variety','native outfit variety','native height variety','native build variety','native material reuse',
    'commuter state','idle state','walk state','talk state','phone state','rap state','cheer state','notice state','avoid state','weather state',
    'idle breathing','idle head drift','walk arm swing','walk leg swing','walk torso sway','talk hand gesture','talk head nod','phone hand pose','phone head tilt','rap body bounce',
    'rap arm gesture','cheer arm raise','cheer body bounce','notice player turn','notice head turn','avoid lean','avoid head turn','weather shoulder hunch','weather head tuck','state blend',
    'player distance awareness','player facing awareness','vehicle proximity awareness','horn reaction awareness','concert reaction','rap battle reaction','mission crowd reaction','rival reaction','weather storm reaction','weather rain reaction',
    'existing pedestrian bridge','existing pedestrian upper body','street contact bridge','street contact gesture','rival crew bridge','rival crew reaction','crowd pulse API','behavior override API','behavior expiry','behavior restore',
    'quality high population','quality balanced population','quality performance population','distance visibility','performance shadow trim','reduced motion scaling','animation frame guard','event throttling','population rebuild guard','V2.34 compatibility',
    'crowd HUD','crowd panel','population stats','enabled toggle','rebuild button','pulse button','Shift+N shortcut','mobile panel','landscape panel','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,root:null,npcs:[],qualityBuilt:null,rebuilds:0,ready:false,
    overrides:new Map(),pulse:null,pulseUntil:0,frames:0,lastEventAt:0
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
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-npc-crowd-forge',
      layerCount:LAYERS.length,enabled:state.enabled,quality:quality(),
      population:state.npcs.length,rebuilds:state.rebuilds,
      pulse:state.pulse,frames:state.frames
    };
  }

  function disposeRoot(){
    if(!state.root)return;
    state.root.traverse?.(o=>{
      o.geometry?.dispose?.();
    });
    state.root.parent?.remove(state.root);
    state.root=null;state.npcs=[];
  }

  function playerWorld(){
    const s=hasDOM()?window.TGGGame?.getState?.()||{}:{};
    return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92,inVehicle:!!s.inVehicle};
  }

  function buildFallback(profile){
    const THREE=T(),g=new THREE.Group();g.userData.parts={};
    const skin=new THREE.MeshStandardMaterial({color:profile.skin,roughness:.68,metalness:.02});
    const top=new THREE.MeshStandardMaterial({color:profile.outfit.top,roughness:.8,metalness:.04});
    const pants=new THREE.MeshStandardMaterial({color:profile.outfit.pants,roughness:.82,metalness:.03});
    const body=new THREE.Group(),head=new THREE.Group(),la=new THREE.Group(),ra=new THREE.Group(),ll=new THREE.Group(),rl=new THREE.Group();
    body.position.y=1.65;
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.4,.82,4,8),top);body.add(torso);
    const hm=new THREE.Mesh(new THREE.SphereGeometry(.36,12,8),skin);head.add(hm);head.position.y=2.85;
    const armGeo=new THREE.CapsuleGeometry(.11,.62,3,7),legGeo=new THREE.CapsuleGeometry(.13,.7,3,7);
    const lam=new THREE.Mesh(armGeo,top),ram=new THREE.Mesh(armGeo,top);lam.position.y=-.36;ram.position.y=-.36;la.add(lam);ra.add(ram);la.position.set(-.5,2.15,0);ra.position.set(.5,2.15,0);
    const llm=new THREE.Mesh(legGeo,pants),rlm=new THREE.Mesh(legGeo,pants);llm.position.y=-.4;rlm.position.y=-.4;ll.add(llm);rl.add(rlm);ll.position.set(-.2,1.05,0);rl.position.set(.2,1.05,0);
    g.add(body,head,la,ra,ll,rl);g.userData.parts={body,head,leftArm:la,rightArm:ra,leftLeg:ll,rightLeg:rl};return g;
  }

  function buildNpc(item,index){
    let root=null;
    try{
      if(window.TGGV227?.buildRig)root=window.TGGV227.buildRig(item.profile);
    }catch{}
    if(!root)root=buildFallback(item.profile);
    root.name='tgg-crowd-npc-'+index;root.userData.v235=true;
    root.position.set(item.x,0,item.z);root.rotation.y=item.heading||0;
    const scale=.7+(index%4)*.025;root.scale.multiplyScalar(scale);
    root.traverse?.(o=>{if(o.isMesh){o.castShadow=quality()==='high';o.receiveShadow=true}});
    root.userData.crowd={
      id:item.id,index,homeX:item.x,homeZ:item.z,behavior:item.behavior||'idle',
      baseBehavior:item.behavior||'idle',phase:index*.73,targetPhase:index*1.11,
      speed:.32+(index%5)*.035,notice:0,lastBehaviorAt:0
    };
    return root;
  }

  function globalPlan(){
    const districts=core()?.districts||['downtown'];
    const cap=core()?.crowdBudget?.(quality())||8;
    const plans=districts.map(d=>core()?.spawnPlan?.(d,quality())||[]);
    const out=[];
    for(let row=0;out.length<cap;row++){
      let added=false;
      for(let i=0;i<plans.length&&out.length<cap;i++){
        if(plans[i][row]){out.push(plans[i][row]);added=true}
      }
      if(!added)break;
    }
    return out;
  }

  function rebuild(){
    if(!hasDOM()||!scene())return status();
    disposeRoot();
    const THREE=T();state.root=new THREE.Group();state.root.name='tgg-npc-crowd-forge';state.root.userData.v235=true;
    const plan=globalPlan();
    plan.forEach((item,i)=>{const n=buildNpc(item,i);state.root.add(n);state.npcs.push(n)});
    scene().add(state.root);state.root.visible=state.enabled;
    state.qualityBuilt=quality();state.rebuilds++;state.ready=true;renderUI();
    return status();
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }

  function setBehavior(id,behavior,duration=0){
    if(!core()?.behaviors?.includes(behavior))return false;
    const npc=state.npcs.find(n=>n.userData?.crowd?.id===id||n.name===id);
    if(!npc)return false;
    const c=npc.userData.crowd;
    state.overrides.set(c.id,{behavior,until:duration>0?Date.now()+duration:Infinity});
    c.behavior=behavior;c.lastBehaviorAt=Date.now();return true;
  }

  function pulseCrowd(kind='cheer',duration=2200){
    const map={concert:'cheer',rap:'rap',mission:'talk',rival:'notice',cheer:'cheer',phone:'phone'};
    state.pulse=map[kind]||kind;
    if(!core()?.behaviors?.includes(state.pulse)&&!['notice','avoid','weather'].includes(state.pulse))state.pulse='cheer';
    state.pulseUntil=Date.now()+clamp(Number(duration)||2200,300,12000);
    state.lastEventAt=Date.now();renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:crowd-pulse',{detail:{kind:state.pulse,duration}}));
    return state.pulse;
  }

  function behaviorFor(npc,now,pw){
    const c=npc.userData.crowd;
    const o=state.overrides.get(c.id);
    if(o){
      if(now<o.until)return o.behavior;
      state.overrides.delete(c.id);
    }
    if(state.pulse&&now<state.pulseUntil)return state.pulse;
    if(state.pulse&&now>=state.pulseUntil){state.pulse=null;state.pulseUntil=0}
    const d=Math.hypot(npc.position.x-pw.x,npc.position.z-pw.z);
    if(pw.inVehicle&&d<5.5)return'avoid';
    const weather=window.TGGV233?.status?.();
    if(weather?.enabled&&['rain','storm'].includes(weather.preset)&&d<18)return'weather';
    if(d<4.5)return'notice';
    return c.baseBehavior;
  }

  function moveNpc(npc,behavior,dt){
    const c=npc.userData.crowd;
    if(behavior!=='walk')return;
    c.targetPhase+=dt*c.speed;
    const radius=1.4+(c.index%4)*.55;
    const tx=c.homeX+Math.cos(c.targetPhase)*radius,tz=c.homeZ+Math.sin(c.targetPhase*.9)*radius;
    const dx=tx-npc.position.x,dz=tz-npc.position.z,dist=Math.hypot(dx,dz);
    if(dist>.02){
      const step=Math.min(dist,dt*(.45+c.speed));
      npc.position.x+=dx/dist*step;npc.position.z+=dz/dist*step;
      const target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-npc.rotation.y),Math.cos(target-npc.rotation.y));
      npc.rotation.y+=delta*Math.min(1,dt*4.5);
    }
  }

  function animatePose(npc,behavior,dt,ts,pw){
    const p=npc.userData.parts,c=npc.userData.crowd;if(!p)return;
    const rm=reducedMotion()?.35:1;
    c.phase+=dt*(behavior==='walk'?7.3:behavior==='rap'?8.8:behavior==='cheer'?7.5:3.2);
    const s=Math.sin(c.phase),co=Math.cos(c.phase),s2=Math.sin(c.phase*2);
    let la=0,ra=0,ll=0,rl=0,bz=0,by=0,hz=0,hy=0;
    if(behavior==='walk'){la=s*.54;ra=-s*.54;ll=-s*.48;rl=s*.48;bz=s2*.035}
    else if(behavior==='talk'){ra=-.25+s*.35;la=.08+co*.1;by=co*.1;hy=s*.08}
    else if(behavior==='phone'){la=-.32;ra=.06;p.leftArm.rotation.z=1.02*rm;hz=.1;hy=-.06}
    else if(behavior==='rap'){la=-.5+s*.65;ra=.35-s*.82;bz=s*.12;by=co*.13;hz=s2*.08}
    else if(behavior==='cheer'){la=-.35;ra=-.35;p.leftArm.rotation.z=1.08*rm;p.rightArm.rotation.z=-1.08*rm;bz=s*.08;hz=s2*.06}
    else if(behavior==='notice'){
      const dx=pw.x-npc.position.x,dz=pw.z-npc.position.z,target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-npc.rotation.y),Math.cos(target-npc.rotation.y));
      npc.rotation.y+=delta*Math.min(1,dt*3.2);hy=clamp(delta,-.22,.22);
    }else if(behavior==='avoid'){bz=-s*.08;hz=.08;la=s*.22;ra=-s*.22}
    else if(behavior==='weather'){bz=.045;hz=-.08;la=-.12;ra=-.12;p.leftArm.rotation.z=.28*rm;p.rightArm.rotation.z=-.28*rm}
    else {bz=Math.sin(c.phase*.42)*.018;hy=Math.sin(c.phase*.3)*.035}

    const blend=.22;
    p.leftArm.rotation.x+=(la*rm-p.leftArm.rotation.x)*blend;p.rightArm.rotation.x+=(ra*rm-p.rightArm.rotation.x)*blend;
    p.leftLeg.rotation.x+=(ll*rm-p.leftLeg.rotation.x)*blend;p.rightLeg.rotation.x+=(rl*rm-p.rightLeg.rotation.x)*blend;
    p.body.rotation.z+=(bz*rm-p.body.rotation.z)*.18;p.body.rotation.y+=(by*rm-p.body.rotation.y)*.16;
    p.head.rotation.z+=(hz*rm-p.head.rotation.z)*.16;p.head.rotation.y+=(hy*rm-p.head.rotation.y)*.16;
  }

  function animateExistingPedestrians(dt,ts,pw){
    const arr=window.TGG3D?.pedestrians||[];
    arr.forEach((n,i)=>{
      const p=n.userData?.parts;if(!p)return;
      const d=Math.hypot(n.position.x-pw.x,n.position.z-pw.z);
      const notice=!pw.inVehicle&&d<4.2,weather=window.TGGV233?.status?.();
      if(notice){
        const dx=pw.x-n.position.x,dz=pw.z-n.position.z,target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-n.rotation.y),Math.cos(target-n.rotation.y));
        n.rotation.y+=delta*Math.min(1,dt*2.5);
        p.head.rotation.y+=(clamp(delta,-.2,.2)-p.head.rotation.y)*.12;
      }
      if(weather?.enabled&&weather.preset==='storm'){
        p.body.rotation.z+=(Math.sin(ts*.004+i)*.035-p.body.rotation.z)*.08;
      }
    });
  }

  function animateContacts(dt,ts,pw){
    const contacts=window.TGGStreetContacts?.contacts||[];
    contacts.forEach((c,i)=>{
      const o=window.TGGStreetContacts?.getObject?.(c.id),p=o?.userData?.parts;if(!o||!p)return;
      const d=Math.hypot(o.position.x-pw.x,o.position.z-pw.z);
      if(d<7&&!pw.inVehicle){
        const dx=pw.x-o.position.x,dz=pw.z-o.position.z,target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-o.rotation.y),Math.cos(target-o.rotation.y));
        o.rotation.y+=delta*Math.min(1,dt*2.2);
        p.rightArm.rotation.x+=(-.25+Math.sin(ts*.004+i)*.2-p.rightArm.rotation.x)*.12;
        p.head.rotation.y+=(clamp(delta,-.18,.18)-p.head.rotation.y)*.1;
      }
    });
  }

  function animateRivals(dt,ts,pw){
    const rivals=window.TGGV225?.group?.userData?.rivals||window.TGGV225?.status?.()?.rivals||[];
    if(!Array.isArray(rivals))return;
    rivals.forEach((o,i)=>{
      const p=o?.userData?.parts;if(!o||!p)return;
      const d=Math.hypot(o.position.x-pw.x,o.position.z-pw.z);
      if(d<9&&!pw.inVehicle)p.head.rotation.y+=(Math.sin(ts*.003+i)*.08-p.head.rotation.y)*.08;
    });
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:concert-start',()=>pulseCrowd('concert',6500));
    window.addEventListener('tgg:rap-battle-start',()=>pulseCrowd('rap',5200));
    window.addEventListener('tgg:mission-complete',()=>pulseCrowd('cheer',2600));
    window.addEventListener('tgg:rival-choice',()=>pulseCrowd('rival',2000));
    window.addEventListener('tgg:weather-change',e=>{
      if(['rain','storm'].includes(e.detail?.preset))pulseCrowd('weather',1800);
    });
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
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-actions"><button id="v235Cheer" type="button">CROWD CHEER</button><button id="v235Rap" type="button">RAP REACTION</button><button id="v235Rebuild" type="button">REBUILD CROWD</button><button id="v235Toggle" type="button">CROWD: ON</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v235Cheer')?.addEventListener('click',()=>pulseCrowd('cheer',2600));
      document.getElementById('v235Rap')?.addEventListener('click',()=>pulseCrowd('rap',3200));
      document.getElementById('v235Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG CROWD FORGE</small><b id="v235HudPop">0 NPCS</b><span id="v235HudState">CITY ALIVE</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.npcs.length+' NATIVE NPCS • '+quality().toUpperCase()+' • '+(state.pulse?state.pulse.toUpperCase():'AUTO BEHAVIOR');
    if(q('v235HudPop'))q('v235HudPop').textContent=state.npcs.length+' NPCS';
    if(q('v235HudState'))q('v235HudState').textContent=state.pulse?state.pulse.toUpperCase():'CITY ALIVE';
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
    if(!state.root&&scene())rebuild();
    if(state.qualityBuilt!==quality())rebuild();
    if(state.enabled){
      const pw=playerWorld(),now=Date.now();
      state.npcs.forEach(n=>{
        const b=behaviorFor(n,now,pw);n.userData.crowd.behavior=b;
        moveNpc(n,b,dt);animatePose(n,b,dt,ts,pw);
        const d=Math.hypot(n.position.x-pw.x,n.position.z-pw.z);
        n.visible=d<42;
      });
      animateExistingPedestrians(dt,ts,pw);animateContacts(dt,ts,pw);animateRivals(dt,ts,pw);state.frames++;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,status,rebuild,setEnabled,setBehavior,pulseCrowd};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();