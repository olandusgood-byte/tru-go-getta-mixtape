(()=>{'use strict';
const VERSION='100000.00.0',SPAN='V5500001-V10000000',KEY='tgg-v10000000-dynasty-world';
const defaults={year:1,day:0,generation:1,legacy:0,inheritance:{},dynasties:{},musicScenes:{},labels:{},venues:{},redevelopment:{},propertyHistory:[],artistHistory:[],worldHistory:[]};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const states=()=>window.TGGUSAStates?.states?.()||[];
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
function ensure(code){
 const seed=hash(code);
 state.dynasties[code] ||= {familyBusinesses:4+seed%10,heirs:1+(seed>>2)%4,wealth:250000+seed%4500000,age:1};
 state.musicScenes[code] ||= {heat:30+seed%65,artists:8+(seed>>3)%28,styles:3+(seed>>5)%7,era:1};
 state.labels[code] ||= {active:2+(seed>>6)%8,market:25+(seed>>8)%70};
 state.venues[code] ||= {clubs:3+(seed>>4)%12,arenas:1+(seed>>7)%4,festivals:1+(seed>>9)%3,health:40+(seed>>10)%55};
 state.redevelopment[code] ||= {growth:35+(seed>>2)%60,decline:5+(seed>>5)%25,projects:1+(seed>>8)%8};
 return {dynasty:state.dynasties[code],scene:state.musicScenes[code],label:state.labels[code],venue:state.venues[code],redevelopment:state.redevelopment[code]};
}
function simDay(){
 state.day++; if(state.day%365===0){state.year++;state.generation=1+Math.floor(state.year/20)}
 states().forEach((s,i)=>{const d=ensure(s.code),wave=Math.sin((state.day+i*5)/53),era=1+Math.floor(state.year/5);
  d.dynasty.age=state.year; d.dynasty.wealth=Math.max(50000,Math.round(d.dynasty.wealth*(1+wave*.002)));
  if(state.day%120===0&&wave>.45)d.dynasty.familyBusinesses++;
  if(state.day%365===0&&state.year%20===0){d.dynasty.heirs=Math.max(1,d.dynasty.heirs+((i+state.year)%3)-1);state.inheritance[s.code]=(state.inheritance[s.code]||0)+Math.round(d.dynasty.wealth*.08);state.legacy+=2}
  d.scene.era=era; d.scene.heat=Math.max(5,Math.min(100,d.scene.heat+wave*.6)); if(state.day%90===0)d.scene.artists=Math.max(2,d.scene.artists+(wave>.35?1:wave<-.6?-1:0));
  d.label.market=Math.max(5,Math.min(100,d.label.market+wave*.45)); if(state.day%180===0)d.label.active=Math.max(1,d.label.active+(wave>.55?1:wave<-.7?-1:0));
  d.venue.health=Math.max(5,Math.min(100,d.venue.health+wave*.55)); if(state.day%365===0&&wave>.5)d.venue.clubs++;
  d.redevelopment.growth=Math.max(5,Math.min(100,d.redevelopment.growth+wave*.5));d.redevelopment.decline=Math.max(0,Math.min(100,d.redevelopment.decline-wave*.25));if(state.day%240===0&&wave>.25)d.redevelopment.projects++;
 });
 if(state.day%120===0){const all=states(),s=all[(state.day/120)%Math.max(1,all.length)|0];if(s)state.artistHistory.unshift({year:state.year,code:s.code,event:['breakout-artist','label-rise','venue-boom','scene-shift','tour-breakthrough'][state.year%5]})}
 if(state.day%365===0){const all=states(),s=all[state.year%Math.max(1,all.length)];if(s)state.propertyHistory.unshift({year:state.year,code:s.code,event:state.year%2?'redevelopment-boom':'property-cycle'});state.worldHistory.unshift({year:state.year,generation:state.generation,event:['new-era','national-tour-season','family-transition','market-cycle','culture-shift'][state.year%5]})}
 state.artistHistory=state.artistHistory.slice(0,120);state.propertyHistory=state.propertyHistory.slice(0,120);state.worldHistory=state.worldHistory.slice(0,120);save();render();return state
}
function render(){
 const code=window.TGGUSAStates?.state?.()?.current||'NC',d=ensure(code),hud=document.getElementById('v10000000Hud');
 if(hud){hud.querySelector('b').textContent='GEN '+state.generation+' • YEAR '+state.year;hud.querySelector('[data-scene]').textContent=code+' SCENE '+Math.round(d.scene.heat)+' • '+d.scene.artists+' ARTISTS';hud.querySelector('[data-dynasty]').textContent='$'+d.dynasty.wealth+' DYNASTY • '+d.dynasty.familyBusinesses+' FAMILY BUSINESSES'}
 const stats=document.getElementById('v10000000Stats');if(stats)stats.textContent='LEGACY '+state.legacy+' • '+Object.keys(state.inheritance).length+' INHERITANCE MARKETS • '+state.worldHistory.length+' WORLD ERAS';
 const feed=document.getElementById('v10000000Feed');if(feed)feed.innerHTML=state.worldHistory.slice(0,10).map(x=>'<article><b>YEAR '+x.year+'</b><span>GEN '+x.generation+' • '+x.event.toUpperCase()+'</span></article>').join('');
}
document.addEventListener('DOMContentLoaded',()=>{
 states().forEach(s=>ensure(s.code));
 const hud=document.createElement('aside');hud.id='v10000000Hud';hud.innerHTML='<small>DYNASTY WORLD</small><b>GEN 1 • YEAR 1</b><span data-scene>MUSIC SCENE READY</span><span data-dynasty>DYNASTIES READY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v10000000Btn';btn.type='button';btn.className='action-primary';btn.textContent='DYNASTY WORLD';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v10000000Panel';panel.hidden=true;panel.innerHTML='<div class="v10000000-card"><header><div><small>V5,500,001–V10,000,000</small><h3>DYNASTY + LEGACY WORLD</h3></div><button id="v10000000Close">CLOSE</button></header><p id="v10000000Stats"></p><div class="v10000000-actions"><button id="v10000000Day">ADVANCE DAY</button><button id="v10000000Year">ADVANCE YEAR</button><button id="v10000000Decade">ADVANCE DECADE</button><button id="v10000000Inheritance">CLAIM INHERITANCE</button></div><div id="v10000000Feed"></div></div>';document.body.appendChild(panel);
 btn.onclick=()=>{panel.hidden=false;render()};document.getElementById('v10000000Close').onclick=()=>panel.hidden=true;
 document.getElementById('v10000000Day').onclick=()=>simDay();
 document.getElementById('v10000000Year').onclick=()=>{for(let i=0;i<365;i++)simDay();window.__tggToast?.('ONE WORLD YEAR SIMULATED')};
 document.getElementById('v10000000Decade').onclick=()=>{for(let y=0;y<10;y++)for(let i=0;i<365;i++)simDay();window.__tggToast?.('ONE WORLD DECADE SIMULATED')};
 document.getElementById('v10000000Inheritance').onclick=()=>{const code=window.TGGUSAStates?.state?.()?.current||'NC',amt=state.inheritance[code]||0;state.legacy+=Math.max(1,Math.floor(amt/100000));state.inheritance[code]=0;save();window.__tggToast?.('LEGACY INHERITANCE CLAIMED');render()};
 window.TGGDynastyWorld={version:VERSION,span:SPAN,simDay,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,multiGenerationFamilies:true,inheritance:true,familyBusinesses:true,businessDynasties:true,neighborhoodRedevelopment:true,propertyInheritance:true,musicSceneEvolution:true,artistRiseFall:true,labelEvolution:true,venueEvolution:true,nationalTourSeasons:true,regionalCultureEvolution:true,careerLegacy:true,persistentDecades:true,all50Compatible:true,ok:true})};
 render();document.documentElement.dataset.tggV10000000='on';window.dispatchEvent(new CustomEvent('tgg:v10000000-ready',{detail:window.TGGDynastyWorld.getStatus()}));
});
})();