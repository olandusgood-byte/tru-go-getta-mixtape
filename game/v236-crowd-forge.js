(() => {
  const VERSION='V2.36 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'crowd core bridge','crowd enabled state','crowd profile state','crowd quality state','crowd root group','crowd rebuild API','crowd restore API','crowd status API','crowd diagnostics','crowd rollback isolation',
    'chill profile','busy profile','event profile','night profile','quality high budget','quality balanced budget','quality performance budget','density scaling','budget rebuild','budget diagnostics',
    'npc body group','npc torso','npc head','npc left arm','npc right arm','npc left leg','npc right leg','npc left eye','npc right eye','npc mouth',
    'npc left brow','npc right brow','npc hair cap','npc shoe pair','npc outfit palette','npc skin palette','npc height variety','npc build variety','npc hair variety','npc material cache',
    'sidewalk spawn grid','spawn deterministic seed','spawn route anchor','spawn route target','spawn city clamp','spawn road offset','spawn district spread','spawn dedupe','spawn quality rebuild','spawn diagnostics',
    'walk cycle','arm swing','leg swing','torso bob','head settle','turn smoothing','route advance','walk speed profile','idle pause','idle breathing',
    'talk state','talk chance','talk arm gesture','talk head nod','talk pair spacing','talk duration','talk cooldown','blink state','blink timing','blink restore',
    'vehicle proximity reaction','horn reaction bridge','reaction distance profile','reaction step away','reaction speed boost','reaction head turn','reaction cooldown','reaction no collision write','reaction no traffic write','reaction diagnostics',
    'concert crowd bridge','rap battle crowd bridge','mission complete cheer','rival choice reaction','weather compatibility','lighting compatibility','animation compatibility','face compatibility','world forge compatibility','interior guard',
    'crowd HUD','crowd panel','profile buttons','enabled toggle','rebuild button','restore button','F11 shortcut','mobile panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV236Core||globalThis.window?.TGGV236Core;
  const state={
    enabled:true,profile:'chill',root:null,npcs:[],qualityBuilt:null,ready:false,
    rebuilds:0,frames:0,lastBuildMs:0,reactions:0,talking:0
  };
  const mats=new Map();
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const modern=hasDOM()?window.TGGV235?.status?.()?.activeProfile:null;
    if(['high','balanced','performance'].includes(modern))return modern;
    const legacy=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(legacy)?legacy:'high';
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;

  function seeded(i){
    let x=(Number(i)||1)>>>0;
    x=(x*1664525+1013904223)>>>0;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-crowd-forge',layerCount:LAYERS.length,
      enabled:state.enabled,profile:state.profile,quality:quality(),population:state.npcs.length,
      rebuilds:state.rebuilds,frames:state.frames,reactions:state.reactions,talking:state.talking
    };
  }

  function material(key,color,rough=.72,metal=.06){
    const THREE=T();if(!THREE)return null;
    const k=key+':'+color+':'+rough+':'+metal;
    if(mats.has(k))return mats.get(k);
    const m=new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
    mats.set(k,m);return m;
  }

  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE||!parent)return null;
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.position.set(...pos);mesh.scale.set(...scale);mesh.rotation.set(...rot);
    mesh.castShadow=quality()==='high';mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }

  const SKINS=[0x5e3b2a,0x7b4e36,0x9a6849,0xb67f5b,0xd5a07c,0xe1b797];
  const TOPS=[0x141922,0x28314a,0x4a2030,0x183c32,0x433b22,0x24212e,0x112a42,0x3a1818];
  const PANTS=[0x0b0e14,0x141820,0x22252b,0x182130,0x2b2523,0x111722];
  const ACCENTS=[0xc7ff00,0x61d9ff,0xff466d,0xffd45c,0xc56cff,0x4cff88];

  function makePerson(i){
    const THREE=T(),g=new THREE.Group();g.name='v236-crowd-person';g.userData.v236Crowd=true;g.userData.index=i;
    const skin=material('skin'+(i%SKINS.length),SKINS[i%SKINS.length],.68,.02);
    const top=material('top'+(i%TOPS.length),TOPS[i%TOPS.length],.82,.04);
    const pants=material('pants'+(i%PANTS.length),PANTS[(i*3)%PANTS.length],.85,.03);
    const shoe=material('shoe',0x090b0f,.74,.14);
    const hair=material('hair',0x07080a,.88,.02);
    const eye=material('eye',0xe9edf3,.38,.02);
    const dark=material('dark',0x06070a,.65,.06);
    const accent=material('accent'+(i%ACCENTS.length),ACCENTS[i%ACCENTS.length],.45,.25);

    const h=.92+seeded(100+i)*.16,b=.88+seeded(200+i)*.22;
    const body=new THREE.Group();body.name='body';body.position.y=1.95*h;g.add(body);
    add(body,new THREE.CapsuleGeometry(.34*b,.58*h,4,7),top,[0,0,0],[1,1,1],[0,0,0],'torso');
    add(body,new THREE.BoxGeometry(.55*b,.24,.36),pants,[0,-.62*h,0],[1,1,1],[0,0,0],'pelvis');

    const head=new THREE.Group();head.name='head';head.position.y=3.18*h;g.add(head);
    add(head,new THREE.SphereGeometry(.34,10,8),skin,[0,0,0],[.92,1,.9],[0,0,0],'head-mesh');
    add(head,new THREE.SphereGeometry(.35,10,6,0,Math.PI*2,0,Math.PI*.48),hair,[0,.07,0],[1,.7,1],[0,0,0],'hair');
    const eyes=[];
    [-.12,.12].forEach((x,j)=>eyes.push(add(head,new THREE.SphereGeometry(.035,6,5),eye,[x,.02,.30],[1,.72,.5],[0,0,0],j?'eye-r':'eye-l')));
    const pupils=[];
    [-.12,.12].forEach((x,j)=>pupils.push(add(head,new THREE.SphereGeometry(.015,5,4),dark,[x,.02,.325],[1,1,.5],[0,0,0],j?'pupil-r':'pupil-l')));
    const brows=[];
    [-.12,.12].forEach((x,j)=>brows.push(add(head,new THREE.BoxGeometry(.105,.018,.018),hair,[x,.145,.315],[1,1,1],[0,0,j?-.05:.05],j?'brow-r':'brow-l')));
    const mouth=add(head,new THREE.BoxGeometry(.15,.018,.018),material('mouth',0x4c2529,.7,.02),[0,-.18,.30],[1,1,1],[0,0,0],'mouth');

    const leftArm=new THREE.Group(),rightArm=new THREE.Group();leftArm.name='leftArm';rightArm.name='rightArm';
    leftArm.position.set(-.48*b,2.45*h,0);rightArm.position.set(.48*b,2.45*h,0);
    add(leftArm,new THREE.CapsuleGeometry(.095,.54*h,3,6),top,[0,-.32*h,0],[1,1,1],[0,0,0],'arm-l');
    add(rightArm,new THREE.CapsuleGeometry(.095,.54*h,3,6),top,[0,-.32*h,0],[1,1,1],[0,0,0],'arm-r');
    add(leftArm,new THREE.SphereGeometry(.105,7,6),skin,[0,-.68*h,0],[1,1,1],[0,0,0],'hand-l');
    add(rightArm,new THREE.SphereGeometry(.105,7,6),skin,[0,-.68*h,0],[1,1,1],[0,0,0],'hand-r');
    g.add(leftArm,rightArm);

    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();leftLeg.name='leftLeg';rightLeg.name='rightLeg';
    leftLeg.position.set(-.18*b,1.35*h,0);rightLeg.position.set(.18*b,1.35*h,0);
    add(leftLeg,new THREE.CapsuleGeometry(.12,.62*h,3,6),pants,[0,-.38*h,0],[1,1,1],[0,0,0],'leg-l');
    add(rightLeg,new THREE.CapsuleGeometry(.12,.62*h,3,6),pants,[0,-.38*h,0],[1,1,1],[0,0,0],'leg-r');
    add(leftLeg,new THREE.BoxGeometry(.27,.14,.43),shoe,[0,-.82*h,.08],[1,1,1],[0,0,0],'shoe-l');
    add(rightLeg,new THREE.BoxGeometry(.27,.14,.43),shoe,[0,-.82*h,.08],[1,1,1],[0,0,0],'shoe-r');
    g.add(leftLeg,rightLeg);

    if(i%4===0)add(body,new THREE.BoxGeometry(.06,.66,.035),accent,[0,.02,.34],[1,1,1],[0,0,0],'accent');
    g.userData.parts={body,head,leftArm,rightArm,leftLeg,rightLeg,eyes,pupils,brows,mouth};
    g.userData.baseBodyY=1.95*h;
    g.userData.phase=seeded(300+i)*Math.PI*2;
    g.userData.blink=0;g.userData.blinkState=0;g.userData.nextBlink=1500+seeded(400+i)*2600;
    g.userData.idleUntil=0;g.userData.talkUntil=0;g.userData.reactUntil=0;g.userData.routeIndex=1;
    return g;
  }

  const ROUTES=[
    [[-29,-18],[-29,18],[-20,18],[-20,-18]],
    [[-5,-30],[-5,30],[5,30],[5,-30]],
    [[20,-18],[20,18],[29,18],[29,-18]],
    [[-18,-29],[18,-29],[18,-20],[-18,-20]],
    [[-18,20],[18,20],[18,29],[-18,29]],
    [[-31,-5],[-12,-5],[-12,5],[-31,5]],
    [[12,-5],[31,-5],[31,5],[12,5]]
  ];

  function routeFor(i){
    const base=ROUTES[i%ROUTES.length];
    const off=(seeded(500+i)-.5)*1.2;
    return base.map(p=>[clamp(p[0]+off,-45,45),clamp(p[1]-off,-45,45)]);
  }

  function currentProfile(){return core()?.profile?.(state.profile)||core()?.profile?.('chill')}

  function disposeRoot(){
    if(!state.root)return;
    state.root.traverse?.(o=>{
      o.geometry?.dispose?.();
      const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.filter(Boolean).forEach(m=>{if(![...mats.values()].includes(m))m.dispose?.()});
    });
    state.root.parent?.remove(state.root);state.root=null;state.npcs=[];
  }

  function rebuild(){
    if(!hasDOM())return status();
    const THREE=T(),s=scene();if(!THREE||!s)return status();
    const started=performance.now();disposeRoot();
    const p=currentProfile(),count=core()?.budget?.(quality(),p.density)||8;
    const root=new THREE.Group();root.name='tgg-crowd-forge';root.userData.v236Crowd=true;
    const npcs=[];
    for(let i=0;i<count;i++){
      const npc=makePerson(i),route=routeFor(i);
      npc.userData.route=route;npc.userData.routeIndex=1;
      const first=route[0],jitter=(seeded(600+i)-.5)*2.4;
      npc.position.set(first[0]+jitter,0,first[1]-jitter);
      npc.rotation.y=seeded(700+i)*Math.PI*2;
      root.add(npc);npcs.push(npc);
    }
    s.add(root);state.root=root;state.npcs=npcs;state.qualityBuilt=quality();state.ready=true;state.rebuilds++;
    state.lastBuildMs=Math.round((performance.now()-started)*10)/10;root.visible=state.enabled;renderUI();return status();
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }

  function restore(){
    disposeRoot();state.enabled=false;state.ready=false;renderUI();return status();
  }

  function applyProfile(id='chill'){
    state.profile=core()?.profiles?.includes(id)?id:'chill';
    if(hasDOM())rebuild();renderUI();return status();
  }

  function playerWorld(){
    const gs=window.TGGGame?.getState?.()||{};
    return{x:((Number(gs.x)||50)-50)*.92,z:((Number(gs.y)||50)-50)*.92,inVehicle:!!gs.inVehicle};
  }

  function carWorld(){
    const c=window.TGG3D?.car;return c?{x:c.position.x,z:c.position.z}:null;
  }

  function updateBlink(npc,dt,now){
    const u=npc.userData,p=u.parts;
    if(!p?.eyes)return;
    if(now>=u.nextBlink&&u.blinkState===0){u.blinkState=1;u.nextBlink=now+1800+seeded(u.index+Math.floor(now/1000))*2500}
    if(u.blinkState===1){u.blink=Math.min(1,u.blink+dt*15);if(u.blink>=.95)u.blinkState=2}
    else if(u.blinkState===2){u.blink=Math.max(0,u.blink-dt*12);if(u.blink<=.02){u.blink=0;u.blinkState=0}}
    p.eyes.forEach(e=>{e.scale.y=lerp(e.scale.y,Math.max(.08,1-u.blink*.9),.45)});
    p.pupils?.forEach(e=>{e.scale.y=lerp(e.scale.y,Math.max(.12,1-u.blink*.88),.45)});
  }

  function updateTalk(npc,dt,now,profile){
    const u=npc.userData,p=u.parts;
    if(now>u.talkUntil&&now>u.reactUntil&&seeded(u.index+Math.floor(now/1800))<profile.talkChance*.012){
      u.talkUntil=now+1600+seeded(800+u.index)*1900;
    }
    const talking=now<u.talkUntil;
    if(talking){
      p.rightArm.rotation.x=lerp(p.rightArm.rotation.x,-.35+Math.sin(u.phase*1.7)*.35,.18);
      p.rightArm.rotation.z=lerp(p.rightArm.rotation.z,-.25,.18);
      p.head.rotation.y=lerp(p.head.rotation.y,Math.sin(u.phase*.7)*.16,.15);
      p.mouth.scale.y=lerp(p.mouth.scale.y,1.5+Math.abs(Math.sin(u.phase*2.4))*.7,.3);
    }else{
      p.rightArm.rotation.z=lerp(p.rightArm.rotation.z,0,.18);
      p.mouth.scale.y=lerp(p.mouth.scale.y,1,.28);
    }
    return talking;
  }

  function updateReaction(npc,dt,now,profile){
    const car=carWorld(),pw=playerWorld();if(!car||!pw.inVehicle)return false;
    const dx=npc.position.x-car.x,dz=npc.position.z-car.z,d=Math.hypot(dx,dz);
    const horn=now<(Number(window.__tggV236HornUntil)||0);
    if((d<profile.reactionDistance||horn&&d<profile.reactionDistance*1.5)&&d>.01){
      npc.userData.reactUntil=Math.max(npc.userData.reactUntil,now+900);
      const force=(horn?2.1:1.25)*dt;
      npc.position.x+=dx/d*force;npc.position.z+=dz/d*force;
      npc.rotation.y=Math.atan2(dx,dz)+Math.PI;
      state.reactions++;return true;
    }
    return now<npc.userData.reactUntil;
  }

  function updateNpc(npc,dt,now,profile){
    const u=npc.userData,p=u.parts,route=u.route,target=route[u.routeIndex%route.length];
    u.phase+=dt*(5.8+profile.walkSpeed*2.8);
    const reacting=updateReaction(npc,dt,now,profile);
    const talking=updateTalk(npc,dt,now,profile);
    updateBlink(npc,dt,now);
    if(!reacting&&!talking){
      const dx=target[0]-npc.position.x,dz=target[1]-npc.position.z,d=Math.hypot(dx,dz);
      if(d<.35){
        u.routeIndex=(u.routeIndex+1)%route.length;
        if(seeded(900+u.index+u.routeIndex)<.28)u.idleUntil=now+700+seeded(950+u.index)*1300;
      }else if(now>=u.idleUntil){
        const step=Math.min(d,dt*(.78+profile.walkSpeed*.72));
        npc.position.x+=dx/d*step;npc.position.z+=dz/d*step;
        const desired=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(desired-npc.rotation.y),Math.cos(desired-npc.rotation.y));
        npc.rotation.y+=delta*Math.min(1,dt*6);
      }
    }
    const moving=!talking&&!reacting&&now>=u.idleUntil;
    const swing=moving?Math.sin(u.phase)*.52:0;
    p.leftArm.rotation.x=lerp(p.leftArm.rotation.x,talking?p.leftArm.rotation.x:swing,.2);
    if(!talking)p.rightArm.rotation.x=lerp(p.rightArm.rotation.x,-swing,.2);
    p.leftLeg.rotation.x=lerp(p.leftLeg.rotation.x,-swing*.82,.22);
    p.rightLeg.rotation.x=lerp(p.rightLeg.rotation.x,swing*.82,.22);
    p.body.position.y=lerp(p.body.position.y,(Number(u.baseBodyY)||1.95)+(moving?Math.abs(Math.sin(u.phase))*.045:Math.sin(u.phase*.32)*.012),.18);
    p.body.rotation.z=lerp(p.body.rotation.z,moving?Math.sin(u.phase)*.025:0,.18);
    if(reacting){p.head.rotation.y=lerp(p.head.rotation.y,.2*Math.sin(u.phase),.25)}
    state.talking+=talking?1:0;
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:horn',()=>{window.__tggV236HornUntil=performance.now()+1100});
    window.addEventListener('tgg:concert-start',()=>applyProfile('event'));
    window.addEventListener('tgg:rap-battle-start',()=>applyProfile('event'));
    window.addEventListener('tgg:mission-complete',()=>{
      state.npcs.forEach((n,i)=>{n.userData.talkUntil=performance.now()+1200+(i%4)*180});
    });
    window.addEventListener('tgg:rival-choice',e=>{
      if(String(e.detail?.choice||'').toLowerCase()==='compete')state.npcs.slice(0,6).forEach(n=>n.userData.reactUntil=performance.now()+1000);
    });
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v236');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v236ForgeBtn')){
      const b=document.createElement('button');b.id='v236ForgeBtn';b.className='v236-forge-btn';b.type='button';b.textContent='CROWD';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v236ForgePanel';panel.className='v236-forge-panel';
      panel.innerHTML='<div class="v236-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v236Close" type="button">×</button></div><div class="v236-profiles"><button data-v236-profile="chill">CHILL</button><button data-v236-profile="busy">BUSY</button><button data-v236-profile="event">EVENT</button><button data-v236-profile="night">NIGHT</button></div><div class="v236-actions"><button id="v236Toggle" type="button">CROWD: ON</button><button id="v236Rebuild" type="button">REBUILD CROWD</button><button id="v236Restore" type="button">REMOVE CROWD</button></div><div id="v236Stats" class="v236-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v236Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v236-profile]').forEach(b=>b.addEventListener('click',()=>applyProfile(b.dataset.v236Profile)));
      document.getElementById('v236Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v236Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v236Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v236ForgeHud';hud.className='v236-forge-hud';
      hud.innerHTML='<small>TGG CROWD FORGE</small><b id="v236HudProfile">CHILL</b><span id="v236HudStats">0 NPCS</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v236Toggle'))q('v236Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');
    if(q('v236Stats'))q('v236Stats').textContent=state.npcs.length+' NPCS • '+quality().toUpperCase()+' • '+state.profile.toUpperCase()+' • '+state.lastBuildMs+'ms';
    if(q('v236HudProfile'))q('v236HudProfile').textContent=state.profile.toUpperCase();
    if(q('v236HudStats'))q('v236HudStats').textContent=state.npcs.length+' NPCS • '+quality().toUpperCase();
    panel?.querySelectorAll('[data-v236-profile]').forEach(b=>b.classList.toggle('active',b.dataset.v236Profile===state.profile));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F11'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='h'||e.key==='H'){window.__tggV236HornUntil=performance.now()+1100}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(!state.root&&scene()&&state.enabled)rebuild();
    if(state.qualityBuilt!==quality()&&state.root)rebuild();
    if(state.enabled&&state.root){
      state.talking=0;const p=currentProfile(),now=performance.now();
      state.npcs.forEach(n=>updateNpc(n,dt,now,p));state.frames++;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,profiles:['chill','busy','event','night'],status,applyProfile,rebuild,setEnabled,restore};
  globalThis.TGGV236=api;
  if(hasDOM()){
    window.TGGV236=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();