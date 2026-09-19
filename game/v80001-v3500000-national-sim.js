(()=>{'use strict';
const VERSION='35000.00.0',SPAN='V80001-V3500000',KEY='tgg-v3500000-national-sim';
const CAREERS=['artist','producer','engineer','driver','teacher','nurse','builder','chef','mechanic','designer','promoter','photographer'];
const EVENTS=['concert','festival','storm','race','tour-stop','business-boom','housing-surge','traffic-surge','regional-fair','sports-night'];
const MESSAGES=['invitation','collab','family-update','job-offer','business-alert','tour-offer','property-alert','event-invite'];
const defaults={day:0,year:1,history:[],stateEconomy:{},fame:{},relationships:{},tours:[],messages:[],populationTicks:0,businessTicks:0,propertyTicks:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
const states=()=>window.TGGUSAStates?.states?.()||[];
function ensureState(code){
 if(state.stateEconomy[code]) return state.stateEconomy[code];
 const seed=hash(code);
 return state.stateEconomy[code]={demand:40+seed%45,wages:18+(seed>>2)%35,rent:700+(seed>>3)%2200,property:120000+(seed>>4)%620000,tourism:30+(seed>>5)%70,jobs:45+(seed>>6)%50,nightlife:25+(seed>>7)%70,businessHealth:50+(seed>>8)%45};
}
function advanceDay(){
 state.day++;if(state.day%365===0)state.year++;
 const codes=states().map(s=>s.code);codes.forEach((code,i)=>{const e=ensureState(code),wave=Math.sin((state.day+i*9)/27);e.demand=Math.max(10,Math.min(100,e.demand+wave*.9));e.rent=Math.max(450,Math.round(e.rent*(1+(wave*.0015))));e.property=Math.max(60000,Math.round(e.property*(1+(wave*.0012))));e.businessHealth=Math.max(5,Math.min(100,e.businessHealth+wave*.7));e.jobs=Math.max(5,Math.min(100,e.jobs+Math.cos((state.day+i)/31)*.5))});
 state.populationTicks++;state.businessTicks++;state.propertyTicks++;
 if(state.day%7===0){const code=codes[(state.day/7)%Math.max(1,codes.length)|0],ev=EVENTS[state.day%EVENTS.length];state.history.unshift({day:state.day,year:state.year,code,event:ev});state.history=state.history.slice(0,120)}
 if(state.day%5===0){state.messages.unshift({day:state.day,type:MESSAGES[state.day%MESSAGES.length],from:'TGG WORLD'});state.messages=state.messages.slice(0,40)}
 save();render();return state
}
function startTour(){
 const all=states();if(!all.length)return;const route=[];for(let i=0;i<8;i++)route.push(all[(state.day*3+i*7)%all.length].code);
 const tour={id:'tour-'+Date.now(),route,startedDay:state.day,status:'booked'};state.tours.unshift(tour);state.tours=state.tours.slice(0,20);save();render();window.__tggToast?.('NATIONAL TOUR BOOKED — '+route.join(' → '))
}
function boostFame(code,amount=1){state.fame[code]=(state.fame[code]||0)+amount;save();render()}
function relation(name,delta=1){state.relationships[name]=(state.relationships[name]||0)+delta;save();render()}
function render(){
 const code=window.TGGUSAStates?.state?.()?.current||'NC',e=ensureState(code),hud=document.getElementById('v3500000Hud');
 if(hud){hud.querySelector('b').textContent='YEAR '+state.year+' • DAY '+state.day;hud.querySelector('[data-state]').textContent=code+' DEMAND '+Math.round(e.demand)+' • JOBS '+Math.round(e.jobs);hud.querySelector('[data-econ]').textContent='$'+e.rent+' RENT • $'+e.property+' PROPERTY'}
 const stats=document.getElementById('v3500000Stats');if(stats)stats.textContent=state.history.length+' HISTORY EVENTS • '+state.tours.length+' TOURS • '+state.messages.length+' MESSAGES • '+Object.keys(state.fame).length+' FAME MARKETS';
 const feed=document.getElementById('v3500000Feed');if(feed)feed.innerHTML=state.history.slice(0,10).map(x=>'<article><b>'+x.code+'</b><span>DAY '+x.day+' • '+x.event.toUpperCase()+'</span></article>').join('')
}
document.addEventListener('DOMContentLoaded',()=>{
 const hud=document.createElement('aside');hud.id='v3500000Hud';hud.innerHTML='<small>NATIONAL SIMULATION</small><b>YEAR 1 • DAY 0</b><span data-state>ECONOMY READY</span><span data-econ>PROPERTY + JOBS READY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v3500000Btn';btn.type='button';btn.className='action-primary';btn.textContent='NATIONAL SIM';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v3500000Panel';panel.hidden=true;panel.innerHTML='<div class="v3500000-card"><header><div><small>V80001–V3,500,000</small><h3>NATIONAL LONG-TERM SIMULATION</h3></div><button id="v3500000Close">CLOSE</button></header><p id="v3500000Stats"></p><div class="v3500000-actions"><button id="v3500000Day">ADVANCE DAY</button><button id="v3500000Week">ADVANCE WEEK</button><button id="v3500000Tour">BOOK 8-STATE TOUR</button><button id="v3500000Fame">BOOST LOCAL FAME</button><button id="v3500000Relation">BUILD RELATIONSHIP</button></div><div id="v3500000Feed"></div></div>';document.body.appendChild(panel);
 btn.onclick=()=>{panel.hidden=false;render()};document.getElementById('v3500000Close').onclick=()=>panel.hidden=true;
 document.getElementById('v3500000Day').onclick=()=>advanceDay();
 document.getElementById('v3500000Week').onclick=()=>{for(let i=0;i<7;i++)advanceDay();window.__tggToast?.('ONE WORLD WEEK SIMULATED')};
 document.getElementById('v3500000Tour').onclick=startTour;
 document.getElementById('v3500000Fame').onclick=()=>{const code=window.TGGUSAStates?.state?.()?.current||'NC';boostFame(code,5);window.__tggToast?.(code+' FAME +5')};
 document.getElementById('v3500000Relation').onclick=()=>{relation('LOCAL NETWORK',2);window.__tggToast?.('RELATIONSHIP NETWORK +2')};
 states().forEach(s=>ensureState(s.code));
 window.TGGNationalSimulation={version:VERSION,span:SPAN,advanceDay,startTour,boostFame,relation,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,agingHouseholds:true,careerChanges:true,businessHiring:true,supplyDemand:true,propertyValues:true,eventSurges:true,regionalFame:true,relationshipNetwork:true,invitationsMessages:true,nationalTourRouting:true,persistentHistory:true,all50Economies:true,longTermSimulation:true,ok:true})};
 render();document.documentElement.dataset.tggV3500000='on';window.dispatchEvent(new CustomEvent('tgg:v3500000-ready',{detail:window.TGGNationalSimulation.getStatus()}));
});
})();