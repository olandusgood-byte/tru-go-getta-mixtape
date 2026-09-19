(()=>{
  const VERSION='V3.40 CITY WORLD MEGA PASS';
  const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()?resolve(window.TGG3D):requestAnimationFrame(t);t()});
  const physical=(THREE,color,rough=.6,metal=.05,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:metal,...extra});
  const rand=n=>{const x=Math.sin(n*12.9898)*43758.5453;return x-Math.floor(x)};

  function addCityDensity(THREE,scene){
    const group=new THREE.Group();group.name='v340-city-density';
    const concrete=physical(THREE,0x34383d,.82,.05),metal=physical(THREE,0x272b31,.36,.76),glass=physical(THREE,0x60798b,.16,.12,{clearcoat:.65,transparent:true,opacity:.38});
    for(let i=0;i<28;i++){
      const side=i%4,slot=Math.floor(i/4),x=side<2?-46+slot*14:(side===2?-53:53),z=side<2?(side===0?-48:48):-42+slot*14;
      const w=3.2+rand(i)*2.4,h=5+rand(i+3)*8,d=3.2+rand(i+7)*2.6;
      const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),concrete.clone());b.position.set(x,h/2,z);group.add(b);
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(w*.62,h*.56),glass.clone());
      if(side<2){pane.position.set(x,h*.57,z+(side===0?d/2+.02:-d/2-.02));pane.rotation.y=side===0?0:Math.PI}
      else{pane.position.set(x+(side===2?w/2+.02:-w/2-.02),h*.57,z);pane.rotation.y=side===2?Math.PI/2:-Math.PI/2}
      group.add(pane);
      if(i%3===0){
        const unit=new THREE.Mesh(new THREE.BoxGeometry(1.2,.45,.8),metal.clone());unit.position.set(x,h+.25,z);group.add(unit);
      }
    }
    const signMat=physical(THREE,0x0b1018,.3,.12,{emissive:0x1c7cff,emissiveIntensity:1.7});
    for(let i=0;i<12;i++){
      const s=new THREE.Mesh(new THREE.BoxGeometry(2.1,.55,.08),signMat.clone());
      s.position.set(-42+(i%6)*16,2.4,i<6?-31:31);group.add(s);
    }
    scene.add(group);return group;
  }

  function addStreetFurniture(THREE,scene){
    const group=new THREE.Group();group.name='v340-street-furniture';
    const dark=physical(THREE,0x24282e,.45,.62),wood=physical(THREE,0x5f4431,.72,.04);
    for(let i=0;i<18;i++){
      const x=-42+(i%9)*10.5,z=i<9?-13.2:13.2;
      const bench=new THREE.Group();
      const seat=new THREE.Mesh(new THREE.BoxGeometry(1.7,.12,.45),wood);seat.position.y=.55;bench.add(seat);
      const back=new THREE.Mesh(new THREE.BoxGeometry(1.7,.55,.1),wood);back.position.set(0,.88,-.18);bench.add(back);
      [-.65,.65].forEach(px=>{const leg=new THREE.Mesh(new THREE.BoxGeometry(.08,.55,.08),dark);leg.position.set(px,.28,0);bench.add(leg)});
      bench.position.set(x,0,z);group.add(bench);
    }
    for(let i=0;i<14;i++){
      const can=new THREE.Mesh(new THREE.CylinderGeometry(.22,.25,.7,12),dark.clone());
      can.position.set(-48+(i*7)%96,.35,-20+((i*17)%40));group.add(can);
    }
    scene.add(group);return group;
  }

  function addWeatherCycle(THREE,scene){
    const cloudGroup=new THREE.Group();cloudGroup.name='v340-clouds';
    const cloudMat=new THREE.MeshBasicMaterial({color:0xaeb7c3,transparent:true,opacity:.12,depthWrite:false});
    for(let i=0;i<18;i++){
      const c=new THREE.Mesh(new THREE.SphereGeometry(3+rand(i)*3,12,8),cloudMat.clone());
      c.scale.set(1.8+rand(i+2)*1.7,.35+.2*rand(i+4),1);
      c.position.set(-70+rand(i+5)*140,22+rand(i+6)*16,-70+rand(i+8)*140);cloudGroup.add(c);
    }
    scene.add(cloudGroup);
    let mode='overcast';
    const setWeather=next=>{mode=['clear','overcast','rain'].includes(next)?next:'overcast';cloudGroup.visible=mode!=='clear';document.documentElement.dataset.tggWeather=mode;return mode};
    setWeather('overcast');
    return {group:cloudGroup,setWeather,getWeather:()=>mode};
  }

  function upgradeInteriors(THREE){
    const upgraded=[];
    const run=()=>{
      const rts=window.TGGInteriors3D?.runtimes||[];
      rts.forEach((rt,i)=>{
        if(!rt?.scene||rt.scene.userData.v340Upgraded)return;
        rt.scene.userData.v340Upgraded=true;
        const rug=new THREE.Mesh(new THREE.PlaneGeometry(4.8,3),physical(THREE,[0x242a35,0x302620,0x1f2d24,0x251e30][i%4],.92,.01));
        rug.rotation.x=-Math.PI/2;rug.position.set(0,.02,1.2);rt.scene.add(rug);
        for(let j=0;j<6;j++){
          const lamp=new THREE.PointLight(j%2?0xffc47d:0x769dff,1.1,7,2);
          lamp.position.set(-5+j*2,3.4,-3+(j%2)*4);rt.scene.add(lamp);
        }
        upgraded.push(rt);
      });
      if(!upgraded.length)requestAnimationFrame(run);
    };
    run();return upgraded;
  }

  function syncCrowd(){
    const get=()=>window.TGGStreetPresence;
    let last='';
    const tick=()=>{
      requestAnimationFrame(tick);
      const sp=get();if(!sp)return;
      const q=document.documentElement.dataset.tggMasterQuality||'high';
      const next=q==='performance'?'LOW':q==='balanced'?'MEDIUM':'HIGH';
      if(next!==last){sp.setDensity?.(next);last=next}
    };requestAnimationFrame(tick);
  }

  wait().then(api=>{
    try{
      const THREE=window.THREE,{scene}=api;
      const density=addCityDensity(THREE,scene);
      const furniture=addStreetFurniture(THREE,scene);
      const weather=addWeatherCycle(THREE,scene);
      const interiors=upgradeInteriors(THREE);
      syncCrowd();
      let last=performance.now(),t=0;
      const animate=now=>{
        requestAnimationFrame(animate);
        const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
        weather.group.children.forEach((c,i)=>{c.position.x+=dt*(.35+(i%4)*.08);if(c.position.x>78)c.position.x=-78});
        const q=document.documentElement.dataset.tggMasterQuality||'high';
        density.visible=q!=='performance';furniture.visible=q!=='performance';
      };requestAnimationFrame(animate);
      document.documentElement.dataset.tggV340='on';
      const status={version:VERSION,features:['city-perimeter-density','storefront-signage','rooftop-detail','street-furniture','bench-trash-detail','dynamic-cloud-layer','weather-state-api','interior-lighting-pass','interior-rug-detail','crowd-quality-sync']};
      window.TGGCityWorldMega={...status,setWeather:weather.setWeather,getStatus:()=>({...status,weather:weather.getWeather(),interiorsUpgraded:interiors.length})};
      window.dispatchEvent(new CustomEvent('tgg:v340-ready',{detail:window.TGGCityWorldMega.getStatus()}));
    }catch(error){
      document.documentElement.dataset.tggV340='fallback';
      window.TGGCityWorldMega={version:VERSION,error:String(error?.message||error),getStatus(){return {version:VERSION,mode:'safe-fallback'}}};
    }
  });
})();
