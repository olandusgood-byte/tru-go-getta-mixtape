(()=>{
'use strict';
const VERSION='7.55.0',KEY='tgg-v755-commercial-city',SCALE=2.75;
const SITES=[
{id:'north-mall',name:'NORTHSIDE MALL',type:'MALL',x:58,z:-118,park:[49,-110],door:[56,-115],cost:3200,income:180,color:'#ffd45c'},
{id:'highway-plaza',name:'HIGHWAY PLAZA',type:'RETAIL',x:-10,z:-111,park:[-19,-104],door:[-12,-109],cost:2100,income:115,color:'#65d6ff'},
{id:'south-gas',name:'SOUTHSIDE GAS + MART',type:'GAS',x:36,z:113,park:[27,106],door:[34,111],cost:1750,income:92,color:'#ff8a55'},
{id:'west-warehouse',name:'WEST COUNTY WAREHOUSE',type:'WAREHOUSE',x:-118,z:-28,park:[-109,-21],door:[-115,-26],cost:2800,income:155,color:'#9b8cff'},
{id:'retail-row',name:'DOWNTOWN RETAIL ROW',type:'RETAIL',x:-30,z:30,park:[-39,24],door:[-32,28],cost:2400,income:135,color:'#c7ff00'},
{id:'lake-resort',name:'LAKE ROAD RESORT',type:'HOSPITALITY',x:-88,z:100,park:[-79,93],door:[-86,98],cost:4400,income:245,color:'#48d7ff'},
{id:'industrial-logistics',name:'INDUSTRIAL LOGISTICS',type:'LOGISTICS',x:118,z:16,park:[109,10],door:[115,14],cost:3900,income:220,color:'#ff6f91'},
{id:'skyline-rooftop',name:'SKYLINE ROOFTOP VENUE',type:'ENTERTAINMENT',x:28,z:48,park:[19,42],door:[26,46],cost:5200,income:310,color:'#d48cff'}
];
const defaults={owned:{},banked:0,totalEarned:0,lastCycle:Date.now(),targetId:null,currentId:null,history:[]};
let state=load();
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return{...defaults,...s,owned:{...(s.owned||{})},history:Array.isArray(s.history)?s.history.slice(-50):[]}}catch{return JSON.parse(JSON.stringify(defaults))}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
const site=id=>SITES.find(x=>x.id===id)||null;
const world=()=>{const s=window.TGGGame?.getState?.()||{};return{x:((Number(s.x)||50)-50)*SCALE,z:((Number(s.y)||50)-50)*SCALE,state:s}};
const toPercent=(x,z)=>({x:50+x/SCALE,y:50+z/SCALE});
const distanceTo=(s,p)=>Math.hypot((s.x||0)-p[0],(s.z||0)-p[1]);
function level(id){return Math.max(0,Number(state.owned[id])||0)}
function buyCost(s){const l=level(s.id);return l?Math.round(s.cost*Math.pow(1.55,l)) : s.cost}
function incomeFor(s){const l=level(s.id);return l?Math.round(s.income*(1+(l-1)*.55)):0}
function setTarget(id){const s=site(id);if(!s)return false;state.targetId=id;save();window.__tggToast?.('BUSINESS ROUTE — '+s.name);render();return true}
function navigationTarget(){
 const s=site(state.targetId);if(!s)return null;const p=world(),inCar=!!p.state.inVehicle,q=inCar?s.park:s.door,d=distanceTo(p,q),pct=toPercent(q[0],q[1]);
 return{x:pct.x,y:pct.y,label:(inCar?'PARK • ':'ENTER • ')+s.name,color:s.color,radius:inCar?6:4,arrived:d<(inCar?8:5)};
}
function near(kind='door'){const p=world();let best=null;for(const s of SITES){const q=kind==='park'?s.park:s.door,d=distanceTo(p,q);if(!best||d<best.distance)best={...s,distance:d}}return best}
function buyOrUpgrade(id){
 const s=site(id);if(!s)return false;const cost=buyCost(s);if(!window.TGGGame?.spend?.(cost))return false;
 state.owned[id]=level(id)+1;state.history.push({type:level(id)===1?'buy':'upgrade',id,at:Date.now(),cost});state.history=state.history.slice(-50);save();render();window.__tggToast?.(s.name+' • LEVEL '+level(id));return true
}
function cycle(force=false){
 const now=Date.now(),span=10*60*1000;if(!force&&now-state.lastCycle<span)return false;const periods=Math.max(1,Math.floor((now-state.lastCycle)/span));state.lastCycle=now;
 let earned=0;for(let i=0;i<periods;i++)for(const s of SITES)earned+=incomeFor(s);state.banked+=earned;state.totalEarned+=earned;if(earned)state.history.push({type:'income',amount:earned,at:now});state.history=state.history.slice(-50);save();render();return earned
}
function collect(){const amount=Math.max(0,Math.round(state.banked));if(!amount)return false;window.TGGGame?.reward?.(amount,Math.max(1,Math.round(amount/100)));state.banked=0;save();render();window.__tggToast?.('BUSINESS INCOME +$'+amount);return true}
function openDirectory(){state.currentId=null;save();render();window.TGGGame?.show?.('commercial');return true}
function enter(id){const s=site(id);if(!s)return false;const p=world();if(p.state.inVehicle)return false;if(distanceTo(p,s.door)>5){setTarget(id);return false}state.currentId=id;state.targetId=null;save();render();window.TGGGame?.show?.('commercial');return true}
function exit(){const s=site(state.currentId);if(s){const p=toPercent(s.door[0]+2,s.door[1]+1),g=window.TGGGame?.getState?.();if(g){g.x=p.x;g.y=p.y;g.inVehicle=false;window.TGGGame?.refresh?.();window.TGGGame?.save?.(true)}}state.currentId=null;save();window.TGGGame?.show?.('game');return true}
function parkAndExit(s){const p=world(),speed=Math.abs(Number(window.TGGGame?.getDrivingState?.()?.speed)||0);if(distanceTo(p,s.park)>8)return false;if(speed>1.1){window.__tggToast?.('SLOW DOWN TO PARK');return false}window.TGGGame?.toggleVehicle?.();window.__tggToast?.('PARKED — WALK TO '+s.name);return true}
function render(){
 const title=document.getElementById('v755Title'),sub=document.getElementById('v755Sub'),grid=document.getElementById('v755Grid'),detail=document.getElementById('v755Site');if(!title||!grid||!detail)return;
 const current=site(state.currentId);title.textContent=current?current.name:'BUSINESS MAP';sub.textContent=current?(current.type+' • LEVEL '+level(current.id)):'Buy locations • upgrade them • collect income';
 grid.innerHTML=current?'':SITES.map(s=>'<article><b>'+s.name+'</b><span>'+s.type+' • LVL '+level(s.id)+'</span><small>$'+buyCost(s)+' NEXT • $'+incomeFor(s)+'/CYCLE</small><div><button data-v755-route="'+s.id+'">ROUTE</button><button data-v755-buy="'+s.id+'">'+(level(s.id)?'UPGRADE':'BUY')+'</button></div></article>').join('');
 detail.innerHTML=current?'<div class="v755-interior"><small>'+current.type+'</small><h3>'+current.name+'</h3><p>Owned level '+level(current.id)+' • earns $'+incomeFor(current)+'/cycle.</p><div class="v755-interior-floor"><i></i><i></i><i></i><b>OPEN FOR BUSINESS</b></div><button data-v755-buy="'+current.id+'">'+(level(current.id)?'UPGRADE BUSINESS':'BUY BUSINESS')+' • $'+buyCost(current)+'</button><button id="v755Collect">COLLECT $'+Math.round(state.banked)+'</button></div>':'<aside class="v755-bank"><b>BANKED BUSINESS INCOME</b><strong>$'+Math.round(state.banked)+'</strong><button id="v755Collect">COLLECT</button><button id="v755Cycle">RUN BUSINESS CYCLE</button></aside>';
 grid.querySelectorAll('[data-v755-route]').forEach(b=>b.onclick=()=>{setTarget(b.dataset.v755Route);window.TGGGame?.show?.('game')});
 document.querySelectorAll('[data-v755-buy]').forEach(b=>b.onclick=()=>buyOrUpgrade(b.dataset.v755Buy));
 document.getElementById('v755Collect')?.addEventListener('click',collect);document.getElementById('v755Cycle')?.addEventListener('click',()=>cycle(true));
}
function ensureButton(){if(document.getElementById('v755CommercialBtn'))return;const host=document.querySelector('#game .action-deck .actions');if(!host)return;const b=document.createElement('button');b.id='v755CommercialBtn';b.textContent='COMMERCIAL MAP';b.addEventListener('click',openDirectory);host.appendChild(b)}
function ensureWorld(){
 const api=window.TGG3D;if(!api?.scene||!window.THREE||api.scene.getObjectByName('TGG_COMMERCIAL_V755'))return false;const THREE=window.THREE,g=new THREE.Group();g.name='TGG_COMMERCIAL_V755';api.scene.add(g);
 SITES.forEach((s,i)=>{const mat=new THREE.MeshStandardMaterial({color:0x202733,roughness:.78,metalness:.12});const h=5+(i%4)*2.4,w=7+(i%3)*2,d=6+(i%2)*2;const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);b.position.set(s.x,h/2,s.z);b.castShadow=true;b.receiveShadow=true;g.add(b);const sign=new THREE.Mesh(new THREE.BoxGeometry(w*.75,.8,.18),new THREE.MeshStandardMaterial({color:new THREE.Color(s.color),emissive:new THREE.Color(s.color),emissiveIntensity:1.8}));sign.position.set(s.x,h*.65,s.z-d/2-.11);g.add(sign);const lot=new THREE.Mesh(new THREE.PlaneGeometry(10,7),new THREE.MeshBasicMaterial({color:0x1c2229,transparent:true,opacity:.7,side:THREE.DoubleSide}));lot.rotation.x=-Math.PI/2;lot.position.set(s.park[0],.09,s.park[1]);g.add(lot)});
 return true
}
function bind(){
 document.getElementById('v755Back')?.addEventListener('click',()=>state.currentId?exit():window.TGGGame?.show?.('game'));
 document.addEventListener('keydown',e=>{if(window.TGGGame?.getActiveScreen?.()!=='game'||(e.key!=='f'&&e.key!=='F'))return;const p=world();if(p.state.inVehicle){const s=near('park');if(s?.distance<8){e.preventDefault();e.stopImmediatePropagation();parkAndExit(s)}}else{const s=near('door');if(s?.distance<5){e.preventDefault();e.stopImmediatePropagation();enter(s.id)}}},true);
 setInterval(()=>{cycle(false);ensureButton();ensureWorld();const p=world();if(state.targetId){const s=site(state.targetId),d=distanceTo(p,p.state.inVehicle?s.park:s.door);if(d<(p.state.inVehicle?8:5))window.__tggToast?.(p.state.inVehicle?'PARK HERE • F':'FRONT DOOR • F')}},1200)
}
function snapshot(){return{version:VERSION,owned:{...state.owned},banked:state.banked,totalEarned:state.totalEarned,targetId:state.targetId,currentId:state.currentId,sites:SITES.map(s=>({id:s.id,type:s.type,cost:s.cost,income:s.income})),features:['commercial-districts','physical-business-routing','parking-before-entry','generic-business-interiors','business-ownership','business-upgrades','passive-income','income-collection','open-world-commercial-buildings']}}
function run(){const checks={game:!!window.TGGGame,world:!!window.TGG3D,openWorld:!!window.TGGOpenWorld,commercialScreen:!!document.getElementById('commercial'),sites:SITES.length===8,features:snapshot().features.length===9};const failed=Object.keys(checks).filter(k=>!checks[k]);return{version:VERSION,layer:'COMMERCIAL-CITY',ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString(),mutationPolicy:'local-only'}}
function boot(){bind();ensureButton();ensureWorld();render();window.TGGCommercialCity={version:VERSION,setTarget,navigationTarget,near,buyOrUpgrade,cycle,collect,openDirectory,enter,exit,parkAndExit,snapshot,run};window.TGGV755={version:VERSION,run,snapshot};document.documentElement.dataset.tggV755='on';window.dispatchEvent(new CustomEvent('tgg:v755-ready',{detail:run()}))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();