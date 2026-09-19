(() => {
  const VERSION='V2.45 PHOTOREAL CORE BULK';
  const wait=()=>new Promise(resolve=>{
    const tick=()=>{
      if(window.TGG3D?.renderer&&window.TGG3D?.scene&&window.TGG3D?.camera)return resolve(window.TGG3D);
      requestAnimationFrame(tick);
    };
    tick();
  });

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function makeSky(THREE){
    const geometry=new THREE.SphereGeometry(190,48,24);
    const material=new THREE.ShaderMaterial({
      side:THREE.BackSide,
      depthWrite:false,
      uniforms:{
        topColor:{value:new THREE.Color(0x10192c)},
        horizonColor:{value:new THREE.Color(0x5d6b78)},
        bottomColor:{value:new THREE.Color(0x07090d)},
        offset:{value:14},
        exponent:{value:0.75}
      },
      vertexShader:`
        varying vec3 vWorldPosition;
        void main(){
          vec4 worldPosition=modelMatrix*vec4(position,1.0);
          vWorldPosition=worldPosition.xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main(){
          float h=normalize(vWorldPosition+vec3(0.0,offset,0.0)).y;
          float upper=pow(max(h,0.0),exponent);
          float lower=pow(max(-h,0.0),0.9);
          vec3 c=mix(horizonColor,topColor,upper);
          c=mix(c,bottomColor,lower);
          gl_FragColor=vec4(c,1.0);
        }`
    });
    const sky=new THREE.Mesh(geometry,material);
    sky.name='v245-realism-sky';
    return sky;
  }

  function addAtmosphere(THREE,scene){
    const sky=makeSky(THREE);
    scene.add(sky);

    const hazeMat=new THREE.MeshBasicMaterial({
      color:0x8b98a7,transparent:true,opacity:0.055,depthWrite:false,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending
    });
    for(let i=0;i<8;i++){
      const ring=new THREE.Mesh(new THREE.CylinderGeometry(28+i*9,30+i*9,2.2,48,1,true),hazeMat.clone());
      ring.material.opacity=0.035+(i*.004);
      ring.position.y=1.2+i*.45;
      ring.name='v245-haze-'+i;
      scene.add(ring);
    }

    const fill=new THREE.DirectionalLight(0x9fb8d8,0.36);
    fill.position.set(-30,24,-16);
    fill.name='v245-sky-fill';
    scene.add(fill);

    const warm=new THREE.DirectionalLight(0xffd0a0,0.52);
    warm.position.set(28,16,10);
    warm.name='v245-warm-key';
    warm.castShadow=true;
    warm.shadow.mapSize.set(2048,2048);
    warm.shadow.camera.near=0.5;
    warm.shadow.camera.far=120;
    warm.shadow.bias=-0.00022;
    scene.add(warm);
  }

  function upgradeMaterials(THREE,scene,renderer){
    const maxAniso=renderer.capabilities.getMaxAnisotropy?.()||1;
    let materialCount=0;
    scene.traverse(obj=>{
      if(!obj?.isMesh)return;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      mats.filter(Boolean).forEach(mat=>{
        materialCount++;
        if('roughness' in mat){
          const y=obj.position?.y||0;
          const low=y<0.35;
          if(low)mat.roughness=clamp(Number(mat.roughness??0.7),0.58,0.9);
          else mat.roughness=clamp(Number(mat.roughness??0.6),0.24,0.82);
        }
        if('metalness' in mat)mat.metalness=clamp(Number(mat.metalness??0),0,0.88);
        if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(Number(mat.envMapIntensity)||0,1.15);
        ['map','normalMap','roughnessMap','metalnessMap','aoMap'].forEach(key=>{
          const tex=mat[key];
          if(tex&&'anisotropy' in tex)tex.anisotropy=maxAniso;
        });
        mat.needsUpdate=true;
      });
      obj.castShadow=obj.castShadow!==false;
      obj.receiveShadow=true;
    });
    return materialCount;
  }

  function addRoadSurface(THREE,scene){
    const roadMaterial=new THREE.MeshPhysicalMaterial({
      color:0x11151b,
      roughness:0.48,
      metalness:0.18,
      clearcoat:0.18,
      clearcoatRoughness:0.38
    });
    const lanes=[
      {w:7.06,d:111.8,x:-24,z:0},{w:7.06,d:111.8,x:0,z:0},{w:7.06,d:111.8,x:24,z:0},
      {w:111.8,d:7.06,x:0,z:-24},{w:111.8,d:7.06,x:0,z:0},{w:111.8,d:7.06,x:0,z:24}
    ];
    lanes.forEach((r,i)=>{
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(r.w,r.d),roadMaterial.clone());
      mesh.rotation.x=-Math.PI/2;
      mesh.position.set(r.x,0.071,r.z);
      mesh.receiveShadow=true;
      mesh.name='v245-road-overlay-'+i;
      scene.add(mesh);
    });
  }

  function addGroundMicroDetail(THREE,scene){
    const geo=new THREE.BufferGeometry();
    const pts=[];
    for(let i=0;i<650;i++){
      const x=((i*47)%109)-54.5;
      const z=((i*83)%107)-53.5;
      const road=(Math.abs(x)<4||Math.abs(z)<4||Math.abs(Math.abs(x)-24)<4||Math.abs(Math.abs(z)-24)<4);
      if(road)continue;
      pts.push(x,0.09,z);
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const dust=new THREE.Points(geo,new THREE.PointsMaterial({
      color:0x59616c,size:0.035,sizeAttenuation:true,transparent:true,opacity:0.32
    }));
    dust.name='v245-ground-microdetail';
    scene.add(dust);
  }

  function tuneRenderer(THREE,renderer,camera){
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.06;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if('useLegacyLights' in renderer)renderer.useLegacyLights=false;
    camera.near=0.08;
    camera.far=260;
    camera.updateProjectionMatrix();
  }

  function installAdaptiveQuality(renderer){
    const tiers={
      ultra:{ratio:2,shadow:true,exposure:1.06},
      high:{ratio:1.6,shadow:true,exposure:1.04},
      balanced:{ratio:1.25,shadow:true,exposure:1.02},
      performance:{ratio:1,shadow:false,exposure:1.0}
    };
    let quality=(innerWidth<720||navigator.hardwareConcurrency<=4)?'balanced':'ultra';
    const apply=tier=>{
      if(!tiers[tier])return quality;
      quality=tier;
      const t=tiers[tier];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,t.ratio));
      renderer.shadowMap.enabled=t.shadow;
      renderer.toneMappingExposure=t.exposure;
      renderer.domElement.dataset.tggQuality=tier;
      return quality;
    };
    apply(quality);
    return {apply,get:()=>quality,tiers};
  }

  function addCinematicOverlay(){
    const el=document.createElement('div');
    el.id='v245CinematicOverlay';
    el.innerHTML='<i class="v245-vignette"></i><i class="v245-grain"></i><i class="v245-bloom"></i>';
    document.body.appendChild(el);
  }

  wait().then(api=>{
    try {
    const THREE=window.THREE;
    const {renderer,scene,camera}=api;
    tuneRenderer(THREE,renderer,camera);
    addAtmosphere(THREE,scene);
    addRoadSurface(THREE,scene);
    addGroundMicroDetail(THREE,scene);
    const materialCount=upgradeMaterials(THREE,scene,renderer);
    const quality=installAdaptiveQuality(renderer);
    addCinematicOverlay();

    const status={
      version:VERSION,
      mode:'photoreal-core',
      materialsUpgraded:materialCount,
      quality:quality.get(),
      features:[
        'aces-filmic','srgb-output','adaptive-pixel-ratio','2048-shadow-key',
        'physical-road-clearcoat','atmospheric-sky','distance-haze',
        'material-roughness-pass','texture-anisotropy','cinematic-overlay'
      ]
    };

    window.TGGRealism={
      ...status,
      setQuality:tier=>{status.quality=quality.apply(tier);return status.quality},
      getStatus:()=>({...status,quality:quality.get(),renderer:{
        pixelRatio:renderer.getPixelRatio(),
        shadows:renderer.shadowMap.enabled,
        exposure:renderer.toneMappingExposure
      }})
    };
    document.documentElement.dataset.tggRealism='v245';
    window.dispatchEvent(new CustomEvent('tgg:realism-ready',{detail:window.TGGRealism.getStatus()}));
    } catch(error) {
      window.TGGRealism={version:VERSION,mode:'safe-fallback',error:String(error?.message||error),getStatus(){return {version:VERSION,mode:'safe-fallback'}}};
      document.documentElement.dataset.tggRealism='fallback';
    }
  }).catch(()=>{ document.documentElement.dataset.tggRealism='fallback'; });
})();