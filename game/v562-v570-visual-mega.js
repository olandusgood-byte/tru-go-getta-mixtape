(()=>{
  'use strict';
  const VERSION='V5.70';
  const LAYERS=['V5.62','V5.63','V5.64','V5.65','V5.66','V5.67','V5.68','V5.69','V5.70'];
  const wait=()=>new Promise(resolve=>{const tick=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve():requestAnimationFrame(tick);tick()});
  wait().then(()=>{
    try{
      const THREE=window.THREE,api=window.TGG3D,scene=api.scene,car=api.car;
      const root=new THREE.Group();root.name='TGG_V562_V570_VISUAL_MEGA';scene.add(root);

      const reflectorMat=new THREE.MeshStandardMaterial({color:0xf7f4d8,emissive:0xe9d36b,emissiveIntensity:1.25,roughness:.34,metalness:.3});
      let reflectors=0;
      for(const lane of [-24,0,24])for(let p=-44;p<=44;p+=4){
        const a=new THREE.Mesh(new THREE.BoxGeometry(.13,.045,.32),reflectorMat);a.position.set(lane+.72,.095,p);root.add(a);reflectors++;
        const b=new THREE.Mesh(new THREE.BoxGeometry(.32,.045,.13),reflectorMat);b.position.set(p,.095,lane+.72);root.add(b);reflectors++;
      }

      const metal=new THREE.MeshStandardMaterial({color:0x3e4652,metalness:.78,roughness:.34});
      const red=new THREE.MeshStandardMaterial({color:0xb7332f,metalness:.35,roughness:.48});
      const binMat=new THREE.MeshStandardMaterial({color:0x1c252b,metalness:.45,roughness:.62});
      let furniture=0;
      function hydrant(x,z){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.22,.27,.72,12),red);body.position.y=.36;g.add(body);const cap=new THREE.Mesh(new THREE.CylinderGeometry(.29,.23,.18,12),red);cap.position.y=.79;g.add(cap);const side=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.45,10),metal);side.rotation.z=Math.PI/2;side.position.set(0,.48,0);g.add(side);g.position.set(x,0,z);root.add(g);furniture++}
      function bin(x,z){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.34,.3,.72,12),binMat);body.position.y=.36;g.add(body);const lid=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.09,12),metal);lid.position.y=.75;g.add(lid);g.position.set(x,0,z);root.add(g);furniture++}
      [[-6,-18],[6,18],[-18,6],[18,-6],[-30,-6],[30,6],[-6,30],[6,-30]].forEach(v=>hydrant(...v));
      [[-10,-5],[10,5],[-5,10],[5,-10],[-28,5],[28,-5],[-5,-28],[5,28]].forEach(v=>bin(...v));
      [-12,-8,-4,4,8,12].forEach(x=>{const post=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,.82,8),metal);post.position.set(x,.41,5.9);root.add(post);furniture++});

      const signEntries=[['STUDIO ROW',-24,-9,0xff466d],['MIXTAPE AVE',24,9,0x48d7ff],['MEDIA DISTRICT',0,31,0xc56cff],['DOWNTOWN',0,-7,0xc7ff00]];
      const signs=[];
      function textSprite(text,color){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(4,7,12,.9)';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#'+new THREE.Color(color).getHexString();ctx.lineWidth=8;ctx.strokeRect(6,6,500,116);ctx.fillStyle='#fff';ctx.font='900 36px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(7.5,1.9,1);return sprite}
      signEntries.forEach(([label,x,z,color])=>{const g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,3.4,8),metal);pole.position.y=1.7;g.add(pole);const sprite=textSprite(label,color);sprite.position.y=3.6;g.add(sprite);g.position.set(x,0,z);root.add(g);signs.push({g,sprite})});

      const leaf=new THREE.MeshStandardMaterial({color:0x2d6745,roughness:.9}),stone=new THREE.MeshStandardMaterial({color:0x575d66,roughness:.92});
      const bushes=[];let landscaping=0;
      [[-12,0],[12,0],[0,-12],[0,12],[-36,0],[36,0],[0,-36],[0,36]].forEach(([x,z],i)=>{const base=new THREE.Mesh(new THREE.CylinderGeometry(.72,.86,.32,14),stone);base.position.set(x,.16,z);root.add(base);const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.66,1),leaf);bush.position.set(x,.72,z);bush.scale.set(1.25,.72,1.05);bush.userData.windPhase=i*.7;root.add(bush);bushes.push(bush);landscaping++});

      const vehicleDetail=new THREE.Group();vehicleDetail.name='TGG_V566_VEHICLE_SIGNAL';car.add(vehicleDetail);
      const amber=()=>new THREE.MeshStandardMaterial({color:0xffa51f,emissive:0xff7a00,emissiveIntensity:.45,roughness:.3});
      const white=()=>new THREE.MeshStandardMaterial({color:0xf5f8ff,emissive:0xdceaff,emissiveIntensity:.25,roughness:.24});
      const signals=[];
      [-.78,.78].forEach(z=>{const f=new THREE.Mesh(new THREE.BoxGeometry(.07,.2,.22),amber());f.position.set(2.15,.92,z);vehicleDetail.add(f);signals.push({mesh:f,side:Math.sign(z)});const r=new THREE.Mesh(new THREE.BoxGeometry(.07,.18,.2),amber());r.position.set(-2.15,.92,z);vehicleDetail.add(r);signals.push({mesh:r,side:Math.sign(z)})});
      const reverseLights=[];[-.42,.42].forEach(z=>{const r=new THREE.Mesh(new THREE.BoxGeometry(.07,.16,.2),white());r.position.set(-2.16,.88,z);vehicleDetail.add(r);reverseLights.push(r)});

      const positions=[];for(let i=0;i<120;i++){const a=(i*2.3999632297)%(Math.PI*2),r=12+(i%31)*1.25;positions.push(Math.cos(a)*r,1.2+(i%17)*.48,Math.sin(a)*r)}
      const atmGeo=new THREE.BufferGeometry();atmGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const atmosphere=new THREE.Points(atmGeo,new THREE.PointsMaterial({color:0xb9cce3,size:.055,transparent:true,opacity:.22,depthWrite:false}));root.add(atmosphere);

      const storefronts=[];const storeColors=[0xff466d,0x48d7ff,0xc7ff00,0xc56cff,0xffc857,0x7a8cff];
      [[-16,-16],[16,-16],[-16,16],[16,16],[-32,16],[32,-16]].forEach(([x,z],i)=>{const mat=new THREE.MeshStandardMaterial({color:storeColors[i],emissive:storeColors[i],emissiveIntensity:1.3,roughness:.38});const awning=new THREE.Mesh(new THREE.BoxGeometry(3.2,.18,.9),mat);awning.position.set(x,2.25,z);root.add(awning);storefronts.push(awning)});

      let last=performance.now();
      function animate(now){requestAnimationFrame(animate);const dt=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;const t=now*.001;atmosphere.rotation.y+=dt*.012;bushes.forEach(b=>{b.rotation.z=Math.sin(t*1.15+b.userData.windPhase)*.035});storefronts.forEach((s,i)=>{s.material.emissiveIntensity=1.15+Math.sin(t*1.4+i)*.24});const dyn=api.getVehicleDynamics?.()||{},steer=Number(dyn.steer)||0;signals.forEach(({mesh,side})=>{const active=(steer<-.18&&side<0)||(steer>.18&&side>0);mesh.material.emissiveIntensity=active&&Math.sin(t*7)>0?4.8:.35});const reversing=(Number(dyn.speed)||0)<-.12;reverseLights.forEach(r=>r.material.emissiveIntensity=reversing?3.8:.2);signs.forEach((s,i)=>{s.sprite.material.opacity=.82+Math.sin(t*.8+i)*.08})}
      requestAnimationFrame(animate);

      const status=()=>({version:VERSION,layers:[...LAYERS],reflectors,streetFurniture:furniture,districtSigns:signs.length,landscaping,vehicleSignals:signals.length+reverseLights.length,atmosphereParticles:120,storefronts:storefronts.length,animated:true,ok:reflectors>=120&&furniture>=20&&signs.length===4&&landscaping===8&&(signals.length+reverseLights.length)>=6&&storefronts.length===6});
      window.TGGV570VisualMega={version:VERSION,getStatus:status,root};
      document.documentElement.dataset.tggVisualMega='v570';
      window.dispatchEvent(new CustomEvent('tgg:v570-visual-mega-ready',{detail:status()}));
    }catch(error){window.TGGV570VisualMega={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(error?.message||error)})};document.documentElement.dataset.tggVisualMega='fallback'}
  });
})();