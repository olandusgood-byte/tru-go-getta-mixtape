(()=>{
  const VERSION='NEXTGEN GRAPHICS 2026.1';
  const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve(window.TGG3D):requestAnimationFrame(t);t()});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const rand=n=>{const x=Math.sin(n*91.733)*43758.5453;return x-Math.floor(x)};

  function qualityProfile(){
    const cores=navigator.hardwareConcurrency||4;
    const dpr=window.devicePixelRatio||1;
    if(innerWidth<720||cores<=4)return 'balanced';
    if(dpr>2.2&&cores<=8)return 'high';
    return 'ultra';
  }

  function tuneRenderer(THREE,renderer,camera,profile){
    const ratios={ultra:2,high:1.65,balanced:1.25,performance:1};
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,ratios[profile]||1.25));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=profile==='ultra'?1.12:profile==='high'?1.08:1.04;
    renderer.shadowMap.enabled=profile!=='performance';
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    camera.near=.07;camera.far=320;camera.updateProjectionMatrix();
  }

  function improveMaterials(scene,renderer){
    const aniso=renderer.capabilities.getMaxAnisotropy?.()||1;
    let count=0;
    scene.traverse(o=>{
      if(!o?.isMesh)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.filter(Boolean).forEach(m=>{
        count++;
        if('roughness' in m)m.roughness=clamp(m.roughness??.6,.18,.92);
        if('metalness' in m)m.metalness=clamp(m.metalness??0,0,.96);
        if('envMapIntensity' in m)m.envMapIntensity=Math.max(m.envMapIntensity||0,1.3);
        if('clearcoat' in m&&/car|vehicle|chrome|metal|body/i.test((o.name||'')+' '+(m.name||''))){
          m.clearcoat=Math.max(m.clearcoat||0,.55);
          if('clearcoatRoughness' in m)m.clearcoatRoughness=Math.min(m.clearcoatRoughness??.3,.16);
        }
        ['map','normalMap','roughnessMap','metalnessMap','aoMap'].forEach(k=>{
          if(m[k]&&'anisotropy' in m[k])m[k].anisotropy=aniso;
        });
        m.needsUpdate=true;
      });
      o.receiveShadow=true;
    });
    return count;
  }

  function addLighting(THREE,scene){
    const rig=new THREE.Group();rig.name='tgg-nextgen-light-rig';
    const key=new THREE.DirectionalLight(0xffd4a3,2.8);
    key.position.set(34,46,18);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.near=.5;key.shadow.camera.far=170;key.shadow.bias=-.00018;rig.add(key);
    const fill=new THREE.DirectionalLight(0x8fb7ff,1.25);fill.position.set(-32,24,-28);rig.add(fill);
    const rim=new THREE.DirectionalLight(0x9d7cff,.8);rim.position.set(-14,15,36);rig.add(rim);
    const hemi=new THREE.HemisphereLight(0x93b7ff,0x17130f,.65);rig.add(hemi);
    scene.add(rig);return{rig,key,fill,rim,hemi};
  }

  function addWetRoads(THREE,scene){
    const group=new THREE.Group();group.name='tgg-nextgen-wet-roads';
    const mat=new THREE.MeshPhysicalMaterial({color:0x0d1218,roughness:.22,metalness:.28,clearcoat:.92,clearcoatRoughness:.12,transparent:true,opacity:.72});
    const roads=[[-24,0,7.2,112],[0,0,7.2,112],[24,0,7.2,112],[0,-24,112,7.2],[0,0,112,7.2],[0,24,112,7.2]];
    roads.forEach(([x,z,w,d],i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat.clone());m.rotation.x=-Math.PI/2;m.position.set(x,.076,z);m.receiveShadow=true;m.name='nextgen-road-'+i;group.add(m)});
    scene.add(group);return group;
  }

  function addWindowDepth(THREE,scene,profile){
    if(profile==='performance')return null;
    const group=new THREE.Group();group.name='tgg-nextgen-window-depth';
    const warm=new THREE.MeshBasicMaterial({color:0xffc77d,transparent:true,opacity:.52,depthWrite:false});
    const cool=new THREE.MeshBasicMaterial({color:0x8dd7ff,transparent:true,opacity:.46,depthWrite:false});
    for(let i=0;i<(profile==='ultra'?180:110);i++){
      const side=i%4,a=rand(i*3),b=rand(i*7);
      const x=side<2?-51+a*102:(side===2?-51:51);
      const z=side<2?(side===0?-50:50):-48+a*96;
      const y=3+b*20;
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(.42+.45*rand(i+2),.22+.35*rand(i+4)),i%3?cool:warm);
      pane.position.set(x,y,z);
      if(side===0)pane.rotation.y=0;
      if(side===1)pane.rotation.y=Math.PI;
      if(side===2)pane.rotation.y=Math.PI/2;
      if(side===3)pane.rotation.y=-Math.PI/2;
      group.add(pane);
    }
    scene.add(group);return group;
  }

  function addHaze(THREE,scene,profile){
    const group=new THREE.Group();group.name='tgg-nextgen-haze';
    const count=profile==='ultra'?12:8;
    for(let i=0;i<count;i++){
      const mat=new THREE.MeshBasicMaterial({color:i%2?0x788ea8:0xb39b86,transparent:true,opacity:.016+i*.0018,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
      const r=24+i*7.2;
      const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r+2,1.4+i*.22,64,1,true),mat);
      m.position.y=1.2+i*.55;group.add(m);
    }
    scene.add(group);return group;
  }

  function addFxOverlay(){
    let root=document.getElementById('tggNextgenFx');
    if(root)return root;
    root=document.createElement('div');root.id='tggNextgenFx';
    root.innerHTML='<i class="ngfx-vignette"></i><i class="ngfx-bloom"></i><i class="ngfx-grain"></i><i class="ngfx-bars top"></i><i class="ngfx-bars bottom"></i>';
    document.body.appendChild(root);return root;
  }

  wait().then(api=>{
    try{
      const THREE=window.THREE,{scene,renderer,camera}=api;
      const profile=qualityProfile();
      tuneRenderer(THREE,renderer,camera,profile);
      const materials=improveMaterials(scene,renderer);
      const lighting=addLighting(THREE,scene);
      const roads=addWetRoads(THREE,scene);
      addWindowDepth(THREE,scene,profile);
      const haze=addHaze(THREE,scene,profile);
      const fx=addFxOverlay();
      document.documentElement.dataset.tggGraphics='nextgen';
      document.documentElement.dataset.tggGraphicsQuality=profile;
      let last=performance.now(),time=0;
      const loop=now=>{
        requestAnimationFrame(loop);
        const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
        const weather=window.TGGCityWorldMega?.getStatus?.()?.weather||'overcast';
        const speed=Math.abs(api.getVehicleDynamics?.()?.speed||0);
        lighting.key.intensity=weather==='clear'?3.2:weather==='rain'?1.8:2.55;
        lighting.fill.intensity=weather==='rain'?1.55:1.1;
        roads.visible=weather!=='clear'||speed>3;
        if(fx)fx.style.setProperty('--ngfx-speed',String(clamp(speed/12,0,1)));
        if(haze)haze.rotation.y=time*.004;
      };
      requestAnimationFrame(loop);
      window.TGGNextgenGraphics={
        version:VERSION,profile,materials,
        getStatus(){return{version:VERSION,profile,materials,features:['pbr-retune','wet-road-reflections','window-depth','atmospheric-haze','cinematic-light-rig','adaptive-resolution','camera-grade-overlay','weather-light-sync']}}
      };
      window.dispatchEvent(new CustomEvent('tgg:nextgen-graphics-ready',{detail:window.TGGNextgenGraphics.getStatus()}));
    }catch(error){
      document.documentElement.dataset.tggGraphics='fallback';
      window.TGGNextgenGraphics={version:VERSION,error:String(error?.message||error),getStatus(){return{version:VERSION,mode:'safe-fallback'}}};
    }
  });
})();