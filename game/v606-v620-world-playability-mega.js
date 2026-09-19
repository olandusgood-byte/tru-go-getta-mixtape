(()=>{
'use strict';
const VERSION='V6.20';
const LAYERS=['V6.06','V6.07','V6.08','V6.09','V6.10','V6.11','V6.12','V6.13','V6.14','V6.15','V6.16','V6.17','V6.18','V6.19','V6.20'];
const wait=()=>new Promise(resolve=>{const tick=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve():requestAnimationFrame(tick);tick()});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

wait().then(()=>{
  try{
    const THREE=window.THREE,api=window.TGG3D,scene=api.scene,car=api.car,camera=api.camera;
    const root=new THREE.Group();root.name='TGG_V606_V620_WORLD_MEGA';scene.add(root);
    const metal=new THREE.MeshStandardMaterial({color:0x454b55,metalness:.78,roughness:.35});
    const dark=new THREE.MeshStandardMaterial({color:0x11151d,metalness:.42,roughness:.62});
    const orange=new THREE.MeshStandardMaterial({color:0xff6b1a,emissive:0x6b2100,emissiveIntensity:.5,roughness:.48});
    const glass=new THREE.MeshPhysicalMaterial({color:0x3b6078,roughness:.16,metalness:.1,transparent:true,opacity:.62,transmission:.08});
    const glow=new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x789900,emissiveIntensity:1.7,roughness:.3});

    // V6.06 parked vehicle silhouettes
    let parkedCars=0;
    const parkedSpots=[[-34,-20,0],[34,20,Math.PI],[-20,34,-Math.PI/2],[20,-34,Math.PI/2],[-10,-34,Math.PI/2],[10,34,-Math.PI/2]];
    parkedSpots.forEach(([x,z,ry],i)=>{
      const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;
      const body=new THREE.Mesh(new THREE.BoxGeometry(3.4,.8,1.7),new THREE.MeshStandardMaterial({color:[0x9e1b32,0x2437a8,0x2a2f38,0xd0d3d6,0x4b2a6b,0x0e6d65][i],metalness:.68,roughness:.28}));body.position.y=.72;g.add(body);
      const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.8,.65,1.35),glass);cabin.position.set(-.15,1.28,0);g.add(cabin);
      [-1.05,1.05].forEach(wx=>[-.78,.78].forEach(wz=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.24,18),dark);w.rotation.x=Math.PI/2;w.position.set(wx,.35,wz);g.add(w)}));
      root.add(g);parkedCars++;
    });

    // V6.07 barriers
    let barriers=0;
    [[-6,-24],[6,-24],[-24,6],[24,-6]].forEach(([x,z],i)=>{
      const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=i>1?Math.PI/2:0;
      const rail=new THREE.Mesh(new THREE.BoxGeometry(3.8,.32,.24),metal);rail.position.y=.85;g.add(rail);
      [-1.55,1.55].forEach(px=>{const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,1.25,.18),metal);leg.position.set(px,.62,0);g.add(leg)});
      root.add(g);barriers++;
    });

    // V6.08 traffic cones
    let cones=0;
    for(let i=0;i<16;i++){
      const c=new THREE.Mesh(new THREE.ConeGeometry(.24,.72,12),orange);
      c.position.set(-18+i*2.4,.36,6+(i%2)*.75);root.add(c);cones++;
    }

    // V6.09 bus shelters
    let shelters=0;
    [[-24,14,0],[24,-14,Math.PI]].forEach(([x,z,ry])=>{
      const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;
      const back=new THREE.Mesh(new THREE.BoxGeometry(4.4,2.35,.08),glass);back.position.y=1.25;g.add(back);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(4.8,.16,1.7),metal);roof.position.set(0,2.45,.62);g.add(roof);
      const bench=new THREE.Mesh(new THREE.BoxGeometry(2.7,.18,.72),dark);bench.position.set(0,.62,.34);g.add(bench);
      root.add(g);shelters++;
    });

    // V6.10 rooftop HVAC detail
    let hvac=0;
    [[-40,-40,9],[-40,40,12],[40,-40,15],[40,40,18],[-16,-40,11],[16,40,13]].forEach(([x,z,y],i)=>{
      const box=new THREE.Mesh(new THREE.BoxGeometry(1.8,.85,1.45),metal);box.position.set(x,y,z);root.add(box);
      const fan=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.09,18),dark);fan.rotation.x=Math.PI/2;fan.position.set(x,y+.46,z);root.add(fan);hvac++;
    });

    // V6.11 reflective puddles
    let puddles=0;
    const puddleMat=new THREE.MeshPhysicalMaterial({color:0x152b3d,roughness:.12,metalness:.38,transparent:true,opacity:.68});
    [[-12,-8],[8,-12],[14,9],[-16,18],[28,3],[-3,-28]].forEach(([x,z],i)=>{
      const p=new THREE.Mesh(new THREE.CircleGeometry(1.4+(i%3)*.35,24),puddleMat.clone());p.rotation.x=-Math.PI/2;p.position.set(x,.035,z);p.scale.y=.45;root.add(p);puddles++;
    });

    // V6.12 crossing signal props
    let signals=0;
    [[-5,-5],[5,-5],[-5,5],[5,5]].forEach(([x,z],i)=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,3,8),metal);pole.position.set(x,1.5,z);root.add(pole);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.42,.7,.3),dark);head.position.set(x,2.75,z);root.add(head);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),i%2?glow:orange);lamp.position.set(x,2.78,z+.17);root.add(lamp);signals++;
    });

    // V6.13 exhaust plume
    const exhaust=[];
    const exhaustMat=new THREE.MeshBasicMaterial({color:0xc5ccd4,transparent:true,opacity:.22,depthWrite:false});
    for(let i=0;i<12;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.06+i*.012,8,6),exhaustMat.clone());s.position.set(-2.25,.54,(i%2?.38:-.38));car.add(s);exhaust.push(s)}

    // V6.14 world compass + V6.15 telemetry readability
    const hud=document.createElement('div');
    hud.id='tggV620Hud';
    hud.innerHTML='<span id="tggV620Compass">N</span><b id="tggV620Speed">0.0</b><small>WORLD DRIVE</small>';
    document.body.appendChild(hud);
    const style=document.createElement('style');
    style.textContent=`
#tggV620Hud{position:fixed;right:18px;top:18px;z-index:1200;display:grid;grid-template-columns:auto auto;gap:3px 12px;align-items:center;padding:10px 13px;border:1px solid #ffffff26;border-radius:14px;background:#070a0ed9;backdrop-filter:blur(8px);box-shadow:0 12px 30px #0008;color:#fff;font-family:Inter,system-ui,sans-serif;pointer-events:none}
#tggV620Hud span{font-size:12px;font-weight:900;color:#c7ff00;letter-spacing:.12em}
#tggV620Hud b{font-size:18px;line-height:1;text-align:right}
#tggV620Hud small{grid-column:1/3;font-size:7px;letter-spacing:.18em;color:#8f98aa}
@media(max-width:720px){#tggV620Hud{right:10px;top:10px;padding:8px 10px;border-radius:11px}#tggV620Hud b{font-size:16px}}
`;
    document.head.appendChild(style);

    // V6.16 waypoint beacons
    let beacons=0;
    const beaconMat=new THREE.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.28,depthWrite:false});
    [[0,24],[24,0],[-24,0],[0,-24]].forEach(([x,z])=>{
      const b=new THREE.Mesh(new THREE.CylinderGeometry(.18,.8,4.8,18,1,true),beaconMat);b.position.set(x,2.4,z);root.add(b);beacons++;
    });

    // V6.17 street drain detail
    let drains=0;
    for(let i=-32;i<=32;i+=8){const d=new THREE.Mesh(new THREE.BoxGeometry(1.3,.035,.36),dark);d.position.set(i,.045,-5.7);root.add(d);drains++}

    // V6.18 utility boxes
    let utilityBoxes=0;
    [[-28,-8],[28,8],[-8,28],[8,-28]].forEach(([x,z])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.8,1.35,.58),metal);b.position.set(x,.675,z);root.add(b);utilityBoxes++});

    // V6.19 camera stability assist + V6.20 consolidated runtime
    let last=performance.now(),phase=0;
    const compass=document.getElementById('tggV620Compass'),speedEl=document.getElementById('tggV620Speed');
    const dirs=['E','NE','N','NW','W','SW','S','SE'];
    function loop(now){
      requestAnimationFrame(loop);
      const dt=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;phase+=dt;
      const dyn=api.getVehicleDynamics?.()||{};
      const sp=Number(dyn.speed)||0;
      speedEl.textContent=Math.abs(sp).toFixed(1);
      const heading=((car.rotation.y%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
      compass.textContent=dirs[Math.round(heading/(Math.PI/4))%8];
      exhaust.forEach((e,i)=>{const active=Math.abs(sp)>.25;const pulse=(phase*.9+i*.11)%1;e.visible=active;e.position.x=-2.25-pulse*.7;e.position.y=.5+pulse*.38;e.material.opacity=active?(1-pulse)*.18:0});
      puddleMat.opacity=.62+Math.sin(phase*.6)*.05;
      // soft stability: damp tiny camera roll only; preserve the existing camera mode/position logic.
      camera.rotation.z*=Math.max(0,1-dt*7.5);
    }
    requestAnimationFrame(loop);

    const status=()=>({
      version:VERSION,layers:[...LAYERS],parkedCars,barriers,cones,shelters,hvac,puddles,signals,
      exhaustParticles:exhaust.length,hud:true,beacons,drains,utilityBoxes,cameraAssist:true,
      ok:parkedCars===6&&barriers===4&&cones===16&&shelters===2&&hvac===6&&puddles===6&&signals===4&&exhaust.length===12&&beacons===4&&drains>=8&&utilityBoxes===4
    });
    window.TGGV620Mega={version:VERSION,getStatus:status,root};
    document.documentElement.dataset.tggV620='ready';
    window.dispatchEvent(new CustomEvent('tgg:v620-ready',{detail:status()}));
  }catch(error){
    window.TGGV620Mega={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(error?.message||error)})};
    document.documentElement.dataset.tggV620='fallback';
  }
});
})();