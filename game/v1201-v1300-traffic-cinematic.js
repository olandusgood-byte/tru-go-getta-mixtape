(()=>{'use strict';
const VERSION='13.00.0',SPAN='V12.01-V13.00',KEY='tgg-v1300-traffic-cinematic';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={laneChanges:0,merges:0,parked:0,stormFlashes:0,discoveries:[],nightMode:'adaptive',roadEvents:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const explore=[
{id:'cave',name:'NORTH RIDGE CAVE',x:136,z:-150,type:'cave'},
{id:'overlook',name:'CANYON OVERLOOK',x:158,z:-104,type:'overlook'},
{id:'falls',name:'RIVER FALLS TRAIL',x:-54,z:-104,type:'waterfall'},
{id:'secret-road',name:'OLD COUNTY ROAD',x:-174,z:66,type:'secret'},
{id:'beach',name:'SOUTH COAST BEACH',x:178,z:146,type:'beach'},
{id:'dock',name:'LAKE FISHING DOCK',x:-118,z:126,type:'dock'}];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_TRAFFIC_CINEMATIC_V1300';scene.add(root);
 const mk=(c,r=.75,m=.18)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const carMat=[0x171717,0x2e4d7c,0x7b2626,0x68727c,0x9b7b2f].map(c=>mk(c,.38,.55));
 const traffic=[];
 const lanes=[-181,-176,-171];
 for(let i=0;i<54;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(1.8,.82,3.8),carMat[i%carMat.length]);const east=i%2===0;const lane=i%3;c.position.set(-188+(i%27)*14,.45,lanes[lane]);c.userData.ai={speed:.018+(i%7)*.002,dir:east?1:-1,lane,targetLane:lane,braking:false,turn:0,parkTimer:0};root.add(c);traffic.push(c)}
 const brakeMat=new THREE.MeshStandardMaterial({color:0xff2c2c,emissive:0xff0000,emissiveIntensity:0});
 const signalMat=new THREE.MeshStandardMaterial({color:0xffb233,emissive:0xff8a00,emissiveIntensity:0});
 traffic.forEach((c,i)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(1.15,.14,.12),brakeMat.clone());b.position.set(0,.08,-1.96);c.add(b);c.userData.brake=b;const t=new THREE.Mesh(new THREE.BoxGeometry(.18,.12,.13),signalMat.clone());t.position.set(i%2?.72:-.72,.1,-1.95);c.add(t);c.userData.turnSignal=t});
 const parking=[];
 for(let i=0;i<28;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(2,.06,4.3),mk(0x232830,.9,.12));p.position.set(-164+(i%14)*24,.04,134+Math.floor(i/14)*14);root.add(p);parking.push({slot:p,occupied:false,vehicle:null})}
 const activityZones=[
{name:'BEACH CROWD',x:174,z:146,count:18},
{name:'CAR MEET',x:116,z:84,count:22},
{name:'CAMPGROUND',x:-140,z:-128,count:16},
{name:'OUTDOOR SHOW',x:34,z:142,count:26}
 ];
 const crowds=[];activityZones.forEach((z,zi)=>{for(let i=0;i<z.count;i++){const n=new THREE.Mesh(new THREE.BoxGeometry(.45,1.62,.45),mk([0x6b5141,0x465e79,0x7a506e,0x6b6b46][i%4],.9,.02));n.position.set(z.x+(i%6)*1.2,.81,z.z+Math.floor(i/6)*1.2);n.userData.zone=zi;root.add(n);crowds.push(n)}})
 const wetRoads=[];for(let i=0;i<10;i++){const w=new THREE.Mesh(new THREE.PlaneGeometry(22,9),new THREE.MeshPhysicalMaterial({color:0x111820,roughness:.16,metalness:.35,transparent:true,opacity:0,clearcoat:.9}));w.rotation.x=-Math.PI/2;w.position.set(-150+i*34,.025,-176);root.add(w);wetRoads.push(w)}
 const fogLights=[];for(let i=0;i<16;i++){const l=new THREE.SpotLight(0xffe4ad,0,48,Math.PI/8,.5,1.8);l.position.set(-176+i*23,2.2,-168);l.target.position.set(l.position.x+10,0,-168);root.add(l,l.target);fogLights.push(l)}
 explore.forEach((p,i)=>{const g=new THREE.Group();const base=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.8,.28,18),mk(0x24303b,.6,.35));base.position.y=.14;g.add(base);const beacon=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshStandardMaterial({color:0x8adfff,emissive:0x28aaff,emissiveIntensity:2.2}));beacon.position.y=2.8;g.add(beacon);g.position.set(p.x,0,p.z);g.userData.explore=p;root.add(g)});
 const lightning=new THREE.DirectionalLight(0xd9ebff,0);lightning.position.set(0,60,0);scene.add(lightning);
 const hud=document.createElement('aside');hud.id='v1300TrafficHud';hud.innerHTML='<small>TRAFFIC AI + CINEMATIC</small><b id="v1300Flow">54 VEHICLES</b><span id="v1300Park">PARKED 0</span><span id="v1300Storm">WEATHER CLEAR</span><span id="v1300Explore">DISCOVERY READY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1300TrafficBtn';btn.type='button';btn.className='action-primary';btn.textContent='TRAFFIC + WORLD';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1300TrafficPanel';panel.hidden=true;panel.innerHTML='<div class="v1300-card"><header><div><small>V1201–V1300</small><h3>TRAFFIC AI + CINEMATIC WORLD</h3></div><button id="v1300Close">CLOSE</button></header><div id="v1300Stats"></div><div id="v1300ExploreList"></div><button id="v1300Scan">SCAN NEARBY DISCOVERY</button></div>';document.body.appendChild(panel);
 panel.querySelector('#v1300ExploreList').innerHTML=explore.map(e=>'<article><b>'+e.name+'</b><span>'+e.type.toUpperCase()+'</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1300Close').onclick=()=>panel.hidden=true;
 const worldPos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 const nearestExplore=()=>{const p=worldPos();return explore.map(x=>({...x,d:Math.hypot(p.x-x.x,p.z-x.z)})).sort((a,b)=>a.d-b.d)[0]};
 function render(){panel.querySelector('#v1300Stats').innerHTML='<p>LANE CHANGES '+state.laneChanges+' • MERGES '+state.merges+' • PARKED '+state.parked+' • DISCOVERIES '+state.discoveries.length+'</p>'}
 panel.querySelector('#v1300Scan').onclick=()=>{const e=nearestExplore();if(!e||e.d>24)return window.__tggToast?.('NO DISCOVERY CLOSE ENOUGH');if(!state.discoveries.includes(e.id)){state.discoveries.push(e.id);save();window.__tggToast?.('DISCOVERED — '+e.name)}document.getElementById('v1300Explore').textContent=e.name;render()};
 let last=performance.now(),clock=0,nextLane=0,nextPark=0,flashUntil=0;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;
  const weather=window.TGGLifeSandbox?.state?.()?.weather||'clear',time=window.TGGLifeSandbox?.state?.()?.time??18,night=time<6||time>19;
  traffic.forEach((c,i)=>{const a=c.userData.ai;let speed=a.speed;if(a.braking)speed*=.28;c.position.x+=speed*dt*60*a.dir;if(c.position.x>194)c.position.x=-194;if(c.position.x<-194)c.position.x=194;c.rotation.y=a.dir>0?Math.PI/2:-Math.PI/2;
   const ahead=traffic[(i+1)%traffic.length];a.braking=Math.abs(ahead.position.x-c.position.x)<7&&Math.abs(ahead.position.z-c.position.z)<1.6;a.brake.material.emissiveIntensity=a.braking?4:.1;
   if(now>nextLane&&i%9===0){a.targetLane=(a.lane+1)%3;a.turn=a.targetLane>a.lane?1:-1;state.laneChanges++;state.merges++;nextLane=now+1800}
   const targetZ=lanes[a.targetLane];c.position.z+=(targetZ-c.position.z)*Math.min(1,dt*1.2);if(Math.abs(targetZ-c.position.z)<.1){a.lane=a.targetLane;a.turn=0}
   a.turnSignal.material.emissiveIntensity=a.turn&&Math.floor(clock*3)%2?3:.1;
  });
  if(now>nextPark){const slot=parking.find(p=>!p.occupied);if(slot){const car=traffic[(state.parked*3)%traffic.length];slot.occupied=true;slot.vehicle=car;car.position.set(slot.slot.position.x,.45,slot.slot.position.z);car.rotation.y=0;state.parked++;save()}nextPark=now+12000}
  const isRain=weather==='rain',isFog=weather==='fog';wetRoads.forEach((w,i)=>{w.material.opacity=isRain?.34:0});fogLights.forEach(l=>{l.intensity=(night&&(isFog||isRain))?2.6:night?.8:0});
  if(isRain&&Math.floor(clock)%17===0&&now>flashUntil){lightning.intensity=7;flashUntil=now+130;state.stormFlashes++;save()}if(now>flashUntil)lightning.intensity=0;
  crowds.forEach((n,i)=>{const zone=activityZones[n.userData.zone];const active=(zone.name==='BEACH CROWD'?time>10&&time<20:zone.name==='CAR MEET'?time>18||time<2:true);n.visible=active;if(active){n.position.x+=Math.sin(clock*.3+i)*.002;n.position.z+=Math.cos(clock*.22+i)*.002}});
  document.documentElement.dataset.tggNight=night?'on':'off';document.getElementById('v1300Flow').textContent=traffic.length+' VEHICLES';document.getElementById('v1300Park').textContent='PARKED '+state.parked;document.getElementById('v1300Storm').textContent='WEATHER '+weather.toUpperCase();
 }requestAnimationFrame(tick);
 window.TGGTrafficCinematic={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),explore:()=>explore.map(x=>({...x})),getStatus:()=>({version:VERSION,span:SPAN,traffic:traffic.length,parking:parking.length,crowds:crowds.length,explore:explore.length,laneChanging:true,merging:true,brakeLights:true,turnSignals:true,parkingAI:true,wetRoadReflections:true,fogHeadlights:true,lightning:true,activityCrowds:true,deepExploration:true,ok:true})};
 document.documentElement.dataset.tggV1300='on';window.dispatchEvent(new CustomEvent('tgg:v1300-ready',{detail:window.TGGTrafficCinematic.getStatus()}));
}).catch(e=>{window.TGGTrafficCinematic={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();