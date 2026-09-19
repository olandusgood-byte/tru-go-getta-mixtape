(()=>{'use strict';
const VERSION='55000.00.0',SPAN='V3500001-V5500000',KEY='tgg-v5500000-legacy-sim';
const defaults={generation:1,year:1,day:0,legacyScore:0,families:{},careers:{},businessDynasties:{},neighborhoods:{},regionalFame:{},rivalries:{},collabs:{},migrations:[],tourSeasons:[],history:[]};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const states=()=>window.TGGUSAStates?.states?.()||[];
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
function ensureFamily(code){
 if(state.families[code])return state.families[code];
 const seed=hash(code);
 return state.families[code]={households:20+seed%45,births:0,moves:0,retirements:0,generation:1,stability:45+(seed%50)}
}
function ensureCareer(code){
 if(state.careers[code])return state.careers[code];
 const seed=hash(code+'career');
 return state.careers[code]={promotions:0,changes:0,opportunities:35+seed%60,talent:20+(seed>>2)%75}
}
function ensureBusiness(code){
 if(state.businessDynasties[code])return state.businessDynasties[code];
 const seed=hash(code+'biz');
 return state.businessDynasties[code]={open:18+seed%30,closed:0,hired:0,fired:0,valuation:250000+(seed%2500000),trend:0}
}
function ensureNeighborhood(code){
 if(state.neighborhoods[code])return state.neighborhoods[code];
 const seed=hash(code+'hood');
 return state.neighborhoods[code]={growth:40+seed%45,property:140000+seed%520000,quality:35+(seed>>3)%60,population:20000+seed%280000}
}
function tickDay(){
 state.day++;if(state.day%365===0){state.year++;state.generation=Math.max(state.generation,1+Math.floor(state.year/18))}
 states().forEach((s,i)=>{
  const f=ensureFamily(s.code),c=ensureCareer(s.code),b=ensureBusiness(s.code),n=ensureNeighborhood(s.code),wave=Math.sin((state.day+i*7)/41);
  if(state.day%30===0){f.births+=(i+state.year)%3===0?1:0;f.moves+=(i+state.day)%4===0?1:0;f.retirements+=(state.year+i)%9===0?1:0;f.generation=state.generation}
  if(state.day%21===0){c.promotions+=(i+state.year)%5===0?1:0;c.changes+=(i+state.day)%7===0?1:0;c.opportunities=Math.max(5,Math.min(100,c.opportunities+wave*2))}
  b.trend=wave;b.valuation=Math.max(50000,Math.round(b.valuation*(1+wave*.0025)));if(state.day%14===0){b.hired+=wave>0?1:0;b.fired+=wave<-.5?1:0;if(wave<-.85&&b.open>4){b.open--;b.closed++}else if(wave>.8)b.open++}
  n.growth=Math.max(5,Math.min(100,n.growth+wave*.45));n.property=Math.max(60000,Math.round(n.property*(1+wave*.0018)));n.quality=Math.max(5,Math.min(100,n.quality+wave*.2));n.population=Math.max(5000,Math.round(n.population*(1+wave*.0008)));
  state.regionalFame[s.code]=(state.regionalFame[s.code]||0)+(wave>0.88?1:0)
 });
 if(state.day%90===0){const all=states(),from=all[(state.day/90)%Math.max(1,all.length)|0]?.code,to=all[(state.day/45+11)%Math.max(1,all.length)|0]?.code;if(from&&to&&from!==to)state.migrations.unshift({day:state.day,from,to,count:25+(state.day%300)})}
 if(state.day%180===0){const all=states(),route=[];for(let i=0;i<12&&all.length;i++)route.push(all[(state.year*5+i*4)%all.length].code);state.tourSeasons.unshift({year:state.year,route,status:'scheduled'});state.tourSeasons=state.tourSeasons.slice(0,12)}
 if(state.day%60===0){const all=states(),code=all[(state.day/60)%Math.max(1,all.length)|0]?.code;if(code){state.history.unshift({day:state.day,year:state.year,code,event:['family-shift','career-boom','business-cycle','property-surge','tour-season','migration-wave'][state.year%6]});state.history=state.history.slice(0,180)}}
 save();render();return state
}
function addRival(name){state.rivalries[name]=(state.rivalries[name]||0)+1;state.legacyScore+=2;save();render()}
function addCollab(name){state.collabs[name]=(state.collabs[name]||0)+1;state.legacyScore+=3;save();render()}
function render(){
 const code=window.TGGUSAStates?.state?.()?.current||'NC',f=ensureFamily(code),b=ensureBusiness(code),n=ensureNeighborhood(code),hud=document.getElementById('v5500000Hud');
 if(hud){hud.querySelector('b').textContent='GEN '+state.generation+' • YEAR '+state.year;hud.querySelector('[data-family]').textContent=code+' '+f.households+' HOUSEHOLDS • '+f.births+' BIRTHS';hud.querySelector('[data-legacy]').textContent='LEGACY '+state.legacyScore+' • PROPERTY $'+n.property}
 const stats=document.getElementById('v5500000Stats');if(stats)stats.textContent=state.migrations.length+' MIGRATIONS • '+state.tourSeasons.length+' TOUR SEASONS • '+Object.keys(state.rivalries).length+' RIVALS • '+Object.keys(state.collabs).length+' COLLABS';
 const feed=document.getElementById('v5500000Feed');if(feed)feed.innerHTML=state.history.slice(0,10).map(x=>'<article><b>'+x.code+'</b><span>YEAR '+x.year+' • '+x.event.toUpperCase()+'</span></article>').join('');
 const econ=document.getElementById('v5500000Economy');if(econ)econ.textContent=code+' BUSINESS VALUE $'+b.valuation+' • OPEN '+b.open+' • CLOSED '+b.closed+' • NEIGHBORHOOD QUALITY '+Math.round(n.quality)
}
document.addEventListener('DOMContentLoaded',()=>{
 states().forEach(s=>{ensureFamily(s.code);ensureCareer(s.code);ensureBusiness(s.code);ensureNeighborhood(s.code)});
 const hud=document.createElement('aside');hud.id='v5500000Hud';hud.innerHTML='<small>LEGACY SIMULATION</small><b>GEN 1 • YEAR 1</b><span data-family>FAMILY SYSTEM READY</span><span data-legacy>LEGACY 0</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v5500000Btn';btn.type='button';btn.className='action-primary';btn.textContent='LEGACY WORLD';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v5500000Panel';panel.hidden=true;panel.innerHTML='<div class="v5500000-card"><header><div><small>V3,500,001–V5,500,000</small><h3>GENERATIONAL LEGACY SIMULATION</h3></div><button id="v5500000Close">CLOSE</button></header><p id="v5500000Stats"></p><p id="v5500000Economy"></p><div class="v5500000-actions"><button id="v5500000Day">ADVANCE DAY</button><button id="v5500000Month">ADVANCE MONTH</button><button id="v5500000Year">ADVANCE YEAR</button><button id="v5500000Rival">ADD RIVALRY</button><button id="v5500000Collab">ADD COLLAB</button></div><div id="v5500000Feed"></div></div>';document.body.appendChild(panel);
 btn.onclick=()=>{panel.hidden=false;render()};document.getElementById('v5500000Close').onclick=()=>panel.hidden=true;
 document.getElementById('v5500000Day').onclick=()=>tickDay();
 document.getElementById('v5500000Month').onclick=()=>{for(let i=0;i<30;i++)tickDay();window.__tggToast?.('ONE WORLD MONTH SIMULATED')};
 document.getElementById('v5500000Year').onclick=()=>{for(let i=0;i<365;i++)tickDay();window.__tggToast?.('ONE WORLD YEAR SIMULATED')};
 document.getElementById('v5500000Rival').onclick=()=>{addRival('REGIONAL RIVAL '+(Object.keys(state.rivalries).length+1));window.__tggToast?.('NEW RIVALRY ADDED')};
 document.getElementById('v5500000Collab').onclick=()=>{addCollab('COLLAB PARTNER '+(Object.keys(state.collabs).length+1));window.__tggToast?.('NEW COLLAB ADDED')};
 window.TGGLegacySimulation={version:VERSION,span:SPAN,tickDay,addRival,addCollab,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,generationalFamilies:true,agingHouseholds:true,careerEvolution:true,businessRiseFall:true,neighborhoodChange:true,propertyCycles:true,regionalFame:true,touringSeasons:true,rivalries:true,collaborations:true,stateMigration:true,persistentLegacy:true,all50Compatible:true,longHorizonSimulation:true,ok:true})};
 render();document.documentElement.dataset.tggV5500000='on';window.dispatchEvent(new CustomEvent('tgg:v5500000-ready',{detail:window.TGGLegacySimulation.getStatus()}));
});
})();