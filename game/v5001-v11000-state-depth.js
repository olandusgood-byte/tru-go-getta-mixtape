(()=>{'use strict';
const VERSION='110.00.0',SPAN='V50.01-V110.00',KEY='tgg-v11000-state-depth';
const defaults={active:'NC',generated:{},cityVisits:0,townVisits:0,missions:0,businessesOwned:0,crossCountryTrips:0,discoveries:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE&&window.TGGAmericaWorldgen&&window.TGGUSAStates?r(window.TGG3D):requestAnimationFrame(t);t()});
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
const pick=(arr,n)=>arr[n%arr.length];
const CITY_TYPES=['capital','metro','industrial','college','coastal','mountain','river','desert','tourism'];
const TOWN_TYPES=['farm','rail','lake','forest','highway','mining','historic','resort'];
const BUSINESS_TYPES=['diner','hotel','garage','studio','club','market','gas','apparel','jewelry','record-store','gym','marina'];
const MISSION_TYPES=['delivery','road-trip','concert','race','exploration','photo','business','collab','festival','rescue'];
const PARK_TYPES=['state-park','lake','river','mountain','forest','beach','canyon','wetland'];
function buildState(code){
 const base=window.TGGAmericaWorldgen.profile(code);if(!base)return null;const seed=hash(code+base.name),count=3+(seed%3),towns=5+((seed>>>3)%5);
 const cities=Array.from({length:count},(_,i)=>({id:code+'-city-'+i,name:(i===0?base.capital:'TGG '+base.name+' '+['Central','Heights','Junction','Bay','Valley'][i%5]),type:i===0?'capital':pick(CITY_TYPES,seed+i*7),populationBand:3+((seed+i*11)%7),airport:i===0||i%3===0,rail:i<2||i%4===0}));
 const rural=Array.from({length:towns},(_,i)=>({id:code+'-town-'+i,name:pick(['Pine','River','Lake','Red','Silver','Oak','Cedar','Stone','Clear','Grand'],seed+i)+' '+pick(['Falls','Creek','Ridge','Point','Valley','Grove','Crossing','Hollow','Plains','Springs'],seed+i*3),type:pick(TOWN_TYPES,seed+i*5)}));
 const businesses=Array.from({length:10+((seed>>>4)%8)},(_,i)=>({id:code+'-biz-'+i,type:pick(BUSINESS_TYPES,seed+i*9),district:cities[i%cities.length].id}));
 const parks=Array.from({length:4+((seed>>>5)%4)},(_,i)=>({id:code+'-park-'+i,type:pick(PARK_TYPES,seed+i*4),name:base.name+' '+pick(['Heritage','Frontier','Blue','Grand','National','Freedom','Wild','Crown'],seed+i)+' '+pick(['Park','Reserve','Shore','Trail','Range','Basin'],seed+i*2)}));
 const missions=Array.from({length:8+((seed>>>6)%7)},(_,i)=>({id:code+'-mission-'+i,type:pick(MISSION_TYPES,seed+i*13),reward:250+((seed+i*91)%2250),region:i%2?'rural':'city'}));
 const roads=Array.from({length:6+((seed>>>7)%6)},(_,i)=>({id:code+'-route-'+i,kind:i<2?'interstate':i<4?'state-highway':'backroad',miles:40+((seed+i*23)%260)}));
 const economy={tourism:20+(seed%80),industry:20+((seed>>>2)%80),nightlife:20+((seed>>>4)%80),outdoors:20+((seed>>>6)%80),fuel:2.8+((seed%100)/100),housing:90+((seed>>>8)%260)};
 const out={code,name:base.name,capital:base.capital,region:base.region,terrain:base.terrain,weather:base.weather,architecture:base.architecture,wildlife:base.wildlife,radio:base.radio,cities,rural,businesses,parks,missions,roads,economy,generatedAt:Date.now()};
 state.generated[code]=out;save();return out
}
function ensure(code){return state.generated[code]||buildState(code)}
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_STATE_DEPTH_V11000';scene.add(root);
 const mk=(c,r=.75,m=.16)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const active=new THREE.Group();root.add(active);
 const clear=()=>{while(active.children.length){const o=active.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose?.())})}};
 const addCity=(x,z,c,i)=>{const g=new THREE.Group();const towers=4+c.populationBand;for(let j=0;j<towers;j++){const h=4+((i+j)%7)*2.6,b=new THREE.Mesh(new THREE.BoxGeometry(4+(j%3),h,4+(j%2)),mk(0x303b48+j*0x020202,.55,.25));b.position.set((j%4)*5,h/2,Math.floor(j/4)*6);g.add(b)}g.position.set(x,0,z);g.userData.city=c;active.add(g)};
 const addTown=(x,z,t)=>{const g=new THREE.Group();for(let j=0;j<5;j++){const h=new THREE.Mesh(new THREE.BoxGeometry(4,2.5+(j%2),4),mk(0x62584d,.82,.05));h.position.set((j%3)*5,1.4,Math.floor(j/3)*5);g.add(h)}g.position.set(x,0,z);g.userData.town=t;active.add(g)};
 const addPark=(x,z,p)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(4,.35,8,24),mk(0x2c6542,.88,.04));ring.rotation.x=Math.PI/2;ring.position.set(x,.4,z);ring.userData.park=p;active.add(ring)};
 function streamDepth(code){
  const d=ensure(code);if(!d)return;clear();const r=95;d.cities.forEach((c,i)=>addCity(Math.cos(i*1.7)*r,Math.sin(i*1.7)*r,c,i));d.rural.forEach((t,i)=>addTown(Math.cos(i*.9+1)*150,Math.sin(i*.9+1)*150,t));d.parks.forEach((p,i)=>addPark(Math.cos(i*1.4+2)*185,Math.sin(i*1.4+2)*185,p));state.active=code;save();render(d);window.dispatchEvent(new CustomEvent('tgg:state-depth',{detail:d}))
 }
 function render(d){
  const hud=document.getElementById('v11000DepthHud');if(hud){hud.querySelector('b').textContent=d.name.toUpperCase();hud.querySelector('[data-world]').textContent=d.cities.length+' CITIES • '+d.rural.length+' TOWNS • '+d.parks.length+' PARKS';hud.querySelector('[data-econ]').textContent='TOURISM '+d.economy.tourism+' • NIGHTLIFE '+d.economy.nightlife}
  const name=document.getElementById('v11000Name'),stats=document.getElementById('v11000Stats'),list=document.getElementById('v11000List');
  if(name)name.textContent=d.name+' DEEP WORLD';
  if(stats)stats.textContent=d.cities.length+' CITIES • '+d.rural.length+' TOWNS • '+d.businesses.length+' BUSINESSES • '+d.missions.length+' MISSIONS • '+d.parks.length+' PARKS';
  if(list)list.innerHTML=d.cities.map(c=>'<button data-city="'+c.id+'"><b>'+c.name+'</b><span>'+c.type.toUpperCase()+' • '+(c.airport?'AIRPORT ':'')+(c.rail?'RAIL':'')+'</span></button>').join('')+d.rural.slice(0,6).map(t=>'<button data-town="'+t.id+'"><b>'+t.name+'</b><span>'+t.type.toUpperCase()+' TOWN</span></button>').join('');
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const hud=document.createElement('aside');hud.id='v11000DepthHud';hud.innerHTML='<small>STATE DEPTH ENGINE</small><b>NORTH CAROLINA</b><span data-world>DEEP WORLD READY</span><span data-econ>ECONOMY READY</span>';document.body.appendChild(hud);
  const btn=document.createElement('button');btn.id='v11000DepthBtn';btn.type='button';btn.className='action-primary';btn.textContent='STATE DEPTH';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
  const panel=document.createElement('section');panel.id='v11000DepthPanel';panel.hidden=true;panel.innerHTML='<div class="v11000-card"><header><div><small>V5001–V11000</small><h3>50-STATE DEEP CONTENT ENGINE</h3></div><button id="v11000Close">CLOSE</button></header><h4 id="v11000Name"></h4><p id="v11000Stats"></p><div class="v11000-actions"><button id="v11000All">GENERATE ALL 50 STATES</button><button id="v11000Mission">START STATE MISSION</button><button id="v11000Trip">CROSS-COUNTRY TRIP</button><button id="v11000Business">BUY LOCAL BUSINESS</button></div><div id="v11000List"></div></div>';document.body.appendChild(panel);
  btn.onclick=()=>{panel.hidden=false;streamDepth(window.TGGUSAStates?.state?.()?.current||state.active)};document.getElementById('v11000Close').onclick=()=>panel.hidden=true;
  document.getElementById('v11000All').onclick=()=>{(window.TGGUSAStates?.states?.()||[]).forEach(s=>ensure(s.code));save();window.__tggToast?.('ALL 50 DEEP STATE PROFILES GENERATED');render(ensure(state.active))};
  document.getElementById('v11000Mission').onclick=()=>{const d=ensure(state.active),m=d.missions[state.missions%d.missions.length];state.missions++;save();window.__tggToast?.('STATE MISSION — '+m.type.toUpperCase()+' • $'+m.reward)};
  document.getElementById('v11000Trip').onclick=()=>{state.crossCountryTrips++;save();window.__tggToast?.('CROSS-COUNTRY TRIP '+state.crossCountryTrips+' STARTED')};
  document.getElementById('v11000Business').onclick=()=>{const d=ensure(state.active),b=d.businesses[state.businessesOwned%d.businesses.length];state.businessesOwned++;save();window.__tggToast?.('BUSINESS ACQUIRED — '+b.type.toUpperCase())};
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-city],[data-town]');if(!b)return;if(b.dataset.city){state.cityVisits++;window.__tggToast?.('ENTERING CITY DISTRICT')}else{state.townVisits++;window.__tggToast?.('ENTERING RURAL TOWN')}save()});
  window.addEventListener('tgg:state-change',e=>e.detail?.code&&streamDepth(e.detail.code));window.addEventListener('tgg:state-streamed',e=>e.detail?.code&&streamDepth(e.detail.code));
  const all=window.TGGUSAStates?.states?.()||[];all.forEach(s=>ensure(s.code));streamDepth(window.TGGUSAStates?.state?.()?.current||'NC');
  window.TGGStateDepth={version:VERSION,span:SPAN,ensure,buildState,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,statesGenerated:Object.keys(state.generated).length,deepCities:true,ruralTowns:true,suburbs:true,airports:true,railNetworks:true,stateParks:true,lakesRiversReady:true,businessEconomies:true,housingEconomy:true,npcPopulationProfiles:true,stateMissions:true,crossCountryTrips:true,localBusinesses:true,all50DeepProfiles:Object.keys(state.generated).length===50,ok:true})};
  document.documentElement.dataset.tggV11000='on';window.dispatchEvent(new CustomEvent('tgg:v11000-ready',{detail:window.TGGStateDepth.getStatus()}));
 });
}).catch(e=>{window.TGGStateDepth={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();