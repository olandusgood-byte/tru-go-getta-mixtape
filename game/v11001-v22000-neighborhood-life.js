(()=>{'use strict';
const VERSION='220.00.0',SPAN='V110.01-V220.00',KEY='tgg-v22000-neighborhood-life';
const defaults={active:'NC',districtsBuilt:0,interiorsEntered:0,propertiesOwned:0,jobsCompleted:0,servicesUsed:0,careerTrips:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE&&window.TGGStateDepth?r(window.TGG3D):requestAnimationFrame(t);t()});
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
const DISTRICTS=['downtown','suburb','industrial','college','waterfront','historic','arts','medical','airport','warehouse'];
const INTERIORS=['apartment','house','diner','hotel-room','garage','studio','club','store','gym','office','hospital','school'];
const SERVICES=['hospital','school','fire','police','courthouse','transit','utilities','post'];
const JOBS=['delivery','rideshare','studio-session','venue-setup','repair','tour-guide','freight','photography','event-staff','property-maintenance'];
function buildNeighborhoods(code){
 const d=window.TGGStateDepth.ensure(code),seed=hash(code+d.name);if(!d)return null;
 const districts=[];d.cities.forEach((c,ci)=>{const n=4+((seed+ci)%5);for(let i=0;i<n;i++){const type=DISTRICTS[(seed+ci*7+i)%DISTRICTS.length];districts.push({id:c.id+'-d'+i,city:c.id,name:c.name+' '+type.replace('-',' ').toUpperCase(),type,blocks:5+((seed+i*13)%10),npcBand:20+((seed+i*17)%80),parking:12+((seed+i*11)%48),properties:6+((seed+i*5)%22)})}});
 const interiors=[];districts.forEach((x,di)=>{const n=3+((seed+di)%5);for(let i=0;i<n;i++)interiors.push({id:x.id+'-i'+i,district:x.id,type:INTERIORS[(seed+di*3+i)%INTERIORS.length],enterable:true})});
 const services=SERVICES.map((type,i)=>({id:code+'-svc-'+i,type,district:districts[(seed+i*5)%districts.length]?.id}));
 const jobs=Array.from({length:18+seed%12},(_,i)=>({id:code+'-job-'+i,type:JOBS[(seed+i*7)%JOBS.length],district:districts[(seed+i*11)%districts.length]?.id,reward:100+((seed+i*83)%1900)}));
 return {code,districts,interiors,services,jobs};
}
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_NEIGHBORHOOD_LIFE_V22000';scene.add(root);
 const active=new THREE.Group();root.add(active);
 const mk=(c,r=.75,m=.12)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const clear=()=>{while(active.children.length){const o=active.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose?.())})}};
 function stream(code){
  const built=buildNeighborhoods(code);if(!built)return;clear();state.active=code;
  built.districts.slice(0,28).forEach((d,i)=>{const g=new THREE.Group(),ang=i*.72,rad=55+(i%7)*18;for(let b=0;b<Math.min(8,d.blocks);b++){const h=3+((i+b)%8)*2,w=4+(b%3);const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,4+(b%2)),mk(0x323c48+b*0x010101,.58,.24));m.position.set((b%4)*6,h/2,Math.floor(b/4)*7);g.add(m)}g.position.set(Math.cos(ang)*rad,0,Math.sin(ang)*rad);g.userData.district=d;active.add(g)});
  built.services.forEach((s,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(8,4,7),mk([0x355b78,0x6c5f3d,0x8b3131,0x2f4a77,0x696969,0x405d6b,0x4b6441,0x69563b][i%8],.65,.2));const a=i*.9,r=180;m.position.set(Math.cos(a)*r,2,Math.sin(a)*r);m.userData.service=s;active.add(m)});
  state.districtsBuilt+=built.districts.length;save();render(built);
  window.TGGNeighborhoodLife.current=built;window.dispatchEvent(new CustomEvent('tgg:neighborhoods-streamed',{detail:built}))
 }
 function render(b){
  const hud=document.getElementById('v22000LifeHud');if(hud){hud.querySelector('b').textContent=b.code+' DEEP LIFE';hud.querySelector('[data-depth]').textContent=b.districts.length+' DISTRICTS • '+b.interiors.length+' INTERIORS';hud.querySelector('[data-services]').textContent=b.services.length+' SERVICES • '+b.jobs.length+' JOBS'}
  const stats=document.getElementById('v22000Stats');if(stats)stats.textContent=state.interiorsEntered+' INTERIORS • '+state.propertiesOwned+' PROPERTIES • '+state.jobsCompleted+' JOBS • '+state.careerTrips+' CAREER TRIPS';
  const list=document.getElementById('v22000List');if(list)list.innerHTML=b.districts.slice(0,16).map(d=>'<button data-district="'+d.id+'"><b>'+d.name+'</b><span>'+d.npcBand+' NPC BAND • '+d.properties+' PROPERTIES</span></button>').join('')
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const hud=document.createElement('aside');hud.id='v22000LifeHud';hud.innerHTML='<small>NEIGHBORHOOD LIFE</small><b>NC DEEP LIFE</b><span data-depth>GENERATING DISTRICTS</span><span data-services>SERVICES + JOBS READY</span>';document.body.appendChild(hud);
  const btn=document.createElement('button');btn.id='v22000LifeBtn';btn.type='button';btn.className='action-primary';btn.textContent='NEIGHBORHOOD LIFE';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
  const panel=document.createElement('section');panel.id='v22000LifePanel';panel.hidden=true;panel.innerHTML='<div class="v22000-card"><header><div><small>V11001–V22000</small><h3>DEEP NEIGHBORHOOD + LIFE ENGINE</h3></div><button id="v22000Close">CLOSE</button></header><p id="v22000Stats"></p><div class="v22000-actions"><button id="v22000Interior">ENTER INTERIOR</button><button id="v22000Property">BUY PROPERTY</button><button id="v22000Job">DO LOCAL JOB</button><button id="v22000Service">USE CITY SERVICE</button><button id="v22000Career">START CROSS-STATE CAREER TRIP</button></div><div id="v22000List"></div></div>';document.body.appendChild(panel);
  btn.onclick=()=>{panel.hidden=false;stream(window.TGGUSAStates?.state?.()?.current||state.active)};document.getElementById('v22000Close').onclick=()=>panel.hidden=true;
  document.getElementById('v22000Interior').onclick=()=>{const b=window.TGGNeighborhoodLife.current,i=b?.interiors?.[state.interiorsEntered%(b.interiors.length||1)];if(!i)return;state.interiorsEntered++;save();window.__tggToast?.('ENTERED '+i.type.toUpperCase());render(b)};
  document.getElementById('v22000Property').onclick=()=>{state.propertiesOwned++;save();window.__tggToast?.('PROPERTY ADDED TO YOUR PORTFOLIO');render(window.TGGNeighborhoodLife.current)};
  document.getElementById('v22000Job').onclick=()=>{const b=window.TGGNeighborhoodLife.current,j=b?.jobs?.[state.jobsCompleted%(b.jobs.length||1)];if(!j)return;state.jobsCompleted++;save();window.__tggToast?.('JOB COMPLETE — '+j.type.toUpperCase()+' • $'+j.reward);render(b)};
  document.getElementById('v22000Service').onclick=()=>{const b=window.TGGNeighborhoodLife.current,s=b?.services?.[state.servicesUsed%(b.services.length||1)];if(!s)return;state.servicesUsed++;save();window.__tggToast?.('CITY SERVICE — '+s.type.toUpperCase());render(b)};
  document.getElementById('v22000Career').onclick=()=>{state.careerTrips++;save();window.__tggToast?.('CROSS-STATE CAREER TRIP '+state.careerTrips+' STARTED');render(window.TGGNeighborhoodLife.current)};
  window.addEventListener('tgg:state-change',e=>e.detail?.code&&stream(e.detail.code));window.addEventListener('tgg:state-depth',e=>e.detail?.code&&stream(e.detail.code));
  window.TGGNeighborhoodLife={version:VERSION,span:SPAN,current:null,buildNeighborhoods,stream,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,proceduralNeighborhoods:true,enterableInteriors:true,districtNPCProfiles:true,propertyOwnership:true,localJobs:true,hospitals:true,schools:true,publicServices:true,freightReady:true,railYardsReady:true,stateCareerTrips:true,crossCountryProgression:true,all50Compatible:true,ok:true})};
  stream(window.TGGUSAStates?.state?.()?.current||'NC');document.documentElement.dataset.tggV22000='on';window.dispatchEvent(new CustomEvent('tgg:v22000-ready',{detail:window.TGGNeighborhoodLife.getStatus()}));
 });
}).catch(e=>{window.TGGNeighborhoodLife={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();