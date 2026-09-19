(()=>{
  'use strict';
  const SPAN='V5.62-V5.66';
  const wait=()=>new Promise(resolve=>{const tick=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve():requestAnimationFrame(tick);tick()});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

  function mesh(THREE,geo,mat,x=0,y=0,z=0){
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;
  }

  function addCharacterDetail(THREE,person,accent=0xc7ff00){
    if(!person||person.getObjectByName('TGG_V562_CHARACTER_DETAIL'))return person?.getObjectByName('TGG_V562_CHARACTER_DETAIL')||null;
    const g=new THREE.Group();g.name='TGG_V562_CHARACTER_DETAIL';
    const skin=new THREE.MeshStandardMaterial({color:0x9d6a49,roughness:.72});
    const dark=new THREE.MeshStandardMaterial({color:0x11141c,roughness:.82});
    const cloth=new THREE.MeshStandardMaterial({color:accent,roughness:.58,metalness:.06});
    const white=new THREE.MeshStandardMaterial({color:0xf1f3f6,roughness:.5});
    const metal=new THREE.MeshStandardMaterial({color:0xe2c66d,metalness:.92,roughness:.18});

    const nose=mesh(THREE,new THREE.SphereGeometry(.105,10,8),skin,0,3.57,.55);nose.scale.set(.75,1,.75);g.add(nose);
    [-.16,.16].forEach(x=>{
      const eye=mesh(THREE,new THREE.SphereGeometry(.045,10,8),dark,x,3.72,.55);g.add(eye);
      const brow=mesh(THREE,new THREE.BoxGeometry(.13,.025,.025),dark,x,3.82,.57);g.add(brow);
    });
    const mouth=mesh(THREE,new THREE.BoxGeometry(.22,.028,.025),dark,0,3.42,.57);g.add(mouth);
    const collar=mesh(THREE,new THREE.TorusGeometry(.28,.035,8,20,Math.PI),white,0,2.6,.45);collar.rotation.x=Math.PI/2;g.add(collar);
    const chain=mesh(THREE,new THREE.TorusGeometry(.24,.025,8,24,Math.PI),metal,0,2.45,.5);chain.rotation.x=Math.PI/2;g.add(chain);
    const jacketL=mesh(THREE,new THREE.BoxGeometry(.16,1.1,.12),cloth,-.52,2.15,.37);jacketL.rotation.z=.08;g.add(jacketL);
    const jacketR=mesh(THREE,new THREE.BoxGeometry(.16,1.1,.12),cloth,.52,2.15,.37);jacketR.rotation.z=-.08;g.add(jacketR);
    const belt=mesh(THREE,new THREE.BoxGeometry(1.0,.1,.12),dark,0,1.42,.38);g.add(belt);
    const buckle=mesh(THREE,new THREE.BoxGeometry(.18,.12,.08),metal,0,1.42,.46);g.add(buckle);
    person.add(g);return g;
  }

  function addStorefronts(THREE,scene){
    const root=new THREE.Group();root.name='TGG_V563_STOREFRONTS';
    const frame=new THREE.MeshStandardMaterial({color:0x2a303a,metalness:.68,roughness:.3});
    const glass=new THREE.MeshPhysicalMaterial({color:0x31506a,roughness:.12,metalness:.18,transparent:true,opacity:.72,transmission:.08});
    const signs=[0xc7ff00,0x48d7ff,0xff466d,0xc56cff,0xffc857,0x4cff88];
    const spots=[[-18,-18,0],[-8,-18,0],[8,-18,0],[18,-18,0],[-18,18,Math.PI],[-8,18,Math.PI],[8,18,Math.PI],[18,18,Math.PI]];
    let signsCount=0,props=0;
    spots.forEach((s,i)=>{
      const g=new THREE.Group();g.position.set(s[0],0,s[1]);g.rotation.y=s[2];
      const facade=mesh(THREE,new THREE.BoxGeometry(6.4,4.2,.4),frame,0,2.1,0);g.add(facade);
      const front=mesh(THREE,new THREE.BoxGeometry(4.8,2.55,.08),glass,0,1.45,.24);g.add(front);
      const signMat=new THREE.MeshStandardMaterial({color:signs[i%signs.length],emissive:signs[i%signs.length],emissiveIntensity:2.3,roughness:.28});
      const sign=mesh(THREE,new THREE.BoxGeometry(4.4,.62,.12),signMat,0,3.45,.27);g.add(sign);signsCount++;
      const awning=mesh(THREE,new THREE.BoxGeometry(4.9,.12,.95),frame,0,2.78,.62);g.add(awning);
      for(let p=-1;p<=1;p++){
        const bollard=mesh(THREE,new THREE.CylinderGeometry(.09,.12,.72,10),frame,p*1.25,.36,1.25);g.add(bollard);props++;
      }
      root.add(g);
    });
    const streetPropMat=new THREE.MeshStandardMaterial({color:0x4c5563,metalness:.76,roughness:.38});
    [[-5,-13],[5,-13],[-5,13],[5,13],[-13,-5],[-13,5],[13,-5],[13,5]].forEach(([x,z],i)=>{
      const can=mesh(THREE,new THREE.CylinderGeometry(.32,.38,.75,12),streetPropMat,x,.38,z);root.add(can);props++;
      const lid=mesh(THREE,new THREE.CylinderGeometry(.35,.35,.08,12),streetPropMat,x,.79,z);root.add(lid);props++;
      if(i%2===0){
        const post=mesh(THREE,new THREE.CylinderGeometry(.05,.07,2.2,8),streetPropMat,x+.55,1.1,z+.35);root.add(post);props++;
        const sign=mesh(THREE,new THREE.BoxGeometry(.72,.46,.06),new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x789900,emissiveIntensity:1.2}),x+.55,2.05,z+.35);root.add(sign);props++;
      }
    });
    scene.add(root);return{root,storefronts:spots.length,signs:signsCount,props};
  }

  function addVegetation(THREE,scene){
    const root=new THREE.Group();root.name='TGG_V564_VEGETATION';
    const trunkMat=new THREE.MeshStandardMaterial({color:0x5b3e2a,roughness:.94});
    const leafA=new THREE.MeshStandardMaterial({color:0x28543a,roughness:.86});
    const leafB=new THREE.MeshStandardMaterial({color:0x356847,roughness:.84});
    const planterMat=new THREE.MeshStandardMaterial({color:0x343943,roughness:.72,metalness:.18});
    const spots=[[-12,-12],[12,-12],[-12,12],[12,12],[-12,-28],[12,-28],[-12,28],[12,28],[-28,-12],[-28,12],[28,-12],[28,12],[-36,0],[36,0],[0,-36],[0,36]];
    spots.forEach(([x,z],i)=>{
      const g=new THREE.Group();g.position.set(x,0,z);
      const planter=mesh(THREE,new THREE.CylinderGeometry(.62,.74,.55,12),planterMat,0,.28,0);g.add(planter);
      const trunk=mesh(THREE,new THREE.CylinderGeometry(.11,.16,2.45,8),trunkMat,0,1.7,0);g.add(trunk);
      const crown1=mesh(THREE,new THREE.IcosahedronGeometry(.88,1),i%2?leafA:leafB,0,3.05,0);crown1.scale.set(1.05,.9,1);g.add(crown1);
      const crown2=mesh(THREE,new THREE.IcosahedronGeometry(.62,1),i%2?leafB:leafA,.25,3.65,.12);g.add(crown2);
      root.add(g);
    });
    scene.add(root);return{root,trees:spots.length,objects:root.children.reduce((n,g)=>n+g.children.length,0)};
  }

  function tuneCinematic(THREE,api){
    const {scene,renderer,camera}=api;
    let shadowLights=0;
    scene.traverse(o=>{
      if(o?.isLight&&o.castShadow){
        o.shadow.mapSize.set(2048,2048);
        o.shadow.bias=-.00015;
        o.shadow.normalBias=.02;
        shadowLights++;
      }
    });
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const baseFov=camera.fov||58;
    let last=performance.now();
    const loop=now=>{
      requestAnimationFrame(loop);
      const dt=Math.min(.05,(now-last)/1000);last=now;
      const speed=Math.abs(api.getVehicleDynamics?.()?.speed||0);
      const inVehicle=!!window.TGGGame?.getState?.()?.inVehicle;
      const target=clamp(baseFov+(inVehicle?speed*.45:0),baseFov,68);
      camera.fov+= (target-camera.fov)*Math.min(1,dt*4.5);
      camera.updateProjectionMatrix();
    };
    requestAnimationFrame(loop);
    return{shadowLights,baseFov};
  }

  function addAtmosphere(THREE,scene){
    const root=new THREE.Group();root.name='TGG_V566_ATMOSPHERE';
    const pts=[];
    for(let i=0;i<220;i++){
      const a=i*2.39996323,r=8+(i%37)*1.25;
      pts.push(Math.cos(a)*r,.35+(i%13)*.38,Math.sin(a)*r);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const mat=new THREE.PointsMaterial({color:0xb8c8d8,size:.035,transparent:true,opacity:.22,depthWrite:false});
    const dust=new THREE.Points(geo,mat);root.add(dust);
    scene.add(root);
    let t=0,last=performance.now();
    const loop=now=>{requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;dust.rotation.y=t*.012;mat.opacity=.17+Math.sin(t*.35)*.035};
    requestAnimationFrame(loop);
    return{root,particles:220};
  }

  wait().then(()=>{
    try{
      const THREE=window.THREE,api=window.TGG3D;
      const playerDetail=addCharacterDetail(THREE,api.player,0xc7ff00);
      const npcDetail=addCharacterDetail(THREE,api.npc,0x6f7cff);
      const storefront=addStorefronts(THREE,api.scene);
      const vegetation=addVegetation(THREE,api.scene);
      const cinematic=tuneCinematic(THREE,api);
      const atmosphere=addAtmosphere(THREE,api.scene);
      document.documentElement.dataset.tggGraphicsMega='v562-v566';
      const status=()=>({
        span:SPAN,
        versions:['V5.62','V5.63','V5.64','V5.65','V5.66'],
        playerDetailParts:playerDetail?.children?.length||0,
        npcDetailParts:npcDetail?.children?.length||0,
        storefronts:storefront.storefronts,
        storefrontSigns:storefront.signs,
        streetProps:storefront.props,
        trees:vegetation.trees,
        vegetationObjects:vegetation.objects,
        shadowLights:cinematic.shadowLights,
        atmosphereParticles:atmosphere.particles,
        ok:(playerDetail?.children?.length||0)>=10&&
           (npcDetail?.children?.length||0)>=10&&
           storefront.storefronts===8&&storefront.signs===8&&storefront.props>=20&&
           vegetation.trees===16&&vegetation.objects>=64&&
           cinematic.shadowLights>=1&&atmosphere.particles===220
      });
      window.TGGGraphicsMega={span:SPAN,getStatus:status};
      window.dispatchEvent(new CustomEvent('tgg:v562-v566-ready',{detail:status()}));
    }catch(error){
      document.documentElement.dataset.tggGraphicsMega='fallback';
      window.TGGGraphicsMega={span:SPAN,getStatus:()=>({span:SPAN,ok:false,error:String(error?.message||error)})};
    }
  });
})();