(() => {
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.min.js';
  const state={ready:false,failed:false,reason:null,revision:null,frame:0,cameraOrbit:{yaw:0,pitch:0.5,distance:10,dragging:false,lastX:0,lastY:0}};
  let THREE,scene,camera,renderer,player,npc,clock,host;
  const world={buildings:[],roads:[],lights:[],colliders:[],landmarks:[]};

  function mapX(v){return (Number(v||50)-50)*0.7}
  function mapZ(v){return (Number(v||55)-50)*0.56}

  async function boot(){
    host=document.getElementById('world3d');
    if(!host)return false;
    try{
      THREE=await import(THREE_URL);
      state.revision=THREE.REVISION;
      scene=new THREE.Scene();
      scene.background=new THREE.Color(0x060810);
      scene.fog=new THREE.FogExp2(0x070912,0.025);

      camera=new THREE.PerspectiveCamera(60,1,0.1,220);
      camera.position.set(0,9,14);

      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.05;
      renderer.domElement.className='world3d-canvas';
      host.innerHTML='';
      host.appendChild(renderer.domElement);
      installCameraControls();

      buildLights();
      buildGround();
      buildRoads();
      buildBuildings();
      buildLandmarks();
      buildPlayer();
      buildNpc();

      clock=new THREE.Clock();
      state.ready=true;
      host.classList.add('ready');
      host.closest('.city')?.classList.add('world3d-active');
      window.dispatchEvent(new CustomEvent('tgg-world3d-ready',{detail:{revision:state.revision}}));
      resize();
      animate();
      return true;
    }catch(error){
      state.failed=true;
      state.reason=String(error?.message||error);
      host?.classList.add('failed');
      console.error('TGG 3D boot failed',error);
      return false;
    }
  }

  function buildLights(){
    const hemi=new THREE.HemisphereLight(0x8bb6ff,0x09080c,1.45);
    scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffffff,2.8);
    sun.position.set(-14,24,8);
    sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-40;sun.shadow.camera.right=40;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;
    scene.add(sun);
    const neonA=new THREE.PointLight(0xc7ff00,22,34,2);
    neonA.position.set(-14,5,-9);
    const neonB=new THREE.PointLight(0x4d77ff,20,32,2);
    neonB.position.set(16,5,4);
    const neonC=new THREE.PointLight(0xff2f7d,16,26,2);
    neonC.position.set(0,4,16);
    scene.add(neonA,neonB,neonC);
    world.lights.push(neonA,neonB,neonC);
  }

  function buildGround(){
    const ground=new THREE.Mesh(
      new THREE.PlaneGeometry(90,90),
      new THREE.MeshStandardMaterial({color:0x10131b,roughness:0.96,metalness:0.04})
    );
    ground.rotation.x=-Math.PI/2;
    ground.receiveShadow=true;
    scene.add(ground);

    const grid=new THREE.GridHelper(90,45,0x394052,0x1c2230);
    grid.position.y=0.02;
    scene.add(grid);
  }

  function road(x,z,w,d){
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(w,0.06,d),
      new THREE.MeshStandardMaterial({color:0x171a20,roughness:0.9})
    );
    mesh.position.set(x,0.03,z);
    mesh.receiveShadow=true;
    scene.add(mesh);
    world.roads.push(mesh);
    return mesh;
  }

  function buildRoads(){
    road(0,0,9,90);
    road(0,0,90,9);
    road(-20,0,6,90);
    road(20,0,6,90);
    road(0,-22,90,6);
    road(0,22,90,6);
    const stripeMat=new THREE.MeshBasicMaterial({color:0xd7d184});
    for(let i=-40;i<=40;i+=5){
      const s1=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.04,2.1),stripeMat);
      s1.position.set(0,0.08,i);
      const s2=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.04,0.22),stripeMat);
      s2.position.set(i,0.08,0);
      scene.add(s1,s2);
    }
  }

  function seededHeight(x,z){
    const n=Math.abs(Math.sin(x*12.9898+z*78.233)*43758.5453)%1;
    return 4+n*14;
  }

  function addBuilding(x,z,w,d,h,color){
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      new THREE.MeshStandardMaterial({color,roughness:0.76,metalness:0.12})
    );
    mesh.position.set(x,h/2,z);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    scene.add(mesh);

    const cap=new THREE.Mesh(
      new THREE.BoxGeometry(w*0.9,0.35,d*0.9),
      new THREE.MeshStandardMaterial({color:0x202637,emissive:0x0b1020,emissiveIntensity:0.4})
    );
    cap.position.set(x,h+0.18,z);
    cap.castShadow=true;
    scene.add(cap);
    world.buildings.push(mesh);
    world.colliders.push({minX:x-w/2-0.55,maxX:x+w/2+0.55,minZ:z-d/2-0.55,maxZ:z+d/2+0.55});
  }

  function buildBuildings(){
    const xs=[-34,-27,-13,-7,7,13,27,34];
    const zs=[-36,-28,-14,-8,8,14,28,36];
    const missionX=mapX(72),missionZ=mapZ(36);
    for(const x of xs){
      for(const z of zs){
        if(Math.abs(x)<5||Math.abs(z)<5)continue;
        if(Math.hypot(x-missionX,z-missionZ)<5.5)continue;
        const h=seededHeight(x,z);
        const c=(x+z)%3===0?0x2a3142:(x-z)%4===0?0x252938:0x1f2431;
        addBuilding(x,z,4.8+(Math.abs(z)%4),4.8+(Math.abs(x)%4),h,c);
      }
    }
  }

  function neonSign(textColor,x,y,z,w=4){
    const m=new THREE.Mesh(
      new THREE.BoxGeometry(w,0.35,0.15),
      new THREE.MeshStandardMaterial({color:textColor,emissive:textColor,emissiveIntensity:4})
    );
    m.position.set(x,y,z);
    scene.add(m);
    return m;
  }

  function addHubLandmark(id,name,screen,x,z,color){
    const root=new THREE.Group();
    root.position.set(x,0,z);
    const base=new THREE.Mesh(
      new THREE.CylinderGeometry(0.85,1.05,0.3,20),
      new THREE.MeshStandardMaterial({color:0x151922,metalness:0.35,roughness:0.55})
    );
    base.position.y=0.15;
    const pole=new THREE.Mesh(
      new THREE.BoxGeometry(0.18,2.6,0.18),
      new THREE.MeshStandardMaterial({color:0x343949,metalness:0.5,roughness:0.35})
    );
    pole.position.y=1.45;
    const sign=new THREE.Mesh(
      new THREE.BoxGeometry(2.8,0.72,0.16),
      new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:3.2,roughness:0.3})
    );
    sign.position.y=2.7;
    root.add(base,pole,sign);
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
    scene.add(root);
    world.landmarks.push({id,name,screen,x,z,color,root});
    return root;
  }

  function buildLandmarks(){
    addHubLandmark('studio-row','TRU GO GETTA STUDIOS','studio',-13,-3,0xc7ff00);
    addHubLandmark('park','THE PARK','park',0,18,0x4d77ff);
    addHubLandmark('shops','SHOP DISTRICT','shops',14,3,0xff397e);
    addHubLandmark('apartment','MY APARTMENT','home',-20,12,0xf2b84b);
    addHubLandmark('media','MEDIA DISTRICT','media',20,-12,0x8b5cf6);
    neonSign(0xc7ff00,-13,4,-9,5);
    neonSign(0x5178ff,14,4,8,5);
    neonSign(0xff397e,2,3.3,18,4);
  }

  function buildHumanoid(accent=0xc7ff00){
    const root=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:0x8b5a3c,roughness:0.7});
    const cloth=new THREE.MeshStandardMaterial({color:0x171b25,roughness:0.65});
    const accentMat=new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:0.35,roughness:0.45});
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.34,20,20),skin);
    head.position.y=2.18;
    head.castShadow=true;
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.46,0.88,6,12),accentMat);
    torso.position.y=1.28;
    torso.castShadow=true;
    const legGeo=new THREE.CapsuleGeometry(0.15,0.72,5,8);
    const l=new THREE.Mesh(legGeo,cloth);l.position.set(-0.21,0.38,0);l.castShadow=true;
    const r=new THREE.Mesh(legGeo,cloth);r.position.set(0.21,0.38,0);r.castShadow=true;
    root.add(head,torso,l,r);
    return root;
  }

  function buildPlayer(){
    player=buildHumanoid(0xc7ff00);
    player.position.set(mapX(50),0,mapZ(55));
    scene.add(player);
  }

  function buildNpc(){
    npc=buildHumanoid(0x5b6c91);
    npc.scale.setScalar(0.94);
    npc.position.set(mapX(72),0,mapZ(36));
    npc.rotation.y=Math.PI;
    scene.add(npc);
    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(0.7,0.07,10,28),
      new THREE.MeshBasicMaterial({color:0xffffff})
    );
    ring.rotation.x=Math.PI/2;
    ring.position.y=0.08;
    npc.add(ring);
  }

  function syncPlayer(){
    if(!player)return;
    const s=window.TGGGame?.getState?.();
    if(!s)return;
    const tx=mapX(s.x),tz=mapZ(s.y);
    const dx=tx-player.position.x,dz=tz-player.position.z;
    if(Math.abs(dx)+Math.abs(dz)>0.001){
      const targetYaw=Math.atan2(dx,dz);
      player.rotation.y=targetYaw;
    }
    player.position.x=THREE.MathUtils.lerp(player.position.x,tx,0.3);
    player.position.z=THREE.MathUtils.lerp(player.position.z,tz,0.3);
  }

  function installCameraControls(){
    const canvas=renderer?.domElement;
    if(!canvas)return;
    canvas.style.touchAction='none';
    canvas.addEventListener('pointerdown',e=>{
      state.cameraOrbit.dragging=true;
      state.cameraOrbit.lastX=e.clientX;
      state.cameraOrbit.lastY=e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!state.cameraOrbit.dragging)return;
      const dx=e.clientX-state.cameraOrbit.lastX;
      const dy=e.clientY-state.cameraOrbit.lastY;
      state.cameraOrbit.lastX=e.clientX;
      state.cameraOrbit.lastY=e.clientY;
      state.cameraOrbit.yaw-=dx*0.006;
      state.cameraOrbit.pitch=Math.max(0.18,Math.min(1.08,state.cameraOrbit.pitch+dy*0.004));
    });
    const end=e=>{
      state.cameraOrbit.dragging=false;
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      state.cameraOrbit.distance=Math.max(5.5,Math.min(18,state.cameraOrbit.distance+Math.sign(e.deltaY)*0.8));
    },{passive:false});
  }

  function canMovePercent(nextX,nextY){
    if(!state.ready)return true;
    const x=mapX(nextX),z=mapZ(nextY);
    if(Math.abs(x)>43||Math.abs(z)>43)return false;
    return !world.colliders.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);
  }

  function nearestLandmark(maxDistance=3.2){
    if(!player)return null;
    let best=null;
    for(const lm of world.landmarks){
      const distance=Math.hypot(player.position.x-lm.x,player.position.z-lm.z);
      if(distance<=maxDistance&&(!best||distance<best.distance))best={id:lm.id,name:lm.name,screen:lm.screen,distance,x:lm.x,z:lm.z};
    }
    return best;
  }

  function updatePrompt(){
    const prompt=document.getElementById('world3dPrompt');
    if(!prompt)return;
    const near=nearestLandmark();
    if(near&&window.TGGGame?.getActiveScreen?.()==='game'){
      prompt.textContent='E • ENTER '+near.name;
      prompt.classList.add('show');
      prompt.dataset.landmark=near.id;
    }else{
      prompt.classList.remove('show');
      prompt.textContent='';
      delete prompt.dataset.landmark;
    }
  }

  function tryEnterLandmark(){
    const near=nearestLandmark();
    if(!near)return {ok:false,status:'no_landmark_nearby'};
    if(near.screen==='businessBoard')window.TGGBusiness?.open?.();
    else window.TGGGame?.show?.(near.screen);
    window.__tggToast?.('ENTERED '+near.name);
    return {ok:true,status:'entered',landmark:near.id,name:near.name,screen:near.screen};
  }

  function followCamera(){
    if(!player||!camera)return;
    const orbit=state.cameraOrbit;
    const horizontal=Math.cos(orbit.pitch)*orbit.distance;
    const target=new THREE.Vector3(player.position.x,1.45,player.position.z);
    const desired=new THREE.Vector3(
      target.x+Math.sin(orbit.yaw)*horizontal,
      target.y+Math.sin(orbit.pitch)*orbit.distance,
      target.z+Math.cos(orbit.yaw)*horizontal
    );
    camera.position.lerp(desired,0.11);
    camera.lookAt(target);
  }

  function animate(){
    if(!state.ready)return;
    state.frame++;
    syncPlayer();
    followCamera();
    updatePrompt();
    const t=clock.getElapsedTime();
    if(npc)npc.position.y=Math.sin(t*1.8)*0.04;
    world.lights.forEach((light,i)=>light.intensity=16+Math.sin(t*1.4+i)*3);
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }

  function resize(){
    if(!renderer||!camera||!host)return;
    const rect=host.getBoundingClientRect();
    const w=Math.max(2,Math.floor(rect.width));
    const h=Math.max(2,Math.floor(rect.height));
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }

  function status(){
    return {
      ready:state.ready,
      failed:state.failed,
      reason:state.reason,
      revision:state.revision,
      buildings:world.buildings.length,
      roads:world.roads.length,
      lights:world.lights.length,
      colliders:world.colliders.length,
      landmarks:world.landmarks.length,
      nearby:nearestLandmark(),
      orbit:{yaw:state.cameraOrbit.yaw,pitch:state.cameraOrbit.pitch,distance:state.cameraOrbit.distance,dragging:state.cameraOrbit.dragging},
      frame:state.frame,
      player:player?{x:player.position.x,y:player.position.y,z:player.position.z,yaw:player.rotation.y}:null,
      camera:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null
    };
  }

  window.TGGWorld3D={boot,status,resize,canMovePercent,nearestLandmark,tryEnterLandmark,state};
  window.addEventListener('resize',resize);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();