(()=>{'use strict';
const VERSION='10.00.0',SPAN='V9.01-V10.00',KEY='tgg-v1000-deep-world';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={season:'summer',snow:0,mud:0,events:0,serviceCalls:0,ownedProperties:[],wildlifeEncounters:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const properties=[
{id:'cabin',name:'PINE RIDGE CABIN',x:-150,z:-132,type:'cabin'},
{id:'farm',name:'WEST COUNTY FARM',x:-154,z:28,type:'farm'},
{id:'coast-house',name:'SUNSET COAST HOUSE',x:166,z:116,type:'coast'},
{id:'suburban-home',name:'MERCY FALLS HOME',x:-148,z:-48,type:'suburb'},
{id:'luxury-estate',name:'NORTH RIDGE ESTATE',x:122,z:-138,type:'estate'}];
const events=['HIGHWAY INCIDENT','CAR MEET','OUTDOOR CONCERT','ROADSIDE BREAKDOWN','FOREST CAMP','RIVER FESTIVAL','CANYON RACE'];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_DEEP_WORLD_V1000';scene.add(root);
 const mk=(c,r=.85,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const grass=mk(0x2b4226,1),snow=mk(0xe8eef5,.72),mud=mk(0x4b3a2b,.98),rock=mk(0x41474d,.96),water=new THREE.MeshPhysicalMaterial({color:0x1b5b77,roughness:.15,metalness:.04,transparent:true,opacity:.9,clearcoat:.5});
 const terrain=new THREE.Mesh(new THREE.PlaneGeometry(420,420,20,20),grass);terrain.rotation.x=-Math.PI/2;terrain.position.y=-.08;terrain.receiveShadow=true;root.add(terrain);
 const pos=terrain.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const h=Math.sin(x*.055)*2.2+Math.cos(y*.047)*1.8+Math.sin((x+y)*.021)*2.8;pos.setZ(i,h*.18)}
 pos.needsUpdate=true;terrain.geometry.computeVertexNormals();
 for(let i=0;i<22;i++){const a=i*.61,r=120+(i%5)*12;const h=new THREE.Mesh(new THREE.ConeGeometry(10+(i%4)*4,24+(i%5)*7,10),i%3===0?snow:rock);h.position.set(Math.cos(a)*r,10+(i%4)*2,Math.sin(a)*r);root.add(h)}
 const river=new THREE.Mesh(new THREE.PlaneGeometry(16,250),water);river.rotation.x=-Math.PI/2;river.rotation.z=.22;river.position.set(-42,.03,12);root.add(river);
 for(let i=0;i<4;i++){const falls=new THREE.Mesh(new THREE.PlaneGeometry(10,16),water.clone());falls.position.set(-34+i*4,8,-82-i*8);falls.material.opacity=.72;root.add(falls)}
 const trees=[];for(let i=0;i<220;i++){const a=i*2.399963,r=80+(i%74)*1.5,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<24||Math.abs(z)<24)continue;const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,2.8,7),mk(0x4d3727,.98));trunk.position.y=1.4;g.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(1.4+(i%3)*.18,4.2+(i%4)*.3,8),mk(i%2?0x183b27:0x20492e,.95));crown.position.y=4.2;g.add(crown);g.position.set(x,0,z);root.add(g);trees.push(g)}
 const trafficTypes=[['POLICE',0x182b6b],['AMBULANCE',0xe8e8e8],['FIRE',0xb32626],['BUS',0x3c6e8f],['SEMI',0x575b61],['MOTORCYCLE',0x111111]];
 const services=[];trafficTypes.forEach((t,i)=>{for(let j=0;j<2;j++){const v=new THREE.Mesh(new THREE.BoxGeometry(t[0]==='MOTORCYCLE'?.8:2.2,.9,t[0]==='SEMI'?6:3.8),mk(t[1],.45,.45));v.position.set(-170+i*18+j*7,.5,-162+i*5);v.userData.tggService={type:t[0],speed:.014+i*.002};root.add(v);services.push(v)}})
 const animals=[];for(let i=0;i<30;i++){const a=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,1.4),mk(i%3?0x70563d:0x4e463d,.96));a.position.set(-160+(i%10)*14,.4,92+Math.floor(i/10)*18);a.userData.tggAnimal=true;root.add(a);animals.push(a)}
 const mudZones=[];for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.CircleGeometry(5+(i%3)*2,20),mud);m.rotation.x=-Math.PI/2;m.position.set(-118+i*18,.015,48+(i%2)*16);root.add(m);mudZones.push(m)}
 const hud=document.createElement('aside');hud.id='v1000DeepWorldHud';hud.innerHTML='<small>DEEP WORLD</small><b id="v1000Season">SUMMER</b><span id="v1000Snow">SNOW 0%</span><span id="v1000Mud">MUD 0%</span><span id="v1000Event">WORLD QUIET</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1000DeepWorldBtn';btn.type='button';btn.className='action-primary';btn.textContent='DEEP WORLD';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1000DeepWorldPanel';panel.hidden=true;panel.innerHTML='<div class="v1000-card"><header><div><small>V901–V1000</small><h3>DEEP OPEN WORLD</h3></div><button id="v1000Close">CLOSE</button></header><div id="v1000Stats"></div><div id="v1000Props"></div><button id="v1000Claim">BUY / CLAIM NEAREST PROPERTY</button></div>';document.body.appendChild(panel);
 panel.querySelector('#v1000Props').innerHTML=properties.map(p=>'<article><b>'+p.name+'</b><span>'+p.type.toUpperCase()+'</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1000Close').onclick=()=>panel.hidden=true;
 const worldPos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 const nearestProperty=()=>{const p=worldPos();return properties.map(x=>({...x,d:Math.hypot(p.x-x.x,p.z-x.z)})).sort((a,b)=>a.d-b.d)[0]};
 function render(){panel.querySelector('#v1000Stats').innerHTML='<p>SEASON '+state.season.toUpperCase()+' • EVENTS '+state.events+' • SERVICE CALLS '+state.serviceCalls+' • PROPERTIES '+state.ownedProperties.length+'</p>'}
 panel.querySelector('#v1000Claim').onclick=()=>{const p=nearestProperty();if(!p||p.d>26)return window.__tggToast?.('MOVE CLOSER TO A PROPERTY');if(!state.ownedProperties.includes(p.id)){state.ownedProperties.push(p.id);save();window.__tggToast?.('PROPERTY ACQUIRED — '+p.name)}render()};
 let last=performance.now(),t=0,nextEvent=Date.now()+35000;
 function updateSeason(){const day=window.TGGLifeSandbox?.state?.()?.day||1;const q=Math.floor((day-1)/10)%4;state.season=['spring','summer','fall','winter'][q];state.snow=state.season==='winter'?75:state.season==='spring'?10:0;document.documentElement.dataset.tggSeason=state.season;terrain.material=state.season==='winter'?snow:grass}
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;t+=dt;updateSeason();
  services.forEach((v,i)=>{v.position.x+=v.userData.tggService.speed*dt*60*(i%2?1:-1);if(v.position.x>190)v.position.x=-190;if(v.position.x<-190)v.position.x=190});
  animals.forEach((a,i)=>{a.position.x+=Math.sin(t*.25+i)*.006;a.position.z+=Math.cos(t*.2+i)*.004;a.rotation.y+=Math.sin(t+i)*.001});
  const weather=window.TGGLifeSandbox?.state?.()?.weather||'clear';state.mud=weather==='rain'?Math.min(100,state.mud+dt*.12):Math.max(0,state.mud-dt*.02);
  if(Date.now()>nextEvent){const e=events[(state.events+(window.TGGLifeSandbox?.state?.()?.day||1))%events.length];state.events++;save();document.getElementById('v1000Event').textContent=e;window.__tggToast?.('WORLD EVENT — '+e);nextEvent=Date.now()+45000}
  document.getElementById('v1000Season').textContent=state.season.toUpperCase();document.getElementById('v1000Snow').textContent='SNOW '+Math.round(state.snow)+'%';document.getElementById('v1000Mud').textContent='MUD '+Math.round(state.mud)+'%';
 }requestAnimationFrame(tick);
 window.TGGDeepWorld={version:VERSION,span:SPAN,properties:()=>properties.map(x=>({...x})),state:()=>JSON.parse(JSON.stringify(state)),requestService:type=>{state.serviceCalls++;save();window.__tggToast?.((type||'SERVICE')+' DISPATCHED');return {accepted:true,type:type||'service'}},getStatus:()=>({version:VERSION,span:SPAN,terrainElevation:true,mountains:true,river:true,waterfalls:true,seasons:true,snow:true,mud:true,forestDensity:trees.length,serviceVehicles:services.length,wildlife:animals.length,properties:properties.length,worldEvents:events.length,ok:true})};
 document.documentElement.dataset.tggV1000='on';window.dispatchEvent(new CustomEvent('tgg:v1000-ready',{detail:window.TGGDeepWorld.getStatus()}));
}).catch(e=>{window.TGGDeepWorld={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();