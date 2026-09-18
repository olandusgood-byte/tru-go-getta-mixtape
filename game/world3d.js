(() => {
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
  const WORLD={minX:-32,maxX:32,minZ:-24,maxZ:24};
  const PLAYER_RADIUS=.72;
  const BUILDINGS=[
    [-27,-19,8,7,10,0x252b38],[-18,-19,7,7,15,0x1d2938],[-9,-19,6,7,8,0x303445],
    [12,-19,8,7,13,0x322b44],[23,-19,9,7,18,0x242b3d],
    [-27,18,8,7,14,0x2a3040],[-17,18,7,7,9,0x303847],[-8,18,6,7,17,0x202d3a],
    [12,18,7,7,12,0x333041],[22,18,9,7,16,0x202a3a],
    [-30,7,6,7,9,0x252a34],[-30,-7,6,7,13,0x292e3a],
    [30,7,6,7,15,0x222b39],[30,-7,6,7,11,0x313441]
  ];
  const DISTRICTS=[
    {id:'studio-row',name:'STUDIO ROW',x:-21,z:-13,color:0x5f67ff},
    {id:'downtown',name:'DOWNTOWN',x:18,z:10,color:0xc7ff00},
    {id:'mixtape-ave',name:'MIXTAPE AVE',x:18,z:-14,color:0xff3b7b}
  ];
  const HUBS=[
    {id:'studio-hub',name:'TRU GO GETTA STUDIOS',screen:'studio',x:-13,z:-3,color:0xc7ff00},
    {id:'park-hub',name:'THE PARK',screen:'park',x:0,z:18,color:0x4d77ff},
    {id:'shops-hub',name:'SHOP DISTRICT',screen:'shops',x:14,z:3,color:0xff397e},
    {id:'apartment-hub',name:'MY APARTMENT',screen:'home',x:-20,z:12,color:0xf2b84b},
    {id:'media-hub',name:'MEDIA DISTRICT',screen:'media',x:20,z:-12,color:0x8b5cf6}
  ];
  const STARTER_CAR={id:'starter-car',name:'STARTER CAR',x:4,z:-2,color:0xc7ff00};

  const api={
    version:'1.27.0',
    library:'three@0.186.0',
    ready:false,
    failed:false,
    error:null,
    renderer:null,
    scene:null,
    camera:null,
    player:null,
    npc:null,
    car:null,
    cameraYawOffset:0,
    cameraDistance:10,
    cameraMode:'orbit',
    cameraModes:['orbit','chase','top'],
    collisionCount:0,
    lastCollision:null,
    district:null,
    motion:{moving:false,walkPhase:0},
    interaction:null,
    hubs:HUBS.map(h=>({...h})),
    snapshot(){
      const p=this.player?.position;
      const c=this.camera?.position;
      return {
        version:this.version,
        ready:this.ready,
        failed:this.failed,
        library:this.library,
        player:p?{x:p.x,y:p.y,z:p.z}:null,
        car:this.car?{x:this.car.position.x,y:this.car.position.y,z:this.car.position.z,visible:this.car.visible}:null,
        camera:c?{x:c.x,y:c.y,z:c.z}:null,
        cameraDistance:this.cameraDistance,
        cameraYawOffset:this.cameraYawOffset,
        cameraMode:this.cameraMode,
        collisionCount:this.collisionCount,
        lastCollision:this.lastCollision,
        district:this.district,
        motion:{...this.motion},
        inVehicle:!!window.TGGGame?.getState?.()?.inVehicle,
        interaction:this.interaction?{...this.interaction}:null
      };
    }
  };
  window.TGGWorld3D=api;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;

  function percentToWorld(x,y){
    return {
      x:lerp(WORLD.minX,WORLD.maxX,clamp((Number(x)||0)/100,0,1)),
      z:lerp(WORLD.maxZ,WORLD.minZ,clamp((Number(y)||0)/100,0,1))
    };
  }

  function stateToWorld(state){
    return percentToWorld(Number(state?.x)||50,Number(state?.y)||55);
  }

  function worldToPercent(x,z){
    return {
      x:clamp(((Number(x)-WORLD.minX)/(WORLD.maxX-WORLD.minX))*100,0,100),
      y:clamp(((WORLD.maxZ-Number(z))/(WORLD.maxZ-WORLD.minZ))*100,0,100)
    };
  }

  function blockedBuilding(x,z,pad=PLAYER_RADIUS){
    const hit=BUILDINGS.find(([bx,bz,w,d])=>
      x>=(bx-w/2-pad)&&x<=(bx+w/2+pad)&&
      z>=(bz-d/2-pad)&&z<=(bz+d/2+pad)
    );
    return hit?{x:hit[0],z:hit[1],w:hit[2],d:hit[3]}:null;
  }

  function isBlockedPercent(x,y){
    const p=percentToWorld(x,y);
    return !!blockedBuilding(p.x,p.z);
  }

  function districtAtPercent(x,y){
    const p=percentToWorld(x,y);
    let best=null;
    for(const d of DISTRICTS){
      const distance=Math.hypot(p.x-d.x,p.z-d.z);
      if(!best||distance<best.distance)best={id:d.id,name:d.name,distance,x:d.x,z:d.z};
    }
    return best;
  }

  function constrainPercent(nextX,nextY,currentX,currentY){
    const nx=clamp(Number(nextX)||0,3,94);
    const ny=clamp(Number(nextY)||0,8,88);
    const cx=clamp(Number(currentX)||50,3,94);
    const cy=clamp(Number(currentY)||55,8,88);
    const full=percentToWorld(nx,ny);
    const hit=blockedBuilding(full.x,full.z);
    if(!hit){
      return {x:nx,y:ny,blocked:false,district:districtAtPercent(nx,ny)};
    }

    const slideX=percentToWorld(nx,cy);
    if(!blockedBuilding(slideX.x,slideX.z)){
      api.collisionCount++;
      api.lastCollision={axis:'y',building:hit,attempt:{x:nx,y:ny},resolved:{x:nx,y:cy},at:Date.now()};
      window.dispatchEvent(new CustomEvent('tgg:world3d-collision',{detail:api.lastCollision}));
      return {x:nx,y:cy,blocked:true,slid:true,axis:'y',district:districtAtPercent(nx,cy)};
    }

    const slideY=percentToWorld(cx,ny);
    if(!blockedBuilding(slideY.x,slideY.z)){
      api.collisionCount++;
      api.lastCollision={axis:'x',building:hit,attempt:{x:nx,y:ny},resolved:{x:cx,y:ny},at:Date.now()};
      window.dispatchEvent(new CustomEvent('tgg:world3d-collision',{detail:api.lastCollision}));
      return {x:cx,y:ny,blocked:true,slid:true,axis:'x',district:districtAtPercent(cx,ny)};
    }

    api.collisionCount++;
    api.lastCollision={axis:'both',building:hit,attempt:{x:nx,y:ny},resolved:{x:cx,y:cy},at:Date.now()};
    window.dispatchEvent(new CustomEvent('tgg:world3d-collision',{detail:api.lastCollision}));
    return {x:cx,y:cy,blocked:true,slid:false,axis:'both',district:districtAtPercent(cx,cy)};
  }

  api.percentToWorld=percentToWorld;
  api.worldToPercent=worldToPercent;
  api.isBlockedPercent=isBlockedPercent;
  api.districtAtPercent=districtAtPercent;
  api.constrainPercent=constrainPercent;
  api.collisionBoxes=BUILDINGS.map(([x,z,w,d])=>({x,z,w,d}));

  function distanceToCarPercent(state=window.TGGGame?.getState?.()){
    if(!state)return Infinity;
    const p=percentToWorld(state.x,state.y);
    const carPosition=api.car?.position||STARTER_CAR;
    return Math.hypot(p.x-carPosition.x,p.z-carPosition.z);
  }

  api.distanceToCarPercent=distanceToCarPercent;

  function nearestInteraction(){
    const state=window.TGGGame?.getState?.();
    if(!state)return null;
    const p=percentToWorld(state.x,state.y);
    if(state.inVehicle)return {id:'starter-car',type:'vehicle',label:'EXIT STARTER CAR',key:'E',distance:0};
    const candidates=[];
    const carDistance=distanceToCarPercent(state);
    if(carDistance<=4.6)candidates.push({id:'starter-car',type:'vehicle',label:'ENTER STARTER CAR',key:'E',distance:carDistance});
    const m=percentToWorld(72,36);
    const managerDistance=Math.hypot(p.x-m.x,p.z-m.z);
    if(managerDistance<=5)candidates.push({id:'manager-m',type:'npc',label:'TALK TO M',key:'E',distance:managerDistance});
    for(const hub of HUBS){
      const distance=Math.hypot(p.x-hub.x,p.z-hub.z);
      if(distance<=3.4)candidates.push({id:hub.id,type:'hub',label:'ENTER '+hub.name,key:'E',distance,screen:hub.screen,name:hub.name});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    return candidates[0]||null;
  }

  function activateNearest(){
    const interaction=nearestInteraction();
    if(!interaction)return {ok:false,status:'nothing_nearby'};
    if(interaction.id==='starter-car'){
      const result=window.TGGGame?.toggleVehicle?.();
      return result?.ok?{ok:true,status:result.status,interaction}:{ok:false,status:result?.status||'vehicle_failed',interaction};
    }
    if(interaction.id==='manager-m'){
      document.getElementById('missionBtn')?.click();
      return {ok:true,status:'activated',interaction};
    }
    if(interaction.type==='hub'&&interaction.screen){
      if(interaction.screen==='businessBoard')window.TGGBusiness?.open?.();
      else window.TGGGame?.show?.(interaction.screen);
      window.__tggToast?.('ENTERED '+interaction.name);
      return {ok:true,status:'entered_hub',interaction};
    }
    return {ok:false,status:'unsupported',interaction};
  }

  api.nearestInteraction=nearestInteraction;
  api.activateNearest=activateNearest;

  function avatarPalette(){
    try{
      const raw=JSON.parse(localStorage.getItem('tgg-avatar-v1')||'{}');
      return {skin:raw.skin||'#8b5a3c',accent:raw.accent||'#c7ff00'};
    }catch(e){
      return {skin:'#8b5a3c',accent:'#c7ff00'};
    }
  }

  function makeMaterial(THREE,color,rough=.72,metal=.08){
    return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  }

  function addBox(THREE,scene,{x=0,y=.5,z=0,w=1,h=1,d=1,color=0x303747,rough=.75,metal=.05,cast=true,receive=true}={}){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),makeMaterial(THREE,color,rough,metal));
    mesh.position.set(x,y,z);
    mesh.castShadow=cast;
    mesh.receiveShadow=receive;
    scene.add(mesh);
    return mesh;
  }

  function addBuilding(THREE,scene,x,z,w,d,h,color){
    const group=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),makeMaterial(THREE,color,.62,.18));
    body.position.y=h/2;
    body.castShadow=true;
    body.receiveShadow=true;
    group.add(body);

    const trimMat=new THREE.MeshStandardMaterial({
      color:0x7fd0ff,emissive:0x1e5f88,emissiveIntensity:.7,roughness:.45,metalness:.2
    });
    const floors=Math.max(2,Math.floor(h/2.6));
    for(let i=1;i<floors;i++){
      const strip=new THREE.Mesh(new THREE.BoxGeometry(w+.04,.05,d+.04),trimMat);
      strip.position.y=(h/floors)*i;
      group.add(strip);
    }

    const roof=new THREE.Mesh(new THREE.BoxGeometry(w*.35,.25,d*.35),makeMaterial(THREE,0x10141e,.5,.35));
    roof.position.y=h+.13;
    group.add(roof);

    group.position.set(x,0,z);
    scene.add(group);
    return group;
  }

  function createCharacter(THREE,palette,accentOverride){
    const group=new THREE.Group();
    group.name='TGGPlayer3D';

    const skin=makeMaterial(THREE,palette.skin,.72,.02);
    const accent=makeMaterial(THREE,accentOverride||palette.accent,.55,.08);
    const dark=makeMaterial(THREE,0x151923,.8,.04);
    const shoe=makeMaterial(THREE,0xe7e8ec,.55,.08);
    const arms=[];
    const legs=[];

    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.48,.56,1.25,8),accent);
    torso.position.y=1.55;torso.castShadow=true;group.add(torso);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.35,16,12),skin);
    head.position.y=2.48;head.castShadow=true;group.add(head);

    const hair=new THREE.Mesh(new THREE.SphereGeometry(.36,12,8,0,Math.PI*2,0,Math.PI*.45),dark);
    hair.position.y=2.65;hair.scale.y=.65;hair.castShadow=true;group.add(hair);

    for(const side of [-1,1]){
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.72,4,8),skin);
      arm.position.set(side*.58,1.52,0);arm.rotation.z=side*.08;arm.castShadow=true;arm.name=side<0?'arm-left':'arm-right';arms.push(arm);group.add(arm);

      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.82,4,8),dark);
      leg.position.set(side*.22,.62,0);leg.castShadow=true;leg.name=side<0?'leg-left':'leg-right';legs.push(leg);group.add(leg);

      const foot=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.58),shoe);
      foot.position.set(side*.22,.12,.12);foot.castShadow=true;group.add(foot);
    }
    group.userData.rig={torso,head,arms,legs};
    group.userData.walkPhase=0;
    return group;
  }

  function createNpc(THREE){
    const group=createCharacter(THREE,{skin:'#7c4d35',accent:'#566174'},'#566174');
    group.name='ManagerM3D';
    group.scale.set(.96,.96,.96);
    return group;
  }

  function createStarterCar(THREE){
    const car=new THREE.Group();
    car.name='TGGStarterCar3D';
    const bodyMat=makeMaterial(THREE,STARTER_CAR.color,.28,.72);
    const dark=makeMaterial(THREE,0x080a0d,.42,.35);
    const glass=new THREE.MeshStandardMaterial({color:0x4d7185,metalness:.25,roughness:.12,transparent:true,opacity:.76});
    const shell=new THREE.Mesh(new THREE.BoxGeometry(3.4,.82,1.72),bodyMat);
    shell.position.y=.82;shell.castShadow=true;car.add(shell);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.86,.72,1.44),glass);
    cabin.position.set(-.18,1.45,0);cabin.castShadow=true;car.add(cabin);
    const bumper=new THREE.Mesh(new THREE.BoxGeometry(.14,.28,1.78),dark);
    bumper.position.set(1.72,.62,0);car.add(bumper);
    const wheels=[];
    [[-1.08,.38,-.86],[-1.08,.38,.86],[1.08,.38,-.86],[1.08,.38,.86]].forEach(([x,y,z])=>{
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.28,14),dark);
      wheel.rotation.x=Math.PI/2;wheel.position.set(x,y,z);wheel.castShadow=true;car.add(wheel);wheels.push(wheel);
    });
    const headMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xeaffff,emissiveIntensity:2.2});
    [-.52,.52].forEach(z=>{const h=new THREE.Mesh(new THREE.BoxGeometry(.05,.2,.28),headMat);h.position.set(1.72,.88,z);car.add(h)});
    car.userData.wheels=wheels;
    return car;
  }

  function addRoadNetwork(THREE,scene){
    const roadMat=makeMaterial(THREE,0x151a23,.95,.02);
    const lineMat=new THREE.MeshStandardMaterial({color:0xd9dd7a,emissive:0x5f6120,emissiveIntensity:.35,roughness:.7});

    const roadA=new THREE.Mesh(new THREE.PlaneGeometry(72,9),roadMat);
    roadA.rotation.x=-Math.PI/2;roadA.position.y=.012;roadA.receiveShadow=true;scene.add(roadA);

    const roadB=new THREE.Mesh(new THREE.PlaneGeometry(9,56),roadMat);
    roadB.rotation.x=-Math.PI/2;roadB.position.y=.014;roadB.receiveShadow=true;scene.add(roadB);

    for(let x=-30;x<=30;x+=5.2){
      const dash=new THREE.Mesh(new THREE.BoxGeometry(2.2,.03,.12),lineMat);
      dash.position.set(x,.035,0);scene.add(dash);
    }
    for(let z=-22;z<=22;z+=5.2){
      const dash=new THREE.Mesh(new THREE.BoxGeometry(.12,.03,2.2),lineMat);
      dash.position.set(0,.04,z);scene.add(dash);
    }

    [[-20,13,25,7],[20,13,25,7],[-20,-13,25,7],[20,-13,25,7]]
      .forEach(([x,z,w,d])=>addBox(THREE,scene,{x,y:.09,z,w,h:.18,d,color:0x343b47,rough:.92,metal:.01,cast:false}));
  }

  function addStreetLights(THREE,scene){
    const poleMat=makeMaterial(THREE,0x353b45,.4,.6);
    const bulbMat=new THREE.MeshStandardMaterial({
      color:0xf6ffd4,emissive:0xcaff70,emissiveIntensity:2.1,roughness:.3
    });
    const spots=[[-11,-5],[11,-5],[-11,5],[11,5],[-25,-5],[25,-5],[-25,5],[25,5]];
    for(const [x,z] of spots){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,3.2,8),poleMat);
      pole.position.set(x,1.6,z);scene.add(pole);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),bulbMat);
      bulb.position.set(x,3.18,z);scene.add(bulb);
    }
  }

  function addDistrictPads(THREE,scene){
    for(const c of DISTRICTS){
      const ring=new THREE.Mesh(
        new THREE.RingGeometry(1.4,1.8,32),
        new THREE.MeshBasicMaterial({color:c.color,transparent:true,opacity:.5,side:THREE.DoubleSide})
      );
      ring.rotation.x=-Math.PI/2;ring.position.set(c.x,.08,c.z);scene.add(ring);
    }
  }

  function addHubLandmark(THREE,scene,hub){
    const root=new THREE.Group();
    root.position.set(hub.x,0,hub.z);
    root.name='Hub:'+hub.id;

    const base=new THREE.Mesh(
      new THREE.CylinderGeometry(.85,1.05,.3,20),
      makeMaterial(THREE,0x151922,.55,.35)
    );
    base.position.y=.15;

    const pole=new THREE.Mesh(
      new THREE.BoxGeometry(.18,2.6,.18),
      makeMaterial(THREE,0x343949,.35,.5)
    );
    pole.position.y=1.45;

    const sign=new THREE.Mesh(
      new THREE.BoxGeometry(2.8,.72,.16),
      new THREE.MeshStandardMaterial({color:hub.color,emissive:hub.color,emissiveIntensity:3.2,roughness:.3})
    );
    sign.position.y=2.7;

    const ring=new THREE.Mesh(
      new THREE.RingGeometry(1.15,1.55,30),
      new THREE.MeshBasicMaterial({color:hub.color,transparent:true,opacity:.58,side:THREE.DoubleSide})
    );
    ring.rotation.x=-Math.PI/2;
    ring.position.y=.05;

    root.add(base,pole,sign,ring);
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
    scene.add(root);
    return root;
  }

  function buildHubLandmarks(THREE,scene){
    HUBS.forEach(hub=>addHubLandmark(THREE,scene,hub));
  }

  function buildCity(THREE,scene){
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,60),makeMaterial(THREE,0x171b22,.95,.01));
    ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

    addRoadNetwork(THREE,scene);
    addStreetLights(THREE,scene);
    addDistrictPads(THREE,scene);
    buildHubLandmarks(THREE,scene);
    BUILDINGS.forEach(v=>addBuilding(THREE,scene,...v));
  }


  function bindInteractionInput(){
    const prompt=document.getElementById('interactionPrompt');
    prompt?.addEventListener('click',()=>activateNearest());
    document.addEventListener('keydown',e=>{
      const t=e.target;
      const typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
      if(typing)return;
      const key=String(e.key||'').toLowerCase();
      if(key==='c'&&window.TGGGame?.getActiveScreen?.()==='game'){
        e.preventDefault();
        cycleCamera();
        return;
      }
      if(key==='e'&&window.TGGGame?.getActiveScreen?.()==='game'){
        const near=nearestInteraction();
        if(near){
          e.preventDefault();
          activateNearest();
        }
      }
    });
  }

  function cycleCamera(){
    const modes=api.cameraModes;
    const index=modes.indexOf(api.cameraMode);
    api.cameraMode=modes[(index+1)%modes.length];
    const button=document.getElementById('camera3dBtn');
    if(button)button.textContent='CAMERA: '+api.cameraMode.toUpperCase();
    window.__tggToast?.('CAMERA — '+api.cameraMode.toUpperCase());
    return api.cameraMode;
  }

  function getCameraMode(){return api.cameraMode}

  api.cycleCamera=cycleCamera;
  api.getCameraMode=getCameraMode;

  function bindCameraInput(canvas){
    let dragging=false;
    let lastX=0;
    canvas.addEventListener('pointerdown',e=>{
      dragging=true;lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!dragging)return;
      const dx=e.clientX-lastX;lastX=e.clientX;
      api.cameraYawOffset=clamp(api.cameraYawOffset-dx*.008,-1.2,1.2);
    });
    const end=e=>{dragging=false;canvas.releasePointerCapture?.(e.pointerId);};
    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      api.cameraDistance=clamp(api.cameraDistance+Math.sign(e.deltaY)*.8,6.5,15);
    },{passive:false});
  }

  async function init(){
    const host=document.querySelector('#game .city');
    if(!host)return;
    const badge=document.getElementById('world3dBadge');
    const districtBadge=document.getElementById('worldDistrictBadge');
    const interactionPrompt=document.getElementById('interactionPrompt');

    try{
      const THREE=await import(THREE_URL);

      const canvas=document.createElement('canvas');
      canvas.id='world3d';
      canvas.className='world3d-canvas';
      canvas.setAttribute('aria-label','TRU GO GETTA 3D city viewport');
      host.prepend(canvas);

      const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.05;

      const scene=new THREE.Scene();
      scene.background=new THREE.Color(0x070b12);
      scene.fog=new THREE.FogExp2(0x070b12,.018);

      const camera=new THREE.PerspectiveCamera(58,1,.1,180);
      camera.position.set(0,7,11);

      scene.add(new THREE.HemisphereLight(0x9fc7ff,0x18151e,1.25));

      const sun=new THREE.DirectionalLight(0xffffff,2.4);
      sun.position.set(-12,24,14);
      sun.castShadow=true;
      sun.shadow.mapSize.set(1024,1024);
      sun.shadow.camera.left=-35;sun.shadow.camera.right=35;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;
      scene.add(sun);

      const rim=new THREE.PointLight(0xc7ff00,55,28,2);
      rim.position.set(0,8,0);scene.add(rim);

      buildCity(THREE,scene);

      const palette=avatarPalette();
      const player=createCharacter(THREE,palette);
      scene.add(player);

      const npc=createNpc(THREE);
      const missionWorld=percentToWorld(72,36);
      npc.position.set(missionWorld.x,0,missionWorld.z);
      scene.add(npc);

      const car=createStarterCar(THREE);
      car.position.set(STARTER_CAR.x,0,STARTER_CAR.z);
      car.rotation.y=Math.PI;
      scene.add(car);

      api.renderer=renderer;api.scene=scene;api.camera=camera;api.player=player;api.npc=npc;api.car=car;

      const radar=document.getElementById('radar3d');
      const radarPlayer=document.getElementById('radarPlayer');
      const radarCar=document.getElementById('radarCar');
      const radarDestinations=document.getElementById('radarDestinations');
      const radarDots=[];
      function radarPlace(el,x,z){
        if(!el)return;
        el.style.left=clamp(((x-WORLD.minX)/(WORLD.maxX-WORLD.minX))*100,0,100)+'%';
        el.style.top=clamp(((WORLD.maxZ-z)/(WORLD.maxZ-WORLD.minZ))*100,0,100)+'%';
      }
      if(radarDestinations){
        radarDestinations.innerHTML='';
        HUBS.forEach(hub=>{
          const dot=document.createElement('span');
          dot.className='radar-destination';
          dot.dataset.hub=hub.id;
          dot.title=hub.name;
          dot.style.setProperty('--radar-color','#'+new THREE.Color(hub.color).getHexString());
          radarDestinations.appendChild(dot);
          radarDots.push({dot,hub});
          radarPlace(dot,hub.x,hub.z);
        });
      }
      function updateRadar(state){
        const p=stateToWorld(state);
        radarPlace(radarPlayer,p.x,p.z);
        radarPlace(radarCar,car.position.x,car.position.z);
        if(radarPlayer)radarPlayer.style.rotate=(Number(state.heading)||0)+'deg';
        if(radarCar)radarCar.classList.toggle('active',!!state.inVehicle);
        if(radar)radar.dataset.mode=api.cameraMode;
        return {player:{x:p.x,z:p.z},car:{x:car.position.x,z:car.position.z},destinations:radarDots.length,mode:api.cameraMode};
      }
      api.updateRadar=updateRadar;
      document.getElementById('camera3dBtn')?.addEventListener('click',()=>cycleCamera());

      function resize(){
        const rect=host.getBoundingClientRect();
        const w=Math.max(1,Math.round(rect.width));
        const h=Math.max(1,Math.round(rect.height));
        renderer.setSize(w,h,false);
        camera.aspect=w/h;
        camera.updateProjectionMatrix();
      }

      api.resize=resize;
      const ro=new ResizeObserver(resize);ro.observe(host);resize();
      bindCameraInput(canvas);
      bindInteractionInput();

      const target=new THREE.Vector3();
      const camTarget=new THREE.Vector3();
      const desiredCam=new THREE.Vector3();
      let lastTime=performance.now();
      let lastDistrict='';
      let lastStateX=null;
      let lastStateY=null;
      let movingUntil=0;

      function frame(now){
        const dt=Math.min(.05,(now-lastTime)/1000||.016);
        lastTime=now;
        const state=window.TGGGame?.getState?.()||{};
        const mapped=stateToWorld(state);
        const stateX=Number(state.x)||0;
        const stateY=Number(state.y)||0;
        if(lastStateX!==null&&(Math.abs(stateX-lastStateX)>.001||Math.abs(stateY-lastStateY)>.001)){
          movingUntil=now+240;
        }
        lastStateX=stateX;
        lastStateY=stateY;
        const moving=now<movingUntil;
        const driving=!!state.inVehicle;
        const walking=moving&&!driving;
        const rig=player.userData.rig;
        if(walking&&rig){
          player.userData.walkPhase=(player.userData.walkPhase||0)+dt*11;
          const swing=Math.sin(player.userData.walkPhase)*.62;
          rig.arms[0].rotation.x=swing;
          rig.arms[1].rotation.x=-swing;
          rig.legs[0].rotation.x=-swing*.72;
          rig.legs[1].rotation.x=swing*.72;
          rig.torso.position.y=1.55+Math.abs(Math.sin(player.userData.walkPhase*2))*.045;
        }else if(rig){
          rig.arms.forEach(a=>a.rotation.x*=.78);
          rig.legs.forEach(l=>l.rotation.x*=.78);
          rig.torso.position.y+=(1.55-rig.torso.position.y)*.18;
        }
        api.motion={moving,walking,driving,walkPhase:player.userData.walkPhase||0};

        target.set(mapped.x,0,mapped.z);
        const smooth=1-Math.pow(.001,dt);
        const heading=(Number(state.heading)||0)*Math.PI/180;
        if(driving){
          player.visible=false;
          car.position.lerp(target,smooth);
          car.rotation.y=-(heading-Math.PI/2);
          if(moving)car.userData.wheels?.forEach(w=>{w.rotation.z-=dt*11});
        }else{
          player.visible=true;
          player.position.lerp(target,smooth);
          player.rotation.y=-(heading-Math.PI/2);
        }

        const subject=driving?car:player;
        camTarget.set(subject.position.x,driving?1.0:1.35,subject.position.z);
        if(api.cameraMode==='top'){
          desiredCam.set(subject.position.x,driving?30:27,subject.position.z+.01);
          camera.position.lerp(desiredCam,1-Math.pow(.001,dt));
        }else{
          const yaw=heading+(api.cameraMode==='orbit'?api.cameraYawOffset:0);
          const dist=api.cameraMode==='chase'
            ? (driving?10:8)
            : (driving?Math.max(api.cameraDistance,11):api.cameraDistance);
          desiredCam.set(
            subject.position.x-Math.cos(yaw)*dist,
            api.cameraMode==='chase'?(driving?4.3:4.9):(driving?5.0:5.6),
            subject.position.z-Math.sin(yaw)*dist
          );
          camera.position.lerp(desiredCam,1-Math.pow(api.cameraMode==='chase'?.025:.015,dt));
        }
        camera.lookAt(camTarget);

        npc.rotation.y=Math.atan2(subject.position.x-npc.position.x,subject.position.z-npc.position.z);

        const district=districtAtPercent(state.x,state.y);
        api.district=district?{id:district.id,name:district.name,distance:district.distance}:null;
        if(district?.id!==lastDistrict){
          lastDistrict=district?.id||'';
          if(districtBadge)districtBadge.textContent=district?.name||'CITY';
        }

        updateRadar(state);

        const interaction=nearestInteraction();
        api.interaction=interaction;
        if(interactionPrompt){
          if(interaction){
            interactionPrompt.classList.remove('hidden');
            interactionPrompt.textContent=interaction.key+' • '+interaction.label;
            interactionPrompt.dataset.interaction=interaction.id;
          }else{
            interactionPrompt.classList.add('hidden');
            interactionPrompt.textContent='';
            delete interactionPrompt.dataset.interaction;
          }
        }

        renderer.render(scene,camera);
        requestAnimationFrame(frame);
      }

      api.ready=true;
      host.classList.add('webgl-ready');
      document.documentElement.classList.add('tgg-webgl-ready');
      if(badge){badge.textContent='3D LIVE';badge.dataset.state='ready';}
      window.dispatchEvent(new CustomEvent('tgg:world3d-ready',{detail:api.snapshot()}));
      requestAnimationFrame(frame);
    }catch(error){
      api.failed=true;
      api.error=String(error?.message||error);
      host.classList.add('webgl-fallback');
      if(badge){badge.textContent='2.5D FALLBACK';badge.dataset.state='fallback';}
      window.dispatchEvent(new CustomEvent('tgg:world3d-failed',{detail:{error:api.error}}));
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();