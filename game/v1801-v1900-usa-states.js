(()=>{'use strict';
const VERSION='19.00.0',SPAN='V18.01-V19.00',KEY='tgg-v1900-usa-states';
const STATES=[
['01','AL','Alabama','Montgomery','South','forests, rivers, Gulf plains'],
['02','AK','Alaska','Juneau','Pacific','tundra, mountains, glaciers'],
['04','AZ','Arizona','Phoenix','Southwest','desert, mesas, canyon country'],
['05','AR','Arkansas','Little Rock','South','Ozarks, forests, delta'],
['06','CA','California','Sacramento','Pacific','coast, cities, valleys, mountains'],
['08','CO','Colorado','Denver','Mountain','Rockies, high plains, alpine roads'],
['09','CT','Connecticut','Hartford','Northeast','coast, wooded towns, rivers'],
['10','DE','Delaware','Dover','Mid-Atlantic','coast, marshes, flatlands'],
['12','FL','Florida','Tallahassee','South','beaches, wetlands, tropical roads'],
['13','GA','Georgia','Atlanta','South','piedmont, forests, coast'],
['15','HI','Hawaii','Honolulu','Pacific','volcanic islands, rainforest, beaches'],
['16','ID','Idaho','Boise','Mountain','mountains, rivers, farmland'],
['17','IL','Illinois','Springfield','Midwest','prairie, Chicago metro, farmland'],
['18','IN','Indiana','Indianapolis','Midwest','farmland, towns, wooded south'],
['19','IA','Iowa','Des Moines','Midwest','rolling farmland, rivers'],
['20','KS','Kansas','Topeka','Plains','open plains, farms, long highways'],
['21','KY','Kentucky','Frankfort','South','hills, horse country, caves'],
['22','LA','Louisiana','Baton Rouge','South','bayous, wetlands, Gulf cities'],
['23','ME','Maine','Augusta','Northeast','rocky coast, pine forests, mountains'],
['24','MD','Maryland','Annapolis','Mid-Atlantic','Chesapeake, suburbs, mountains'],
['25','MA','Massachusetts','Boston','Northeast','historic towns, coast, hills'],
['26','MI','Michigan','Lansing','Midwest','Great Lakes, forests, industrial cities'],
['27','MN','Minnesota','Saint Paul','Midwest','lakes, forests, cold plains'],
['28','MS','Mississippi','Jackson','South','delta, forests, Gulf coast'],
['29','MO','Missouri','Jefferson City','Midwest','Ozarks, rivers, plains'],
['30','MT','Montana','Helena','Mountain','big sky, Rockies, open range'],
['31','NE','Nebraska','Lincoln','Plains','prairie, Sandhills, long highways'],
['32','NV','Nevada','Carson City','Mountain','desert basins, mountains, neon cities'],
['33','NH','New Hampshire','Concord','Northeast','mountains, forests, lakes'],
['34','NJ','New Jersey','Trenton','Mid-Atlantic','dense suburbs, shore, pine barrens'],
['35','NM','New Mexico','Santa Fe','Southwest','high desert, mesas, mountains'],
['36','NY','New York','Albany','Northeast','NYC metro, lakes, Adirondacks'],
['37','NC','North Carolina','Raleigh','South','Atlantic coast, piedmont, Blue Ridge'],
['38','ND','North Dakota','Bismarck','Plains','prairie, badlands, open roads'],
['39','OH','Ohio','Columbus','Midwest','cities, farmland, rolling hills'],
['40','OK','Oklahoma','Oklahoma City','Plains','prairie, red dirt, wooded east'],
['41','OR','Oregon','Salem','Pacific','coast, Cascades, forests, high desert'],
['42','PA','Pennsylvania','Harrisburg','Mid-Atlantic','Appalachians, cities, farmland'],
['44','RI','Rhode Island','Providence','Northeast','coast, bays, compact towns'],
['45','SC','South Carolina','Columbia','South','lowcountry, beaches, pine forests'],
['46','SD','South Dakota','Pierre','Plains','Black Hills, prairie, badlands'],
['47','TN','Tennessee','Nashville','South','mountains, valleys, music cities'],
['48','TX','Texas','Austin','Southwest','big cities, plains, desert, Gulf coast'],
['49','UT','Utah','Salt Lake City','Mountain','red rock, deserts, Wasatch mountains'],
['50','VT','Vermont','Montpelier','Northeast','Green Mountains, forests, small towns'],
['51','VA','Virginia','Richmond','South','Blue Ridge, piedmont, coast'],
['53','WA','Washington','Olympia','Pacific','Puget Sound, Cascades, rainforest'],
['54','WV','West Virginia','Charleston','Appalachia','mountains, hollows, rivers'],
['55','WI','Wisconsin','Madison','Midwest','lakes, farmland, forests'],
['56','WY','Wyoming','Cheyenne','Mountain','high plains, Rockies, Yellowstone country']
].map(([fips,code,name,capital,region,biome])=>({fips,code,name,capital,region,biome}));
const defaults={current:'NC',visited:['NC'],favorite:null,roadTrips:0,atlasLoaded:false};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const byCode=c=>STATES.find(s=>s.code===c);
function loadScript(src){return new Promise((resolve,reject)=>{if([...document.scripts].some(s=>s.src===src))return resolve();const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
async function buildAtlas(svg){
 await loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');
 await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
 const topo=await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(r=>{if(!r.ok)throw new Error('atlas_fetch_failed');return r.json()});
 const feature=topojson.feature(topo,topo.objects.states);
 const projection=d3.geoIdentity().reflectY(false).fitSize([960,600],feature);
 const path=d3.geoPath(projection);
 svg.setAttribute('viewBox','0 0 960 600');
 const ns='http://www.w3.org/2000/svg';
 feature.features.forEach(f=>{
  const p=document.createElementNS(ns,'path'),id=String(f.id).padStart(2,'0'),meta=STATES.find(s=>s.fips===id);
  p.setAttribute('d',path(f));p.setAttribute('class','v1900-state');p.dataset.fips=id;
  if(meta){p.dataset.code=meta.code;p.setAttribute('aria-label',meta.name);if(meta.code===state.current)p.classList.add('is-current')}
  p.onclick=()=>meta&&selectState(meta.code);
  svg.appendChild(p);
 });
 const borders=document.createElementNS(ns,'path');borders.setAttribute('d',path(topojson.mesh(topo,topo.objects.states,(a,b)=>a!==b)));borders.setAttribute('class','v1900-borders');svg.appendChild(borders);
 state.atlasLoaded=true;save();render();
}
function selectState(code){
 const s=byCode(code);if(!s)return;state.current=code;if(!state.visited.includes(code))state.visited.push(code);save();
 document.querySelectorAll('.v1900-state').forEach(p=>p.classList.toggle('is-current',p.dataset.code===code));
 render();window.__tggToast?.(s.name.toUpperCase()+' — '+s.biome);
 window.dispatchEvent(new CustomEvent('tgg:state-change',{detail:{...s}}));
}
function render(){
 const s=byCode(state.current)||byCode('NC');
 const title=document.getElementById('v1900StateName'),meta=document.getElementById('v1900StateMeta'),stats=document.getElementById('v1900StateStats');
 if(title)title.textContent=s.name+' • '+s.code;
 if(meta)meta.textContent='CAPITAL '+s.capital.toUpperCase()+' • '+s.region.toUpperCase()+' • '+s.biome.toUpperCase();
 if(stats)stats.textContent=state.visited.length+' / 50 STATES VISITED • ROAD TRIPS '+state.roadTrips;
 const hud=document.getElementById('v1900UsaHud');if(hud)hud.querySelector('b').textContent=s.name.toUpperCase();
}
document.addEventListener('DOMContentLoaded',()=>{
 const hud=document.createElement('aside');hud.id='v1900UsaHud';hud.innerHTML='<small>USA WORLD</small><b>NORTH CAROLINA</b><span>50-STATE REAL-GEOGRAPHY MODE</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1900UsaBtn';btn.type='button';btn.className='action-primary';btn.textContent='USA ATLAS';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1900UsaPanel';panel.hidden=true;panel.innerHTML='<div class="v1900-card"><header><div><small>V1801–V1900</small><h3>UNITED STATES WORLD ATLAS</h3></div><button id="v1900Close">CLOSE</button></header><div class="v1900-layout"><div class="v1900-map-wrap"><svg id="v1900Map" role="img" aria-label="Map of the 50 United States"></svg><div id="v1900MapStatus">LOADING REAL STATE BOUNDARIES…</div></div><div class="v1900-info"><h4 id="v1900StateName"></h4><p id="v1900StateMeta"></p><p id="v1900StateStats"></p><div class="v1900-actions"><button id="v1900Travel">ROAD TRIP HERE</button><button id="v1900Favorite">FAVORITE STATE</button></div><div id="v1900List"></div></div></div></div>';document.body.appendChild(panel);
 document.getElementById('v1900List').innerHTML=STATES.map(s=>'<button class="v1900-row" data-code="'+s.code+'"><b>'+s.code+'</b><span>'+s.name+'</span><em>'+s.region+'</em></button>').join('');
 document.querySelectorAll('.v1900-row').forEach(b=>b.onclick=()=>selectState(b.dataset.code));
 btn.onclick=()=>{panel.hidden=false;render();if(!state.atlasLoaded&&!panel.dataset.loading){panel.dataset.loading='1';buildAtlas(document.getElementById('v1900Map')).then(()=>document.getElementById('v1900MapStatus').textContent='REAL STATE BOUNDARIES LOADED').catch(()=>document.getElementById('v1900MapStatus').textContent='ATLAS OFFLINE — STATE LIST STILL AVAILABLE')}};
 document.getElementById('v1900Close').onclick=()=>panel.hidden=true;
 document.getElementById('v1900Travel').onclick=()=>{const s=byCode(state.current);state.roadTrips++;save();window.__tggToast?.('LONG-DISTANCE ROUTE SET — '+s.name);window.TGGPersistentWorld?.addNews?.('ROAD TRIP ROUTE OPENED TOWARD '+s.name.toUpperCase());render()};
 document.getElementById('v1900Favorite').onclick=()=>{state.favorite=state.current;save();window.__tggToast?.(byCode(state.current).name+' SET AS FAVORITE STATE')};
 render();
 window.TGGUSAStates={version:VERSION,span:SPAN,states:()=>STATES.map(s=>({...s})),state:()=>JSON.parse(JSON.stringify(state)),selectState,getStatus:()=>({version:VERSION,span:SPAN,states:STATES.length,realNames:true,realCapitals:true,realStateBoundaries:true,regions:true,biomeIdentity:true,longDistanceTravel:true,atlas:true,ok:true})};
 document.documentElement.dataset.tggV1900='on';window.dispatchEvent(new CustomEvent('tgg:v1900-ready',{detail:window.TGGUSAStates.getStatus()}));
});
})();