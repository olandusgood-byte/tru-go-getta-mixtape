(() => {
  const VERSION='V2.36 TGG CROWD + NPC FORGE 100';
  const PACKS=['core','body','face','outfit','district','path','motion','awareness','quality','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV236Core||globalThis.window?.TGGV236Core;
  const state={enabled:true,root:null,npcs:[],qualityBuilt:null,ready:false,rebuilds:0,frames:0};
  let panel=null,hud=null,lastTs=0;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;return['high','balanced','performance'].includes(q)?q:'high'};
  const seeded=i=>{let x=(i*1103515245+12345)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000};

  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-crowd-forge',layerCount:LAYERS.length,enabled:state.enabled,quality:quality(),count:state.npcs.length,rebuilds:state.rebuilds,frames:state.frames}}

  function mat(color,rough=.72,metal=.05){const THREE=T();return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
  function mesh(parent,geo,material,pos=[0,0,0],name='mesh'){const THREE=T(),m=new THREE.Mesh(geo,material);m.position.set(...pos);m.name=name;m.castShadow=quality()==='high';m.receiveShadow=true;parent.add(m);return m}

  function makeNpc(i,arch){
    const THREE=T(),g=new THREE.Group();g.name='v236-npc-'+i;g.userData.v236=true;
    const skin=mat(arch.skin,.66,.02),top=mat(arch.top,.82,.04),pants=mat(arch.pants,.84,.04),accent=mat(arch.accent,.42,.38),dark=mat(0x090b0f,.84,.04);
    const body=new THREE.Group();body.position.y=1.8;g.add(body);
    mesh(body,new THREE.CapsuleGeometry(.34,.58,4,8),top,[0,.1,0],'body');
    const head=new THREE.Group();head.position.y=3.15;g.add(head);
    mesh(head,new THREE.SphereGeometry(.31,12,9),skin,[0,0,0],'head');
    mesh(head,new THREE.BoxGeometry(.34,.12,.22),skin,[0,-.24,.02],'jaw');
    mesh(head,new THREE.BoxGeometry(.38,.09,.22),dark,[0,.25,-.03],'hair');
    [-.1,.1].forEach((x,k)=>mesh(head,new THREE.SphereGeometry(.028,6,5),dark,[x,.03,.285],k?'eye-r':'eye-l'));
    const la=new THREE.Group(),ra=new THREE.Group();la.position.set(-.48,2.28,0);ra.position.set(.48,2.28,0);g.add(la,ra);
    mesh(la,new THREE.CapsuleGeometry(.095,.62,3,6),top,[0,-.38,0],'left-arm');mesh(ra,new THREE.CapsuleGeometry(.095,.62,3,6),top,[0,-.38,0],'right-arm');
    const ll=new THREE.Group(),rl=new THREE.Group();ll.position.set(-.18,1.25,0);rl.position.set(.18,1.25,0);g.add(ll,rl);
    mesh(ll,new THREE.CapsuleGeometry(.12,.7,3,6),pants,[0,-.45,0],'left-leg');mesh(rl,new THREE.CapsuleGeometry(.12,.7,3,6),pants,[0,-.45,0],'right-leg');
    mesh(ll,new THREE.BoxGeometry(.24,.14,.42),dark,[0,-.95,.1],'left-shoe');mesh(rl,new THREE.BoxGeometry(.24,.14,.42),dark,[0,-.95,.1],'right-shoe');
    mesh(body,new THREE.BoxGeometry(.08,.5,.04),accent,[.25,.08,.34],'accent');
    g.userData.parts={body,head,leftArm:la,rightArm:ra,leftLeg:ll,rightLeg:rl};
    g.userData.phase=i*.73;g.userData.motion='idle';g.userData.arch=arch.id;g.userData.speed=.8+seeded(i+11)*.55;
    return g;
  }

  const DISTRICTS=[
    {id:'studio',x:-31,z:-15,arch:['artist','promoter','fan']},
    {id:'shops',x:-15,z:31,arch:['fan','local','artist']},
    {id:'park',x:15,z:-31,arch:['local','fan','artist']},
    {id:'media',x:7,z:38,arch:['promoter','artist','fan']},
    {id:'business',x:-38,z:7,arch:['exec','promoter','artist']},
    {id:'downtown',x:31,z:31,arch:['local','fan','exec']}
  ];

  function routeFor(i,d){
    const r=3.5+seeded(i+90)*3.8,a=seeded(i+91)*Math.PI*2;
    return Array.from({length:4},(_,k)=>[d.x+Math.cos(a+k*Math.PI/2)*r,d.z+Math.sin(a+k*Math.PI/2)*r]);
  }

  function rebuild(){
    if(!hasDOM())return status();const THREE=T(),s=scene();if(!THREE||!s)return status();
    if(state.root?.parent)state.root.parent.remove(state.root);
    state.root=new THREE.Group();state.root.name='tgg-crowd-forge';state.root.userData.v236=true;state.npcs=[];
    const count=core()?.densityBudget?.(quality())||8;
    for(let i=0;i<count;i++){
      const d=DISTRICTS[i%DISTRICTS.length],aid=d.arch[i%d.arch.length],arch=core()?.archetype?.(aid)||{};
      const npc=makeNpc(i,arch),route=routeFor(i,d);npc.position.set(route[0][0],0,route[0][1]);npc.userData.route=route;npc.userData.routeIndex=1;
      state.root.add(npc);state.npcs.push(npc);
    }
    s.add(state.root);state.root.visible=state.enabled;state.qualityBuilt=quality();state.rebuilds++;state.ready=true;renderUI();return status();
  }

  function nearestPlayer(npc){
    const p=window.TGG3D?.player;if(!p)return 999;return Math.hypot(npc.position.x-p.position.x,npc.position.z-p.position.z)
  }
  function nearestCar(npc){
    const c=window.TGG3D?.car;if(!c)return 999;return Math.hypot(npc.position.x-c.position.x,npc.position.z-c.position.z)
  }
  function chooseMotion(npc,now){
    const carNear=window.TGGGame?.getState?.()?.inVehicle&&nearestCar(npc)<5.5;
    if(carNear)return'walk';
    if(nearestPlayer(npc)<4.2){
      const v=(Math.floor(now/2600)+Number(npc.name.match(/\d+/)?.[0]||0))%4;
      return['talk','phone','rap','idle'][v];
    }
    return'walk';
  }
  function animateNpc(npc,dt,ts){
    const route=npc.userData.route,idx=npc.userData.routeIndex||0,target=route[idx],dx=target[0]-npc.position.x,dz=target[1]-npc.position.z,dist=Math.hypot(dx,dz);
    const motion=chooseMotion(npc,ts);npc.userData.motion=motion;const def=core()?.motion?.(motion)||{};
    if(motion==='walk'){
      if(dist<.3)npc.userData.routeIndex=(idx+1)%route.length;
      else{const step=Math.min(dist,npc.userData.speed*dt);npc.position.x+=dx/dist*step;npc.position.z+=dz/dist*step;npc.rotation.y=Math.atan2(dx,dz)}
    }
    npc.userData.phase+=dt*(def.rate||2);const ph=npc.userData.phase,p=npc.userData.parts;if(!p)return;
    const s=Math.sin(ph),c=Math.cos(ph),arm=def.arm||0,leg=def.leg||0;
    let lax=s*arm,rax=-s*arm,llx=-s*leg,rlx=s*leg,bz=s*.025,hy=c*.025;
    if(motion==='talk'){rax=-.4+s*.3;lax=.1;hy=s*.08}
    if(motion==='phone'){lax=-.42;p.leftArm.rotation.z+=(1.05-p.leftArm.rotation.z)*.2;rax=.05;hy=-.08}
    else p.leftArm.rotation.z*=.8;
    if(motion==='rap'){lax=-.5+s*.65;rax=.35-s*.75;bz=s*.1;hy=-c*.08}
    p.leftArm.rotation.x+=(lax-p.leftArm.rotation.x)*.25;p.rightArm.rotation.x+=(rax-p.rightArm.rotation.x)*.25;
    p.leftLeg.rotation.x+=(llx-p.leftLeg.rotation.x)*.25;p.rightLeg.rotation.x+=(rlx-p.rightLeg.rotation.x)*.25;
    p.body.rotation.z+=(bz-p.body.rotation.z)*.18;p.head.rotation.y+=(hy-p.head.rotation.y)*.18;
    p.body.position.y=1.8+Math.abs(s)*(def.bob||0);
  }

  function setEnabled(v){state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled}
  function restore(){if(state.root?.parent)state.root.parent.remove(state.root);state.root=null;state.npcs=[];state.enabled=false;renderUI();return status()}

  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v236');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v236ForgeBtn')){const b=document.createElement('button');b.id='v236ForgeBtn';b.className='v236-forge-btn';b.type='button';b.textContent='CROWD';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v236ForgePanel';panel.className='v236-forge-panel';panel.innerHTML='<small>TGG NATIVE 3D</small><b>CROWD + NPC FORGE</b><button id="v236Toggle">CROWD: ON</button><button id="v236Rebuild">REBUILD CROWD</button><button id="v236Restore">RESTORE BASE</button><span id="v236Stats"></span>';document.body.appendChild(panel);document.getElementById('v236Toggle').onclick=()=>setEnabled(!state.enabled);document.getElementById('v236Rebuild').onclick=rebuild;document.getElementById('v236Restore').onclick=restore}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v236ForgeHud';hud.className='v236-forge-hud';city.appendChild(hud)}renderUI();
  }
  function renderUI(){if(!hasDOM())return;const q=id=>document.getElementById(id);if(q('v236Toggle'))q('v236Toggle').textContent='CROWD: '+(state.enabled?'ON':'OFF');if(q('v236Stats'))q('v236Stats').textContent=state.npcs.length+' NPCS • '+quality().toUpperCase();if(hud)hud.textContent='CROWD FORGE • '+state.npcs.length+' NPCS'}
  function tick(ts=0){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!state.root||state.qualityBuilt!==quality())rebuild();const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;if(state.enabled){state.npcs.forEach(n=>animateNpc(n,dt,ts));state.frames++}}
  const api={version:VERSION,layers:LAYERS,status,rebuild,setEnabled,restore};
  globalThis.TGGV236=api;if(hasDOM()){window.TGGV236=api;ensureUI();requestAnimationFrame(tick)}
})();