(()=>{
'use strict';
const VERSION='7.80.0',SPAN='V7.63-V7.80',KEY='tgg-v780-life-sandbox';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={weather:'clear',time:18.5,day:1,lastEncounter:0,encounters:0,miles:0,discovered:[],fuel:100,condition:100};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state};
const biomes=[
 {id:'metro',name:'TGG METRO',x:0,z:0,r:52,type:'city'},
 {id:'pine',name:'PINE COUNTRY',x:-112,z:-106,r:58,type:'forest'},
 {id:'ridge',name:'NORTH RIDGE',x:92,z:-118,r:56,type:'mountain'},
 {id:'lake',name:'LAKE COUNTRY',x:-94,z:102,r:50,type:'lake'},
 {id:'southwoods',name:'SOUTH WOODS',x:96,z:112,r:54,type:'forest'},
 {id:'industrial',name:'INDUSTRIAL BELT',x:126,z:16,r:48,type:'industrial'},
 {id:'farmland',name:'WEST COUNTY',x:-138,z:12,r:62,type:'country'}
];
const encounters=[
 {id:'roadside-show',label:'ROADSIDE SHOW',types:['city','country'],chance:.18},
 {id:'street-race-callout',label:'STREET RACE CALLOUT',types:['city','industrial'],chance:.18},
 {id:'breakdown',label:'STRANDED DRIVER',types:['country','forest','mountain'],chance:.14},
 {id:'wildlife',label:'WILDLIFE CROSSING',types:['forest','mountain','lake'],chance:.2},
 {id:'pop-up-market',label:'POP-UP MARKET',types:['city','country'],chance:.12},
 {id:'scenic-overlook',label:'SCENIC OVERLOOK',types:['mountain','lake'],chance:.18}
];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_LIFE_SANDBOX_V780';scene.add(root);
 const mats={
  dirt:new THREE.MeshStandardMaterial({color:0x594a35,roughness:.98}),
  grass:new THREE.MeshStandardMaterial({color:0x243a20,roughness:1}),
  rock:new THREE.MeshStandardMaterial({color:0x3b4244,roughness:.93}),
  sand:new THREE.MeshStandardMaterial({color:0x746043,roughness:.98}),
  glow:new THREE.MeshStandardMaterial({color:0xffb64c,emissive:0xff7a1a,emissiveIntensity:2.2,roughness:.5})
 };
 const addTrail=(x,z,w,d,rot=0,mat=mats.dirt)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,.035,d),mat);m.position.set(x,.02,z);m.rotation.y=rot;m.receiveShadow=true;root.add(m)};
 addTrail(-105,-104,7,130,.28); addTrail(-124,-44,6,102,-.42); addTrail(96,-112,6,118,.62); addTrail(108,94,6,116,-.55); addTrail(-112,98,5,86,.8); addTrail(-136,16,8,132,0);
 for(let i=0;i<34;i++){const a=i*.73,r=22+(i%8)*4;const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1.3+(i%4)*.35,0),mats.rock);rock.scale.y=.6+(i%3)*.2;rock.position.set(92+Math.cos(a)*r,(i%4)*.25,-118+Math.sin(a)*r);root.add(rock)}
 for(let i=0;i<28;i++){const x=-152+(i%7)*8,z=-16+Math.floor(i/7)*18;const field=new THREE.Mesh(new THREE.BoxGeometry(5,.12,10),i%2?mats.grass:mats.sand);field.position.set(x,.04,z);root.add(field)}
 const stationMat=new THREE.MeshStandardMaterial({color:0x1a2028,metalness:.28,roughness:.5});
 const stops=[[-126,-18,'WEST COUNTY SERVICE'],[120,-62,'RIDGE GAS'],[78,126,'SOUTH WOODS STOP']];
 stops.forEach(([x,z,label])=>{const g=new THREE.Group(),b=new THREE.Mesh(new THREE.BoxGeometry(11,4.5,7),stationMat);b.position.y=2.25;g.add(b);const sign=new THREE.Mesh(new THREE.BoxGeometry(6,.8,.3),mats.glow);sign.position.set(0,4.8,0);g.add(sign);g.position.set(x,0,z);g.userData.tggLabel=label;root.add(g)});
 const hud=document.createElement('aside');hud.id='v780WorldHud';
 hud.innerHTML='<div><small>LIFE SANDBOX</small><b id="v780Biome">TGG METRO</b></div><div><span id="v780Clock">DAY 1 • 6:30 PM</span><span id="v780Weather">CLEAR</span></div>';
 document.body.appendChild(hud);
 const banner=document.createElement('div');banner.id='v780Encounter';banner.hidden=true;document.body.appendChild(banner);
 let prev=null,dist=0,lastTick=performance.now();
 const worldPos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 const biomeFor=p=>biomes.slice().sort((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-b.x,p.z-b.z))[0];
 const weatherCycle=['clear','clear','cloudy','rain','fog','clear'];
 const fmtTime=t=>{let h=Math.floor(t)%24,m=Math.floor((t%1)*60),amp=h>=12?'PM':'AM',hh=h%12||12;return hh+':'+String(m).padStart(2,'0')+' '+amp};
 function setWeather(name){state.weather=name;save();document.documentElement.dataset.tggWeather=name;scene.fog&&(scene.fog.density=name==='fog'?.018:name==='rain'?.011:.006);return name}
 function discover(b){if(!state.discovered.includes(b.id)){state.discovered.push(b.id);save();window.__tggToast?.('DISCOVERED — '+b.name)}}
 function maybeEncounter(b,now){if(now-state.lastEncounter<45000)return;const pool=encounters.filter(e=>e.types.includes(b.type));if(!pool.length)return;const e=pool[(state.day+state.encounters+Math.floor(state.time))%pool.length];if(Math.random()>e.chance)return;state.lastEncounter=now;state.encounters++;save();banner.textContent=e.label+' • '+b.name;banner.hidden=false;setTimeout(()=>banner.hidden=true,4200);window.dispatchEvent(new CustomEvent('tgg:world-encounter',{detail:{...e,biome:b.name}}))}
 function tick(now){
  requestAnimationFrame(tick);
  const dt=Math.min(.1,(now-lastTick)/1000);lastTick=now;state.time+=dt*.045;
  if(state.time>=24){state.time-=24;state.day++;setWeather(weatherCycle[state.day%weatherCycle.length])}
  const p=worldPos(),b=biomeFor(p);discover(b);maybeEncounter(b,Date.now());
  if(prev){dist+=Math.hypot(p.x-prev.x,p.z-prev.z);if(dist>8){state.miles+=dist/160;dist=0;save()}} prev=p;
  const game=window.TGGGame?.getState?.();if(game?.inVehicle){state.fuel=clamp(state.fuel-dt*.0025,0,100)}
  document.getElementById('v780Biome').textContent=b.name;
  document.getElementById('v780Clock').textContent='DAY '+state.day+' • '+fmtTime(state.time);
  document.getElementById('v780Weather').textContent=state.weather.toUpperCase();
  const sun=Math.max(.08,Math.sin(((state.time-6)/24)*Math.PI*2)*.5+.55);
  scene.traverse(o=>{if(o.isDirectionalLight&&o.userData?.tggV780!==false)o.intensity=Math.min(o.intensity,Math.max(.35,sun*2.1))});
 }
 setWeather(state.weather);requestAnimationFrame(tick);
 window.TGGLifeSandbox={
  version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),biomes:()=>biomes.map(x=>({...x})),
  setWeather,refuel:()=>{state.fuel=100;return save()},repair:()=>{state.condition=100;return save()},
  getStatus:()=>({version:VERSION,span:SPAN,biomes:biomes.length,encounters:encounters.length,weather:true,dayNight:true,longTravel:true,roadsideStops:stops.length,discovered:state.discovered.length,ok:true})
 };
 document.documentElement.dataset.tggV780='on';
 window.dispatchEvent(new CustomEvent('tgg:v780-ready',{detail:window.TGGLifeSandbox.getStatus()}));
}).catch(err=>{window.TGGLifeSandbox={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(err?.message||err)})}});
})();