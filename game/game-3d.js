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
      w.rotation.x=Math.PI/2;w.position.set(x,y,z);w.castShadow=true;car.add(w);wheels.push(w);
    });
    const headMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xeaffff,emissiveIntensity:2.5});
    [-.65,.65].forEach(z=>{const h=new THREE.Mesh(new THREE.BoxGeometry(.06,.24,.34),headMat);h.position.set(2.12,1.0,z);car.add(h)});
    car.userData.wheels=wheels;
    return car;
  }
  const car=makeCar();
  car.position.set(5.7,0,4.6);car.rotation.y=Math.PI;scene.add(car);

  const skylineGlow=new THREE.Mesh(new THREE.RingGeometry(32,49,64),new THREE.MeshBasicMaterial({color:0x2a3040,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  skylineGlow.rotation.x=-Math.PI/2;skylineGlow.position.y=.02;scene.add(skylineGlow);

  let yaw=Math.PI*.25,pitch=.48,distance=17,dragging=false,px=0,py=0;
  let lastPlayerX=0,lastPlayerZ=0,walkPhase=0;

  renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId)});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!dragging)return;
    yaw-=(e.clientX-px)*.008;
    pitch=Math.max(.22,Math.min(.9,pitch-(e.clientY-py)*.006));
    px=e.clientX;py=e.clientY;
  });
  renderer.domElement.addEventListener('pointerup',()=>dragging=false);
  renderer.domElement.addEventListener('wheel',e=>{distance=Math.max(8,Math.min(30,distance+Math.sign(e.deltaY)*1.4));e.preventDefault()},{passive:false});

  function toWorld(s){
    return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92};
  }
  function canMovePercent(x,y){
    const p=toWorld({x,y});
    if(Math.abs(p.x)>49||Math.abs(p.z)>49)return false;
    return !obstacles.some(o=>Math.abs(p.x-o.x)<o.hw&&Math.abs(p.z-o.z)<o.hd);
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
      car.rotation.y=-((Number(s.heading)||0)*Math.PI/180)+Math.PI/2;
    }
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
      player.position.x=THREE.MathUtils.lerp(player.position.x,p.x,.18);
      player.position.z=THREE.MathUtils.lerp(player.position.z,p.z,.18);
      player.rotation.y=-((Number(s.heading)||0)*Math.PI/180)+Math.PI/2;
    }

    const vx=player.position.x-lastPlayerX,vz=player.position.z-lastPlayerZ;
    const speed=Math.min(1,Math.hypot(vx,vz)*8);
    lastPlayerX=player.position.x;lastPlayerZ=player.position.z;
    const parts=player.userData.parts;
    if(parts){
      if(speed>.025&&!s.inVehicle)walkPhase+=dt*(7+speed*8);
      const swing=!s.inVehicle?Math.sin(walkPhase)*.72*speed:0;
      parts.leftArm.rotation.x=THREE.MathUtils.lerp(parts.leftArm.rotation.x,swing,.22);
      parts.rightArm.rotation.x=THREE.MathUtils.lerp(parts.rightArm.rotation.x,-swing,.22);
      parts.leftLeg.rotation.x=THREE.MathUtils.lerp(parts.leftLeg.rotation.x,-swing*.85,.22);
      parts.rightLeg.rotation.x=THREE.MathUtils.lerp(parts.rightLeg.rotation.x,swing*.85,.22);
      parts.body.rotation.z=THREE.MathUtils.lerp(parts.body.rotation.z,Math.sin(walkPhase*2)*.025*speed,.18);
    }

    car.userData.wheels?.forEach(w=>{if(s.inVehicle)w.rotation.z-=dt*10});

    const subject=s.inVehicle?car.position:player.position;
    const target=new THREE.Vector3(subject.x,s.inVehicle?1.5:2.2,subject.z);
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    const followDistance=s.inVehicle?Math.max(12,distance):distance;
    const desired=new THREE.Vector3(
      target.x+Math.sin(yaw)*followDistance*cp,
      target.y+followDistance*sp,
      target.z+Math.cos(yaw)*followDistance*cp
    );
    camera.position.lerp(desired,s.inVehicle?.12:.085);
    camera.lookAt(target);

    npc.position.y=Math.sin(t*2)*.05;
    npcRing.rotation.z=t*.55;
    neon.intensity=16+Math.sin(t*1.7)*3;
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
    distanceToCarPercent
  };
})();