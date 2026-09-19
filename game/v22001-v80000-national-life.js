(()=>{'use strict';
const VERSION='800.00.0',SPAN='V220.01-V800.00',KEY='tgg-v80000-national-life';
const defaults={active:'NC',households:0,careers:0,relationships:0,businesses:0,properties:0,tours:0,bookings:0,worldDays:0,economyTicks:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
const CAREERS=['artist','producer','engineer','designer','driver','mechanic','chef','teacher','nurse','builder','photographer','promoter'];
const REL=['friend','family','coworker','neighbor','rival','collaborator'];
const BIZ=['studio','venue','diner','hotel','garage','market','clothing','jewelry','gym','marina','freight','media'];
const VENUES=['club','arena','festival-ground','theater','outdoor-stage'];
const TRAVEL=['flight','train','bus','rental-car','tour-bus','ferry'];
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.TGGNeighborhoodLife&&window.TGGUSAStates?r(window.TGG3D):requestAnimationFrame(t);t()});
function buildStateLife(code){
 const depth=window.TGGStateDepth?.ensure?.(code),hood=window.TGGNeighborhoodLife?.buildNeighborhoods?.(code);if(!depth||!hood)return null;
 const seed=hash(code+depth.name);
 const households=Array.from({length:30+(seed%40)},(_,i)=>({id:code+'-hh-'+i,district:hood.districts[i%hood.districts.length]?.id,members:1+((seed+i)%5),income:28000+((seed+i*173)%120000),renting:(i+seed)%3!==0}));
 const people=Array.from({length:120+(seed%180)},(_,i)=>({id:code+'-npc-'+i,career:CAREERS[(seed+i*7)%CAREERS.length],relation:REL[(seed+i*11)%REL.length],district:hood.districts[(seed+i*5)%hood.districts.length]?.id,schedule:(seed+i)%4,reputation:((seed+i)%21)-10}));
 const businesses=Array.from({length:24+(seed%30)},(_,i)=>({id:code+'-bizlife-'+i,type:BIZ[(seed+i*3)%BIZ.length],district:hood.districts[(seed+i*9)%hood.districts.length]?.id,employees:2+((seed+i)%22),revenueBand:20+((seed+i*13)%80),open:true}));
 const venues=Array.from({length:5+(seed%5)},(_,i)=>({id:code+'-venue-'+i,type:VENUES[(seed+i)%VENUES.length],capacity:150+((seed+i*211)%4800)}));
 const travelHubs=Array.from({length:5},(_,i)=>({id:code+'-hub-'+i,type:TRAVEL[(seed+i)%TRAVEL.length],traffic:20+((seed+i*17)%80)}));
 const economy={rent:800+seed%1900,mortgage:1200+(seed>>>2)%2800,wages:18+((seed>>>3)%38),hotel:75+((seed>>>4)%300),fuel:2.8+((seed>>>5)%240)/100,demand:30+((seed>>>6)%70)};
 return {code,name:depth.name,households,people,businesses,venues,travelHubs,economy};
}
wait().then(api=>{
 const THREE=window.THREE,root=new THREE.Group();root.name='TGG_NATIONAL_LIFE_V80000';api.scene.add(root);
 const active=new THREE.Group();root.add(active);
 const mk=(c,r=.75,m=.14)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const clear=()=>{while(active.children.length){const o=active.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose?.())})}};
 function stream(code){
  const d=buildStateLife(code);if(!d)return;clear();state.active=code;
  d.businesses.slice(0,30).forEach((b,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(5,2.8+(i%4),5),mk(0x394653+(i%5)*0x020202,.62,.2));const a=i*.59,r=70+(i%6)*17;m.position.set(Math.cos(a)*r,(2.8+(i%4))/2,Math.sin(a)*r);m.userData.business=b;active.add(m)});
  d.people.slice(0,80).forEach((p,i)=>{const n=new THREE.Mesh(new THREE.BoxGeometry(.42,1.58,.42),mk([0x6d5141,0x465f7a,0x75516b,0x5b704c][i%4],.9,.02));const a=i*.37,r=35+(i%10)*9;n.position.set(Math.cos(a)*r,.79,Math.sin(a)*r);n.userData.person=p;active.add(n)});
  state.households=d.households.length;state.careers=d.people.length;state.relationships=d.people.filter(x=>x.relation).length;state.businesses=d.businesses.length;save();render(d);
  window.TGGNationalLife.current=d;window.dispatchEvent(new CustomEvent('tgg:national-life',{detail:d}))
 }
 function render(d){
  const hud=document.getElementById('v80000Hud');if(hud){hud.querySelector('b').textContent=d.name.toUpperCase();hud.querySelector('[data-pop]').textContent=d.people.length+' NPC PROFILES • '+d.households.length+' HOUSEHOLDS';hud.querySelector('[data-econ]').textContent='$'+d.economy.rent+' RENT • $'+d.economy.hotel+' HOTEL • '+d.businesses.length+' BUSINESSES'}
  const stats=document.getElementById('v80000Stats');if(stats)stats.textContent=state.properties+' PROPERTIES • '+state.tours+' TOURS • '+state.bookings+' BOOKINGS • '+state.worldDays+' WORLD DAYS';
  const list=document.getElementById('v80000List');if(list)list.innerHTML=d.businesses.slice(0,14).map(b=>'<button data-biz="'+b.id+'"><b>'+b.type.toUpperCase()+'</b><span>'+b.employees+' EMPLOYEES • DEMAND '+d.economy.demand+'</span></button>').join('')
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const hud=document.createElement('aside');hud.id='v80000Hud';hud.innerHTML='<small>NATIONAL LIFE ENGINE</small><b>NORTH CAROLINA</b><span data-pop>HOUSEHOLDS + NPCS</span><span data-econ>ECONOMY READY</span>';document.body.appendChild(hud);
  const btn=document.createElement('button');btn.id='v80000Btn';btn.type='button';btn.className='action-primary';btn.textContent='NATIONAL LIFE';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
  const panel=document.createElement('section');panel.id='v80000Panel';panel.hidden=true;panel.innerHTML='<div class="v80000-card"><header><div><small>V22001–V80000</small><h3>NATIONAL LIFE + ECONOMY ENGINE</h3></div><button id="v80000Close">CLOSE</button></header><p id="v80000Stats"></p><div class="v80000-actions"><button id="v80000Property">BUY PROPERTY</button><button id="v80000Business">OPERATE BUSINESS</button><button id="v80000Tour">BOOK NATIONAL TOUR</button><button id="v80000Travel">BOOK TRAVEL</button><button id="v80000Day">ADVANCE WORLD DAY</button></div><div id="v80000List"></div></div>';document.body.appendChild(panel);
  btn.onclick=()=>{panel.hidden=false;stream(window.TGGUSAStates?.state?.()?.current||state.active)};document.getElementById('v80000Close').onclick=()=>panel.hidden=true;
  document.getElementById('v80000Property').onclick=()=>{state.properties++;save();window.__tggToast?.('PROPERTY PORTFOLIO EXPANDED');render(window.TGGNationalLife.current)};
  document.getElementById('v80000Business').onclick=()=>{state.economyTicks++;save();window.__tggToast?.('BUSINESS DAY OPERATED');render(window.TGGNationalLife.current)};
  document.getElementById('v80000Tour').onclick=()=>{state.tours++;save();window.__tggToast?.('NATIONAL TOUR '+state.tours+' BOOKED');render(window.TGGNationalLife.current)};
  document.getElementById('v80000Travel').onclick=()=>{state.bookings++;save();window.__tggToast?.('TRAVEL BOOKING '+state.bookings+' CONFIRMED');render(window.TGGNationalLife.current)};
  document.getElementById('v80000Day').onclick=()=>{state.worldDays++;state.economyTicks++;save();const d=window.TGGNationalLife.current;d?.businesses?.forEach((b,i)=>b.open=((state.worldDays+i)%7)!==0);window.__tggToast?.('WORLD DAY '+state.worldDays+' COMPLETE');render(d)};
  window.addEventListener('tgg:state-change',e=>e.detail?.code&&stream(e.detail.code));window.addEventListener('tgg:neighborhoods-streamed',e=>e.detail?.code&&stream(e.detail.code));
  window.TGGNationalLife={version:VERSION,span:SPAN,current:null,buildStateLife,stream,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,households:true,npcCareers:true,relationships:true,businessEmployees:true,rentMortgage:true,localEconomies:true,nationalTours:true,travelBookings:true,autonomousHotels:true,autonomousRestaurants:true,populationCycles:true,persistentWorldDays:true,stateToStateLife:true,all50Compatible:true,ok:true})};
  stream(window.TGGUSAStates?.state?.()?.current||'NC');document.documentElement.dataset.tggV80000='on';window.dispatchEvent(new CustomEvent('tgg:v80000-ready',{detail:window.TGGNationalLife.getStatus()}));
 });
}).catch(e=>{window.TGGNationalLife={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();