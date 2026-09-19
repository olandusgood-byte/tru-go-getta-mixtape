(()=>{
  'use strict';
  const VERSION='V5.61';
  const FEATURES=['vehicle-detail-kit','facade-window-depth','building-entry-detail','rooftop-silhouettes','city-emissive-layer'];
  const wait=()=>new Promise(resolve=>{const tick=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve():requestAnimationFrame(tick);tick()});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

  function addVehicleDetail(THREE,car){
    if(!car||car.getObjectByName('TGG_V561_CAR_DETAIL'))return car?.getObjectByName('TGG_V561_CAR_DETAIL')||null;
    const g=new THREE.Group();g.name='TGG_V561_CAR_DETAIL';
    const chrome=new THREE.MeshStandardMaterial({color:0xbfc7d2,metalness:.94,roughness:.16});
    const black=new THREE.MeshStandardMaterial({color:0x090b0f,metalness:.72,roughness:.24});
    const red=new THREE.MeshStandardMaterial({color:0xff3038,metalness:.55,roughness:.3,emissive:0x4a0004,emissiveIntensity:.5});
    const plateMat=new THREE.MeshStandardMaterial({color:0xe9edf1,metalness:.12,roughness:.48});
    const glowMat=new THREE.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.22,depthWrite:false});

    const grille=new THREE.Mesh(new THREE.BoxGeometry(.09,.46,1.42),black);grille.position.set(2.18,.86,0);g.add(grille);
    for(let z=-.55;z<=.55;z+=.275){const slat=new THREE.Mesh(new THREE.BoxGeometry(.03,.34,.035),chrome);slat.position.set(2.235,.87,z);g.add(slat)}
    const splitter=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,2.18),black);splitter.position.set(2.08,.48,0);g.add(splitter);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(.3,.16,2.0),black);diffuser.position.set(-2.08,.48,0);g.add(diffuser);
    [-1.04,1.04].forEach(z=>{const skirt=new THREE.Mesh(new THREE.BoxGeometry(3.7,.13,.08),black);skirt.position.set(0,.48,z);g.add(skirt)});
    const plate=new THREE.Mesh(new THREE.BoxGeometry(.04,.34,.76),plateMat);plate.position.set(-2.18,.82,0);g.add(plate);

    const wheels=car.userData?.wheels||[];
    wheels.forEach((wheel,i)=>{
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.35,24),chrome);
      rim.rotation.x=Math.PI/2;rim.position.copy(wheel.position);g.add(rim);
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.365,24),new THREE.MeshStandardMaterial({color:0x6d737d,metalness:.88,roughness:.24}));
      disc.rotation.x=Math.PI/2;disc.position.copy(wheel.position);g.add(disc);
      const caliper=new THREE.Mesh(new THREE.BoxGeometry(.09,.24,.08),red);
      caliper.position.set(wheel.position.x,wheel.position.y+.16,wheel.position.z+(wheel.position.z>0?.2:-.2));g.add(caliper);
    });

    const underglow=new THREE.Mesh(new THREE.PlaneGeometry(3.8,1.65),glowMat);
    underglow.rotation.x=-Math.PI/2;underglow.position.set(0,.055,0);g.add(underglow);
    car.add(g);
    return g;
  }

  function buildingDefs(){
    const defs=[];let bi=0;
    const blocks=[-40,-32,-16,-8,8,16,32,40];
    for(const x of blocks)for(const z of blocks){
      const h=7+((Math.abs(x*13+z*7)+bi*3)%22);
      const w=5+((bi*5)%5);
      const d=5+((bi*7)%4);
      defs.push({x,z,h,w,d,i:bi++});
    }
    return defs;
  }

  function addFacadeDetail(THREE,scene){
    const root=new THREE.Group();root.name='TGG_V561_FACADE_DETAIL';
    const windowMat=new THREE.MeshStandardMaterial({color:0x8fdcff,emissive:0x2c8fb8,emissiveIntensity:1.8,roughness:.26,metalness:.12});
    const warmMat=new THREE.MeshStandardMaterial({color:0xffd095,emissive:0xb65f22,emissiveIntensity:1.4,roughness:.34,metalness:.08});
    const frameMat=new THREE.MeshStandardMaterial({color:0x252b35,metalness:.72,roughness:.32});
    const doorMat=new THREE.MeshPhysicalMaterial({color:0x17202b,roughness:.18,metalness:.32,transparent:true,opacity:.78,transmission:.08});
    const roofMat=new THREE.MeshStandardMaterial({color:0x39414d,metalness:.72,roughness:.38});

    let windows=0,doors=0,rooftops=0,awnings=0;
    for(const b of buildingDefs()){
      const floors=Math.max(2,Math.floor((b.h-2)/2));
      const cols=Math.max(2,Math.floor((b.w-.8)/1.3));
      for(let fy=0;fy<floors;fy++){
        const y=1.8+fy*1.85;if(y>b.h-.7)continue;
        for(let c=0;c<cols;c++){
          const x=b.x-(cols-1)*.54+c*1.08;
          const m=new THREE.Mesh(new THREE.BoxGeometry(.62,.58,.035),(b.i+fy+c)%4===0?warmMat:windowMat);
          m.position.set(x,y,b.z+b.d/2+.025);root.add(m);windows++;
        }
      }
      const sideCols=Math.max(2,Math.floor((b.d-.8)/1.45));
      for(let fy=0;fy<Math.min(floors,7);fy++){
        const y=1.8+fy*1.85;if(y>b.h-.7)continue;
        for(let c=0;c<sideCols;c++){
          const z=b.z-(sideCols-1)*.58+c*1.16;
          const m=new THREE.Mesh(new THREE.BoxGeometry(.035,.54,.66),(b.i+fy+c)%5===0?warmMat:windowMat);
          m.position.set(b.x+b.w/2+.025,y,z);root.add(m);windows++;
        }
      }

      const door=new THREE.Mesh(new THREE.BoxGeometry(1.15,1.85,.08),doorMat);
      door.position.set(b.x,.94,b.z+b.d/2+.075);root.add(door);doors++;
      const canopy=new THREE.Mesh(new THREE.BoxGeometry(2.25,.16,1.05),frameMat);
      canopy.position.set(b.x,2.0,b.z+b.d/2+.45);root.add(canopy);awnings++;
      const rooftop=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.3,b.w*.34),.65,Math.max(1.1,b.d*.3)),roofMat);
      rooftop.position.set(b.x,b.h+.32,b.z);root.add(rooftop);rooftops++;
      if(b.i%3===0){
        const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,2.2,8),frameMat);
        antenna.position.set(b.x+.5,b.h+1.4,b.z-.35);root.add(antenna);
      }
    }
    scene.add(root);
    return {root,windows,doors,rooftops,awnings};
  }

  wait().then(()=>{
    try{
      const THREE=window.THREE,api=window.TGG3D,scene=api.scene,car=api.car;
      const carDetail=addVehicleDetail(THREE,car);
      const facade=addFacadeDetail(THREE,scene);
      document.documentElement.dataset.tggVisuals='v561';
      const status=()=>({
        version:VERSION,
        features:[...FEATURES],
        vehicleParts:carDetail?.children?.length||0,
        facadeWindows:facade.windows,
        facadeDoors:facade.doors,
        rooftopStructures:facade.rooftops,
        awnings:facade.awnings,
        ok:(carDetail?.children?.length||0)>=18&&facade.windows>=250&&facade.doors===64&&facade.rooftops===64
      });
      window.TGGWorldVisuals={version:VERSION,getStatus:status};
      window.dispatchEvent(new CustomEvent('tgg:v561-visuals-ready',{detail:status()}));
    }catch(error){
      window.TGGWorldVisuals={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(error?.message||error)})};
      document.documentElement.dataset.tggVisuals='fallback';
    }
  });
})();