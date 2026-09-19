(()=>{'use strict';
const VERSION='9.00.0',SPAN='V8.51-V9.00',KEY='tgg-v900-travel-cinematic';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={dirt:0,wear:0,tripMiles:0,cameraMode:'CHASE',headlights:'AUTO',traction:1};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,camera=api.camera;
 const root=new THREE.Group();root.name='TGG_TRAVEL_CINEMATIC_V900';scene.add(root);
 const hud=document.createElement('aside');hud.id='v900TravelHud';hud.innerHTML='<small>TRAVEL SYSTEM</small><b id="v900Cam">CHASE</b><span id="v900Traction">TRACTION 100%</span><span id="v900Wear">WEAR 0%</span><span id="v900Dirt">DIRT 0%</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v900TravelBtn';btn.type='button';btn.textContent='TRAVEL CAMERA';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const modes=['CHASE','HOOD','CINEMATIC','CRUISE'];
 btn.onclick=()=>{const i=(modes.indexOf(state.cameraMode)+1)%modes.length;state.cameraMode=modes[i];save();document.getElementById('v900Cam').textContent=state.cameraMode;window.__tggToast?.('CAMERA — '+state.cameraMode)};
 const lightMat=new THREE.MeshStandardMaterial({color:0xf9f2d0,emissive:0xffe29a,emissiveIntensity:3.4,roughness:.25});
 const lamps=[];
 for(let i=0;i<10;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),lightMat.clone());mesh.position.set(-150+i*34,2.4,-154+(i%2)*4);root.add(mesh);const l=new THREE.SpotLight(0xffe2aa,2.6,42,Math.PI/7,.35,1.8);l.position.copy(mesh.position);l.target.position.set(mesh.position.x+8,0,mesh.position.z);root.add(l,l.target);lamps.push({mesh,l})}
 let last=performance.now(),distance=0,prev=null;
 const worldPos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 function roadPhysics(){
  const w=window.TGGLifeSandbox?.state?.()?.weather||'clear';
  const region=window.TGGRegionalRealism?.state?.()?.roadCondition||'dry';
  const base=w==='rain'?.72:w==='fog'?.86:region==='damp'?.9:1;
  state.traction=base;
  return base;
 }
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;
  const p=worldPos();if(prev){const d=Math.hypot(p.x-prev.x,p.z-prev.z);distance+=d;if(distance>6){state.tripMiles+=distance/160;distance=0;state.wear=Math.min(100,state.wear+dt*.0035);const region=window.TGGRegionalRealism?.state?.()?.roadCondition||'dry';if(region!=='dry')state.dirt=Math.min(100,state.dirt+dt*.05);save()}}prev=p;
  const traction=roadPhysics();document.getElementById('v900Traction').textContent='TRACTION '+Math.round(traction*100)+'%';document.getElementById('v900Wear').textContent='WEAR '+Math.round(state.wear)+'%';document.getElementById('v900Dirt').textContent='DIRT '+Math.round(state.dirt)+'%';
  const time=window.TGGLifeSandbox?.state?.()?.time??18;const night=time<6||time>19;lamps.forEach(o=>{o.l.intensity=night?2.8:.2;o.mesh.material.emissiveIntensity=night?3.4:.25});
  if(state.cameraMode==='CINEMATIC'&&camera){camera.rotation.z=Math.sin(now*.00045)*.008}
 }
 requestAnimationFrame(tick);
 window.TGGTravelCinematic={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),cleanVehicle:()=>{state.dirt=0;return save()},serviceVehicle:()=>{state.wear=0;return save()},getStatus:()=>({version:VERSION,span:SPAN,cameraModes:modes.length,weatherTraction:true,vehicleDirt:true,vehicleWear:true,headlightNetwork:true,longTripTracking:true,ok:true})};
 document.documentElement.dataset.tggV900='on';window.dispatchEvent(new CustomEvent('tgg:v900-ready',{detail:window.TGGTravelCinematic.getStatus()}));
}).catch(e=>{window.TGGTravelCinematic={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();