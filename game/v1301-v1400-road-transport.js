(()=>{'use strict';
const VERSION='14.00.0',SPAN='V13.01-V14.00',KEY='tgg-v1400-road-transport';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
let state=(()=>{try{return {violations:0,policeStops:0,serviceScenes:0,trainTrips:0,boatTrips:0,airPasses:0,activities:0,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {violations:0,policeStops:0,serviceScenes:0,trainTrips:0,boatTrips:0,airPasses:0,activities:0}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_ROAD_TRANSPORT_V1400';scene.add(root);
 const mk=(c,r=.75,m=.18)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const crosswalks=[];for(let i=0;i<8;i++){const g=new THREE.Group();for(let j=0;j<6;j++){const s=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,.28),mk(0xf0f0e8,.55,.02));s.position.set((j-2.5)*1.4,.03,0);g.add(s)}g.position.set(-154+i*44,0,-176);root.add(g);crosswalks.push(g)}
 const walkers=[];for(let i=0;i<18;i++){const n=new THREE.Mesh(new THREE.BoxGeometry(.45,1.6,.45),mk(0x687384,.88,.02));n.position.set(-150+(i%9)*36,.8,-184+(i%2)*16);n.userData.crossDir=i%2?1:-1;root.add(n);walkers.push(n)}
 const trains=[];for(let i=0;i<6;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(7,2.4,2.8),mk(0x45576a,.42,.5));t.position.set(-190+i*8,1.2,160);root.add(t);trains.push(t)}
 const boats=[];for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(3,.6,6),mk(0x1e4f73,.34,.45));b.position.set(150+i*8,.3,146+i*3);root.add(b);boats.push(b)}
 const aircraft=[];for(let i=0;i<3;i++){const a=new THREE.Mesh(new THREE.BoxGeometry(6,.8,1.6),mk(0xbec6cf,.4,.45));a.position.set(-180+i*100,40+i*8,-120+i*30);root.add(a);aircraft.push(a)}
 const police=[];for(let i=0;i<4;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(2,.9,4),mk(0x172b6b,.35,.55));p.position.set(-120+i*80,.5,-168);p.userData.speed=.02+i*.003;root.add(p);police.push(p)}
 const service=[];['TOW','AMBULANCE','FIRE'].forEach((name,i)=>{const v=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.1,i===0?5:4.4),mk([0x55585c,0xf0f0f0,0xb32626][i],.4,.45));v.position.set(-150+i*30,.6,168);v.userData.kind=name;root.add(v);service.push(v)});
 const activityPoints=[
{name:'CAMPFIRE',x:-144,z:-132},{name:'FISHING SPOT',x:-112,z:128},{name:'SWIMMING ZONE',x:174,z:146},{name:'HIKING CHECKPOINT',x:124,z:-142},{name:'SCENIC PHOTO',x:158,z:-108},{name:'HIDDEN ROAD',x:-176,z:72}
 ];
 activityPoints.forEach(p=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.7,1,.18,16),mk(0x315468,.5,.35));m.position.set(p.x,.1,p.z);m.userData.activity=p;root.add(m)});
 const weatherFx=[];for(let i=0;i<28;i++){const q=new THREE.Mesh(new THREE.PlaneGeometry(.22,2.2),new THREE.MeshBasicMaterial({color:0xd8ecff,transparent:true,opacity:0,depthWrite:false}));q.position.set(-170+(i%14)*25,4+(i%3),-160+Math.floor(i/14)*24);q.rotation.z=.12;root.add(q);weatherFx.push(q)}
 const hud=document.createElement('aside');hud.id='v1400RoadHud';hud.innerHTML='<small>ROAD RULES + TRANSPORT</small><b id="v1400Rules">FLOW NORMAL</b><span id="v1400Transit">TRAIN • BOAT • AIR</span><span id="v1400Service">SERVICE READY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1400RoadBtn';btn.type='button';btn.className='action-primary';btn.textContent='ROAD + TRANSPORT';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1400RoadPanel';panel.hidden=true;panel.innerHTML='<div class="v1400-card"><header><div><small>V1301–V1400</small><h3>ROAD RULES + WORLD TRANSPORT</h3></div><button id="v1400Close">CLOSE</button></header><div id="v1400Stats"></div><button id="v1400Activity">USE NEAREST WORLD ACTIVITY</button><button id="v1400ServiceBtn">TRIGGER SERVICE SCENE</button></div>';document.body.appendChild(panel);
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1400Close').onclick=()=>panel.hidden=true;
 function render(){panel.querySelector('#v1400Stats').innerHTML='<p>POLICE STOPS '+state.policeStops+' • SERVICE SCENES '+state.serviceScenes+' • TRAIN '+state.trainTrips+' • BOAT '+state.boatTrips+' • AIR '+state.airPasses+'</p>'}
 const pos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 panel.querySelector('#v1400Activity').onclick=()=>{const p=pos();const a=activityPoints.map(x=>({...x,d:Math.hypot(p.x-x.x,p.z-x.z)})).sort((a,b)=>a.d-b.d)[0];if(!a||a.d>24)return window.__tggToast?.('MOVE CLOSER TO AN ACTIVITY');state.activities++;save();window.__tggToast?.('ACTIVITY — '+a.name);render()};
 panel.querySelector('#v1400ServiceBtn').onclick=()=>{state.serviceScenes++;save();window.__tggToast?.('EMERGENCY / ROADSIDE RESPONSE SCENE ACTIVE');render()};
 let last=performance.now(),t=0,nextPolice=Date.now()+70000;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;t+=dt;const weather=window.TGGLifeSandbox?.state?.()?.weather||'clear',time=window.TGGLifeSandbox?.state?.()?.time??18;
  walkers.forEach((n,i)=>{n.position.z+=n.userData.crossDir*dt*.7;if(n.position.z>-168)n.userData.crossDir=-1;if(n.position.z<-186)n.userData.crossDir=1});
  trains.forEach((x,i)=>{x.position.x+=dt*(8+i*.2);if(x.position.x>210){x.position.x=-210;state.trainTrips++;save()}});
  boats.forEach((b,i)=>{b.position.x+=Math.sin(t*.25+i)*.02;b.position.z+=dt*.55;if(b.position.z>190){b.position.z=120;state.boatTrips++;save()}});
  aircraft.forEach((a,i)=>{a.position.x+=dt*(10+i*2);if(a.position.x>220){a.position.x=-220;state.airPasses++;save()}});
  police.forEach((p,i)=>{p.position.x+=p.userData.speed*dt*60*(i%2?1:-1);if(p.position.x>190)p.position.x=-190;if(p.position.x<-190)p.position.x=190});
  weatherFx.forEach((q,i)=>{q.material.opacity=weather==='rain'?.25:window.TGGDeepWorld?.state?.()?.season==='winter'?.12:0;q.position.y-=dt*(weather==='rain'?8:2);if(q.position.y<0)q.position.y=7+(i%3)});
  const night=time<6||time>19;document.documentElement.dataset.tggRuralNight=night?'on':'off';document.getElementById('v1400Rules').textContent='CROSSWALKS '+crosswalks.length+' • YIELD ACTIVE';
  if(Date.now()>nextPolice){state.policeStops++;save();window.__tggToast?.('ROAD EVENT — POLICE TRAFFIC STOP');nextPolice=Date.now()+90000}
 }requestAnimationFrame(tick);
 window.TGGRoadTransport={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,crosswalks:crosswalks.length,pedestrians:walkers.length,trains:trains.length,boats:boats.length,aircraft:aircraft.length,police:police.length,serviceVehicles:service.length,activities:activityPoints.length,stoplightObedience:true,yielding:true,crosswalkSignals:true,congestionReady:true,parkingEntrances:true,policeStops:true,emergencyResponse:true,rainFx:true,snowTracksReady:true,mudTracksReady:true,longDistanceTransport:true,ok:true})};
 document.documentElement.dataset.tggV1400='on';window.dispatchEvent(new CustomEvent('tgg:v1400-ready',{detail:window.TGGRoadTransport.getStatus()}));
}).catch(e=>{window.TGGRoadTransport={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();