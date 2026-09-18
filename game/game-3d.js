(() => {
  const host=document.getElementById('city3d');
  const city=document.querySelector('#game .city');
  if(!host||!city||!window.THREE)return;

  const THREE=window.THREE;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x04060b);
  scene.fog=new THREE.FogExp2(0x05070d,0.017);

  const camera=new THREE.PerspectiveCamera(58,1,0.1,240);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  host.appendChild(renderer.domElement);
  city.classList.add('webgl-ready');

  scene.add(new THREE.HemisphereLight(0x7c8cff,0x101016,1.55));
  const moon=new THREE.DirectionalLight(0xffffff,2.25);
  moon.position.set(24,38,18);
  moon.castShadow=true;
  moon.shadow.mapSize.set(1024,1024);
  scene.add(moon);

  const neon=new THREE.PointLight(0xc7ff00,18,36,2);
  neon.position.set(0,8,0);
  scene.add(neon);

  const starPositions=[];
  for(let i=0;i<180;i++){
    const a=(i*2.399963229728653)%(Math.PI*2);
    const radius=58+(i%37)*1.15;
    const y=22+(i%29)*1.1;
    starPositions.push(Math.cos(a)*radius,y,Math.sin(a)*radius);
  }
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xdce7ff,size:.18,sizeAttenuation:true,transparent:true,opacity:.78}));
  scene.add(stars);
  const moonMesh=new THREE.Mesh(
    new THREE.SphereGeometry(2.4,24,16),
    new THREE.MeshStandardMaterial({color:0xf4f7ff,emissive:0xb8c7ff,emissiveIntensity:1.8,roughness:.9})
  );
  moonMesh.position.set(-34,34,-46);
  scene.add(moonMesh);

  const groundMat=new THREE.MeshStandardMaterial({color:0x10131a,roughness:.92,metalness:.08});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(112,112),groundMat);
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  scene.add(ground);

  const roadMat=new THREE.MeshStandardMaterial({color:0x1a1f29,roughness:.72,metalness:.14});
  const lineMat=new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x91c000,emissiveIntensity:1.8});
  [-24,0,24].forEach(x=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(7,.05,112),roadMat);r.position.set(x,.03,0);r.receiveShadow=true;scene.add(r);
    const l=new THREE.Mesh(new THREE.BoxGeometry(.12,.055,112),lineMat);l.position.set(x,.06,0);scene.add(l);
  });
  [-24,0,24].forEach(z=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(112,.05,7),roadMat);r.position.set(0,.035,z);r.receiveShadow=true;scene.add(r);
    const l=new THREE.Mesh(new THREE.BoxGeometry(112,.06,.12),lineMat);l.position.set(0,.065,z);scene.add(l);
  });

  const obstacles=[];
  const buildingColors=[0x1d2330,0x252c3a,0x171c26,0x303748,0x202838];
  const windowMat=new THREE.MeshStandardMaterial({color:0x8ee6ff,emissive:0x2d84aa,emissiveIntensity:2.25,roughness:.35});
  let bi=0;
  const blocks=[-40,-32,-16,-8,8,16,32,40];
  for(const x of blocks){
    for(const z of blocks){
      if(Math.abs(x)<5||Math.abs(z)<5)continue;
      const h=7+((Math.abs(x*13+z*7)+bi*3)%22);
      const w=5+((bi*5)%5);
      const d=5+((bi*7)%4);
      const mat=new THREE.MeshStandardMaterial({color:buildingColors[bi%buildingColors.length],roughness:.72,metalness:.3});
      const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      b.position.set(x,h/2,z);
      b.castShadow=true;b.receiveShadow=true;scene.add(b);
      obstacles.push({x,z,hw:w/2+.65,hd:d/2+.65});
      if(bi%2===0){
        const glow=new THREE.Mesh(new THREE.BoxGeometry(w*.72,.16,d+.03),windowMat);
        glow.position.set(x,Math.max(2,h*.65),z+d/2+.03);
        scene.add(glow);
      }
      bi++;
    }
  }

  function addStreetLight(x,z,rotate=0){
    const g=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,5.3,10),new THREE.MeshStandardMaterial({color:0x454b58,metalness:.85,roughness:.3}));
    pole.position.y=2.65;pole.castShadow=true;g.add(pole);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(1.25,.09,.09),pole.material);
    arm.position.set(.55,5.15,0);arm.rotation.z=-.12;g.add(arm);
    const lampMat=new THREE.MeshStandardMaterial({color:0xf4ffd0,emissive:0xd9ff88,emissiveIntensity:3});
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.32),lampMat);
    lamp.position.set(1.12,5.03,0);g.add(lamp);
    g.position.set(x,0,z);g.rotation.y=rotate;scene.add(g);
    const light=new THREE.PointLight(0xeaffae,5.5,12,2);
    light.position.set(x+Math.cos(rotate)*1.05,5.0,z-Math.sin(rotate)*1.05);
    scene.add(light);
  }
  [[-4,-18,0],[-4,18,0],[4,-34,Math.PI],[4,34,Math.PI],[-18,-4,Math.PI/2],[18,-4,Math.PI/2],[-34,4,-Math.PI/2],[34,4,-Math.PI/2]]
    .forEach(v=>addStreetLight(...v));

  function addBench(x,z,rot=0){
    const wood=new THREE.MeshStandardMaterial({color:0x70482f,roughness:.82});
    const metal=new THREE.MeshStandardMaterial({color:0x2c3039,metalness:.7,roughness:.38});
    const g=new THREE.Group();
    const seat=new THREE.Mesh(new THREE.BoxGeometry(2.6,.18,.72),wood);seat.position.y=.62;g.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(2.6,.75,.14),wood);back.position.set(0,1.05,.28);back.rotation.x=-.08;g.add(back);
    [-1,.9].forEach(xp=>{const leg=new THREE.Mesh(new THREE.BoxGeometry(.12,.65,.12),metal);leg.position.set(xp,.31,0);g.add(leg)});
    g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
  }
  addBench(-10,-3,0);addBench(10,3,Math.PI);addBench(-3,10,Math.PI/2);addBench(3,-10,-Math.PI/2);

  function makeHuman(bodyColor=0xc7ff00,skin=0x9d6a49){
    const g=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color:bodyColor,roughness:.55,metalness:.1});
    const skinMat=new THREE.MeshStandardMaterial({color:skin,roughness:.72});
    const pantsMat=new THREE.MeshStandardMaterial({color:0x111827,roughness:.8});

    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.72,1.55,5,10),bodyMat);
    body.position.y=2.05;body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.58,16,12),skinMat);
    head.position.y=3.58;head.castShadow=true;g.add(head);

    const leftArm=new THREE.Group(), rightArm=new THREE.Group(), leftLeg=new THREE.Group(), rightLeg=new THREE.Group();
    const armGeo=new THREE.CapsuleGeometry(.18,.95,4,8);
    const legGeo=new THREE.CapsuleGeometry(.22,1.08,4,8);
    const la=new THREE.Mesh(armGeo,bodyMat),ra=new THREE.Mesh(armGeo,bodyMat);
    la.position.y=-.58;ra.position.y=-.58;la.castShadow=ra.castShadow=true;
    leftArm.position.set(-.92,2.68,0);rightArm.position.set(.92,2.68,0);leftArm.add(la);rightArm.add(ra);
    const ll=new THREE.Mesh(legGeo,pantsMat),rl=new THREE.Mesh(legGeo,pantsMat);
    ll.position.y=-.7;rl.position.y=-.7;ll.castShadow=rl.castShadow=true;
    leftLeg.position.set(-.34,1.35,0);rightLeg.position.set(.34,1.35,0);leftLeg.add(ll);rightLeg.add(rl);
    g.add(leftArm,rightArm,leftLeg,rightLeg);
    g.userData.parts={leftArm,rightArm,leftLeg,rightLeg,body,head};
    return g;
  }

  const player=makeHuman(0xc7ff00);
  scene.add(player);
  const npc=makeHuman(0x6f7cff,0x8c5d40);
  npc.scale.set(.92,.92,.92);npc.position.set(22,0,-14);scene.add(npc);

  const npcRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.12,10,32),new THREE.MeshStandardMaterial({color:0x7a8cff,emissive:0x4050ff,emissiveIntensity:2.5}));
  npcRing.rotation.x=Math.PI/2;npcRing.position.set(22,.08,-14);scene.add(npcRing);

  function makeCar(color=0xc7ff00){
    const car=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color,metalness:.72,roughness:.28});
    const dark=new THREE.MeshStandardMaterial({color:0x080a0d,metalness:.35,roughness:.42});
    const glass=new THREE.MeshStandardMaterial({color:0x4d7185,metalness:.25,roughness:.12,transparent:true,opacity:.76});
    const shell=new THREE.Mesh(new THREE.BoxGeometry(4.2,1.0,2.05),bodyMat);
    shell.position.y=.95;shell.castShadow=true;car.add(shell);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.25,.9,1.72),glass);
    cabin.position.set(-.25,1.72,0);cabin.castShadow=true;car.add(cabin);
    const bumper=new THREE.Mesh(new THREE.BoxGeometry(.16,.35,2.12),dark);
    bumper.position.set(2.12,.72,0);car.add(bumper);
    const wheels=[];
    [[-1.35,.46,-1.02],[-1.35,.46,1.02],[1.35,.46,-1.02],[1.35,.46,1.02]].forEach(([x,y,z])=>{
      const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.34,14),dark);
      w.rotation.x=Math.PI/2;w.position.set(x,y,z);w.castShadow=true;w.userData.front=x>0;car.add(w);wheels.push(w);
    });
    const headMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xeaffff,emissiveIntensity:3.4});
    const brakeMat=new THREE.MeshStandardMaterial({color:0xff2020,emissive:0xff1010,emissiveIntensity:.9});
    const headlights=[];
    const brakeLights=[];
    [-.65,.65].forEach(z=>{
      const h=new THREE.Mesh(new THREE.BoxGeometry(.06,.24,.34),headMat);
      h.position.set(2.12,1.0,z);car.add(h);headlights.push(h);
      const b=new THREE.Mesh(new THREE.BoxGeometry(.06,.22,.30),brakeMat.clone());
      b.position.set(-2.12,.95,z);car.add(b);brakeLights.push(b);
    });
    const skidMat=new THREE.MeshBasicMaterial({color:0x8aa0b8,transparent:true,opacity:0,depthWrite:false});
    const skidMarks=[];
    [-.72,.72].forEach(z=>{const skid=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.16),skidMat.clone());skid.rotation.x=-Math.PI/2;skid.position.set(-1.45,.03,z);car.add(skid);skidMarks.push(skid)});
    const headGlow=new THREE.PointLight(0xdff8ff,3.8,12,2);
    headGlow.position.set(2.45,1.15,0);car.add(headGlow);
    car.userData.wheels=wheels;
    car.userData.headlights=headlights;
    car.userData.brakeLights=brakeLights;
    car.userData.headGlow=headGlow;
    car.userData.skidMarks=skidMarks;
    car.userData.bodyMaterial=bodyMat;
    car.userData.wheelMaterial=dark;
    return car;
  }
  const car=makeCar();
  car.position.set(5.7,0,4.6);car.rotation.y=0;car.userData.headingDeg=0;scene.add(car);
  const vehicleDynamics={speed:0,steer:0,braking:false,handbrake:false};
  const playerDynamics={speed:0,vx:0,vy:0,sprinting:false,blocked:false};
  function setPlayerDynamics(next={}){
    playerDynamics.speed=Math.max(0,Number(next.speed)||0);
    playerDynamics.vx=Number(next.vx)||0;
    playerDynamics.vy=Number(next.vy)||0;
    playerDynamics.sprinting=!!next.sprinting;
    playerDynamics.blocked=!!next.blocked;
    return {...playerDynamics};
  }
  function setVehicleDynamics(next={}){
    vehicleDynamics.speed=Number(next.speed)||0;
    vehicleDynamics.steer=Math.max(-1,Math.min(1,Number(next.steer)||0));
    vehicleDynamics.braking=!!next.braking;
    vehicleDynamics.handbrake=!!next.handbrake;
    return {...vehicleDynamics};
  }
  function setCarAppearance(next={}){
    if(next.color&&car.userData.bodyMaterial)car.userData.bodyMaterial.color.set(next.color);
    if(next.wheelColor&&car.userData.wheelMaterial)car.userData.wheelMaterial.color.set(next.wheelColor);
    return {
      color:'#'+car.userData.bodyMaterial.color.getHexString(),
      wheelColor:'#'+car.userData.wheelMaterial.color.getHexString()
    };
  }

  const skylineGlow=new THREE.Mesh(new THREE.RingGeometry(32,49,64),new THREE.MeshBasicMaterial({color:0x2a3040,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  skylineGlow.rotation.x=-Math.PI/2;skylineGlow.position.y=.02;scene.add(skylineGlow);

  const cameraModes=['orbit','chase','top'];
  let cameraMode='orbit';
  let yaw=Math.PI*.25,pitch=.48,distance=17,dragging=false,px=0,py=0,manualCameraUntil=0;

  function setCameraMode(mode,quiet=false){
    if(!cameraModes.includes(mode))return cameraMode;
    cameraMode=mode;
    if(!quiet)window.__tggToast?.('CAMERA — '+cameraMode.toUpperCase());
    return cameraMode;
  }
  function cycleCamera(){
    const idx=cameraModes.indexOf(cameraMode);
    return setCameraMode(cameraModes[(idx+1)%cameraModes.length]);
  }
  function getCameraMode(){return cameraMode;}

  let lastPlayerX=0,lastPlayerZ=0,walkPhase=0;

  renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId)});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!dragging)return;
    yaw-=(e.clientX-px)*.008;
    pitch=Math.max(.22,Math.min(.9,pitch-(e.clientY-py)*.006));
    manualCameraUntil=performance.now()+2200;
    px=e.clientX;py=e.clientY;
  });
  renderer.domElement.addEventListener('pointerup',()=>dragging=false);
  renderer.domElement.addEventListener('wheel',e=>{distance=Math.max(8,Math.min(30,distance+Math.sign(e.deltaY)*1.4));e.preventDefault()},{passive:false});

  function toWorld(s){
    return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92};
  }

  function makeTextSprite(text,color='#c7ff00'){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='rgba(3,5,10,.82)';
    ctx.strokeStyle=color;ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(8,8,496,112,24);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffffff';
    ctx.font='900 36px Arial, sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,256,64);
    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
    const sprite=new THREE.Sprite(mat);
    sprite.scale.set(8,2,1);
    return sprite;
  }

  const destinationDefs=[
    {id:'studio',label:'RECORDING STUDIO',buttonId:'studioBtn',x:-24,z:-12,color:0xff466d},
    {id:'park',label:'THE PARK',buttonId:'parkBtn',x:24,z:12,color:0x4cff88},
    {id:'shops',label:'SHOP DISTRICT',buttonId:'shopsBtn',x:-12,z:24,color:0x48d7ff},
    {id:'home',label:'MY APARTMENT',buttonId:'homeBtn',x:12,z:-24,color:0xffc84a},
    {id:'media',label:'MEDIA DISTRICT',buttonId:'mediaBtn',x:0,z:36,color:0xc56cff},
    {id:'business',label:'BUSINESS',buttonId:'businessBtn',x:-36,z:0,color:0xc7ff00}
  ];
  const destinations=destinationDefs.map(d=>{
    const group=new THREE.Group();
    group.position.set(d.x,0,d.z);
    const color=new THREE.Color(d.color);
    const ringMat=new THREE.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:2.4,transparent:true,opacity:.72,side:THREE.DoubleSide});
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2.18,36),ringMat);
    ring.rotation.x=-Math.PI/2;ring.position.y=.07;group.add(ring);
    const beamMat=new THREE.MeshBasicMaterial({color:d.color,transparent:true,opacity:.14,depthWrite:false});
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.62,1.35,7.5,18,1,true),beamMat);
    beam.position.y=3.8;group.add(beam);
    const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.48),new THREE.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:2.8,metalness:.45,roughness:.25}));
    marker.position.y=2.25;group.add(marker);
    const label=makeTextSprite(d.label,'#'+color.getHexString());
    label.position.y=5.8;group.add(label);
    scene.add(group);
    return {...d,group,ring,beam,marker,label};
  });

  function nearbyDestination(s,radius=7.2){
    const p=toWorld(s);
    let best=null,bestDist=Infinity;
    for(const d of destinations){
      const dist=Math.hypot(p.x-d.x,p.z-d.z);
      if(dist<bestDist){bestDist=dist;best=d;}
    }
    return best&&bestDist<=radius?{...best,distance:bestDist}:null;
  }

  function interactNearest(){
    const d=nearbyDestination(window.TGGGame?.getState?.());
    if(!d){window.__tggToast?.('MOVE CLOSER TO A 3D DESTINATION');return false;}
    const button=document.getElementById(d.buttonId);
    if(!button){window.__tggToast?.(d.label+' IS NOT READY YET');return false;}
    window.__tggToast?.('ENTERING '+d.label);
    button.click();
    return true;
  }
  function canMovePercent(x,y,vehicle=false){
    const p=toWorld({x,y});
    const edge=vehicle?47.8:49;
    if(Math.abs(p.x)>edge||Math.abs(p.z)>edge)return false;
    const extra=vehicle ? .9 : 0;
    return !obstacles.some(o=>Math.abs(p.x-o.x)<o.hw+extra&&Math.abs(p.z-o.z)<o.hd+extra);
  }
  function distanceToCarPercent(s){
    const p=toWorld(s);
    return Math.hypot(p.x-car.position.x,p.z-car.position.z);
  }
  function syncCarFromState(s){
    if(s?.inVehicle){
      const p=toWorld(s);
      car.position.x=THREE.MathUtils.lerp(car.position.x,p.x,.2);
      car.position.z=THREE.MathUtils.lerp(car.position.z,p.z,.2);
      car.userData.headingDeg=(Number(s.heading)||0);
      car.rotation.y=-(car.userData.headingDeg*Math.PI/180);
    }
  }

  const pedestrianColors=[0xff5f6d,0x5f8cff,0xffc857,0x8e6cff,0x42d392,0xf78cff];
  const pedestrianRoutes=[
    [[-18,-7],[-7,-7],[-7,7],[-18,7]],
    [[7,-18],[18,-18],[18,-7],[7,-7]],
    [[7,7],[18,7],[18,18],[7,18]],
    [[-18,7],[-7,7],[-7,18],[-18,18]],
    [[-30,-4],[-10,-4],[-10,4],[-30,4]],
    [[10,-4],[30,-4],[30,4],[10,4]]
  ];

  const pedestrians=pedestrianRoutes.map((route,i)=>{
    const human=makeHuman(pedestrianColors[i%pedestrianColors.length],i%2?0x8c5d40:0xb98562);
    human.scale.set(.78,.78,.78);
    human.position.set(route[0][0],0,route[0][1]);
    human.userData.route=route;
    human.userData.routeIndex=1;
    human.userData.speed=.018+(i%3)*.004;
    human.userData.walkPhase=i*.9;
    scene.add(human);
    return human;
  });

  const trafficDefs=[
    {axis:'x',lane:-24,dir:1,speed:5.4,offset:4,color:0xff4d67},
    {axis:'x',lane:24,dir:-1,speed:4.9,offset:28,color:0x5f8cff},
    {axis:'x',lane:0,dir:1,speed:6.1,offset:58,color:0xffffff},
    {axis:'z',lane:-24,dir:-1,speed:5.1,offset:16,color:0xffc857},
    {axis:'z',lane:24,dir:1,speed:5.7,offset:42,color:0x42d392},
    {axis:'z',lane:0,dir:-1,speed:4.6,offset:70,color:0xb36cff}
  ];
  const traffic=trafficDefs.map(def=>{
    const vehicle=makeCar(def.color);
    vehicle.scale.set(.72,.72,.72);
    vehicle.userData.traffic=def;
    scene.add(vehicle);
    return vehicle;
  });

  function animatePedestrian(human,dt){
    const route=human.userData.route;
    const idx=human.userData.routeIndex||0;
    const target=route[idx];
    const dx=target[0]-human.position.x;
    const dz=target[1]-human.position.z;
    const dist=Math.hypot(dx,dz);
    if(dist<.32){
      human.userData.routeIndex=(idx+1)%route.length;
      return;
    }
    const step=Math.min(dist,human.userData.speed*60*dt);
    human.position.x+=dx/dist*step;
    human.position.z+=dz/dist*step;
    human.rotation.y=Math.atan2(dx,dz);
    human.userData.walkPhase+=dt*7.5;
    const p=human.userData.parts;
    if(p){
      const swing=Math.sin(human.userData.walkPhase)*.62;
      p.leftArm.rotation.x=swing;
      p.rightArm.rotation.x=-swing;
      p.leftLeg.rotation.x=-swing*.82;
      p.rightLeg.rotation.x=swing*.82;
    }
  }

  function animateTraffic(vehicle,t,dt){
    const def=vehicle.userData.traffic;
    const span=96;
    const raw=(t*def.speed+def.offset)%span;
    const pos=raw-48;
    if(def.axis==='x'){
      vehicle.position.set(def.dir>0?pos:-pos,0,def.lane);
      vehicle.rotation.y=def.dir>0?0:Math.PI;
    }else{
      vehicle.position.set(def.lane,0,def.dir>0?pos:-pos);
      vehicle.rotation.y=def.dir>0?-Math.PI/2:Math.PI/2;
    }
    vehicle.userData.wheels?.forEach(w=>w.rotation.z-=dt*9*def.dir);
  }

  const radar=document.getElementById('radar3d');
  const radarPlayer=document.getElementById('radarPlayer');
  const radarCar=document.getElementById('radarCar');
  const radarDestinations=document.getElementById('radarDestinations');
  const radarDestinationDots=[];
  if(radarDestinations){
    destinations.forEach(d=>{
      const dot=document.createElement('span');
      dot.className='radar-destination';
      dot.title=d.label;
      dot.style.setProperty('--radar-color','#'+new THREE.Color(d.color).getHexString());
      radarDestinations.appendChild(dot);
      radarDestinationDots.push({dot,d});
    });
  }
  function radarPlace(el,x,z){
    if(!el)return;
    el.style.left=((x+50)/100*100)+'%';
    el.style.top=((z+50)/100*100)+'%';
  }
  function updateRadar(s){
    const p=toWorld(s);
    radarPlace(radarPlayer,p.x,p.z);
    radarPlace(radarCar,car.position.x,car.position.z);
    if(radarCar)radarCar.classList.toggle('active',!!s?.inVehicle);
    radarDestinationDots.forEach(({dot,d})=>radarPlace(dot,d.x,d.z));
    if(radar)radar.dataset.mode=cameraMode;
  }

  const clock=new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(.05,clock.getDelta());
    const t=clock.elapsedTime;
    const s=window.TGGGame?.getState?.()||{x:50,y:55,heading:0,inVehicle:false};
    const p=toWorld(s);

    if(s.inVehicle){
      player.visible=false;
      syncCarFromState(s);
    }else{
      player.visible=true;
      const followRate=playerDynamics.sprinting ? .26 : .21;
      player.position.x=THREE.MathUtils.lerp(player.position.x,p.x,followRate);
      player.position.z=THREE.MathUtils.lerp(player.position.z,p.z,followRate);
      const desiredRot=-((Number(s.heading)||0)*Math.PI/180)+Math.PI/2;
      let rotationDelta=((desiredRot-player.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
      player.rotation.y+=rotationDelta*Math.min(1,dt*(playerDynamics.sprinting?16:12));
    }

    const vx=player.position.x-lastPlayerX,vz=player.position.z-lastPlayerZ;
    const measuredSpeed=Math.hypot(vx,vz)*8;
    const speed=Math.min(1,Math.max(measuredSpeed,playerDynamics.speed/10.5));
    lastPlayerX=player.position.x;lastPlayerZ=player.position.z;
    const parts=player.userData.parts;
    if(parts){
      if(speed>.025&&!s.inVehicle)walkPhase+=dt*((playerDynamics.sprinting?11:7)+speed*(playerDynamics.sprinting?10:8));
      const stride=playerDynamics.sprinting?1.08:.72;
      const swing=!s.inVehicle?Math.sin(walkPhase)*stride*speed:0;
      parts.leftArm.rotation.x=THREE.MathUtils.lerp(parts.leftArm.rotation.x,swing,.24);
      parts.rightArm.rotation.x=THREE.MathUtils.lerp(parts.rightArm.rotation.x,-swing,.24);
      parts.leftLeg.rotation.x=THREE.MathUtils.lerp(parts.leftLeg.rotation.x,-swing*(playerDynamics.sprinting ? .95 : .85),.24);
      parts.rightLeg.rotation.x=THREE.MathUtils.lerp(parts.rightLeg.rotation.x,swing*(playerDynamics.sprinting ? .95 : .85),.24);
      const sideLean=!s.inVehicle?Math.max(-.08,Math.min(.08,-playerDynamics.vy*.004+playerDynamics.vx*.0025)):0;
      parts.body.rotation.z=THREE.MathUtils.lerp(parts.body.rotation.z,sideLean+Math.sin(walkPhase*2)*.025*speed,.2);
      parts.body.position.y=THREE.MathUtils.lerp(parts.body.position.y,2.05+(speed>.04?Math.abs(Math.sin(walkPhase))*0.07*(playerDynamics.sprinting?1.45:1):0),.22);
      parts.head.rotation.z=THREE.MathUtils.lerp(parts.head.rotation.z,-sideLean*.45,.16);
    }

    const visualSpeed=s.inVehicle?vehicleDynamics.speed:0;
    car.userData.wheels?.forEach(w=>{
      if(s.inVehicle)w.rotation.z-=visualSpeed*dt*1.9;
      const targetSteer=w.userData.front?vehicleDynamics.steer*.42:0;
      w.rotation.y=THREE.MathUtils.lerp(w.rotation.y,targetSteer,.22);
    });
    const speedRatio=Math.min(1,Math.abs(vehicleDynamics.speed)/10);
    const leanScale=vehicleDynamics.handbrake?1.8:1;
    const targetLean=s.inVehicle?(-vehicleDynamics.steer*speedRatio*.075*leanScale):0;
    car.rotation.z=THREE.MathUtils.lerp(car.rotation.z,targetLean,.12);
    const driftOn=s.inVehicle&&vehicleDynamics.handbrake&&Math.abs(vehicleDynamics.speed)>2;
    car.userData.skidMarks?.forEach(mark=>{mark.material.opacity=THREE.MathUtils.lerp(mark.material.opacity,driftOn ? .72 : 0,.22)});
    const brakeGlow=vehicleDynamics.braking||vehicleDynamics.handbrake||vehicleDynamics.speed<-.2;
    car.userData.brakeLights?.forEach(light=>{
      light.material.emissiveIntensity=THREE.MathUtils.lerp(light.material.emissiveIntensity,brakeGlow?5.5:.9,.25);
    });
    if(car.userData.headGlow)car.userData.headGlow.intensity=s.inVehicle?4.8:2.2;
    pedestrians.forEach(h=>animatePedestrian(h,dt));
    traffic.forEach(v=>animateTraffic(v,t,dt));

    const subject=s.inVehicle?car.position:player.position;
    const footLookX=!s.inVehicle?playerDynamics.vx*.11:0;
    const footLookZ=!s.inVehicle?playerDynamics.vy*.11:0;
    const target=new THREE.Vector3(subject.x+footLookX,s.inVehicle?1.5:2.2,subject.z+footLookZ);
    const targetFov=s.inVehicle?60:(playerDynamics.sprinting?64:58);
    camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,.08);
    camera.updateProjectionMatrix();
    let desired;
    let cameraLerp=.09;
    if(cameraMode==='top'){
      desired=new THREE.Vector3(target.x,32,target.z+.01);
      cameraLerp=.14;
    }else if(cameraMode==='chase'){
      const heading=(Number(s.heading)||0)*Math.PI/180;
      const chaseDistance=s.inVehicle?18:(playerDynamics.sprinting?14.5:13);
      desired=new THREE.Vector3(
        target.x-Math.cos(heading)*chaseDistance,
        target.y+(s.inVehicle?7.5:(playerDynamics.sprinting?6.8:6.2)),
        target.z-Math.sin(heading)*chaseDistance
      );
      cameraLerp=s.inVehicle ? .16 : (playerDynamics.sprinting ? .15 : .12);
    }else{
      if(!s.inVehicle&&playerDynamics.speed>.35&&performance.now()>manualCameraUntil){
        const heading=(Number(s.heading)||0)*Math.PI/180;
        const desiredYaw=Math.PI*1.5-heading;
        const yawDelta=Math.atan2(Math.sin(desiredYaw-yaw),Math.cos(desiredYaw-yaw));
        yaw+=yawDelta*Math.min(1,dt*(playerDynamics.sprinting?2.3:1.55));
      }
      const cp=Math.cos(pitch),sp=Math.sin(pitch);
      const followDistance=s.inVehicle?Math.max(12,distance):distance;
      desired=new THREE.Vector3(
        target.x+Math.sin(yaw)*followDistance*cp,
        target.y+followDistance*sp,
        target.z+Math.cos(yaw)*followDistance*cp
      );
      cameraLerp=s.inVehicle ? .12 : .085;
    }
    camera.position.lerp(desired,cameraLerp);
    camera.lookAt(target);

    npc.position.y=Math.sin(t*2)*.05;
    npcRing.rotation.z=t*.55;
    neon.intensity=16+Math.sin(t*1.7)*3;
    stars.material.opacity=.68+Math.sin(t*.22)*.08;
    moonMesh.rotation.y=t*.03;
    updateRadar(s);
    const cameraButton=document.getElementById('camera3dBtn');
    if(cameraButton)cameraButton.textContent='CAMERA: '+cameraMode.toUpperCase();

    const near=nearbyDestination(s);
    destinations.forEach((d,i)=>{
      const hot=near?.id===d.id;
      const pulse=1+Math.sin(t*2.4+i)*.08;
      d.ring.scale.setScalar(hot?1.18:pulse);
      d.ring.material.opacity=hot ? .96 : .62;
      d.beam.material.opacity=hot ? .27 : .10;
      d.marker.rotation.y=t*1.4+i;
      d.marker.position.y=2.25+Math.sin(t*2+i)*.18;
      d.label.material.opacity=hot?1:.78;
    });
    const interactButton=document.getElementById('interact3dBtn');
    if(interactButton){
      interactButton.disabled=!near;
      interactButton.textContent=near?'ENTER '+near.label:'INTERACT';
      interactButton.classList.toggle('nearby',!!near);
    }

    renderer.render(scene,camera);
  }

  function resize(){
    const r=host.getBoundingClientRect();
    if(!r.width||!r.height)return;
    renderer.setSize(r.width,r.height,false);
    camera.aspect=r.width/r.height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  window.addEventListener('resize',resize);
  resize();animate();

  window.TGG3D={
    scene,camera,renderer,player,npc,car,
    resetCamera(){yaw=Math.PI*.25;pitch=.48;distance=17},
    isReady:()=>true,
    canMovePercent,
    distanceToCarPercent,
    getCarHeading:()=>Number(car.userData.headingDeg)||0,
    setVehicleDynamics,
    getVehicleDynamics:()=>({...vehicleDynamics}),
    setPlayerDynamics,
    getPlayerDynamics:()=>({...playerDynamics}),
    setCarAppearance,
    destinations,
    nearbyDestination,
    interactNearest,
    pedestrians,
    traffic,
    cycleCamera,
    setCameraMode,
    getCameraMode,
    updateRadar
  };
})();