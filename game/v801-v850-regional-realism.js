(()=>{'use strict';
const VERSION='8.50.0',SPAN='V8.01-V8.50',KEY='tgg-v850-regional-realism';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={discovered:[],propertyClaims:0,radio:'CITY 101.7',roadCondition:'dry'};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const regions=[
{id:'coast',name:'SUNSET COAST',x:158,z:108,type:'coast',radio:'COAST 88.9'},
{id:'canyon',name:'REDLINE CANYON',x:146,z:-92,type:'canyon',radio:'ROAD 93.3'},
{id:'river',name:'RIVER COUNTY',x:-82,z:150,type:'river',radio:'COUNTRY 97.5'},
{id:'smalltown',name:'MERCY FALLS',x:-158,z:-54,type:'town',radio:'LOCAL 104.1'},
{id:'interstate',name:'I-9 INTERSTATE',x:0,z:-154,type:'highway',radio:'CITY 101.7'}];
const raceTypes=['HIGHWAY RUN','CANYON SPRINT','DIRT CIRCUIT','COAST LOOP'];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_REGIONAL_REALISM_V850';scene.add(root);
 const mk=(c,r=.8,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const road=mk(0x181b20,.72,.18),dirt=mk(0x6b5437,.98),rock=mk(0x3a3d40,.94),water=new THREE.MeshPhysicalMaterial({color:0x174f68,roughness:.18,metalness:.05,transparent:true,opacity:.88,clearcoat:.45});
 const addRoad=(x,z,w,d,rot=0,mat=road)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,.06,d),mat);o.position.set(x,.03,z);o.rotation.y=rot;o.receiveShadow=true;root.add(o);return o};
 addRoad(0,-154,12,330,Math.PI/2);addRoad(112,-98,9,160,.65);addRoad(148,88,10,150,.08);addRoad(-132,-54,8,112,.4);addRoad(-88,138,7,120,-.7,dirt);
 for(let i=0;i<18;i++){const a=i*.7,r=24+(i%5)*6;const h=new THREE.Mesh(new THREE.ConeGeometry(8+(i%4)*3,18+(i%5)*5,8),rock);h.position.set(146+Math.cos(a)*r,8,-92+Math.sin(a)*r);root.add(h)}
 const river=new THREE.Mesh(new THREE.PlaneGeometry(18,150),water);river.rotation.x=-Math.PI/2;river.rotation.z=-.7;river.position.set(-82,.025,148);root.add(river);
 const coast=new THREE.Mesh(new THREE.PlaneGeometry(120,70),water.clone());coast.rotation.x=-Math.PI/2;coast.position.set(170,.01,132);root.add(coast);
 const bridgeMat=mk(0x444a52,.52,.6);
 for(let i=-2;i<=2;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(4,.5,26),bridgeMat);b.position.set(-82+i*4,.5,148+i*2);b.rotation.y=-.7;root.add(b)}
 const tunnelMat=mk(0x25292d,.9,.2);
 for(let i=0;i<5;i++){const arch=new THREE.Mesh(new THREE.TorusGeometry(6,.7,10,24,Math.PI),tunnelMat);arch.rotation.z=Math.PI;arch.rotation.y=.65;arch.position.set(126+i*6,6,-116+i*6);root.add(arch)}
 const settlements=[
{x:-158,z:-54,label:'MERCY FALLS',kind:'town'},
{x:162,z:100,label:'COAST VILLAGE',kind:'town'},
{x:-112,z:142,label:'RIVER STOP',kind:'service'},
{x:14,z:-158,label:'I-9 SERVICE PLAZA',kind:'service'},
{x:136,z:-84,label:'CANYON GARAGE',kind:'garage'},
{x:170,z:114,label:'COAST MOTEL',kind:'motel'}];
 settlements.forEach(p=>{const g=new THREE.Group();for(let j=0;j<4;j++){const h=new THREE.Mesh(new THREE.BoxGeometry(6+(j%2)*2,3+(j%3),6),mk(0x313944,.82,.1));h.position.set((j-1.5)*7,1.5+(j%3)/2,(j%2)*8);g.add(h)}g.position.set(p.x,0,p.z);g.userData.tggSettlement=p;root.add(g)});
 const wildlife=[];for(let i=0;i<16;i++){const a=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,1.7),mk(0x6e5a42,.95));a.position.set(-120+(i%8)*10,.45,116+Math.floor(i/8)*18);a.userData.v850Wildlife=true;root.add(a);wildlife.push(a)}
 const traffic=[];for(let i=0;i<18;i++){const car=new THREE.Mesh(new THREE.BoxGeometry(1.9,.8,3.8),mk(i%3?0x7a1f1f:0x1f3f7a,.38,.55));car.position.set(-150+i*18,.45,-154+(i%2)*3);car.userData.v850Traffic={speed:.018+(i%5)*.003};root.add(car);traffic.push(car)}
 const hud=document.createElement('aside');hud.id='v850RegionalHud';hud.innerHTML='<small>REGIONAL WORLD</small><b id="v850Region">I-9 INTERSTATE</b><span id="v850Radio">CITY 101.7</span><span id="v850Surface">DRY ROAD</span>';document.body.appendChild(hud);
 const action=document.createElement('button');action.id='v850RegionalBtn';action.type='button';action.className='action-primary';action.textContent='REGIONAL WORLD';document.querySelector('#game .action-deck .actions')?.appendChild(action);
 const panel=document.createElement('section');panel.id='v850RegionalPanel';panel.hidden=true;panel.innerHTML='<div class="v850-card"><header><div><small>V801–V850</small><h3>REGIONAL REALISM</h3></div><button id="v850Close">CLOSE</button></header><div id="v850Stats"></div><div id="v850Regions"></div><button id="v850Claim">CLAIM NEAREST PROPERTY</button></div>';document.body.appendChild(panel);
 panel.querySelector('#v850Regions').innerHTML=regions.map(r=>'<article><b>'+r.name+'</b><span>'+r.type.toUpperCase()+' • '+r.radio+'</span></article>').join('');
 action.onclick=()=>{panel.hidden=false;renderPanel()};panel.querySelector('#v850Close').onclick=()=>panel.hidden=true;
 const worldPos=()=>api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});
 const nearestRegion=()=>{const p=worldPos();return regions.map(r=>({...r,d:Math.hypot(p.x-r.x,p.z-r.z)})).sort((a,b)=>a.d-b.d)[0]};
 function renderPanel(){panel.querySelector('#v850Stats').innerHTML='<p>REGIONS '+regions.length+' • TRAFFIC '+traffic.length+' • WILDLIFE '+wildlife.length+' • PROPERTIES '+state.propertyClaims+'</p>'}
 panel.querySelector('#v850Claim').onclick=()=>{const r=nearestRegion();if(!r||r.d>28)return window.__tggToast?.('MOVE CLOSER TO A REGIONAL PROPERTY ZONE');state.propertyClaims++;save();window.__tggToast?.('PROPERTY CLAIM REGISTERED — '+r.name);renderPanel()};
 let last=performance.now(),t=0;
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;t+=dt;
  traffic.forEach((c,i)=>{c.position.x+=c.userData.v850Traffic.speed*dt*60*(i%2?1:-1);if(c.position.x>176)c.position.x=-176;if(c.position.x<-176)c.position.x=176;c.rotation.y=i%2?Math.PI/2:-Math.PI/2});
  wildlife.forEach((w,i)=>{w.position.x+=Math.sin(t*.45+i)*.004;w.rotation.y=Math.sin(t*.2+i)});
  const r=nearestRegion();if(r){document.getElementById('v850Region').textContent=r.name;state.radio=r.radio;document.getElementById('v850Radio').textContent=r.radio;if(!state.discovered.includes(r.id)&&r.d<34){state.discovered.push(r.id);save();window.__tggToast?.('REGION DISCOVERED — '+r.name)}}
  const weather=window.TGGLifeSandbox?.state?.()?.weather||'clear';state.roadCondition=weather==='rain'?'wet':weather==='fog'?'damp':'dry';document.getElementById('v850Surface').textContent=state.roadCondition.toUpperCase()+' ROAD';
 }requestAnimationFrame(tick);
 window.TGGRegionalRealism={version:VERSION,span:SPAN,regions:()=>regions.map(r=>({...r})),raceTypes:[...raceTypes],state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,regions:regions.length,traffic:traffic.length,wildlife:wildlife.length,settlements:settlements.length,bridges:true,tunnels:true,river:true,coast:true,interstate:true,regionalRadio:true,propertyClaims:state.propertyClaims,ok:true})};
 document.documentElement.dataset.tggV850='on';window.dispatchEvent(new CustomEvent('tgg:v850-ready',{detail:window.TGGRegionalRealism.getStatus()}));
}).catch(e=>{window.TGGRegionalRealism={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();