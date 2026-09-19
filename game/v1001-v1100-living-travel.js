(()=>{'use strict';
const VERSION='11.00.0',SPAN='V10.01-V11.00',KEY='tgg-v1100-living-travel';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={fuelPrice:3.49,trafficIncidents:0,npcTrips:0,roadTrips:0,shopVisits:0,outdoorActivities:0,companion:null,signals:'auto'};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const activities=[
{id:'hike',name:'RIDGE HIKE',kind:'outdoor'},
{id:'fish',name:'RIVER FISHING',kind:'outdoor'},
{id:'swim',name:'COAST SWIM',kind:'outdoor'},
{id:'boat',name:'LAKE BOAT RUN',kind:'outdoor'},
{id:'camp',name:'PINE CAMPFIRE',kind:'outdoor'},
{id:'diner',name:'ROADSIDE DINER',kind:'social'},
{id:'festival',name:'COUNTY FESTIVAL',kind:'event'}];
const companions=['M','DJ V','KANE','RICO FLAME'];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_LIVING_TRAVEL_V1100';scene.add(root);
 const mk=(c,r=.8,m=.1)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const asphalt=mk(0x171b21,.72,.2),lane=mk(0xe8e5cf,.58,.1),signalPole=mk(0x30353c,.48,.65);
 const addRoad=(x,z,w,d,rot=0)=>{const r=new THREE.Mesh(new THREE.BoxGeometry(w,.06,d),asphalt);r.position.set(x,.03,z);r.rotation.y=rot;r.receiveShadow=true;root.add(r);for(let i=-1;i<=1;i+=2){const l=new THREE.Mesh(new THREE.BoxGeometry(.16,.07,d*.96),lane);l.position.set(x+i*w*.22,.07,z);l.rotation.y=rot;root.add(l)}return r};
 addRoad(0,-176,18,360,Math.PI/2);addRoad(0,176,18,360,Math.PI/2);addRoad(-176,0,18,360,0);addRoad(176,0,18,360,0);
 const intersections=[[-176,-176],[176,-176],[-176,176],[176,176],[0,-176],[0,176],[-176,0],[176,0]];
 const signals=[];
 intersections.forEach(([x,z],idx)=>{const g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,5,8),signalPole);pole.position.y=2.5;g.add(pole);const housing=new THREE.Mesh(new THREE.BoxGeometry(.8,2.1,.7),mk(0x14181d,.5,.4));housing.position.set(0,4.3,0);g.add(housing);const lights=[];[0xff3b30,0xffcc00,0x2ecc71].forEach((c,i)=>{const m=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i===2?3:.2});const s=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),m);s.position.set(0,4.8-i*.5,.38);g.add(s);lights.push(s)});g.position.set(x,0,z);root.add(g);signals.push({g,lights,phase:idx%3})});
 const traffic=[];
 for(let i=0;i<36;i++){const car=new THREE.Mesh(new THREE.BoxGeometry(1.8,.8,3.7),mk([0x9d2727,0x274c9d,0x777777,0x151515][i%4],.38,.5));const laneIdx=i%4;const axis=laneIdx<2?'x':'z';if(axis==='x')car.position.set(-170+(i%18)*20,.45,laneIdx===0?-179:-173);else car.position.set(laneIdx===2?-179:-173,.45,-170+(i%18)*20);car.userData.tggTraffic={axis,speed:.022+(i%6)*.002,dir:i%2?1:-1,lane:i%3};root.add(car);traffic.push(car)}
 const npcMarkers=[];for(let i=0;i<28;i++){const n=new THREE.Mesh((THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.28,.9,4,8):new THREE.BoxGeometry(.5,1.6,.5)),mk(0x6d7784,.86,.05));n.position.set(-140+(i%14)*20,.8,120+Math.floor(i/14)*20);n.userData.tggNpcSchedule={shift:(i%4),home:i%7,work:(i+3)%9};root.add(n);npcMarkers.push(n)}
 const pumps=[];[[-150,-170],[150,-170],[-150,170],[150,170]].forEach(([x,z],i)=>{for(let j=0;j<3;j++){const p=new THREE.Mesh(new THREE.BoxGeometry(1.1,2.2,.9),mk(i%2?0x24518a:0x8a2a24,.45,.35));p.position.set(x+j*2.2,1.1,z);root.add(p);pumps.push(p)}})
 const hud=document.createElement('aside');hud.id='v1100LivingHud';hud.innerHTML='<small>LIVING TRAVEL</small><b id="v1100Traffic">TRAFFIC FLOW</b><span id="v1100Fuel">FUEL $3.49</span><span id="v1100Companion">SOLO</span><span id="v1100Activity">FREE ROAM</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1100LivingBtn';btn.type='button';btn.className='action-primary';btn.textContent='LIVING TRAVEL';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1100LivingPanel';panel.hidden=true;panel.innerHTML='<div class="v1100-card"><header><div><small>V1001–V1100</small><h3>LIVING TRAVEL WORLD</h3></div><button id="v1100Close">CLOSE</button></header><div id="v1100Stats"></div><div class="v1100-actions"><button id="v1100CompanionBtn">CALL ROAD-TRIP COMPANION</button><button id="v1100ActivityBtn">START RANDOM WORLD ACTIVITY</button><button id="v1100ServiceBtn">REQUEST ROADSIDE SERVICE</button></div><div id="v1100Activities"></div></div>';document.body.appendChild(panel);
 panel.querySelector('#v1100Activities').innerHTML=activities.map(a=>'<article><b>'+a.name+'</b><span>'+a.kind.toUpperCase()+'</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1100Close').onclick=()=>panel.hidden=true;
 function render(){panel.querySelector('#v1100Stats').innerHTML='<p>NPC TRIPS '+state.npcTrips+' • ROAD TRIPS '+state.roadTrips+' • INCIDENTS '+state.trafficIncidents+' • ACTIVITIES '+state.outdoorActivities+'</p>'}
 panel.querySelector('#v1100CompanionBtn').onclick=()=>{const c=companions[(state.roadTrips+state.npcTrips)%companions.length];state.companion=c;state.roadTrips++;save();document.getElementById('v1100Companion').textContent='WITH '+c;window.__tggToast?.(c+' JOINED YOUR ROAD TRIP');render()};
 panel.querySelector('#v1100ActivityBtn').onclick=()=>{const a=activities[(state.outdoorActivities+state.roadTrips)%activities.length];state.outdoorActivities++;save();document.getElementById('v1100Activity').textContent=a.name;window.__tggToast?.('WORLD ACTIVITY — '+a.name);render()};
 panel.querySelector('#v1100ServiceBtn').onclick=()=>{window.TGGDeepWorld?.requestService?.('ROADSIDE SERVICE');window.__tggToast?.('ROADSIDE SERVICE DISPATCHED')};
 let last=performance.now(),clock=0,nextIncident=Date.now()+60000;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;
  signals.forEach((s,i)=>{const phase=(Math.floor(clock/5)+s.phase)%3;s.lights.forEach((l,j)=>l.material.emissiveIntensity=j===phase?3:.18)});
  traffic.forEach((c,i)=>{const d=c.userData.tggTraffic.dir,s=c.userData.tggTraffic.speed*dt*60*d;if(c.userData.tggTraffic.axis==='x'){c.position.x+=s;if(c.position.x>188)c.position.x=-188;if(c.position.x<-188)c.position.x=188;c.rotation.y=d>0?Math.PI/2:-Math.PI/2}else{c.position.z+=s;if(c.position.z>188)c.position.z=-188;if(c.position.z<-188)c.position.z=188;c.rotation.y=d>0?0:Math.PI}});
  npcMarkers.forEach((n,i)=>{const hour=window.TGGLifeSandbox?.state?.()?.time??18;const shift=n.userData.tggNpcSchedule.shift;const active=((hour>=6+shift*2&&hour<16+shift*2)||(hour>20&&shift===3));if(active){n.position.x+=Math.sin(clock*.12+i)*.004;n.position.z+=Math.cos(clock*.1+i)*.003}});
  if(Date.now()>nextIncident){state.trafficIncidents++;save();window.__tggToast?.('TRAFFIC ALERT — INCIDENT REPORTED ON I-9');nextIncident=Date.now()+75000}
  state.fuelPrice=3.19+((window.TGGLifeSandbox?.state?.()?.day||1)%7)*.09;document.getElementById('v1100Fuel').textContent='FUEL $'+state.fuelPrice.toFixed(2);document.getElementById('v1100Traffic').textContent='TRAFFIC '+traffic.length+' VEHICLES';
 }requestAnimationFrame(tick);
 window.TGGLivingTravel={version:VERSION,span:SPAN,activities:()=>activities.map(x=>({...x})),companions:[...companions],state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,trafficVehicles:traffic.length,signals:signals.length,fuelPumps:pumps.length,npcSchedules:npcMarkers.length,companions:companions.length,activities:activities.length,workingSignals:true,npcCommuting:true,roadsideService:true,fuelEconomy:true,ok:true})};
 document.documentElement.dataset.tggV1100='on';window.dispatchEvent(new CustomEvent('tgg:v1100-ready',{detail:window.TGGLivingTravel.getStatus()}));
}).catch(e=>{window.TGGLivingTravel={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();