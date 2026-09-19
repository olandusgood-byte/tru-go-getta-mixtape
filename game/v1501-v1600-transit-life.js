(()=>{'use strict';
const VERSION='16.00.0',SPAN='V15.01-V16.00',KEY='tgg-v1600-transit-life';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
let state=(()=>{try{return {trainBoardings:0,busBoardings:0,taxiPickups:0,ferryBoardings:0,garageParks:0,valetParks:0,reroutes:0,closures:0,companionMoments:0,interiorVisits:0,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {trainBoardings:0,busBoardings:0,taxiPickups:0,ferryBoardings:0,garageParks:0,valetParks:0,reroutes:0,closures:0,companionMoments:0,interiorVisits:0}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const schedules=[
{id:'train-a',type:'train',label:'CENTRAL ↔ MERCY FALLS',interval:12},
{id:'bus-a',type:'bus',label:'DOWNTOWN ↔ COAST',interval:8},
{id:'ferry-a',type:'ferry',label:'SUNSET COAST ↔ LAKE',interval:15},
{id:'airport-a',type:'air',label:'TGG INTERNATIONAL ARRIVALS',interval:20}
];
const interiors=[
{id:'hotel-room',name:'COAST GRAND SUITE',x:166,z:110,type:'hotel'},
{id:'motel-room',name:'I-9 MOTOR ROOM',x:30,z:-166,type:'motel'},
{id:'diner-int',name:'WEST COUNTY DINER',x:-154,z:-34,type:'diner'},
{id:'camp-int',name:'PINE RIDGE CAMP',x:-146,z:-130,type:'camp'},
{id:'restaurant',name:'SUNSET RESTAURANT',x:168,z:102,type:'restaurant'}];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_TRANSIT_LIFE_V1600';scene.add(root);
 const mk=(c,r=.75,m=.18)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const stationStops=[];[[-160,170,'WEST TERMINAL'],[18,172,'CENTRAL'],[160,170,'EAST TERMINAL']].forEach((p,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(12,.25,3),mk(0x515b66,.65,.3));m.position.set(p[0],.15,p[1]);m.userData.stop=p[2];root.add(m);stationStops.push(m)});
 const garages=[];for(let i=0;i<4;i++){const g=new THREE.Mesh(new THREE.BoxGeometry(18,5,14),mk(0x252b32,.72,.3));g.position.set([-150,-50,60,150][i],2.5,[90,-90,100,-80][i]);g.userData.capacity=24+i*8;root.add(g);garages.push(g)}
 const queues=[];for(let i=0;i<16;i++){const q=new THREE.Mesh(new THREE.BoxGeometry(1.8,.8,3.8),mk(i%2?0x3a526d:0x6b3b3b,.42,.5));q.position.set(-166+(i%8)*5,.45,-162+Math.floor(i/8)*6);q.userData.queue=i%4;root.add(q);queues.push(q)}
 const closureBarriers=[];for(let i=0;i<10;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(2.6,.7,.5),mk(0xff6b2f,.6,.08));b.position.set(-90+i*5,.4,176);root.add(b);closureBarriers.push(b)}
 const interiorGroups=[];interiors.forEach((p,i)=>{const g=new THREE.Group();const floor=new THREE.Mesh(new THREE.BoxGeometry(8,.2,7),mk(0x4b4038,.7,.15));floor.position.y=.1;g.add(floor);const wall=new THREE.Mesh(new THREE.BoxGeometry(8,3.2,.25),mk(0x605a54,.82,.05));wall.position.set(0,1.6,-3.4);g.add(wall);const bedTable=new THREE.Mesh(new THREE.BoxGeometry(3,.7,2),mk(i%2?0x4d5664:0x735b4a,.8,.05));bedTable.position.set(0,.45,0);g.add(bedTable);g.position.set(p.x,0,p.z);g.visible=false;g.userData.interior=p;root.add(g);interiorGroups.push(g)});
 const hud=document.createElement('aside');hud.id='v1600TransitLifeHud';hud.innerHTML='<small>TRANSIT LIFE</small><b id="v1600Schedule">SCHEDULES ACTIVE</b><span id="v1600Route">GPS NORMAL</span><span id="v1600Companion">COMPANION QUIET</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1600TransitLifeBtn';btn.type='button';btn.className='action-primary';btn.textContent='TRANSIT LIFE';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1600TransitLifePanel';panel.hidden=true;panel.innerHTML='<div class="v1600-card"><header><div><small>V1501–V1600</small><h3>SCHEDULED TRANSIT + TRAVEL LIFE</h3></div><button id="v1600Close">CLOSE</button></header><div id="v1600Stats"></div><div id="v1600Schedules"></div><div class="v1600-actions"><button id="v1600Train">BOARD TRAIN</button><button id="v1600Bus">BOARD BUS</button><button id="v1600Taxi">TAXI PICKUP</button><button id="v1600Ferry">BOARD FERRY</button><button id="v1600Garage">PARK GARAGE</button><button id="v1600Valet">VALET</button><button id="v1600Interior">ENTER NEAREST INTERIOR</button></div></div>';document.body.appendChild(panel);
 panel.querySelector('#v1600Schedules').innerHTML=schedules.map(s=>'<article><b>'+s.label+'</b><span>'+s.type.toUpperCase()+' • '+s.interval+' MIN</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1600Close').onclick=()=>panel.hidden=true;
 const hit=(k,msg)=>{state[k]++;save();window.__tggToast?.(msg);render()};
 panel.querySelector('#v1600Train').onclick=()=>hit('trainBoardings','TRAIN BOARDED');
 panel.querySelector('#v1600Bus').onclick=()=>hit('busBoardings','BUS BOARDED');
 panel.querySelector('#v1600Taxi').onclick=()=>hit('taxiPickups','TAXI ARRIVED');
 panel.querySelector('#v1600Ferry').onclick=()=>hit('ferryBoardings','FERRY BOARDED');
 panel.querySelector('#v1600Garage').onclick=()=>hit('garageParks','PARKED IN GARAGE');
 panel.querySelector('#v1600Valet').onclick=()=>hit('valetParks','VALET TOOK VEHICLE');
 const pos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 panel.querySelector('#v1600Interior').onclick=()=>{const p=pos(),near=interiors.map(x=>({...x,d:Math.hypot(p.x-x.x,p.z-x.z)})).sort((a,b)=>a.d-b.d)[0];if(!near||near.d>24)return window.__tggToast?.('MOVE CLOSER TO A HOTEL, MOTEL, DINER, CAMP OR RESTAURANT');interiorGroups.forEach(g=>g.visible=g.userData.interior.id===near.id);state.interiorVisits++;save();window.__tggToast?.('ENTERED — '+near.name);render()};
 function render(){panel.querySelector('#v1600Stats').innerHTML='<p>TRAIN '+state.trainBoardings+' • BUS '+state.busBoardings+' • TAXI '+state.taxiPickups+' • FERRY '+state.ferryBoardings+' • GARAGE '+state.garageParks+' • INTERIORS '+state.interiorVisits+'</p>'}
 let last=performance.now(),clock=0,nextClosure=Date.now()+85000,nextCompanion=Date.now()+50000;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;const hour=window.TGGLifeSandbox?.state?.()?.time??18,weather=window.TGGLifeSandbox?.state?.()?.weather||'clear';
  queues.forEach((q,i)=>{const busy=((hour>=7&&hour<9)||(hour>=16&&hour<19));q.visible=busy||i<6;q.position.z+=Math.sin(clock*.18+i)*.002});
  if(Date.now()>nextClosure){state.closures++;state.reroutes++;save();closureBarriers.forEach((b,i)=>b.visible=(state.closures+i)%2===0);document.getElementById('v1600Route').textContent='GPS REROUTE '+state.reroutes;window.__tggToast?.('ROAD CLOSURE — GPS REROUTED');nextClosure=Date.now()+105000}
  const companion=window.TGGLivingTravel?.state?.()?.companion;if(companion&&Date.now()>nextCompanion){state.companionMoments++;save();document.getElementById('v1600Companion').textContent=companion+' REACTING';window.__tggToast?.(companion+' COMMENTS ON '+(weather==='rain'?'THE STORM':hour>20?'THE NIGHT DRIVE':'THE TRIP'));nextCompanion=Date.now()+65000}
  const minute=Math.floor(clock)%60;document.getElementById('v1600Schedule').textContent='NEXT DEPARTURE '+String((12-minute%12)%12).padStart(2,'0')+' MIN';
 }requestAnimationFrame(tick);
 window.TGGTransitLife={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),schedules:()=>schedules.map(x=>({...x})),interiors:()=>interiors.map(x=>({...x})),getStatus:()=>({version:VERSION,span:SPAN,stationStops:stationStops.length,garages:garages.length,queues:queues.length,scheduledTransit:true,trainBoarding:true,busBoarding:true,taxiPickup:true,ferryBoarding:true,parkingGarages:true,valet:true,gasQueues:true,dynamicClosures:true,gpsRerouting:true,companionReactions:true,hotelInteriors:true,restaurantInteriors:true,campInteriors:true,ok:true})};
 document.documentElement.dataset.tggV1600='on';window.dispatchEvent(new CustomEvent('tgg:v1600-ready',{detail:window.TGGTransitLife.getStatus()}));
}).catch(e=>{window.TGGTransitLife={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();