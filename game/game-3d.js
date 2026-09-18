(() => {
  const host=document.getElementById('city3d');
  const city=document.querySelector('#game .city');
  if(!host||!city||!window.THREE)return;

  const THREE=window.THREE;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x05070d);
  scene.fog=new THREE.FogExp2(0x05070d,0.018);

  const camera=new THREE.PerspectiveCamera(58,1,0.1,220);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  host.appendChild(renderer.domElement);
  city.classList.add('webgl-ready');

  scene.add(new THREE.HemisphereLight(0x7c8cff,0x101016,1.5));
  const moon=new THREE.DirectionalLight(0xffffff,2.2);
  moon.position.set(24,38,18);
  moon.castShadow=true;
  moon.shadow.mapSize.set(1024,1024);
  scene.add(moon);

  const neon=new THREE.PointLight(0xc7ff00,18,34,2);
  neon.position.set(0,8,0);
  scene.add(neon);

  const groundMat=new THREE.MeshStandardMaterial({color:0x11141b,roughness:.92,metalness:.08});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(110,110),groundMat);
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  scene.add(ground);

  const roadMat=new THREE.MeshStandardMaterial({color:0x1b1f29,roughness:.75,metalness:.12});
  const lineMat=new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x91c000,emissiveIntensity:1.6});
  [-24,0,24].forEach(x=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(7,.05,110),roadMat);r.position.set(x,.03,0);r.receiveShadow=true;scene.add(r);
    const l=new THREE.Mesh(new THREE.BoxGeometry(.12,.055,110),lineMat);l.position.set(x,.06,0);scene.add(l);
  });
  [-24,0,24].forEach(z=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(110,.05,7),roadMat);r.position.set(0,.035,z);r.receiveShadow=true;scene.add(r);
    const l=new THREE.Mesh(new THREE.BoxGeometry(110,.06,.12),lineMat);l.position.set(0,.065,z);scene.add(l);
  });

  const buildingColors=[0x1d2330,0x252c3a,0x171c26,0x303748,0x202838];
  const windowMat=new THREE.MeshStandardMaterial({color:0x8ee6ff,emissive:0x2d84aa,emissiveIntensity:2.2,roughness:.35});
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
      if(bi%2===0){
        const glow=new THREE.Mesh(new THREE.BoxGeometry(w*.72,.16,d+.03),windowMat);
        glow.position.set(x,Math.max(2,h*.65),z+d/2+.03);
        scene.add(glow);
      }
      bi++;
    }
  }

  function makeHuman(bodyColor=0xc7ff00,skin=0x9d6a49){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.78,1.65,5,10),new THREE.MeshStandardMaterial({color:bodyColor,roughness:.55,metalness:.1}));
    body.position.y=2.05;body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.62,16,12),new THREE.MeshStandardMaterial({color:skin,roughness:.7}));
    head.position.y=3.62;head.castShadow=true;g.add(head);
    const legsMat=new THREE.MeshStandardMaterial({color:0x111827,roughness:.8});
    [-.34,.34].forEach(x=>{const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.23,1.05,4,8),legsMat);leg.position.set(x,.72,0);leg.castShadow=true;g.add(leg)});
    return g;
  }

  const player=makeHuman(0xc7ff00);
  scene.add(player);
  const npc=makeHuman(0x6f7cff,0x8c5d40);
  npc.scale.set(.92,.92,.92);
  npc.position.set(22,0,-14);
  scene.add(npc);

  const npcRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.12,10,32),new THREE.MeshStandardMaterial({color:0x7a8cff,emissive:0x4050ff,emissiveIntensity:2.5}));
  npcRing.rotation.x=Math.PI/2;npcRing.position.set(22,.08,-14);scene.add(npcRing);

  const skylineGlow=new THREE.Mesh(new THREE.RingGeometry(32,49,64),new THREE.MeshBasicMaterial({color:0x2a3040,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  skylineGlow.rotation.x=-Math.PI/2;skylineGlow.position.y=.02;scene.add(skylineGlow);

  let yaw=Math.PI*.25;
  let pitch=.48;
  let distance=17;
  let dragging=false;
  let px=0,py=0;

  renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId)});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!dragging)return;
    yaw-=(e.clientX-px)*.008;
    pitch=Math.max(.22,Math.min(.9,pitch-(e.clientY-py)*.006));
    px=e.clientX;py=e.clientY;
  });
  renderer.domElement.addEventListener('pointerup',()=>dragging=false);
  renderer.domElement.addEventListener('wheel',e=>{distance=Math.max(9,Math.min(29,distance+Math.sign(e.deltaY)*1.4));e.preventDefault()},{passive:false});

  function toWorld(s){
    const x=((Number(s?.x)||50)-50)*.92;
    const z=((Number(s?.y)||50)-50)*.92;
    return {x,z};
  }

  const clock=new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const s=window.TGGGame?.getState?.()||{x:50,y:55,heading:0};
    const p=toWorld(s);
    player.position.x=THREE.MathUtils.lerp(player.position.x,p.x,.16);
    player.position.z=THREE.MathUtils.lerp(player.position.z,p.z,.16);
    player.rotation.y=-((Number(s.heading)||0)*Math.PI/180)+Math.PI/2;

    const target=new THREE.Vector3(player.position.x,2.2,player.position.z);
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    const desired=new THREE.Vector3(
      target.x+Math.sin(yaw)*distance*cp,
      target.y+distance*sp,
      target.z+Math.cos(yaw)*distance*cp
    );
    camera.position.lerp(desired,.085);
    camera.lookAt(target);

    const t=clock.getElapsedTime();
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
  resize();
  animate();

  window.TGG3D={
    scene,camera,renderer,player,npc,
    resetCamera(){yaw=Math.PI*.25;pitch=.48;distance=17},
    isReady:()=>true
  };
})();