(() => {
  const VERSION='V2.50 REALITY MASTER CONSOLIDATION';
  const ready=()=>new Promise(resolve=>{
    const tick=()=>{
      if(window.TGG3D?.scene&&window.TGG3D?.renderer&&window.TGG3D?.camera&&window.THREE)return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  const rand=n=>{const x=Math.sin(n*999.91)*43758.5453;return x-Math.floor(x)};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function physical(THREE,color,rough=.55,metal=.05,opts={}){
    return new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:metal,clearcoat:opts.clearcoat??0,clearcoatRoughness:opts.clearcoatRoughness??.45,transmission:opts.transmission??0,transparent:opts.transparent??false,opacity:opts.opacity??1,ior:opts.ior??1.45,thickness:opts.thickness??0});
  }
  function addHumanDetail(THREE,human,index=0){
    if(!human?.isGroup||human.userData?.v250Detailed)return;
    human.userData.v250Detailed=true;
    const parts=human.userData.parts||{};
    const skinColor=parts.head?.material?.color?.clone?.()||new THREE.Color(0x9d6a49);
    const skin=physical(THREE,skinColor,.68,.01),dark=physical(THREE,0x111111,.72,.03),white=physical(THREE,0xf4f1ea,.5,.02),eyeDark=physical(THREE,0x151515,.35,.02,{clearcoat:.3}),lip=physical(THREE,0x663b36,.62,.01);
    const face=new THREE.Group();face.name='v250-face-detail';
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),skin);nose.scale.set(.7,1.1,.65);nose.position.set(0,3.56,.545);face.add(nose);
    [-.2,.2].forEach(x=>{const ew=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),white);ew.scale.set(1.25,.72,.5);ew.position.set(x,3.72,.535);face.add(ew);const p=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),eyeDark);p.position.set(x,3.72,.595);face.add(p);const b=new THREE.Mesh(new THREE.BoxGeometry(.2,.025,.025),dark);b.position.set(x,3.84,.565);b.rotation.z=x<0?.08:-.08;face.add(b)});
    const mouth=new THREE.Mesh(new THREE.CapsuleGeometry(.025,.2,3,6),lip);mouth.rotation.z=Math.PI/2;mouth.position.set(0,3.43,.57);face.add(mouth);
    [-.57,.57].forEach(x=>{const ear=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),skin);ear.scale.set(.55,1,.45);ear.position.set(x,3.58,0);face.add(ear)});
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.59,16,10,0,Math.PI*2,0,Math.PI*.56),dark);hair.position.set(0,3.76,-.02);hair.scale.y=.72;face.add(hair);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.28,10),skin);neck.position.set(0,3.08,0);face.add(neck);
    [-.34,.34].forEach((x,i)=>{const shoe=new THREE.Mesh(new THREE.BoxGeometry(.42,.22,.72),physical(THREE,0xe6e6e6,.55,.05));shoe.position.set(x,.18,.13);face.add(shoe);const hand=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),skin);hand.position.set(i?1.08:-1.08,1.9,0);face.add(hand)});
    const tones=[0x171717,0x273245,0x281d24,0x1e2b24];if(parts.body?.material){parts.body.material=physical(THREE,tones[index%tones.length],.48,.08,{clearcoat:.08});parts.body.material.needsUpdate=true}
    human.add(face);
  }
  function addCarDetail(THREE,car,index=0){
    if(!car?.isGroup||car.userData?.v250Detailed)return;
    car.userData.v250Detailed=true;
    const bodyMat=car.userData.bodyMaterial||car.userData.bodyMat||physical(THREE,0x222222,.24,.72,{clearcoat:.7,clearcoatRoughness:.14});
    if('clearcoat' in bodyMat){bodyMat.clearcoat=.8;bodyMat.clearcoatRoughness=.12;bodyMat.metalness=.82;bodyMat.roughness=.21;bodyMat.needsUpdate=true}
    const trim=physical(THREE,0x07090b,.28,.72,{clearcoat:.45,clearcoatRoughness:.18}),chrome=physical(THREE,0xc9d0d8,.16,.96,{clearcoat:.75,clearcoatRoughness:.08}),red=physical(THREE,0x7d0909,.26,.1,{clearcoat:.55}),glass=physical(THREE,0x5b7485,.09,.18,{clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.58,transmission:.08});
    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.34,.16,1.88),bodyMat);hood.position.set(1.62,1.45,0);hood.rotation.z=-.055;car.add(hood);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(1.65,.09,1.55),bodyMat);roof.position.set(-.36,2.2,0);car.add(roof);
    const windshield=new THREE.Mesh(new THREE.PlaneGeometry(1.52,.72),glass);windshield.position.set(.7,1.93,0);windshield.rotation.y=Math.PI/2;windshield.rotation.z=.25;car.add(windshield);
    const rearGlass=windshield.clone();rearGlass.position.x=-1.32;rearGlass.rotation.z=-.23;car.add(rearGlass);
    [-1.98,1.98].forEach(x=>{const bumper=new THREE.Mesh(new THREE.BoxGeometry(.13,.24,1.93),trim);bumper.position.set(x,.64,0);car.add(bumper)});
    [-.79,.79].forEach(z=>{const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.38,10),chrome);exhaust.rotation.z=Math.PI/2;exhaust.position.set(-2.18,.48,z);car.add(exhaust);const tail=new THREE.Mesh(new THREE.BoxGeometry(.05,.17,.42),red);tail.position.set(-2.13,1.05,z);car.add(tail)});
    [-1.03,1.03].forEach(z=>{const skirt=new THREE.Mesh(new THREE.BoxGeometry(3.55,.12,.1),trim);skirt.position.set(0,.56,z);car.add(skirt)});
    if(index===0){const l=new THREE.SpotLight(0xe8f7ff,18,34,.24,.45,1.7);l.position.set(2.2,1.25,-.58);l.target.position.set(12,.2,-.58);car.add(l,l.target);const r=new THREE.SpotLight(0xe8f7ff,18,34,.24,.45,1.7);r.position.set(2.2,1.25,.58);r.target.position.set(12,.2,.58);car.add(r,r.target);car.userData.v250Headlights=[l,r]}
  }
  function addCityDetail(THREE,scene){
    const concrete=physical(THREE,0x696d70,.88,.02),curb=physical(THREE,0x909090,.78,.03),metal=physical(THREE,0x4b5056,.38,.74),glass=physical(THREE,0x7692a5,.12,.12,{clearcoat:.7,transparent:true,opacity:.42,transmission:.05}),leaf=physical(THREE,0x1e3c24,.82,.01);
    for(let i=0;i<34;i++){const x=-47+(i%17)*5.85,z=(i<17?-1:1)*10.25;const c=new THREE.Mesh(new THREE.BoxGeometry(4.9,.18,.55),curb);c.position.set(x,.11,z);scene.add(c);if(i%3===0){const g=new THREE.Mesh(new THREE.BoxGeometry(.7,.03,.45),metal);g.position.set(x+.7,.215,z);scene.add(g)}}
    for(let i=0;i<28;i++){const a=(i/28)*Math.PI*2,r=42+(i%4)*2.5;const t=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,2.3,9),physical(THREE,0x4a3525,.9,.01));t.position.set(Math.cos(a)*r,1.15,Math.sin(a)*r);scene.add(t);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(.9+(i%3)*.13,1),leaf);crown.position.set(t.position.x,2.65,t.position.z);scene.add(crown)}
    for(let i=0;i<18;i++){const x=-44+(i%9)*11,z=i<9?-33:33;const shell=new THREE.Mesh(new THREE.BoxGeometry(5.2,2.7,.35),concrete);shell.position.set(x,1.35,z);scene.add(shell);const pane=new THREE.Mesh(new THREE.BoxGeometry(4.55,1.72,.08),glass);pane.position.set(x,1.48,z+(z<0?.22:-.22));scene.add(pane);const awn=new THREE.Mesh(new THREE.BoxGeometry(4.7,.12,1.15),physical(THREE,[0x242b35,0x392525,0x203126][i%3],.52,.08));awn.position.set(x,2.52,z+(z<0?.7:-.7));scene.add(awn)}
    const decalMat=new THREE.MeshBasicMaterial({color:0x2c3035,transparent:true,opacity:.22,depthWrite:false});
    for(let i=0;i<54;i++){const stain=new THREE.Mesh(new THREE.CircleGeometry(.15+rand(i)*.55,12),decalMat.clone());stain.rotation.x=-Math.PI/2;stain.position.set(-50+rand(i+91)*100,.079,-50+rand(i+191)*100);stain.material.opacity=.08+rand(i+301)*.18;scene.add(stain)}
    const puddleMat=physical(THREE,0x26323b,.08,.25,{clearcoat:1,clearcoatRoughness:.03,transparent:true,opacity:.5});
    for(let i=0;i<14;i++){const p=new THREE.Mesh(new THREE.CircleGeometry(.4+rand(i+1)*1.2,18),puddleMat.clone());p.rotation.x=-Math.PI/2;p.scale.y=.35;p.position.set(-45+rand(i+9)*90,.083,-45+rand(i+22)*90);scene.add(p)}
    const wireMat=new THREE.LineBasicMaterial({color:0x17191c,transparent:true,opacity:.68});
    for(let i=0;i<8;i++){const z=-42+i*12,pts=[new THREE.Vector3(-50,7+rand(i)*2,z),new THREE.Vector3(0,8+rand(i+2)*2,z+.4),new THREE.Vector3(50,7+rand(i+4)*2,z)];const curve=new THREE.CatmullRomCurve3(pts);scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),wireMat))}
  }
  function addWeatherAndAir(THREE,scene){
    const count=900,geo=new THREE.BufferGeometry(),arr=new Float32Array(count*3);
    for(let i=0;i<count;i++){arr[i*3]=-55+rand(i+10)*110;arr[i*3+1]=2+rand(i+20)*38;arr[i*3+2]=-55+rand(i+30)*110}
    geo.setAttribute('position',new THREE.BufferAttribute(arr,3));
    const rain=new THREE.Points(geo,new THREE.PointsMaterial({color:0xb8d4ea,size:.032,transparent:true,opacity:.18,depthWrite:false}));
    rain.name='v250-atmospheric-moisture';scene.add(rain);return rain;
  }
  function addCameraRealism(camera,api){
    const base=58;let shake=0,last=performance.now();
    const loop=()=>{requestAnimationFrame(loop);const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;const drive=api.getVehicleDynamics?.()||{},walk=api.getPlayerDynamics?.()||{};const targetShake=clamp(Math.abs(Number(drive.speed)||0)/160+(walk.sprinting?.008:0),0,.035);shake+=(targetShake-shake)*Math.min(1,dt*4);camera.rotation.z+=(Math.sin(now*.011)*shake-camera.rotation.z)*Math.min(1,dt*3);const targetFov=base+clamp(Math.abs(Number(drive.speed)||0)*.10,0,7)+(walk.sprinting?3:0);camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*2.5);camera.updateProjectionMatrix()};loop();
  }
  function installQualityGovernor(renderer){
    let frames=0,total=0,last=performance.now(),tier='ultra';
    const apply=next=>{tier=next;const r={ultra:2,high:1.6,balanced:1.25,performance:1}[tier]||1.25;renderer.setPixelRatio(Math.min(devicePixelRatio||1,r));renderer.shadowMap.enabled=tier!=='performance';document.documentElement.dataset.tggMasterQuality=tier};
    apply(innerWidth<720?'balanced':'ultra');
    const tick=()=>{requestAnimationFrame(tick);const now=performance.now();total+=now-last;frames++;last=now;if(frames>=90){const fps=1000/(total/frames);if(fps<35&&tier==='ultra')apply('high');else if(fps<30&&tier==='high')apply('balanced');else if(fps<24&&tier==='balanced')apply('performance');else if(fps>56&&tier==='balanced'&&innerWidth>=900)apply('high');frames=0;total=0}};tick();
    return {get:()=>tier,set:apply};
  }
  ready().then(()=>{
    const THREE=window.THREE,api=window.TGG3D,{scene,renderer,camera,player,npc,car}=api;
    renderer.physicallyCorrectLights=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    addHumanDetail(THREE,player,0);addHumanDetail(THREE,npc,1);(api.pedestrians||[]).forEach((h,i)=>addHumanDetail(THREE,h,i+2));
    addCarDetail(THREE,car,0);(api.traffic||[]).forEach((v,i)=>addCarDetail(THREE,v,i+1));
    addCityDetail(THREE,scene);const rain=addWeatherAndAir(THREE,scene);addCameraRealism(camera,api);const quality=installQualityGovernor(renderer);
    const clock=new THREE.Clock();
    const animateAir=()=>{requestAnimationFrame(animateAir);const dt=Math.min(.05,clock.getDelta()),a=rain.geometry.attributes.position.array;for(let i=0;i<a.length;i+=3){a[i+1]-=dt*(5+((i/3)%7)*.23);if(a[i+1]<.3)a[i+1]=34+rand(i)*8}rain.geometry.attributes.position.needsUpdate=true;const driving=api.getVehicleDynamics?.()||{};car.userData.v250Headlights?.forEach(l=>l.intensity=Math.abs(Number(driving.speed)||0)>.1?23:14)};animateAir();
    const status={version:VERSION,mode:'reality-master-consolidated',layers:['human-anatomy-detail','skin-face-eyes-hair','hands-shoes-clothing-materials','vehicle-clearcoat-glass-trim','headlight-cones','street-curbs-grates','storefront-glass-awnings','trees-utility-wires','surface-decals-puddles','atmospheric-moisture','camera-inertia','speed-fov','adaptive-fps-quality'],quality:quality.get()};
    window.TGGRealityMaster={...status,getStatus:()=>({...status,quality:quality.get()}),setQuality:q=>{quality.set(q);status.quality=quality.get();return status.quality}};
    document.documentElement.dataset.tggRealityMaster='v250';window.dispatchEvent(new CustomEvent('tgg:reality-master-ready',{detail:window.TGGRealityMaster.getStatus()}));
  });
})();