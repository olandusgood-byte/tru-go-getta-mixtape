(()=>{
  const VERSION='V3.20 REALISM MEGA PASS';
  const wait=()=>new Promise(resolve=>{
    const tick=()=>window.TGG3D?.isReady?.()?resolve(window.TGG3D):requestAnimationFrame(tick);
    tick();
  });
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const physical=(THREE,color,rough=.55,metal=.05,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:metal,...extra});

  function tuneRenderer(THREE,api){
    const {renderer,camera,scene}=api;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if('useLegacyLights' in renderer)renderer.useLegacyLights=false;
    if('physicallyCorrectLights' in renderer)renderer.physicallyCorrectLights=true;
    camera.near=.08; camera.far=Math.max(camera.far||0,320); camera.updateProjectionMatrix();
    if(scene.fog&&'density' in scene.fog)scene.fog.density=Math.min(scene.fog.density,.008);
  }

  function addLighting(THREE,scene){
    const group=new THREE.Group(); group.name='v320-lighting';
    const hemi=new THREE.HemisphereLight(0x9fb8d8,0x17130f,.42); group.add(hemi);
    const rim=new THREE.DirectionalLight(0xc8ddff,.36); rim.position.set(-32,28,-18); group.add(rim);
    const warm=new THREE.DirectionalLight(0xffc48d,.5); warm.position.set(34,19,12); warm.castShadow=true;
    warm.shadow.mapSize.set(2048,2048); warm.shadow.bias=-.00018; group.add(warm);
    scene.add(group); return group;
  }

  function refineHumans(THREE,humans){
    let count=0;
    humans.filter(Boolean).forEach((h,i)=>{
      if(!h.isGroup||h.userData.v320Refined)return;
      h.userData.v320Refined=true; count++;
      h.traverse(o=>{
        if(!o.isMesh||!o.material)return;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>{
          if('roughness' in m)m.roughness=clamp(Number(m.roughness??.6),.32,.82);
          if('envMapIntensity' in m)m.envMapIntensity=Math.max(Number(m.envMapIntensity)||0,1.05);
          m.needsUpdate=true;
        });
      });
      const head=h.userData.parts?.head;
      if(head){
        const highlight=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),physical(THREE,0xffffff,.16,.02,{clearcoat:.5}));
        highlight.position.set(i%2?-.18:.18,.09,.52); head.add(highlight);
      }
    });
    return count;
  }

  function refineVehicles(THREE,vehicles){
    let count=0;
    vehicles.filter(Boolean).forEach(v=>{
      if(!v.isGroup||v.userData.v320Refined)return;
      v.userData.v320Refined=true; count++;
      v.traverse(o=>{
        if(!o.isMesh||!o.material)return;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>{
          if('clearcoat' in m)m.clearcoat=Math.max(Number(m.clearcoat)||0,.62);
          if('clearcoatRoughness' in m)m.clearcoatRoughness=Math.min(Number(m.clearcoatRoughness??.3),.18);
          if('metalness' in m)m.metalness=clamp(Number(m.metalness??.1),0,.88);
          if('roughness' in m)m.roughness=clamp(Number(m.roughness??.5),.16,.68);
          m.needsUpdate=true;
        });
      });
    });
    return count;
  }

  function addStreetDetail(THREE,scene){
    const group=new THREE.Group(); group.name='v320-street-detail';
    const poleMat=physical(THREE,0x292d33,.4,.72);
    const lampMat=physical(THREE,0xffdfac,.25,.05,{emissive:0xffb968,emissiveIntensity:2.6});
    for(let i=0;i<20;i++){
      const axis=i<10?'x':'z',p=-45+(i%10)*10;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,4.8,10),poleMat);
      if(axis==='x')pole.position.set(p,2.4,i%2?-10:10); else pole.position.set(i%2?-10:10,2.4,p);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),lampMat);
      lamp.position.copy(pole.position); lamp.position.y=4.76;
      group.add(pole,lamp);
      if(i%2===0){
        const light=new THREE.PointLight(0xffc47d,2.3,13,2);
        light.position.copy(lamp.position); light.position.y-=.08; group.add(light);
      }
    }
    const puddleMat=physical(THREE,0x23303a,.08,.18,{clearcoat:1,clearcoatRoughness:.025,transparent:true,opacity:.48});
    for(let i=0;i<18;i++){
      const p=new THREE.Mesh(new THREE.CircleGeometry(.45+(i%5)*.17,18),puddleMat.clone());
      p.rotation.x=-Math.PI/2; p.scale.y=.38; p.position.set(-42+(i*13)%84,.086,-38+(i*17)%76); group.add(p);
    }
    scene.add(group); return group;
  }

  function addAtmosphere(THREE,scene){
    const count=720,geo=new THREE.BufferGeometry(),arr=new Float32Array(count*3);
    for(let i=0;i<count;i++){arr[i*3]=-58+((i*37)%116);arr[i*3+1]=2+((i*19)%34);arr[i*3+2]=-58+((i*53)%116)}
    geo.setAttribute('position',new THREE.BufferAttribute(arr,3));
    const rain=new THREE.Points(geo,new THREE.PointsMaterial({color:0xb8d8ef,size:.028,transparent:true,opacity:.13,depthWrite:false}));
    rain.name='v320-moisture'; scene.add(rain); return rain;
  }

  function installAdaptiveDetail(api,detail,lighting,rain){
    let tier='high',last=performance.now(),samples=[];
    const apply=q=>{
      tier=q||tier;
      const perf=tier==='performance',balanced=tier==='balanced';
      detail.visible=!perf;
      lighting.visible=!perf;
      rain.visible=!(perf||balanced);
      return tier;
    };
    const readTier=()=>document.documentElement.dataset.tggMegaPreset||document.documentElement.dataset.tggMasterQuality||'high';
    apply(readTier());
    const mo=new MutationObserver(()=>apply(readTier())); mo.observe(document.documentElement,{attributes:true});
    const loop=now=>{
      requestAnimationFrame(loop);
      const dt=now-last; last=now;
      if(dt>0&&dt<180)samples.push(dt);
      if(samples.length>90)samples.shift();
      if(samples.length===90){
        const fps=1000/(samples.reduce((a,b)=>a+b,0)/samples.length);
        document.documentElement.dataset.tggV320FpsBand=fps<35?'low':fps<50?'mid':'high';
      }
      if(rain.visible){
        const a=rain.geometry.attributes.position.array;
        for(let i=1;i<a.length;i+=3){a[i]-=dt*.008*(5+(i%7));if(a[i]<.2)a[i]=34+(i%9)}
        rain.geometry.attributes.position.needsUpdate=true;
      }
    };
    requestAnimationFrame(loop);
    return {getTier:()=>tier,apply};
  }

  wait().then(api=>{
    try{
      const THREE=window.THREE,{scene}=api;
      tuneRenderer(THREE,api);
      const lighting=addLighting(THREE,scene);
      const humanCount=refineHumans(THREE,[api.player,api.npc,...(api.pedestrians||[])]);
      const vehicleCount=refineVehicles(THREE,[api.car,...(api.traffic||[])]);
      const detail=addStreetDetail(THREE,scene);
      const rain=addAtmosphere(THREE,scene);
      const adaptive=installAdaptiveDetail(api,detail,lighting,rain);
      document.documentElement.dataset.tggV320='on';
      const status={version:VERSION,mode:'threejs-realism-mega-pass',humanCount,vehicleCount,features:[
        'physical-lighting-balance','human-material-refinement','vehicle-clearcoat-refinement',
        'street-light-fixtures','quality-aware-local-lights','wet-surface-puddles',
        'atmospheric-moisture','adaptive-detail-scaling','aces-renderer-tuning'
      ]};
      window.TGGRealismMega={...status,getStatus:()=>({...status,quality:adaptive.getTier()}),setQuality:q=>adaptive.apply(q)};
      window.dispatchEvent(new CustomEvent('tgg:v320-ready',{detail:window.TGGRealismMega.getStatus()}));
    }catch(error){
      window.TGGRealismMega={version:VERSION,mode:'safe-fallback',error:String(error?.message||error),getStatus(){return {version:VERSION,mode:'safe-fallback'}}};
      document.documentElement.dataset.tggV320='fallback';
    }
  });
})();
