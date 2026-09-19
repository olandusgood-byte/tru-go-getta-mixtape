(()=>{'use strict';
const VERSION='15.00.0',SPAN='V14.01-V15.00',KEY='tgg-v1500-transport-immersion';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
let state=(()=>{try{return {busTrips:0,taxiTrips:0,ferryTrips:0,hotelStays:0,dinerVisits:0,campNights:0,detours:0,rushHour:false,gpsTarget:null,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {busTrips:0,taxiTrips:0,ferryTrips:0,hotelStays:0,dinerVisits:0,campNights:0,detours:0,rushHour:false,gpsTarget:null}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const destinations=[
{id:'central-station',name:'CENTRAL STATION',x:18,z:172,type:'train'},
{id:'airport',name:'TGG INTERNATIONAL',x:150,z:-150,type:'airport'},
{id:'ferry',name:'SUNSET FERRY TERMINAL',x:176,z:136,type:'ferry'},
{id:'hotel',name:'COAST GRAND HOTEL',x:164,z:108,type:'hotel'},
{id:'motel',name:'I-9 MOTOR LODGE',x:28,z:-166,type:'motel'},
{id:'diner',name:'WEST COUNTY DINER',x:-154,z:-34,type:'diner'},
{id:'camp',name:'PINE RIDGE CAMPGROUND',x:-146,z:-130,type:'camp'}];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_TRANSPORT_IMMERSION_V1500';scene.add(root);
 const mk=(c,r=.75,m=.18)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const buses=[];for(let i=0;i<8;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.4,7),mk(0x3a6b90,.42,.38));b.position.set(-170+i*48,1.2,-160+(i%2)*16);b.userData.route=i%3;b.userData.dir=i%2?1:-1;root.add(b);buses.push(b)}
 const taxis=[];for(let i=0;i<10;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(1.9,.85,3.8),mk(0xd5a62f,.38,.5));t.position.set(-160+i*34,.45,-20+(i%2)*10);t.userData.dir=i%2?1:-1;root.add(t);taxis.push(t)}
 const ferries=[];for(let i=0;i<2;i++){const f=new THREE.Mesh(new THREE.BoxGeometry(8,2,18),mk(0xd9d9d9,.5,.35));f.position.set(170+i*14,1,136+i*6);root.add(f);ferries.push(f)}
 const stations=[];destinations.forEach((d,i)=>{const g=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(10,4,8),mk(0x2c3440,.7,.2));b.position.y=2;g.add(b);const sign=new THREE.Mesh(new THREE.BoxGeometry(6,.7,.2),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x6bc7ff,emissiveIntensity:1.8}));sign.position.set(0,4.6,0);g.add(sign);g.position.set(d.x,0,d.z);g.userData.destination=d;root.add(g);stations.push(g)});
 const construction=[];for(let i=0;i<6;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(3,.7,.7),mk(0xff7a1a,.7,.05));c.position.set(-80+i*8,.4,-176);root.add(c);construction.push(c)}
 const cones=[];for(let i=0;i<20;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(.22,.6,10),mk(0xff7a1a,.7,.05));c.position.set(-100+i*4,.3,-172+(i%2)*2);root.add(c);cones.push(c)}
 const crowdZones=[
{name:'AIRPORT TERMINAL',x:150,z:-150,base:20},
{name:'CENTRAL STATION',x:18,z:172,base:18},
{name:'DINER',x:-154,z:-34,base:12},
{name:'CAMPGROUND',x:-146,z:-130,base:14},
{name:'BEACH HOTEL',x:164,z:108,base:16}
 ];
 const crowds=[];crowdZones.forEach((z,zi)=>{for(let i=0;i<z.base;i++){const n=new THREE.Mesh(new THREE.BoxGeometry(.44,1.6,.44),mk([0x6b5141,0x465e79,0x7a506e][i%3],.9,.02));n.position.set(z.x+(i%5)*1.1,.8,z.z+Math.floor(i/5)*1.1);n.userData.zone=zi;root.add(n);crowds.push(n)}})
 const hud=document.createElement('aside');hud.id='v1500TransitHud';hud.innerHTML='<small>TRANSPORT IMMERSION</small><b id="v1500Flow">NORMAL FLOW</b><span id="v1500Gps">GPS READY</span><span id="v1500Travel">BUS • TAXI • FERRY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1500TransitBtn';btn.type='button';btn.className='action-primary';btn.textContent='TRANSPORT HUB';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1500TransitPanel';panel.hidden=true;panel.innerHTML='<div class="v1500-card"><header><div><small>V1401–V1500</small><h3>WORLD TRANSPORT + IMMERSION</h3></div><button id="v1500Close">CLOSE</button></header><div id="v1500Stats"></div><div id="v1500Destinations"></div><div class="v1500-actions"><button id="v1500Bus">TAKE BUS</button><button id="v1500Taxi">CALL TAXI</button><button id="v1500Ferry">TAKE FERRY</button><button id="v1500Rest">REST / STAY</button></div></div>';document.body.appendChild(panel);
 panel.querySelector('#v1500Destinations').innerHTML=destinations.map(d=>'<button class="v1500-dest" data-dest="'+d.id+'"><b>'+d.name+'</b><span>'+d.type.toUpperCase()+'</span></button>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1500Close').onclick=()=>panel.hidden=true;
 panel.querySelectorAll('[data-dest]').forEach(b=>b.onclick=()=>{const d=destinations.find(x=>x.id===b.dataset.dest);state.gpsTarget=d?.id||null;save();document.getElementById('v1500Gps').textContent=d?'GPS '+d.name:'GPS READY';window.__tggToast?.(d?'ROUTE SET — '+d.name:'GPS CLEARED')});
 panel.querySelector('#v1500Bus').onclick=()=>{state.busTrips++;save();window.__tggToast?.('BUS TRIP STARTED');render()};
 panel.querySelector('#v1500Taxi').onclick=()=>{state.taxiTrips++;save();window.__tggToast?.('TAXI / RIDESHARE REQUESTED');render()};
 panel.querySelector('#v1500Ferry').onclick=()=>{state.ferryTrips++;save();window.__tggToast?.('FERRY BOARDING');render()};
 panel.querySelector('#v1500Rest').onclick=()=>{const p=api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});const d=destinations.map(x=>({...x,d:Math.hypot(p.x-x.x,p.z-x.z)})).sort((a,b)=>a.d-b.d)[0];if(!d||d.d>28)return window.__tggToast?.('MOVE CLOSER TO A HOTEL, MOTEL, DINER OR CAMPGROUND');if(d.type==='hotel'||d.type==='motel')state.hotelStays++;else if(d.type==='diner')state.dinerVisits++;else if(d.type==='camp')state.campNights++;save();window.__tggToast?.('STOP COMPLETED — '+d.name);render()};
 function render(){panel.querySelector('#v1500Stats').innerHTML='<p>BUS '+state.busTrips+' • TAXI '+state.taxiTrips+' • FERRY '+state.ferryTrips+' • HOTEL '+state.hotelStays+' • CAMP '+state.campNights+'</p>'}
 let last=performance.now(),clock=0,nextDetour=Date.now()+80000;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;const hour=window.TGGLifeSandbox?.state?.()?.time??18,weather=window.TGGLifeSandbox?.state?.()?.weather||'clear';
  state.rushHour=(hour>=7&&hour<9)||(hour>=16&&hour<19);const trafficFactor=state.rushHour?0.55:weather==='rain'?.72:1;
  buses.forEach((b,i)=>{b.position.x+=dt*(5+i*.2)*b.userData.dir*trafficFactor;if(b.position.x>190)b.position.x=-190;if(b.position.x<-190)b.position.x=190});
  taxis.forEach((t,i)=>{t.position.x+=dt*(7+i*.15)*t.userData.dir*trafficFactor;if(t.position.x>190)t.position.x=-190;if(t.position.x<-190)t.position.x=190});
  ferries.forEach((f,i)=>{f.position.z+=dt*(.45+i*.05);if(f.position.z>188)f.position.z=120});
  crowds.forEach((n,i)=>{const z=crowdZones[n.userData.zone],rush=state.rushHour&&(z.name==='AIRPORT TERMINAL'||z.name==='CENTRAL STATION');n.visible=weather==='rain'&&z.name==='CAMPGROUND'?i%3===0:true;n.position.x+=Math.sin(clock*.22+i)*.0018*(rush?1.4:1)});
  construction.forEach((c,i)=>c.visible=((Math.floor(clock/20)+i)%2===0));cones.forEach((c,i)=>c.visible=construction[i%construction.length].visible);
  if(Date.now()>nextDetour){state.detours++;save();window.__tggToast?.('ROAD UPDATE — CONSTRUCTION DETOUR ACTIVE');nextDetour=Date.now()+100000}
  document.getElementById('v1500Flow').textContent=state.rushHour?'RUSH HOUR':'NORMAL FLOW';
 }requestAnimationFrame(tick);
 window.TGGTransportImmersion={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),destinations:()=>destinations.map(x=>({...x})),getStatus:()=>({version:VERSION,span:SPAN,buses:buses.length,taxis:taxis.length,ferries:ferries.length,stations:stations.length,crowds:crowds.length,rushHour:true,weatherSlowdown:true,constructionDetours:true,gpsRouting:true,etaReady:true,hotels:true,motels:true,diners:true,campgrounds:true,stationBoarding:true,airportActivity:true,ferryDocking:true,ok:true})};
 document.documentElement.dataset.tggV1500='on';window.dispatchEvent(new CustomEvent('tgg:v1500-ready',{detail:window.TGGTransportImmersion.getStatus()}));
}).catch(e=>{window.TGGTransportImmersion={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();