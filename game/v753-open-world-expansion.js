(()=>{
  const VERSION='7.53.1';
  const KEY='tgg-v753-open-world';
  const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()?resolve(window.TGG3D):requestAnimationFrame(t);t()});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function zoneFor(s){
    const x=Number(s?.x)||50,y=Number(s?.y)||50;
    if(y<18)return x<45?'PINE COUNTRY':'NORTH RIDGE';
    if(y>82)return x<48?'LAKE ROAD':'SOUTH WOODS';
    if(x<18)return 'WEST COUNTY';
    if(x>82)return 'INDUSTRIAL BELT';
    if(x>32&&x<68&&y>28&&y<72)return 'DOWNTOWN';
    return 'OUTER CITY';
  }
  function run(){
    const api=window.TGG3D;
    const checks={runtime:!!api?.scene,scale:Number(api?.WORLD_SCALE)>=2.5,far:Number(api?.camera?.far)>=500};
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    const r={version:VERSION,layer:'OPEN-WORLD',ok:!failed.length,checks,failed,zone:zoneFor(window.TGGGame?.getState?.()),at:new Date().toISOString(),mutationPolicy:'local-only'};
    try{localStorage.setItem(KEY,JSON.stringify(r))}catch{}
    return r;
  }
  wait().then(api=>{
    const THREE=window.THREE,{scene,camera,WORLD_HALF}=api;
    const group=new THREE.Group();group.name='TGG_OPEN_WORLD_V753';scene.add(group);

    const terrainMat=new THREE.MeshStandardMaterial({color:0x101915,roughness:.97,metalness:.01});
    const terrain=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF*2.25,WORLD_HALF*2.25,1,1),terrainMat);
    terrain.rotation.x=-Math.PI/2;terrain.position.y=-.045;terrain.receiveShadow=true;group.add(terrain);

    const roadMat=new THREE.MeshStandardMaterial({color:0x151a20,roughness:.74,metalness:.16});
    const shoulderMat=new THREE.MeshStandardMaterial({color:0x2a2d2a,roughness:.95});
    const stripeMat=new THREE.MeshStandardMaterial({color:0xf5d95c,emissive:0x5f5318,emissiveIntensity:.7,roughness:.62});
    const addRoad=(x,z,w,d,rot=0)=>{
      const g=new THREE.Group();
      const shoulder=new THREE.Mesh(new THREE.BoxGeometry(w+5,.055,d+5),shoulderMat);shoulder.position.y=.01;g.add(shoulder);
      const road=new THREE.Mesh(new THREE.BoxGeometry(w,.075,d),roadMat);road.position.y=.045;road.receiveShadow=true;g.add(road);
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.14,w*.018),.085,d*.94),stripeMat);stripe.position.y=.09;g.add(stripe);
      g.position.set(x,0,z);g.rotation.y=rot;group.add(g);return g;
    };
    addRoad(0,-104,9,220,Math.PI/2);
    addRoad(0,104,9,220,Math.PI/2);
    addRoad(-106,0,9,220,0);
    addRoad(106,0,9,220,0);
    addRoad(-66,-66,8,170,Math.PI/4);
    addRoad(68,68,8,170,Math.PI/4);

    const trunkMat=new THREE.MeshStandardMaterial({color:0x4c3526,roughness:.98});
    const pineMat=new THREE.MeshStandardMaterial({color:0x173927,roughness:.94});
    const pineDark=new THREE.MeshStandardMaterial({color:0x102b1d,roughness:.96});
    const addPine=(x,z,s=1)=>{
      const g=new THREE.Group();
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.24*s,.34*s,2.8*s,7),trunkMat);trunk.position.y=1.4*s;g.add(trunk);
      const crown1=new THREE.Mesh(new THREE.ConeGeometry(1.6*s,4.3*s,8),pineMat);crown1.position.y=4.0*s;g.add(crown1);
      const crown2=new THREE.Mesh(new THREE.ConeGeometry(1.25*s,3.5*s,8),pineDark);crown2.position.y=5.5*s;g.add(crown2);
      g.position.set(x,0,z);group.add(g);
    };
    for(let i=0;i<150;i++){
      const a=i*2.3999632297;
      const radius=74+(i%37)*1.65;
      const x=Math.cos(a)*radius,z=Math.sin(a)*radius;
      if(Math.abs(x)<18||Math.abs(z)<18)continue;
      addPine(x,z,.65+(i%5)*.11);
    }
    for(let i=0;i<46;i++)addPine(-118+(i%12)*6,-122+Math.floor(i/12)*9,.72+(i%4)*.1);
    for(let i=0;i<42;i++)addPine(82+(i%10)*6,86+Math.floor(i/10)*8,.68+(i%5)*.09);

    const hillMat=new THREE.MeshStandardMaterial({color:0x1a2420,roughness:1});
    for(let i=0;i<18;i++){
      const angle=(i/18)*Math.PI*2;
      const r=WORLD_HALF+28+(i%3)*9;
      const hill=new THREE.Mesh(new THREE.ConeGeometry(15+(i%4)*4,28+(i%5)*7,9),hillMat.clone());
      hill.position.set(Math.cos(angle)*r,8+(i%3)*2,Math.sin(angle)*r);
      hill.rotation.y=angle*.7;group.add(hill);
    }

    const waterMat=new THREE.MeshPhysicalMaterial({color:0x0b2432,roughness:.2,metalness:.08,transparent:true,opacity:.84,clearcoat:.5});
    const lake=new THREE.Mesh(new THREE.CircleGeometry(24,48),waterMat);lake.rotation.x=-Math.PI/2;lake.position.set(-82,.02,92);group.add(lake);

    const lampPoleMat=new THREE.MeshStandardMaterial({color:0x343a43,metalness:.8,roughness:.3});
    const lampGlowMat=new THREE.MeshStandardMaterial({color:0xffdca0,emissive:0xffb34d,emissiveIntensity:4});
    for(let i=-5;i<=5;i++){
      const x=i*20;
      [-104,104].forEach(z=>{
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.11,4.5,8),lampPoleMat);pole.position.set(x,2.25,z);group.add(pole);
        const lamp=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),lampGlowMat);lamp.position.set(x,4.45,z);group.add(lamp);
        const light=new THREE.PointLight(0xffca82,3.2,14,2);light.position.set(x,4.4,z);group.add(light);
      });
    }

    const hud=document.createElement('aside');hud.id='v753WorldHud';
    hud.innerHTML='<small>OPEN WORLD</small><b id="v753Zone">DOWNTOWN</b><span>HIGHWAYS • WOODS • COUNTRY • CITY</span>';
    document.body.appendChild(hud);
    setInterval(()=>{
      const zone=zoneFor(window.TGGGame?.getState?.());
      const el=document.getElementById('v753Zone');if(el)el.textContent=zone;
      document.documentElement.dataset.tggWorldZone=zone.toLowerCase().replace(/\s+/g,'-');
    },350);

    camera.far=Math.max(camera.far,650);camera.updateProjectionMatrix();
    document.documentElement.dataset.tggV753='on';
    window.TGGOpenWorld={version:VERSION,group,zoneFor,getStatus:()=>({version:VERSION,worldScale:api.WORLD_SCALE,worldHalf:api.WORLD_HALF,forestObjects:group.children.length,features:['expanded-world-scale','outer-highway-loop','country-roads','pine-forest-biomes','distant-mountain-ring','lake-road-zone','roadside-lighting','spread-destinations','long-sightlines']})};
    window.TGGV753={version:VERSION,run,snapshot:()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}};
    run();
    window.dispatchEvent(new CustomEvent('tgg:v753-ready',{detail:window.TGGOpenWorld.getStatus()}));
  }).catch(error=>{
    window.TGGV753={version:VERSION,run:()=>({version:VERSION,ok:false,error:String(error?.message||error)}),snapshot:()=>null};
  });
})();