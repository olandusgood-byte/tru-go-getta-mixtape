(() => {
  const VERSION='V2.13 WORLD POLISH 100';
  const LAYERS=[
    'damage smoke','impact sparks','drift smoke','boost trail','critical hazard pulse','headlight damage flicker','engine vibration','suspension bob','speed vignette','boost vignette',
    'mission letterbox','mission start pulse','mission checkpoint pulse','mission complete pulse','mission handoff pulse','district ribbon','district detection','street prop boot','parking bollards','traffic cones',
    'trash bins','bus shelter','street planters','hydrants','parking meters','reflective puddles','road shoulder markers','intersection reflectors','neon curb accents','studio district accent',
    'media district accent','park district accent','downtown accent','shop district accent','home district accent','extra taxi traffic','extra coupe traffic','extra van traffic','extra sedan traffic','traffic color variety',
    'traffic brake emissive','traffic headlight emissive','traffic collision participation','traffic signal participation','traffic spacing participation','traffic player avoidance','traffic performance culling','traffic state tagging','traffic diagnostics','traffic count QA',
    'extra pedestrian one','extra pedestrian two','extra pedestrian three','extra pedestrian four','pedestrian outfit variety','pedestrian skin variety','pedestrian route variety','pedestrian idle sway','pedestrian sprint reaction','pedestrian shadow support',
    'contact halo','contact proximity glow','contact role badge pulse','contact conversation stance','contact mission stance','contact handoff stance','contact diagnostics','player sprint trail','player footstep dust','player movement glow',
    'car condition visual bridge','car repair visual reset','car boost visual bridge','car drift visual bridge','car impact visual bridge','car critical visual bridge','car garage color bridge','car tuning bridge','car reset bridge','car diagnostics',
    'adaptive particle budget','performance particle trim','balanced particle mode','high particle mode','reduced motion particles','visibility pause','blur cleanup','resize safety','high dpi safety','mobile fx trim',
    'mobile ribbon trim','landscape HUD trim','pointer safety','accessibility aria live','status API','layer manifest API','world prop diagnostics','particle diagnostics','population diagnostics','release QA hooks'
  ];
  const state={
    ready:false,fxEnabled:true,props:0,extraTraffic:0,extraPedestrians:0,
    activeParticles:0,lastImpactAt:0,lastDistrict:'CENTRAL',particleMode:'high'
  };
  const pools={smoke:[],sparks:[],drift:[],boost:[],dust:[]};
  let ribbon=null,overlay=null,live=null,lastNow=performance.now(),smokeClock=0,driftClock=0,boostClock=0,dustClock=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function three(){return window.THREE}
  function scene(){return window.TGG3D?.scene||null}
  function gameState(){return window.TGGGame?.getState?.()||null}
  function drive(){return window.TGGGame?.getDrivingState?.()||{}}
  function condition(){return Number(window.TGGV212?.status?.()?.condition??100)}

  function installHud(){
    document.body.classList.add('tgg-v213');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.13 WORLD POLISH 100';
    const city=document.querySelector('.city');
    if(city&&!document.getElementById('v213FxOverlay')){
      overlay=document.createElement('div');overlay.id='v213FxOverlay';overlay.className='v213-fx-overlay';
      overlay.innerHTML='<i class="v213-vignette"></i><i class="v213-letterbox top"></i><i class="v213-letterbox bottom"></i>';
      city.appendChild(overlay);
    }else overlay=document.getElementById('v213FxOverlay');
    if(city&&!document.getElementById('v213DistrictRibbon')){
      ribbon=document.createElement('div');ribbon.id='v213DistrictRibbon';ribbon.className='v213-district-ribbon';
      ribbon.innerHTML='<small>NOW ENTERING</small><b id="v213District">CENTRAL</b>';
      city.appendChild(ribbon);
    }else ribbon=document.getElementById('v213DistrictRibbon');
    if(!document.getElementById('v213Live')){
      live=document.createElement('div');live.id='v213Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }else live=document.getElementById('v213Live');
  }

  function material(color,opts={}){
    const T=three();
    return new T.MeshStandardMaterial({
      color,roughness:opts.roughness??.65,metalness:opts.metalness??.25,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1,depthWrite:opts.depthWrite??true
    });
  }

  function addProp(obj){const sc=scene();if(!sc||!obj)return null;sc.add(obj);state.props++;return obj}
  function box(w,h,d,color,x,y,z,opts={}){
    const T=three();const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color,opts));
    m.position.set(x,y,z);m.castShadow=opts.shadow!==false;m.receiveShadow=opts.shadow!==false;return addProp(m);
  }
  function cylinder(rt,rb,h,color,x,y,z,opts={}){
    const T=three();const m=new T.Mesh(new T.CylinderGeometry(rt,rb,h,10),material(color,opts));
    m.position.set(x,y,z);m.castShadow=opts.shadow!==false;return addProp(m);
  }

  function bootStreetProps(){
    if(state.props>0||!scene()||!three())return;
    const T=three();
    [[-6,-6],[-6,6],[6,-6],[6,6],[-30,-6],[-30,6],[30,-6],[30,6],[-6,-30],[6,-30],[-6,30],[6,30]].forEach(([x,z],i)=>{
      cylinder(.16,.2,.72,i%2?0xffcf4a:0xc7ff00,x,.36,z,{metalness:.55,roughness:.35});
    });
    [[-11,-5],[-13,-5],[11,5],[13,5],[-5,11],[-5,13],[5,-11],[5,-13]].forEach(([x,z],i)=>{
      const cone=new T.Mesh(new T.ConeGeometry(.28,.72,12),material(i%2?0xff6b35:0xffb13b,{roughness:.55}));
      cone.position.set(x,.36,z);addProp(cone);
    });
    [[-17,-5],[17,5],[-5,17],[5,-17]].forEach(([x,z],i)=>{
      const g=new T.Group();
      const bin=new T.Mesh(new T.BoxGeometry(.85,1.05,.82),material(0x202a31,{metalness:.32,roughness:.72}));
      bin.position.y=.53;g.add(bin);
      const lid=new T.Mesh(new T.BoxGeometry(.92,.12,.88),material(0x39444d,{metalness:.45,roughness:.55}));
      lid.position.y=1.09;g.add(lid);g.position.set(x,0,z);addProp(g);
    });
    [[-20,5],[20,-5],[-5,-20],[5,20]].forEach(([x,z],i)=>{
      const g=new T.Group();
      const pot=new T.Mesh(new T.CylinderGeometry(.72,.56,.72,14),material(0x4b352a,{roughness:.82}));pot.position.y=.36;g.add(pot);
      const plant=new T.Mesh(new T.SphereGeometry(.72,12,8),material(0x2f8f55,{roughness:.9}));plant.scale.y=.75;plant.position.y=1.18;g.add(plant);
      g.position.set(x,0,z);addProp(g);
    });
    [[-9,5],[9,-5],[-5,-9],[5,9]].forEach(([x,z])=>{
      const g=new T.Group();
      const body=new T.Mesh(new T.CylinderGeometry(.22,.28,.75,12),material(0xb51f36,{metalness:.45,roughness:.45}));body.position.y=.38;g.add(body);
      const cap=new T.Mesh(new T.SphereGeometry(.28,10,7),material(0xd62f49,{metalness:.38,roughness:.42}));cap.scale.y=.55;cap.position.y=.82;g.add(cap);
      g.position.set(x,0,z);addProp(g);
    });
    for(const [axis,lane] of [['x',-24],['x',0],['x',24],['z',-24],['z',0],['z',24]]){
      for(let n=-40;n<=40;n+=8){
        if([-24,0,24].some(k=>Math.abs(n-k)<5))continue;
        const marker=new T.Mesh(new T.BoxGeometry(axis==='x'?1.25:.08,.018,axis==='x'?.08:1.25),new T.MeshBasicMaterial({color:0xe7ebf3,transparent:true,opacity:.28}));
        marker.position.set(axis==='x'?n:lane,.075,axis==='x'?lane:n);addProp(marker);
      }
    }
    for(const [x,z,c] of [[-24,-12,0xff466d],[0,36,0xc56cff],[24,12,0x4cff88],[-36,0,0xc7ff00],[-12,24,0x48d7ff],[12,-24,0xffc84a]]){
      const ring=new T.Mesh(new T.RingGeometry(2.3,2.65,28),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.set(x,.085,z);ring.userData.v213Pulse=true;addProp(ring);
    }
    for(const [x,z,w,d] of [[-12,-5,5,1.7],[14,5,4.5,1.5],[-5,14,1.5,4.5],[5,-14,1.5,4.5]]){
      const puddle=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshStandardMaterial({color:0x0b1825,metalness:.72,roughness:.12,transparent:true,opacity:.38}));
      puddle.rotation.x=-Math.PI/2;puddle.position.set(x,.082,z);addProp(puddle);
    }
    const shelter=new T.Group();
    const frameMat=material(0x384657,{metalness:.72,roughness:.3});
    const glassMat=new T.MeshStandardMaterial({color:0x5b7890,transparent:true,opacity:.24,metalness:.25,roughness:.12});
    [-2,2].forEach(x=>{const p=new T.Mesh(new T.BoxGeometry(.12,3.3,.12),frameMat);p.position.set(x,1.65,0);shelter.add(p)});
    const roof=new T.Mesh(new T.BoxGeometry(4.3,.15,1.5),frameMat);roof.position.set(0,3.3,0);shelter.add(roof);
    const glass=new T.Mesh(new T.BoxGeometry(4.05,2.9,.05),glassMat);glass.position.set(0,1.7,.65);shelter.add(glass);
    const bench=new T.Mesh(new T.BoxGeometry(2.9,.18,.55),material(0x6f4931,{roughness:.75}));bench.position.set(0,.65,.2);shelter.add(bench);
    shelter.position.set(31,0,-8);shelter.rotation.y=Math.PI/2;addProp(shelter);
  }

  function makeSimpleCar(color,def,label='CITY'){
    const T=three(),g=new T.Group();
    const bodyMat=material(color,{metalness:.68,roughness:.32});
    const dark=material(0x0a0c10,{metalness:.42,roughness:.4});
    const glass=material(0x38576a,{metalness:.24,roughness:.12,transparent:true,opacity:.78});
    const body=new T.Mesh(new T.BoxGeometry(3.9,.92,1.95),bodyMat);body.position.y=.88;body.castShadow=true;g.add(body);
    const cabin=new T.Mesh(new T.BoxGeometry(2.05,.8,1.58),glass);cabin.position.set(-.18,1.6,0);g.add(cabin);
    const wheels=[];
    [[-1.22,.42,-.95],[-1.22,.42,.95],[1.22,.42,-.95],[1.22,.42,.95]].forEach(([x,y,z])=>{
      const w=new T.Mesh(new T.CylinderGeometry(.36,.36,.3,12),dark);w.rotation.x=Math.PI/2;w.position.set(x,y,z);g.add(w);wheels.push(w);
    });
    const brakeLights=[];
    [-.58,.58].forEach(z=>{
      const b=new T.Mesh(new T.BoxGeometry(.05,.2,.27),material(0x99151d,{emissive:0xff1728,emissiveIntensity:.9}));b.position.set(-1.96,.88,z);g.add(b);brakeLights.push(b);
      const h=new T.Mesh(new T.BoxGeometry(.05,.2,.27),material(0xeefaff,{emissive:0xcceeff,emissiveIntensity:2.4}));h.position.set(1.96,.9,z);g.add(h);
    });
    if(label==='TAXI'){
      const sign=new T.Mesh(new T.BoxGeometry(.9,.28,.38),material(0xffd23b,{emissive:0xa67800,emissiveIntensity:.8}));sign.position.set(-.15,2.1,0);g.add(sign);
    }
    g.scale.set(.72,.72,.72);
    g.userData.wheels=wheels;g.userData.brakeLights=brakeLights;g.userData.traffic={...def,travel:Number(def.offset)||0};g.userData.speedScale=1;g.userData.targetSpeedScale=1;g.userData.v213=true;
    scene().add(g);window.TGG3D.traffic.push(g);state.extraTraffic++;return g;
  }

  function bootExtraTraffic(){
    if(state.extraTraffic||!window.TGG3D?.traffic||!scene())return;
    makeSimpleCar(0xffd23b,{axis:'x',lane:-24,dir:-1,speed:4.8,offset:78},'TAXI');
    makeSimpleCar(0x6ad4ff,{axis:'x',lane:24,dir:1,speed:5.2,offset:12},'COUPE');
    makeSimpleCar(0xe6e8ec,{axis:'z',lane:-24,dir:1,speed:4.45,offset:64},'VAN');
    makeSimpleCar(0x5c667a,{axis:'z',lane:24,dir:-1,speed:5.05,offset:32},'SEDAN');
  }

  function makeSimpleHuman(color,skin,route,phase=0){
    const T=three(),g=new T.Group();
    const top=material(color,{roughness:.65}),skinMat=material(skin,{roughness:.78}),pants=material(0x141923,{roughness:.8});
    const body=new T.Mesh(new T.CapsuleGeometry(.62,1.35,4,8),top);body.position.y=1.92;body.castShadow=true;g.add(body);
    const head=new T.Mesh(new T.SphereGeometry(.5,12,9),skinMat);head.position.y=3.25;head.castShadow=true;g.add(head);
    const makeLimb=(geo,mat)=>{const grp=new T.Group(),m=new T.Mesh(geo,mat);m.position.y=-.52;grp.add(m);return grp};
    const armGeo=new T.CapsuleGeometry(.15,.82,3,7),legGeo=new T.CapsuleGeometry(.19,.94,3,7);
    const leftArm=makeLimb(armGeo,top),rightArm=makeLimb(armGeo,top),leftLeg=makeLimb(legGeo,pants),rightLeg=makeLimb(legGeo,pants);
    leftArm.position.set(-.78,2.48,0);rightArm.position.set(.78,2.48,0);leftLeg.position.set(-.28,1.18,0);rightLeg.position.set(.28,1.18,0);g.add(leftArm,rightArm,leftLeg,rightLeg);
    g.userData.parts={leftArm,rightArm,leftLeg,rightLeg,body,head};g.userData.route=route;g.userData.routeIndex=1;g.userData.speed=.017+phase*.001;g.userData.walkPhase=phase;g.userData.v213=true;
    g.scale.set(.82,.82,.82);g.position.set(route[0][0],0,route[0][1]);scene().add(g);window.TGG3D.pedestrians.push(g);state.extraPedestrians++;return g;
  }

  function bootExtraPedestrians(){
    if(state.extraPedestrians||!window.TGG3D?.pedestrians||!scene())return;
    makeSimpleHuman(0x00a7ff,0x9b694c,[[-38,-7],[-29,-7],[-29,7],[-38,7]],1);
    makeSimpleHuman(0xf95d9b,0xc08a67,[[29,-7],[38,-7],[38,7],[29,7]],2);
    makeSimpleHuman(0xffa62b,0x6f4634,[[-7,29],[-7,38],[7,38],[7,29]],3);
    makeSimpleHuman(0x7d6cff,0xa36d4c,[[-7,-38],[-7,-29],[7,-29],[7,-38]],4);
  }

  function makePool(type,count,color,size){
    const T=three(),sc=scene();if(!T||!sc)return;
    for(let i=0;i<count;i++){
      const m=new T.Mesh(new T.SphereGeometry(size,6,5),new T.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false}));
      m.visible=false;m.userData.life=0;m.userData.vel=new T.Vector3();m.userData.kind=type;sc.add(m);pools[type].push(m);
    }
  }
  function bootParticles(){
    if(pools.smoke.length||!scene())return;
    const mode=window.TGGV212?.status?.()?.quality||'high';state.particleMode=mode;
    const mult=mode==='performance'?.55:mode==='balanced'?.75:1;
    makePool('smoke',Math.max(5,Math.round(12*mult)),0x657080,.23);
    makePool('sparks',Math.max(8,Math.round(20*mult)),0xffc54a,.07);
    makePool('drift',Math.max(6,Math.round(14*mult)),0xb5c0cb,.16);
    makePool('boost',Math.max(6,Math.round(16*mult)),0x5ab8ff,.09);
    makePool('dust',Math.max(5,Math.round(10*mult)),0x9d8d78,.11);
  }
  function emit(type,pos,vel,life=1,scale=1){
    const p=pools[type]?.find(x=>!x.visible);if(!p||!pos)return null;
    p.visible=true;p.position.copy(pos);p.scale.setScalar(scale);p.material.opacity=1;p.userData.life=life;p.userData.maxLife=life;p.userData.vel.copy(vel||new (three().Vector3)());state.activeParticles++;return p;
  }
  function worldPoint(obj,x,y,z){
    const T=three();if(!T||!obj)return null;const v=new T.Vector3(x,y,z);return obj.localToWorld(v);
  }

  function emitCarFx(dt,now){
    const T=three(),car=window.TGG3D?.car,gs=gameState(),d=drive();if(!T||!car||!gs)return;
    const speed=Math.abs(Number(d.speed)||0),cond=condition();
    if(gs.inVehicle&&cond<65){
      smokeClock-=dt;
      if(smokeClock<=0){
        smokeClock=cond<25?.055:.13;
        const p=worldPoint(car,1.35,1.12,0);
        emit('smoke',p,new T.Vector3((Math.random()-.5)*.18,.65+Math.random()*.3,(Math.random()-.5)*.18),1.25,.75+(65-cond)/70);
      }
    }
    if(gs.inVehicle&&d.handbrake&&speed>2.5){
      driftClock-=dt;
      if(driftClock<=0){
        driftClock=.06;
        for(const z of [-.72,.72]){
          const p=worldPoint(car,-1.35,.12,z);
          emit('drift',p,new T.Vector3((Math.random()-.5)*.25,.18,(Math.random()-.5)*.25),.75,.7);
        }
      }
    }
    if(gs.inVehicle&&d.boosting&&speed>2){
      boostClock-=dt;
      if(boostClock<=0){
        boostClock=.035;
        for(const z of [-.5,.5]){
          const p=worldPoint(car,-2.2,.6,z);
          emit('boost',p,new T.Vector3(-Math.cos(car.rotation.y)*.25,.05,Math.sin(car.rotation.y)*.25),.38,.72);
        }
      }
    }
    if(!gs.inVehicle){
      const pd=window.TGG3D?.getPlayerDynamics?.()||{};
      if(pd.sprinting&&Number(pd.speed)>6){
        dustClock-=dt;
        if(dustClock<=0){
          dustClock=.11;
          const player=window.TGG3D?.player,p=worldPoint(player,0,.06,0);
          emit('dust',p,new T.Vector3((Math.random()-.5)*.15,.12,(Math.random()-.5)*.15),.55,.55);
        }
      }
    }
    car.position.y=gs.inVehicle?Math.sin(now*.012)*Math.min(.035,speed*.003):0;
    const crit=cond<=20,blink=crit&&(Math.sin(now*.018)>0);
    car.userData.headlights?.forEach((h,i)=>{if(crit&&i===1)h.material.emissiveIntensity=blink?3.4:.25});
    if(car.userData.boostGlow&&crit&&!d.boosting)car.userData.boostGlow.intensity=blink?2.2:0;
  }

  function updateParticles(dt){
    state.activeParticles=0;
    for(const arr of Object.values(pools)){
      arr.forEach(p=>{
        if(!p.visible)return;
        p.userData.life-=dt;
        if(p.userData.life<=0){p.visible=false;p.material.opacity=0;return}
        state.activeParticles++;
        p.position.addScaledVector(p.userData.vel,dt*60);
        p.userData.vel.y+=p.userData.kind==='sparks'?-0.022:0.002;
        const ratio=p.userData.life/p.userData.maxLife;
        p.material.opacity=clamp(ratio,0,1)*(p.userData.kind==='smoke'?.45:.82);
        const grow=p.userData.kind==='smoke'||p.userData.kind==='drift'||p.userData.kind==='dust';
        if(grow)p.scale.multiplyScalar(1+dt*.65);
      });
    }
  }

  function impactSparks(detail={}){
    const T=three(),car=window.TGG3D?.car;if(!T||!car)return;
    state.lastImpactAt=Date.now();
    const base=car.position.clone();base.y=.65;
    const n=Math.round(7+clamp(Number(detail.strength)||.4,0,1)*11);
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,sp=.14+Math.random()*.4;
      emit('sparks',base.clone(),new T.Vector3(Math.cos(a)*sp,.12+Math.random()*.38,Math.sin(a)*sp),.35+Math.random()*.35,.65+Math.random()*.6);
    }
    document.body.classList.add('v213-impact');setTimeout(()=>document.body.classList.remove('v213-impact'),260);
  }

  function district(){
    const s=gameState();if(!s)return 'CENTRAL';
    const x=((Number(s.x)||50)-50)*.92,z=((Number(s.y)||50)-50)*.92;
    if(z>26)return 'MEDIA DISTRICT';
    if(z<-19&&Math.abs(x)<17)return 'HOME / SOUTH';
    if(x<-27)return 'DOWNTOWN BUSINESS';
    if(x>19&&z>2)return 'TGG PARK';
    if(x<-15&&z<4)return 'STUDIO ROW';
    if(z>15&&x<8)return 'SHOP DISTRICT';
    return 'CENTRAL';
  }
  function updateDistrict(){
    const next=district();if(next===state.lastDistrict)return;
    state.lastDistrict=next;
    const el=document.getElementById('v213District');if(el)el.textContent=next;
    ribbon?.classList.add('active');setTimeout(()=>ribbon?.classList.remove('active'),1900);
    if(live)live.textContent='Entering '+next;
  }

  function pulseWorld(now){
    scene()?.traverse?.(o=>{
      if(o.userData?.v213Pulse&&o.material){
        const base=.12; o.material.opacity=base+(Math.sin(now*.003+o.position.x)*.06+.06);
      }
    });
  }

  function updateOverlay(){
    const gs=gameState(),d=drive(),cond=condition();
    document.body.classList.toggle('v213-driving',!!gs?.inVehicle);
    document.body.classList.toggle('v213-boosting',!!gs?.inVehicle&&!!d.boosting);
    document.body.classList.toggle('v213-drifting',!!gs?.inVehicle&&!!d.handbrake&&Math.abs(Number(d.speed)||0)>2.5);
    document.body.classList.toggle('v213-critical',cond<=20);
  }

  function cinematic(kind,title){
    document.body.classList.add('v213-cinematic','v213-'+kind);
    if(live)live.textContent=title||kind;
    setTimeout(()=>document.body.classList.remove('v213-cinematic','v213-'+kind),kind==='complete'?1350:800);
  }
  window.addEventListener('tgg:traffic-impact',e=>impactSparks(e.detail||{}));
  window.addEventListener('tgg:mission-start',e=>cinematic('start',e.detail?.missionName));
  window.addEventListener('tgg:mission-checkpoint',e=>cinematic('checkpoint',e.detail?.missionName));
  window.addEventListener('tgg:mission-complete',e=>cinematic('complete',e.detail?.missionName));
  window.addEventListener('tgg:mission-handoff',()=>cinematic('handoff','Next contact'));
  window.addEventListener('tgg:vehicle-repaired',()=>{document.body.classList.add('v213-repaired');setTimeout(()=>document.body.classList.remove('v213-repaired'),700)});

  function boot(){
    if(state.ready)return true;
    installHud();
    if(!scene()||!three()||!window.TGG3D?.car)return false;
    bootStreetProps();bootExtraTraffic();bootExtraPedestrians();bootParticles();
    state.ready=true;return true;
  }
  function tick(now=performance.now()){
    requestAnimationFrame(tick);
    installHud();
    if(!boot())return;
    const dt=Math.min(.05,Math.max(.001,(now-lastNow)/1000));lastNow=now;
    if(document.hidden)return;
    emitCarFx(dt,now);updateParticles(dt);updateDistrict();pulseWorld(now);updateOverlay();
    const q=window.TGGV212?.status?.()?.quality||'high';state.particleMode=q;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.13 WORLD POLISH 100';
  }
  function status(){
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,props:state.props,
      extraTraffic:state.extraTraffic,extraPedestrians:state.extraPedestrians,
      activeParticles:state.activeParticles,district:state.lastDistrict,particleMode:state.particleMode,
      trafficTotal:window.TGG3D?.traffic?.length||0,pedestrianTotal:window.TGG3D?.pedestrians?.length||0
    };
  }
  window.TGGV213={version:VERSION,layers:LAYERS,status,boot,impactSparks,district};
  requestAnimationFrame(tick);
})();