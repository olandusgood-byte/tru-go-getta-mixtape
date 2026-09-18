(() => {
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
  const api={
    version:'1.21.0',
    library:'three@0.186.0',
    ready:false,
    failed:false,
    error:null,
    renderer:null,
    scene:null,
    camera:null,
    player:null,
    npc:null,
    cameraYawOffset:0,
    cameraDistance:10,
    snapshot(){
      const p=this.player?.position;
      const c=this.camera?.position;
      return {
        ready:this.ready,
        failed:this.failed,
        library:this.library,
        player:p?{x:p.x,y:p.y,z:p.z}:null,
        camera:c?{x:c.x,y:c.y,z:c.z}:null,
        cameraDistance:this.cameraDistance,
        cameraYawOffset:this.cameraYawOffset
      };
    }
  };
  window.TGGWorld3D=api;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;

  function stateToWorld(state){
    const x=lerp(-27,27,clamp((Number(state?.x)||50)/100,0,1));
    const z=lerp(21,-21,clamp((Number(state?.y)||55)/100,0,1));
    return {x,z};
  }

  function avatarPalette(){
    try{
      const raw=JSON.parse(localStorage.getItem('tgg-avatar-v1')||'{}');
      return {
        skin:raw.skin||'#8b5a3c',
        accent:raw.accent||'#c7ff00'
      };
    }catch(e){
      return {skin:'#8b5a3c',accent:'#c7ff00'};
    }
  }

  function makeMaterial(THREE,color,rough=.72,metal=.08){
    return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  }

  function addBox(THREE,scene,{x=0,y=.5,z=0,w=1,h=1,d=1,color=0x303747,rough=.75,metal=.05,cast=true,receive=true}={}){
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      makeMaterial(THREE,color,rough,metal)
    );
    mesh.position.set(x,y,z);
    mesh.castShadow=cast;
    mesh.receiveShadow=receive;
    scene.add(mesh);
    return mesh;
  }

  function addBuilding(THREE,scene,x,z,w,d,h,color){
    const group=new THREE.Group();
    const body=new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      makeMaterial(THREE,color,.62,.18)
    );
    body.position.y=h/2;
    body.castShadow=true;
    body.receiveShadow=true;
    group.add(body);

    const trimMat=new THREE.MeshStandardMaterial({
      color:0x7fd0ff,
      emissive:0x1e5f88,
      emissiveIntensity:.7,
      roughness:.45,
      metalness:.2
    });
    const floors=Math.max(2,Math.floor(h/2.6));
    for(let i=1;i<floors;i++){
      const strip=new THREE.Mesh(new THREE.BoxGeometry(w+.04,.05,d+.04),trimMat);
      strip.position.y=(h/floors)*i;
      group.add(strip);
    }

    const roof=new THREE.Mesh(
      new THREE.BoxGeometry(w*.35,.25,d*.35),
      makeMaterial(THREE,0x10141e,.5,.35)
    );
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

    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.48,.56,1.25,8),accent);
    torso.position.y=1.55;
    torso.castShadow=true;
    group.add(torso);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.35,16,12),skin);
    head.position.y=2.48;
    head.castShadow=true;
    group.add(head);

    const hair=new THREE.Mesh(new THREE.SphereGeometry(.36,12,8,0,Math.PI*2,0,Math.PI*.45),dark);
    hair.position.y=2.65;
    hair.scale.y=.65;
    hair.castShadow=true;
    group.add(hair);

    for(const side of [-1,1]){
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.72,4,8),skin);
      arm.position.set(side*.58,1.52,0);
      arm.rotation.z=side*.08;
      arm.castShadow=true;
      group.add(arm);

      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.82,4,8),dark);
      leg.position.set(side*.22,.62,0);
      leg.castShadow=true;
      group.add(leg);

      const foot=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.58),shoe);
      foot.position.set(side*.22,.12,.12);
      foot.castShadow=true;
      group.add(foot);
    }

    return group;
  }

  function createNpc(THREE){
    const group=createCharacter(THREE,{skin:'#7c4d35',accent:'#566174'},'#566174');
    group.name='ManagerM3D';
    group.scale.set(.96,.96,.96);
    return group;
  }

  function addRoadNetwork(THREE,scene){
    const roadMat=makeMaterial(THREE,0x151a23,.95,.02);
    const lineMat=new THREE.MeshStandardMaterial({color:0xd9dd7a,emissive:0x5f6120,emissiveIntensity:.35,roughness:.7});

    const roadA=new THREE.Mesh(new THREE.PlaneGeometry(72,9),roadMat);
    roadA.rotation.x=-Math.PI/2;
    roadA.position.y=.012;
    roadA.receiveShadow=true;
    scene.add(roadA);

    const roadB=new THREE.Mesh(new THREE.PlaneGeometry(9,56),roadMat);
    roadB.rotation.x=-Math.PI/2;
    roadB.position.y=.014;
    roadB.receiveShadow=true;
    scene.add(roadB);

    for(let x=-30;x<=30;x+=5.2){
      const dash=new THREE.Mesh(new THREE.BoxGeometry(2.2,.03,.12),lineMat);
      dash.position.set(x,.035,0);
      scene.add(dash);
    }
    for(let z=-22;z<=22;z+=5.2){
      const dash=new THREE.Mesh(new THREE.BoxGeometry(.12,.03,2.2),lineMat);
      dash.position.set(0,.04,z);
      scene.add(dash);
    }

    const sidewalk=makeMaterial(THREE,0x363d49,.85,.04);
    [
      [-20,13,25,7], [20,13,25,7], [-20,-13,25,7], [20,-13,25,7]
    ].forEach(([x,z,w,d])=>addBox(THREE,scene,{x,y:.09,z,w,h:.18,d,color:0x343b47,rough:.92,metal:.01,cast:false}));
  }

  function addStreetLights(THREE,scene){
    const poleMat=makeMaterial(THREE,0x353b45,.4,.6);
    const bulbMat=new THREE.MeshStandardMaterial({
      color:0xf6ffd4,
      emissive:0xcaff70,
      emissiveIntensity:2.1,
      roughness:.3
    });
    const spots=[[-11,-5],[11,-5],[-11,5],[11,5],[-25,-5],[25,-5],[-25,5],[25,5]];
    for(const [x,z] of spots){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,3.2,8),poleMat);
      pole.position.set(x,1.6,z);
      scene.add(pole);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),bulbMat);
      bulb.position.set(x,3.18,z);
      scene.add(bulb);
    }
  }

  function addDistrictPads(THREE,scene){
    const configs=[
      {x:-21,z:-13,color:0x5f67ff},
      {x:18,z:10,color:0xc7ff00},
      {x:18,z:-14,color:0xff3b7b}
    ];
    for(const c of configs){
      const ring=new THREE.Mesh(
        new THREE.RingGeometry(1.4,1.8,32),
        new THREE.MeshBasicMaterial({color:c.color,transparent:true,opacity:.5,side:THREE.DoubleSide})
      );
      ring.rotation.x=-Math.PI/2;
      ring.position.set(c.x,.08,c.z);
      scene.add(ring);
    }
  }

  function buildCity(THREE,scene){
    const ground=new THREE.Mesh(
      new THREE.PlaneGeometry(80,60),
      makeMaterial(THREE,0x171b22,.95,.01)
    );
    ground.rotation.x=-Math.PI/2;
    ground.receiveShadow=true;
    scene.add(ground);

    addRoadNetwork(THREE,scene);
    addStreetLights(THREE,scene);
    addDistrictPads(THREE,scene);

    const buildings=[
      [-27,-19,8,7,10,0x252b38],[-18,-19,7,7,15,0x1d2938],[-9,-19,6,7,8,0x303445],
      [12,-19,8,7,13,0x322b44],[23,-19,9,7,18,0x242b3d],
      [-27,18,8,7,14,0x2a3040],[-17,18,7,7,9,0x303847],[-8,18,6,7,17,0x202d3a],
      [12,18,7,7,12,0x333041],[22,18,9,7,16,0x202a3a],
      [-30,7,6,7,9,0x252a34],[-30,-7,6,7,13,0x292e3a],
      [30,7,6,7,15,0x222b39],[30,-7,6,7,11,0x313441]
    ];
    buildings.forEach(v=>addBuilding(THREE,scene,...v));
  }

  function bindCameraInput(canvas){
    let dragging=false;
    let lastX=0;
    canvas.addEventListener('pointerdown',e=>{
      dragging=true;
      lastX=e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!dragging)return;
      const dx=e.clientX-lastX;
      lastX=e.clientX;
      api.cameraYawOffset=clamp(api.cameraYawOffset-dx*.008,-1.2,1.2);
    });
    const end=e=>{
      dragging=false;
      canvas.releasePointerCapture?.(e.pointerId);
    };
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

      const hemi=new THREE.HemisphereLight(0x9fc7ff,0x18151e,1.25);
      scene.add(hemi);

      const sun=new THREE.DirectionalLight(0xffffff,2.4);
      sun.position.set(-12,24,14);
      sun.castShadow=true;
      sun.shadow.mapSize.set(1024,1024);
      sun.shadow.camera.left=-35;
      sun.shadow.camera.right=35;
      sun.shadow.camera.top=35;
      sun.shadow.camera.bottom=-35;
      scene.add(sun);

      const rim=new THREE.PointLight(0xc7ff00,55,28,2);
      rim.position.set(0,8,0);
      scene.add(rim);

      buildCity(THREE,scene);

      const palette=avatarPalette();
      const player=createCharacter(THREE,palette);
      scene.add(player);

      const npc=createNpc(THREE);
      npc.position.set(12,0,-7);
      scene.add(npc);

      api.renderer=renderer;
      api.scene=scene;
      api.camera=camera;
      api.player=player;
      api.npc=npc;

      function resize(){
        const rect=host.getBoundingClientRect();
        const w=Math.max(1,Math.round(rect.width));
        const h=Math.max(1,Math.round(rect.height));
        renderer.setSize(w,h,false);
        camera.aspect=w/h;
        camera.updateProjectionMatrix();
      }

      api.resize=resize;
      const ro=new ResizeObserver(resize);
      ro.observe(host);
      resize();

      bindCameraInput(canvas);

      const target=new THREE.Vector3();
      const camTarget=new THREE.Vector3();
      const desiredCam=new THREE.Vector3();
      let lastTime=performance.now();

      function frame(now){
        const dt=Math.min(.05,(now-lastTime)/1000||.016);
        lastTime=now;
        const state=window.TGGGame?.getState?.()||{};
        const mapped=stateToWorld(state);

        target.set(mapped.x,0,mapped.z);
        const smooth=1-Math.pow(.001,dt);
        player.position.lerp(target,smooth);

        const heading=(Number(state.heading)||0)*Math.PI/180;
        player.rotation.y=-(heading-Math.PI/2);

        const yaw=heading+api.cameraYawOffset;
        const dist=api.cameraDistance;
        desiredCam.set(
          player.position.x-Math.cos(yaw)*dist,
          5.6,
          player.position.z-Math.sin(yaw)*dist
        );
        camera.position.lerp(desiredCam,1-Math.pow(.015,dt));
        camTarget.set(player.position.x,1.35,player.position.z);
        camera.lookAt(camTarget);

        npc.rotation.y=Math.atan2(player.position.x-npc.position.x,player.position.z-npc.position.z);

        renderer.render(scene,camera);
        requestAnimationFrame(frame);
      }

      api.ready=true;
      host.classList.add('webgl-ready');
      document.documentElement.classList.add('tgg-webgl-ready');
      if(badge){
        badge.textContent='3D LIVE';
        badge.dataset.state='ready';
      }
      window.dispatchEvent(new CustomEvent('tgg:world3d-ready',{detail:api.snapshot()}));
      requestAnimationFrame(frame);
    }catch(error){
      api.failed=true;
      api.error=String(error?.message||error);
      const host=document.querySelector('#game .city');
      host?.classList.add('webgl-fallback');
      if(badge){
        badge.textContent='2.5D FALLBACK';
        badge.dataset.state='fallback';
      }
      window.dispatchEvent(new CustomEvent('tgg:world3d-failed',{detail:{error:api.error}}));
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();