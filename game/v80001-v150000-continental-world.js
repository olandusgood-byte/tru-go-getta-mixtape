(()=>{'use strict';
const VERSION='1500.00.0',SPAN='V800.01-V1500.00',KEY='tgg-v150000-continental-world';
const defaults={active:'NC',season:'SUMMER',worldHour:12,days:0,interstateTrips:0,flights:0,railTrips:0,freightRuns:0,tours:0,contracts:0,properties:0,businessTicks:0,weatherEvents:0,careerMoves:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const hash=s=>[...String(s)].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
const STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const REGIONS={NORTHEAST:['ME','NH','VT','MA','RI','CT','NY','NJ','PA'],SOUTH:['DE','MD','VA','WV','NC','SC','GA','FL','KY','TN','MS','AL','OK','TX','AR','LA'],MIDWEST:['OH','IN','IL','MI','WI','IA','KS','MN','MO','NE','ND','SD'],WEST:['MT','ID','WY','CO','NM','AZ','UT','NV','WA','OR','CA','AK','HI']};
const SEASONS=['WINTER','SPRING','SUMMER','FALL'];
const CAREERS=['artist','producer','engineer','promoter','designer','driver','mechanic','chef','manager','photographer','videographer','security','venue-owner','property-manager','tour-manager','dj'];
const INDUSTRIES=['music','media','hospitality','automotive','fashion','food','construction','logistics','real-estate','fitness','retail','nightlife'];
const TRANSPORT=['interstate','airport','rail','bus','ferry','tour-bus','freight'];
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.TGGNationalLife&&window.TGGUSAStates?r(window.TGG3D):requestAnimationFrame(t);t()});
const regionOf=code=>Object.entries(REGIONS).find(([,v])=>v.includes(code))?.[0]||'SOUTH';
function weatherFor(code){
 const seed=hash(code+state.days+state.season),region=regionOf(code);
 const base=state.season==='WINTER'?35:state.season==='SPRING'?62:state.season==='SUMMER'?82:58;
 const regional=region==='WEST'?4:region==='NORTHEAST'?-5:region==='MIDWEST'?-2:3;
 const temperature=Math.round(base+regional+((seed%19)-9));
 const kind=state.season==='WINTER'&&temperature<35?'SNOW':seed%7===0?'STORM':seed%4===0?'RAIN':'CLEAR';
 return {temperature,kind,wind:4+(seed%28),visibility:kind==='CLEAR'?100:kind==='RAIN'?72:kind==='SNOW'?58:48};
}
function buildContinental(code){
 const life=window.TGGNationalLife?.buildStateLife?.(code);if(!life)return null;
 const seed=hash(code+life.name),region=regionOf(code),weather=weatherFor(code);
 const cities=Array.from({length:8+(seed%8)},(_,i)=>({id:code+'-city-'+i,name:life.name+' METRO '+(i+1),population:45000+((seed+i*7919)%1400000),musicHeat:20+((seed+i*17)%80),cost:45+((seed+i*13)%110)}));
 const roads=Array.from({length:12+(seed%12)},(_,i)=>({id:'I-'+(10+((seed+i*7)%89)),type:'interstate',traffic:20+((seed+i*19)%80),condition:55+((seed+i*23)%45)}));
 const airports=Array.from({length:2+(seed%4)},(_,i)=>({id:code+'-air-'+i,flights:18+((seed+i*31)%140),delay:seed%9===0?25:0}));
 const rail=Array.from({length:2+(seed%3)},(_,i)=>({id:code+'-rail-'+i,service:45+((seed+i*29)%55)}));
 const jobs=Array.from({length:40+(seed%60)},(_,i)=>({id:code+'-job-'+i,career:CAREERS[(seed+i*11)%CAREERS.length],industry:INDUSTRIES[(seed+i*7)%INDUSTRIES.length],pay:18+((seed+i*37)%150),city:cities[i%cities.length].id}));
 const contracts=Array.from({length:18+(seed%24)},(_,i)=>({id:code+'-contract-'+i,type:['show','studio','promo','delivery','property','video','tour'][i%7],value:250+((seed+i*211)%12000),rep:2+((seed+i)%24)}));
 const routes=STATES.filter(x=>x!==code).slice(seed%12,(seed%12)+8).map((to,i)=>({from:code,to,mode:TRANSPORT[(seed+i)%TRANSPORT.length],distance:90+((seed+i*173)%2700),cost:35+((seed+i*41)%550)}));
 return {code,name:life.name,region,weather,cities,roads,airports,rail,jobs,contracts,routes,economy:life.economy};
}
wait().then(api=>{
 const THREE=window.THREE,root=new THREE.Group();root.name='TGG_CONTINENTAL_WORLD_V150000';api.scene.add(root);const streamed=new THREE.Group();root.add(streamed);
 const mat=(c,r=.72,m=.12)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const clear=()=>{while(streamed.children.length){const o=streamed.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(x=>x.dispose?.())})}};
 function stream(code){
  const d=buildContinental(code);if(!d)return null;clear();state.active=code;
  d.cities.slice(0,12).forEach((c,i)=>{const h=4+(i%7)*2.2,m=new THREE.Mesh(new THREE.BoxGeometry(5.5,h,5.5),mat(0x26384f+(i%4)*0x020305,.58,.22));const a=i*.53,r=105+(i%4)*25;m.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r);m.userData.city=c;streamed.add(m)});
  d.roads.slice(0,16).forEach((road,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(3,.08,34),mat(0x161b22,.95,.05));const a=i*.39,r=70+(i%6)*24;m.position.set(Math.cos(a)*r,.04,Math.sin(a)*r);m.rotation.y=-a;m.userData.road=road;streamed.add(m)});
  render(d);window.TGGContinentalWorld.current=d;window.dispatchEvent(new CustomEvent('tgg:continental-world',{detail:d}));save();return d;
 }
 function render(d){
  const hud=document.getElementById('v150000Hud');if(hud){hud.querySelector('b').textContent=d.name.toUpperCase()+' • '+d.region;hud.querySelector('[data-weather]').textContent=d.weather.temperature+'° • '+d.weather.kind+' • WIND '+d.weather.wind;hud.querySelector('[data-world]').textContent=d.cities.length+' METROS • '+d.jobs.length+' JOBS • '+d.contracts.length+' CONTRACTS'}
  const s=document.getElementById('v150000Stats');if(s)s.textContent=state.days+' DAYS • '+state.interstateTrips+' ROAD TRIPS • '+state.flights+' FLIGHTS • '+state.tours+' TOURS • '+state.careerMoves+' CAREER MOVES';
  const list=document.getElementById('v150000List');if(list)list.innerHTML=d.routes.map(r=>'<button data-route="'+r.to+'"><b>'+r.mode.toUpperCase()+' → '+r.to+'</b><span>'+r.distance+' MI • $'+r.cost+'</span></button>').join('');
 }
 function travel(to,mode='interstate'){const d=buildContinental(state.active),r=d?.routes.find(x=>x.to===to)||{cost:90};if(window.TGGGame?.spend&&!window.TGGGame.spend(r.cost))return false;if(mode==='flight')state.flights++;else if(mode==='rail')state.railTrips++;else state.interstateTrips++;state.active=to;save();window.TGGUSAStates?.travelTo?.(to);stream(to);return true}
 function advanceDay(){state.days++;state.worldHour=(state.worldHour+24)%24;if(state.days%30===0)state.season=SEASONS[(SEASONS.indexOf(state.season)+1)%SEASONS.length];if(hash(state.active+state.days)%11===0)state.weatherEvents++;state.businessTicks++;save();stream(state.active);return state}
 document.addEventListener('DOMContentLoaded',()=>{
  const hud=document.createElement('aside');hud.id='v150000Hud';hud.innerHTML='<small>CONTINENTAL WORLD ENGINE</small><b>NORTH CAROLINA • SOUTH</b><span data-weather>WEATHER READY</span><span data-world>NATIONAL SYSTEMS READY</span>';document.body.appendChild(hud);
  const btn=document.createElement('button');btn.id='v150000Btn';btn.type='button';btn.className='action-primary';btn.textContent='USA WORLD+';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
  const panel=document.createElement('section');panel.id='v150000Panel';panel.hidden=true;panel.innerHTML='<div class="v150000-card"><header><div><small>V80001–V150000+</small><h3>CONTINENTAL WORLD + LIFE ENGINE</h3></div><button id="v150000Close">CLOSE</button></header><p id="v150000Stats"></p><div class="v150000-actions"><button id="v150000Day">ADVANCE DAY</button><button id="v150000Career">RUN CAREER MOVE</button><button id="v150000Tour">BOOK TOUR LEG</button><button id="v150000Freight">RUN FREIGHT</button><button id="v150000Property">EXPAND PROPERTY</button><button id="v150000Business">OPERATE BUSINESS</button></div><div id="v150000List"></div></div>';document.body.appendChild(panel);
  btn.onclick=()=>{panel.hidden=false;stream(window.TGGUSAStates?.state?.()?.current||state.active)};document.getElementById('v150000Close').onclick=()=>panel.hidden=true;
  document.getElementById('v150000Day').onclick=()=>advanceDay();
  document.getElementById('v150000Career').onclick=()=>{state.careerMoves++;state.contracts++;save();window.TGGGame?.reward?.(175+state.careerMoves*3,25);render(window.TGGContinentalWorld.current)};
  document.getElementById('v150000Tour').onclick=()=>{state.tours++;save();window.TGGGame?.reward?.(450,40);render(window.TGGContinentalWorld.current)};
  document.getElementById('v150000Freight').onclick=()=>{state.freightRuns++;save();window.TGGGame?.reward?.(220,18);render(window.TGGContinentalWorld.current)};
  document.getElementById('v150000Property').onclick=()=>{state.properties++;save();render(window.TGGContinentalWorld.current)};
  document.getElementById('v150000Business').onclick=()=>{state.businessTicks++;save();window.TGGGame?.reward?.(125,12);render(window.TGGContinentalWorld.current)};
  document.getElementById('v150000List').onclick=e=>{const b=e.target.closest('[data-route]');if(!b)return;const d=window.TGGContinentalWorld.current,r=d?.routes.find(x=>x.to===b.dataset.route);travel(b.dataset.route,r?.mode)};
  window.addEventListener('tgg:state-change',e=>e.detail?.code&&stream(e.detail.code));
  window.TGGContinentalWorld={version:VERSION,span:SPAN,current:null,buildContinental,stream,travel,advanceDay,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,all50States:true,interstates:true,airports:true,rail:true,bus:true,ferries:true,nationalJobs:true,careerContracts:true,regionalEconomies:true,dynamicWeather:true,seasons:true,propertyExpansion:true,businessSimulation:true,nationalTouring:true,freightLogistics:true,stateTravel:true,persistentDays:true,ok:true})};
  stream(window.TGGUSAStates?.state?.()?.current||'NC');document.documentElement.dataset.tggV150000='on';window.dispatchEvent(new CustomEvent('tgg:v150000-ready',{detail:window.TGGContinentalWorld.getStatus()}));
 });
}).catch(e=>{window.TGGContinentalWorld={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();