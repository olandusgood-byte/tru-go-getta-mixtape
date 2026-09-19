(()=>{
'use strict';
const VERSION='7.54.0',KEY='tgg-v754-real-world-access',SCALE=2.75;
const BUILDINGS=[
{id:'studio',label:'RECORDING STUDIO',screen:'studio',x:-82,z:-56,park:[-74,-50],door:[-80,-54],roof:true,color:'#ff466d'},
{id:'park',label:'THE PARK',screen:'park',x:74,z:58,park:[66,64],door:[72,60],roof:false,color:'#4cff88'},
{id:'shops',label:'SHOP DISTRICT',screen:'shops',x:-72,z:76,park:[-63,70],door:[-70,74],roof:true,color:'#48d7ff'},
{id:'home',label:'MY APARTMENT',screen:'home',x:48,z:-82,park:[39,-75],door:[46,-80],roof:true,color:'#ffc84a'},
{id:'media',label:'MEDIA DISTRICT',screen:'media',x:6,z:108,park:[15,100],door:[8,106],roof:true,color:'#c56cff'},
{id:'garage',label:'GARAGE',screen:'garage',x:88,z:-74,park:[79,-68],door:[86,-72],roof:true,color:'#7a8cff'}
];
const BUTTONS={studioBtn:'studio',parkBtn:'park',shopsBtn:'shops',homeBtn:'home',mediaBtn:'media',garageBtn:'garage'};
const BACKS={studioBack:'studio',parkBack:'park',shopsBack:'shops',homeBack:'home',mediaBack:'media',garageBack:'garage'};
let targetId=null,lastInterior=null,roofSite=null,prevVehicle=false,roofRuntime=null;
const roofState={x:0,z:1.5};
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const world=()=>{const s=window.TGGGame?.getState?.()||{};return{x:((Number(s.x)||50)-50)*SCALE,z:((Number(s.y)||50)-50)*SCALE,state:s}};
const toPercent=(x,z)=>({x:50+x/SCALE,y:50+z/SCALE});
const dist=(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.z||0)-(b.z||0));
const site=id=>BUILDINGS.find(b=>b.id===id)||null;
function proximity(b,kind='door'){const p=world(),q=kind==='park'?{x:b.park[0],z:b.park[1]}:{x:b.door[0],z:b.door[1]};return dist(p,q)}
function nearest(kind='door'){let best=null;for(const b of BUILDINGS){const d=proximity(b,kind);if(!best||d<best.distance)best={...b,distance:d}}return best}
function setTarget(id){const b=site(id);if(!b)return false;targetId=id;renderHud();window.__tggToast?.('ROUTE SET — '+b.label);return true}
function navigationTarget(){
 if(!targetId)return null;const b=site(targetId);if(!b)return null;
 const s=world().state,inVehicle=!!s.inVehicle,p=inVehicle?b.park:b.door,d=proximity(b,inVehicle?'park':'door'),pct=toPercent(p[0],p[1]);
 return{x:pct.x,y:pct.y,label:(inVehicle?'PARK • ':'DOOR • ')+b.label,color:b.color,radius:inVehicle?5:3,arrived:d< (inVehicle?7:4)};
}
function markExterior(b){lastInterior={id:b.id,door:clone(b.door),park:clone(b.park),at:Date.now()};try{localStorage.setItem(KEY,JSON.stringify({targetId,lastInterior,roofSite:roofSite?.id||null}))}catch{}}
function enterBuilding(b){
 const s=world().state;if(!b||s.inVehicle)return false;
 if(proximity(b,'door')>5){setTarget(b.id);window.__tggToast?.('WALK TO THE FRONT DOOR');return false}
 markExterior(b);targetId=null;lastInterior={...lastInterior,id:b.id};
 window.TGGGame?.show?.(b.screen);window.__tggToast?.('ENTERED '+b.label);return true
}
function exitBuilding(id){const b=site(id)||site(lastInterior?.id);if(!b)return false;const s=window.TGGGame?.getState?.();const p=toPercent(b.door[0]+2,b.door[1]+1);if(s){s.x=p.x;s.y=p.y;s.inVehicle=false;window.TGGGame?.refresh?.();window.TGGGame?.save?.(true)}window.TGGGame?.show?.('game');targetId=null;return true}
function parkAndExit(b){
 const s=world().state;if(!s.inVehicle)return false;const speed=Math.abs(Number(window.TGGGame?.getDrivingState?.()?.speed)||0);
 if(proximity(b,'park')>8){setTarget(b.id);window.__tggToast?.('PULL INTO THE PARKING ZONE');return false}
 if(speed>1.1){window.__tggToast?.('SLOW DOWN TO PARK');return false}
 window.TGGGame?.toggleVehicle?.();markExterior(b);window.__tggToast?.('PARKED — WALK TO '+b.label);return true
}
function interact(){
 const s=world().state;
 if(s.inVehicle){const p=nearest('park');return p&&p.distance<8?parkAndExit(p):false}
 const d=nearest('door');return d&&d.distance<5?enterBuilding(d):false
}
function ensureRoofButtons(){
 BUILDINGS.filter(b=>b.roof).forEach(b=>{
   const screen=document.getElementById(b.screen);if(!screen||screen.querySelector('[data-v754-roof="'+b.id+'"]'))return;
   const host=screen.querySelector('.home-actions,.studio-actions,.media-actions,.shop-row,.garage-actions,.panel')||screen;
   const btn=document.createElement('button');btn.type='button';btn.dataset.v754Roof=b.id;btn.className='v754-roof-access';btn.textContent='STAIRS / ELEVATOR TO ROOF';host.appendChild(btn);
 });
}
function buildRoof(){
 if(roofRuntime||!window.THREE)return roofRuntime;
 const host=document.getElementById('v754Roof3d');if(!host)return null;
 const THREE=window.THREE,scene=new THREE.Scene();scene.background=new THREE.Color(0x060912);scene.fog=new THREE.FogExp2(0x080b14,.028);
 const camera=new THREE.PerspectiveCamera(56,1,.1,160);camera.position.set(11,7,13);
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;host.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0x8298d7,0x05070a,1.5));const moon=new THREE.DirectionalLight(0xd9e6ff,2.4);moon.position.set(10,18,8);moon.castShadow=true;scene.add(moon);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(20,.45,15),new THREE.MeshStandardMaterial({color:0x181d25,roughness:.9,metalness:.08}));roof.position.y=-.25;roof.receiveShadow=true;scene.add(roof);
 const wallMat=new THREE.MeshStandardMaterial({color:0x2a303a,roughness:.78});[[-10,1,0,.4,2,15],[10,1,0,.4,2,15],[0,1,-7.5,20,2,.4],[0,1,7.5,20,2,.4]].forEach(v=>{const m=new THREE.Mesh(new THREE.BoxGeometry(v[3],v[4],v[5]),wallMat);m.position.set(v[0],v[1],v[2]);scene.add(m)});
 const hvac=new THREE.Mesh(new THREE.BoxGeometry(3,1.4,2.3),new THREE.MeshStandardMaterial({color:0x555e69,metalness:.7,roughness:.38}));hvac.position.set(-4,.7,-2.8);scene.add(hvac);
 const stair=new THREE.Mesh(new THREE.BoxGeometry(3.4,3.2,3),new THREE.MeshStandardMaterial({color:0x252b34,roughness:.8}));stair.position.set(4,1.6,2.8);scene.add(stair);
 const door=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.3,.12),new THREE.MeshStandardMaterial({color:0x0c1118,emissive:0x294a68,emissiveIntensity:1.1}));door.position.set(4,1.25,1.25);scene.add(door);
 const player=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.4,1.0,4,8),new THREE.MeshStandardMaterial({color:0xc7ff00,roughness:.55}));body.position.y=1.4;player.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.3,12,10),new THREE.MeshStandardMaterial({color:0xa97250,roughness:.7}));head.position.y=2.35;player.add(head);scene.add(player);
 for(let i=0;i<26;i++){const h=5+(i%8)*1.7,w=2.3+(i%4)*.8;const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),new THREE.MeshStandardMaterial({color:0x101522,roughness:.8,emissive:i%3===0?0x14253c:0x05070a,emissiveIntensity:.45}));const a=i/26*Math.PI*2,r=26+(i%5)*3;b.position.set(Math.cos(a)*r,h/2-2,Math.sin(a)*r);scene.add(b)}
 function resize(){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()}
 new ResizeObserver(resize).observe(host);resize();
 function tick(){requestAnimationFrame(tick);if(window.TGGGame?.getActiveScreen?.()!=='roof')return;player.position.set(roofState.x,0,roofState.z);camera.position.x=roofState.x+10;camera.position.z=roofState.z+12;camera.lookAt(roofState.x,1.5,roofState.z);renderer.render(scene,camera)}tick();
 roofRuntime={scene,camera,renderer,player,resize};return roofRuntime
}
function openRoof(id){const b=site(id);if(!b?.roof)return false;roofSite=b;roofState.x=0;roofState.z=1.5;buildRoof();document.getElementById('v754RoofTitle').textContent=b.label+' ROOFTOP';window.TGGGame?.show?.('roof');return true}
function closeRoof(){const b=roofSite||site(lastInterior?.id);window.TGGGame?.show?.(b?.screen||'game');return true}
function roofMove(dx,dz){roofState.x=Math.max(-8.7,Math.min(8.7,roofState.x+dx));roofState.z=Math.max(-6.2,Math.min(6.2,roofState.z+dz));return clone(roofState)}
function ensureWorldMarkers(){
 const api=window.TGG3D;if(!api?.scene||!window.THREE||api.scene.getObjectByName('TGG_ACCESS_V754'))return false;const THREE=window.THREE,g=new THREE.Group();g.name='TGG_ACCESS_V754';api.scene.add(g);
 BUILDINGS.forEach(b=>{
  const pm=new THREE.Mesh(new THREE.PlaneGeometry(7,4),new THREE.MeshBasicMaterial({color:0x21364b,transparent:true,opacity:.38,side:THREE.DoubleSide}));pm.rotation.x=-Math.PI/2;pm.position.set(b.park[0],.11,b.park[1]);g.add(pm);
  const dm=new THREE.Mesh(new THREE.BoxGeometry(1.5,3,.25),new THREE.MeshStandardMaterial({color:new THREE.Color(b.color),emissive:new THREE.Color(b.color),emissiveIntensity:1.8,transparent:true,opacity:.72}));dm.position.set(b.door[0],1.5,b.door[1]);g.add(dm);
 });return true
}
function renderHud(){
 let el=document.getElementById('v754AccessHud');if(!el){el=document.createElement('aside');el.id='v754AccessHud';el.innerHTML='<small>REAL WORLD ACCESS</small><b id="v754AccessTitle">FREE ROAM</b><span id="v754AccessHint">Drive • park • exit • walk to doors</span>';document.body.appendChild(el)}
 const s=world().state,b=targetId?site(targetId):null,n=s.inVehicle?nearest('park'):nearest('door');
 const title=document.getElementById('v754AccessTitle'),hint=document.getElementById('v754AccessHint');
 if(b)title.textContent=b.label;else title.textContent='FREE ROAM';
 if(s.inVehicle&&n?.distance<8)hint.textContent='SLOW + F TO PARK / EXIT';
 else if(!s.inVehicle&&n?.distance<5)hint.textContent='F TO ENTER '+n.label;
 else hint.textContent=s.inVehicle?'DRIVE TO A PARKING ZONE':'WALK TO A FRONT DOOR';
}
function bind(){
 ensureRoofButtons();document.getElementById('v754RoofBack')?.addEventListener('click',closeRoof);
 document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.dataset.v754Roof){e.preventDefault();e.stopImmediatePropagation();openRoof(b.dataset.v754Roof);return}
   const id=BUTTONS[b.id];if(id&&window.TGGGame?.getActiveScreen?.()==='game'){e.preventDefault();e.stopImmediatePropagation();const s=world().state,st=site(id);if(!s.inVehicle&&proximity(st,'door')<5)enterBuilding(st);else setTarget(id);return}
   const back=BACKS[b.id];if(back&&window.TGGGame?.getActiveScreen?.()===site(back)?.screen){e.preventDefault();e.stopImmediatePropagation();exitBuilding(back)}
 },true);
 document.addEventListener('keydown',e=>{
   const screen=window.TGGGame?.getActiveScreen?.();
   if(screen==='game'&&(e.key==='f'||e.key==='F')){const s=world().state,n=s.inVehicle?nearest('park'):nearest('door');if(n&&n.distance<(s.inVehicle?8:5)){e.preventDefault();e.stopImmediatePropagation();interact();return}}
   if(screen==='roof'){const k=e.key.length===1?e.key.toLowerCase():e.key;if(k==='w'||k==='ArrowUp'){e.preventDefault();roofMove(0,-.55)}else if(k==='s'||k==='ArrowDown'){e.preventDefault();roofMove(0,.55)}else if(k==='a'||k==='ArrowLeft'){e.preventDefault();roofMove(-.55,0)}else if(k==='d'||k==='ArrowRight'){e.preventDefault();roofMove(.55,0)}else if(k==='e'||k==='Escape'){e.preventDefault();closeRoof()}}
 },true);
 setInterval(()=>{const s=world().state;if(prevVehicle&&!s.inVehicle){const p=nearest('park');if(p&&p.distance<10)markExterior(p)}prevVehicle=!!s.inVehicle;ensureWorldMarkers();ensureRoofButtons();renderHud()},250);
}
function snapshot(){return{version:VERSION,targetId,lastInterior:clone(lastInterior),roofSite:roofSite?.id||null,buildings:BUILDINGS.map(b=>({id:b.id,door:b.door,park:b.park,roof:b.roof})),features:['parking-zones','speed-gated-park-exit','walk-to-door-entry','physical-destination-routing','exterior-return-points','rooftop-access','rooftop-walking','3d-door-parking-markers','teleport-button-lockout']}}
function run(){const checks={game:!!window.TGGGame,world:!!window.TGG3D,openWorld:!!window.TGGOpenWorld,buildings:BUILDINGS.length>=6,roofScreen:!!document.getElementById('roof'),features:snapshot().features.length===9};const failed=Object.keys(checks).filter(k=>!checks[k]);return{version:VERSION,layer:'REAL-WORLD-ACCESS',ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString(),mutationPolicy:'local-only'}}
function boot(){bind();ensureWorldMarkers();renderHud();window.TGGPhysicalAccess={version:VERSION,setTarget,navigationTarget,nearest,interact,enterBuilding,exitBuilding,parkAndExit,openRoof,closeRoof,roofMove,snapshot,run};window.TGGV754={version:VERSION,run,snapshot};document.documentElement.dataset.tggV754='on';window.dispatchEvent(new CustomEvent('tgg:v754-ready',{detail:run()}))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();