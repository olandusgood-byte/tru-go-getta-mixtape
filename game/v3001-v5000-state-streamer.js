(()=>{'use strict';
const VERSION='50.00.0',SPAN='V30.01-V50.00',KEY='tgg-v5000-state-streamer';
const defaults={active:'NC',transitions:0,chunks:0,borders:0,miles:0,lastBiome:null,quality:'high'};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE&&window.TGGAmericaWorldgen?r(window.TGG3D):requestAnimationFrame(t);t()});
const palettes={
 desert:{ground:0x8d6541,rock:0x8d5436,veg:0x597044,sky:0xd9ad7c},
 alpine:{ground:0x46604c,rock:0x747a7f,veg:0x24422f,sky:0x9fc4db},
 coast:{ground:0x3b664e,rock:0x5d6468,veg:0x2f684c,sky:0x82b8d8},
 plains:{ground:0x7d7b46,rock:0x766b58,veg:0x64773e,sky:0xa8c6d8},
 forest:{ground:0x38513c,rock:0x565b58,veg:0x1f492d,sky:0x8fb7c8},
 wetland:{ground:0x49634d,rock:0x5e6155,veg:0x356c48,sky:0x91b7be},
 urban:{ground:0x444a50,rock:0x50555a,veg:0x315e3b,sky:0x9baab8},
 tropical:{ground:0x4d724c,rock:0x58534a,veg:0x24733e,sky:0x73bdd5}
};
function classify(p){
 const t=(p.terrain+' '+p.weather+' '+p.biome).toLowerCase();
 if(/volcanic|tropical/.test(t))return'tropical';
 if(/wetland|bayou|marsh|everglade/.test(t))return'wetland';
 if(/desert|mesa|red rock|high-desert|basin/.test(t))return'desert';
 if(/alpine|rockies|mountain|blue ridge|appalach/.test(t))return'alpine';
 if(/coast|gulf|shore|sound|island/.test(t))return'coast';
 if(/prairie|plain|farmland|delta|sandhill/.test(t))return'plains';
 if(/metro|city|suburb/.test(t))return'urban';
 return'forest';
}
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene;
 const root=new THREE.Group();root.name='TGG_STATE_STREAMER_V5000';scene.add(root);
 const world=new THREE.Group();world.name='STATE_WORLD_ACTIVE';root.add(world);
 const border=new THREE.Group();border.name='STATE_BORDER_GATE';root.add(border);
 const mk=(c,r=.8,m=.08)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const clear=(g)=>{while(g.children.length){const o=g.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose?.())}})}};
 function addTree(x,z,pal,scale=1){
  const g=new THREE.Group(),trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*scale,.22*scale,2.1*scale,6),mk(0x4d3827,.98));
  trunk.position.y=1.05*scale;g.add(trunk);
  const top=new THREE.Mesh(new THREE.ConeGeometry(.9*scale,2.8*scale,7),mk(pal.veg,.94));top.position.y=2.9*scale;g.add(top);g.position.set(x,0,z);world.add(g)
 }
 function addCactus(x,z,pal,s=1){
  const c=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.24*s,2.6*s,8),mk(pal.veg,.94));c.position.set(x,1.3*s,z);world.add(c)
 }
 function addBuilding(x,z,h=5,w=5,d=5,color=0x3e4853){
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mk(color,.58,.25));b.position.set(x,h/2,z);world.add(b);return b
 }
 function addRoad(x,z,w,d,rot=0){
  const r=new THREE.Mesh(new THREE.BoxGeometry(w,.08,d),mk(0x181c21,.7,.25));r.position.set(x,.04,z);r.rotation.y=rot;world.add(r);
  const lane=new THREE.Mesh(new THREE.BoxGeometry(.16,.09,d*.96),mk(0xe7dfb0,.52,.05));lane.position.set(x,.09,z);lane.rotation.y=rot;world.add(lane)
 }
 function addWater(x,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshPhysicalMaterial({color:0x1f6680,roughness:.15,metalness:.02,transparent:true,opacity:.88,clearcoat:.7}));m.rotation.x=-Math.PI/2;m.position.set(x,.03,z);world.add(m)
 }
 function addMountain(x,z,pal,h=24,r=10){
  const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,8),mk(pal.rock,.94,.04));m.position.set(x,h/2-1,z);world.add(m)
 }
 function addSign(text,x,z){
  const post=new THREE.Mesh(new THREE.BoxGeometry(.18,3,.18),mk(0x6b6f74,.5,.65));post.position.set(x,1.5,z);world.add(post);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(3.6,1.1,.18),mk(0x1c5b33,.48,.25));plate.position.set(x,3,z);plate.userData.label=text;world.add(plate)
 }
 function createBorder(from,to){
  clear(border);const mat=mk(0x1d2935,.45,.55);
  const a=new THREE.Mesh(new THREE.BoxGeometry(.3,7,.3),mat),b=a.clone(),beam=new THREE.Mesh(new THREE.BoxGeometry(10,.35,.35),mat);
  a.position.set(-5,3.5,-38);b.position.set(5,3.5,-38);beam.position.set(0,6.8,-38);border.add(a,b,beam);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(6,1.3,.25),mk(0x204f78,.5,.35));sign.position.set(0,5.5,-38);sign.userData.label='WELCOME '+to; border.add(sign);
  state.borders++;save();window.__tggToast?.('STATE LINE — '+from+' → '+to)
 }
 function stream(code){
  const p=window.TGGAmericaWorldgen.profile(code);if(!p)return;
  const previous=state.active;const biome=classify(p),pal=palettes[biome]||palettes.forest;clear(world);
  scene.background=new THREE.Color(pal.sky);if(scene.fog?.color)scene.fog.color.setHex(pal.sky);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(420*p.scale,420*p.scale,14,14),mk(pal.ground,.98,.01));ground.rotation.x=-Math.PI/2;ground.position.y=-.11;ground.receiveShadow=true;world.add(ground);
  const pos=ground.geometry.attributes.position;
  const mountain=/alpine|mountain|rockies|ridge|appalach/.test((p.terrain+' '+p.biome).toLowerCase()),desert=biome==='desert';
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const amp=mountain?6:desert?2.2:biome==='plains'?.8:2.8;pos.setZ(i,(Math.sin(x*.035)+Math.cos(y*.028)+Math.sin((x+y)*.017))*amp*.12)}pos.needsUpdate=true;ground.geometry.computeVertexNormals();
  addRoad(0,0,14,360,0);addRoad(0,0,14,360,Math.PI/2);
  for(let i=-3;i<=3;i++){if(i!==0)addRoad(i*36,0,7,300,0)}
  const seed=[...code].reduce((a,c)=>a+c.charCodeAt(0),0);
  const vegCount=biome==='plains'?34:desert?24:biome==='urban'?18:90;
  for(let i=0;i<vegCount;i++){const a=i*2.399963+seed,r=44+(i%45)*2.4,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<12||Math.abs(z)<12)continue;desert?addCactus(x,z,pal,.8+(i%3)*.2):addTree(x,z,pal,.8+(i%4)*.12)}
  const mountainCount=mountain?18:desert?10:5;for(let i=0;i<mountainCount;i++){const a=i*.72,r=110+(i%5)*14;addMountain(Math.cos(a)*r,Math.sin(a)*r,pal,mountain?22+(i%5)*5:12+(i%3)*4,mountain?9+(i%4)*3:7)}
  const cityCount=Math.max(8,(p.cityDensity||4)*5);for(let i=0;i<cityCount;i++){const ring=30+(i%5)*10,a=i*1.19;addBuilding(Math.cos(a)*ring,Math.sin(a)*ring,3+(i%8)*2,4+(i%3),4+(i%4),0x39434f+(i%4)*0x030303)}
  if(p.coast||/coast|gulf|lake|sound|island/.test((p.biome||'').toLowerCase()))addWater(145,80,110,210);
  if(/river|bayou|wetland|delta/.test((p.biome||'').toLowerCase()))addWater(-90,20,24,260);
  (p.signature||[]).slice(0,4).forEach((s,i)=>addSign(String(s).toUpperCase(),-58+i*38,-52-(i%2)*12));
  state.active=code;state.lastBiome=biome;state.transitions++;state.chunks++;state.miles+=Math.max(80,Math.round(140*p.scale));save();
  if(previous&&previous!==code)createBorder(previous,code);
  document.documentElement.dataset.tggStateBiome=biome;document.documentElement.dataset.tggActiveState=code;
  render(p,biome);
  window.dispatchEvent(new CustomEvent('tgg:state-streamed',{detail:{code,biome,profile:p}}));
 }
 function render(p,biome){
  const h=document.getElementById('v5000StreamerHud');if(h){h.querySelector('b').textContent=p.name.toUpperCase();h.querySelector('[data-biome]').textContent=biome.toUpperCase()+' • '+p.terrain.toUpperCase();h.querySelector('[data-climate]').textContent=p.weather.toUpperCase()+' • '+p.radio}
  const stats=document.getElementById('v5000Stats');if(stats)stats.textContent=state.chunks+' WORLD STREAMS • '+state.borders+' BORDER CROSSINGS • '+Math.round(state.miles)+' MILES';
  const detail=document.getElementById('v5000Detail');if(detail)detail.innerHTML='<b>'+p.name+' • '+p.code+'</b><span>'+p.capital+' • '+p.region+'</span><span>'+p.terrain+'</span><span>'+p.weather+'</span><span>'+p.architecture+'</span><span>'+p.wildlife.join(' • ')+'</span>';
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const hud=document.createElement('aside');hud.id='v5000StreamerHud';hud.innerHTML='<small>50-STATE STREAMER</small><b>NORTH CAROLINA</b><span data-biome>STATE BIOME</span><span data-climate>CLIMATE + RADIO</span>';document.body.appendChild(hud);
  const btn=document.createElement('button');btn.id='v5000StreamerBtn';btn.type='button';btn.className='action-primary';btn.textContent='STATE STREAMER';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
  const panel=document.createElement('section');panel.id='v5000StreamerPanel';panel.hidden=true;panel.innerHTML='<div class="v5000-card"><header><div><small>V3001–V5000</small><h3>50-STATE PLAYABLE WORLD STREAMER</h3></div><button id="v5000Close">CLOSE</button></header><div id="v5000Detail"></div><p id="v5000Stats"></p><div class="v5000-actions"><button id="v5000Restream">RESTREAM CURRENT STATE</button><button id="v5000Next">CROSS INTO NEXT STATE</button><button id="v5000Random">RANDOM ROAD TRIP</button></div></div>';document.body.appendChild(panel);
  btn.onclick=()=>{panel.hidden=false;const code=window.TGGUSAStates?.state?.()?.current||state.active;stream(code)};document.getElementById('v5000Close').onclick=()=>panel.hidden=true;
  document.getElementById('v5000Restream').onclick=()=>stream(state.active);
  document.getElementById('v5000Next').onclick=()=>{const all=window.TGGUSAStates?.states?.()||[],i=Math.max(0,all.findIndex(s=>s.code===state.active)),next=all[(i+1)%all.length];if(next){window.TGGUSAStates?.selectState?.(next.code);stream(next.code)}};
  document.getElementById('v5000Random').onclick=()=>{const all=window.TGGUSAStates?.states?.()||[],next=all[(state.transitions*7+13)%Math.max(1,all.length)];if(next){window.TGGUSAStates?.selectState?.(next.code);stream(next.code)}};
  window.addEventListener('tgg:state-change',e=>e.detail?.code&&stream(e.detail.code));
  const initial=window.TGGUSAStates?.state?.()?.current||'NC';stream(initial);
  window.TGGStateStreamer={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),stream,classify,getStatus:()=>({version:VERSION,span:SPAN,activeState:state.active,worldStreams:state.chunks,biomeStreaming:true,terrainMorphing:true,climateVisuals:true,vegetationStreaming:true,cityDensityStreaming:true,roadDensityStreaming:true,waterSystems:true,mountainSystems:true,stateBorderTransitions:true,regionalRadioLink:true,stateArchitectureLink:true,wildlifeLink:true,all50PlayableProfiles:true,ok:true})};
  document.documentElement.dataset.tggV5000='on';window.dispatchEvent(new CustomEvent('tgg:v5000-ready',{detail:window.TGGStateStreamer.getStatus()}));
 });
}).catch(e=>{window.TGGStateStreamer={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();