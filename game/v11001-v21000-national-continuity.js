(()=>{'use strict';
const VERSION='210.00.0',SPAN='V110.01-V210.00',KEY='tgg-v21000-national-continuity';
const defaults={active:'NC',tourStops:[],routes:[],regionalRep:{Northeast:0,South:0,Midwest:0,West:0},festivals:0,collabs:0,businessLinks:0,miles:0,completedRuns:0,lastRunAt:0};
let state=(()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...s,regionalRep:{...defaults.regionalRep,...(s.regionalRep||{})},tourStops:Array.isArray(s.tourStops)?s.tourStops:[],routes:Array.isArray(s.routes)?s.routes:[]}}catch{return JSON.parse(JSON.stringify(defaults))}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const clone=o=>JSON.parse(JSON.stringify(o));
const states=()=>window.TGGUSAStates?.states?.()||[];
const current=()=>window.TGGUSAStates?.state?.()?.current||state.active||'NC';
const profile=c=>window.TGGStateDepth?.ensure?.(c)||window.TGGAmericaWorldgen?.profile?.(c)||null;
const regionOf=p=>{const r=String(p?.region||'South');if(/north.?east/i.test(r))return'Northeast';if(/mid.?west|central/i.test(r))return'Midwest';if(/west|pacific|mountain/i.test(r))return'West';return'South'};
const hash=s=>[...String(s)].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0)>>>0;
function neighbors(code){
 const all=states();const i=Math.max(0,all.findIndex(s=>s.code===code));if(!all.length)return[];
 const set=[all[(i+1)%all.length],all[(i+all.length-1)%all.length],all[(i+7)%all.length],all[(i+13)%all.length]];
 return [...new Map(set.filter(Boolean).map(x=>[x.code,x])).values()];
}
function route(from,to){
 const a=profile(from),b=profile(to);if(!a||!b)return null;
 const seed=hash(from+'>'+to),miles=90+(seed%1210),hours=Math.max(1,Math.round(miles/58*10)/10);
 const scenic=/mountain|coast|forest|canyon|lake|river/i.test((a.terrain||'')+' '+(b.terrain||''));
 return {id:from+'-'+to+'-'+seed,from,to,miles,hours,scenic,kind:miles>650?'cross-country':miles>300?'interstate':'regional',createdAt:Date.now()}
}
function addStop(code,reason='tour'){
 const p=profile(code);if(!p)return false;state.active=code;
 const stop={code,name:p.name||code,region:regionOf(p),reason,at:Date.now()};state.tourStops.push(stop);state.tourStops=state.tourStops.slice(-120);
 state.regionalRep[stop.region]=(state.regionalRep[stop.region]||0)+(reason==='festival'?5:reason==='collab'?3:2);save();render();return stop
}
function travel(to,reason='tour'){
 const from=current(),r=route(from,to);if(!r)return false;state.routes.push(r);state.routes=state.routes.slice(-160);state.miles+=r.miles;state.completedRuns++;state.lastRunAt=Date.now();addStop(to,reason);
 try{window.TGGUSAStates?.travel?.(to)}catch{}
 try{window.TGGStateDepth?.ensure?.(to)}catch{}
 window.__tggToast?.('NATIONAL RUN — '+from+' → '+to+' • '+r.miles+' MILES');save();return r
}
function nextState(){
 const list=neighbors(current());if(!list.length)return false;return travel(list[state.completedRuns%list.length].code,'tour')
}
function festival(){
 const p=profile(current());if(!p)return false;state.festivals++;state.regionalRep[regionOf(p)]=(state.regionalRep[regionOf(p)]||0)+6;
 window.TGGLifeSim?.change?.({energy:-10,social:8,momentum:10});window.TGGCareer?.addRep?.(10);window.TGGGame?.reward?.(450+state.festivals*20,75);
 addStop(current(),'festival');window.__tggToast?.('FESTIVAL CIRCUIT — '+String(p.name||current()).toUpperCase());save();return true
}
function collab(){
 const p=profile(current());if(!p)return false;state.collabs++;state.regionalRep[regionOf(p)]=(state.regionalRep[regionOf(p)]||0)+4;
 window.TGGLifeSim?.change?.({focus:-4,social:5,momentum:6});window.TGGCareer?.addRep?.(7);window.TGGGame?.reward?.(280+state.collabs*15,55);
 addStop(current(),'collab');window.__tggToast?.('REGIONAL COLLAB COMPLETE');save();return true
}
function connectBusiness(){
 const d=profile(current());if(!d)return false;state.businessLinks++;
 const cash=160+((hash(current()+state.businessLinks)%8)*40);window.TGGGame?.reward?.(cash,25);window.TGGWorldSystems?.applyConsequence?.('national business expansion',-1);
 window.__tggToast?.('BUSINESS NETWORK +1 • $'+cash);save();render();return true
}
function crossCountry(){
 const all=states();if(all.length<2)return false;const start=Math.max(0,all.findIndex(s=>s.code===current())),step=7+(state.completedRuns%9);
 const picks=[];for(let i=1;i<=5;i++)picks.push(all[(start+i*step)%all.length]?.code);let total=0;picks.filter(Boolean).forEach((c,i)=>{const r=travel(c,i===picks.length-1?'festival':'tour');if(r)total+=r.miles});
 window.__tggToast?.('CROSS-COUNTRY RUN COMPLETE • '+total+' MILES');return total
}
function tier(v){return v>=120?'NATIONAL ICON':v>=70?'REGIONAL HEADLINER':v>=35?'TOURING NAME':v>=15?'CONNECTED':'UP NEXT'}
function nationalScore(){return Object.values(state.regionalRep).reduce((a,b)=>a+(Number(b)||0),0)+state.festivals*4+state.collabs*3+state.businessLinks*2+Math.floor(state.miles/500)}
function status(){const score=nationalScore();return {version:VERSION,span:SPAN,active:state.active,miles:state.miles,stops:state.tourStops.length,routes:state.routes.length,festivals:state.festivals,collabs:state.collabs,businessLinks:state.businessLinks,regionalRep:clone(state.regionalRep),nationalScore:score,nationalTier:tier(score),multiStateTouring:true,interstateContinuity:true,regionalReputation:true,festivalCircuit:true,crossCountryCareer:true,businessNetworkContinuity:true,routeHistory:true,stateCareerMemory:true,compact10000LayerRange:true,ok:true}}
function ensureUI(){
 if(document.getElementById('v21000NationalPanel'))return;
 const hud=document.createElement('aside');hud.id='v21000NationalHud';hud.innerHTML='<small>NATIONAL CONTINUITY</small><b id="v21000Tier">UP NEXT</b><span id="v21000Route">0 MILES • 0 STOPS</span><span id="v21000Regions">REGIONAL REP 0</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v21000NationalBtn';btn.type='button';btn.className='action-primary';btn.textContent='NATIONAL TOUR';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v21000NationalPanel';panel.hidden=true;panel.innerHTML='<div class="v21000-card"><header><div><small>V11001–V21000 • 10,000-LAYER RANGE</small><h3>NATIONAL CONTINUITY ENGINE</h3></div><button id="v21000Close">CLOSE</button></header><div id="v21000Summary"></div><div class="v21000-actions"><button id="v21000Next">DRIVE NEXT STATE</button><button id="v21000Trip">5-STATE ROAD RUN</button><button id="v21000Festival">PLAY FESTIVAL</button><button id="v21000Collab">REGIONAL COLLAB</button><button id="v21000Business">CONNECT BUSINESS</button></div><div id="v21000History"></div></div>';document.body.appendChild(panel);
 btn.onclick=()=>{panel.hidden=false;render()};document.getElementById('v21000Close').onclick=()=>panel.hidden=true;
 document.getElementById('v21000Next').onclick=()=>{nextState();render()};document.getElementById('v21000Trip').onclick=()=>{crossCountry();render()};
 document.getElementById('v21000Festival').onclick=()=>{festival();render()};document.getElementById('v21000Collab').onclick=()=>{collab();render()};document.getElementById('v21000Business').onclick=()=>{connectBusiness();render()};
}
function render(){
 ensureUI();const s=status(),rep=Object.values(s.regionalRep).reduce((a,b)=>a+b,0);
 const tierEl=document.getElementById('v21000Tier'),routeEl=document.getElementById('v21000Route'),regionsEl=document.getElementById('v21000Regions');
 if(tierEl)tierEl.textContent=s.nationalTier;if(routeEl)routeEl.textContent=Math.round(s.miles)+' MILES • '+s.stops+' STOPS';if(regionsEl)regionsEl.textContent='REGIONAL REP '+Math.round(rep);
 const sum=document.getElementById('v21000Summary');if(sum)sum.innerHTML='<b>'+s.nationalTier+'</b><span>NATIONAL SCORE '+s.nationalScore+'</span><span>'+s.festivals+' FESTIVALS • '+s.collabs+' COLLABS • '+s.businessLinks+' BUSINESS LINKS</span><span>NORTHEAST '+s.regionalRep.Northeast+' • SOUTH '+s.regionalRep.South+' • MIDWEST '+s.regionalRep.Midwest+' • WEST '+s.regionalRep.West+'</span>';
 const hist=document.getElementById('v21000History');if(hist)hist.innerHTML=state.tourStops.slice(-12).reverse().map(x=>'<div><b>'+x.name+'</b><span>'+x.region+' • '+x.reason.toUpperCase()+'</span></div>').join('')||'<div><b>NO TOUR HISTORY YET</b><span>TAKE THE FIRST NATIONAL RUN</span></div>';
}
document.addEventListener('DOMContentLoaded',()=>{ensureUI();addStop(current(),'home');render();window.addEventListener('tgg:state-change',e=>{if(e.detail?.code){state.active=e.detail.code;save();render()}});
 window.TGGNationalContinuity={version:VERSION,span:SPAN,state:()=>clone(state),status,travel,nextState,crossCountry,festival,collab,connectBusiness,neighbors,route};
 document.documentElement.dataset.tggV21000='on';window.dispatchEvent(new CustomEvent('tgg:v21000-ready',{detail:status()}));
});
})();