(()=>{'use strict';
const VERSION='12.00.0',SPAN='V11.01-V12.00',KEY='tgg-v1200-driving-interaction';
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()&&window.THREE?r(window.TGG3D):requestAnimationFrame(t);t()});
const defaults={damage:0,tireWear:0,tireTemp:70,hydroplaneRisk:0,mudGrip:1,snowGrip:1,services:0,washes:0,repairs:0,tows:0,crashes:0,nightCrowd:0};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const serviceStops=[
{id:'gas-west',name:'WEST COUNTY FUEL',kind:'gas',x:-168,z:-168},
{id:'gas-east',name:'EAST I-9 FUEL',kind:'gas',x:168,z:-168},
{id:'wash-coast',name:'COAST AUTO SPA',kind:'wash',x:170,z:120},
{id:'repair-canyon',name:'REDLINE REPAIR',kind:'repair',x:142,z:-86},
{id:'tow-city',name:'TGG TOW YARD',kind:'tow',x:160,z:24}
];
wait().then(api=>{
 const THREE=window.THREE,scene=api.scene,root=new THREE.Group();root.name='TGG_DRIVING_INTERACTION_V1200';scene.add(root);
 const mk=(c,r=.75,m=.2)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const wet=mk(0x101820,.28,.45),dry=mk(0x1b1d21,.74,.2),snow=mk(0xe9eff5,.7,.02),mud=mk(0x4c3928,.98,.01);
 const ramps=[[-120,-172,.35],[-76,-172,-.35],[76,-172,.35],[120,-172,-.35],[172,-120,1.2],[172,120,-1.2]];
 ramps.forEach(([x,z,r])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(9,.08,54),dry.clone());m.position.set(x,.05,z);m.rotation.y=r;root.add(m)});
 const lights=[];for(let i=0;i<24;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshStandardMaterial({color:0xfff2cf,emissive:0xffc56b,emissiveIntensity:3}));p.position.set(-176+i*15,.12,-181);root.add(p);lights.push(p)}
 const spray=[];for(let i=0;i<18;i++){const s=new THREE.Mesh(new THREE.PlaneGeometry(.8,1.8),new THREE.MeshBasicMaterial({color:0xaed8ff,transparent:true,opacity:0,depthWrite:false}));s.position.set(-160+i*18,.3,-176);s.rotation.x=-Math.PI/2;root.add(s);spray.push(s)}
 const marks=[];for(let i=0;i<20;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.25,7),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:.0}));m.rotation.x=-Math.PI/2;m.position.set(-150+i*15,.01,176);root.add(m);marks.push(m)}
 const stopGroups=[];serviceStops.forEach((p,i)=>{const g=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(11,4.2,8),mk(i%2?0x293544:0x3f2d2a,.62,.2));b.position.y=2.1;g.add(b);const sign=new THREE.Mesh(new THREE.BoxGeometry(7,.7,.25),new THREE.MeshStandardMaterial({color:0xffd96b,emissive:0xff8a33,emissiveIntensity:2.2}));sign.position.set(0,4.7,0);g.add(sign);g.position.set(p.x,0,p.z);g.userData.tggService=p;root.add(g);stopGroups.push(g)});
 const businesses=[
{name:'MORNING DINER',open:5,close:15,x:-150,z:-42},
{name:'NIGHT DINER',open:18,close:4,x:142,z:52},
{name:'COAST HOTEL',open:0,close:24,x:164,z:110},
{name:'TRAIL OUTFITTER',open:7,close:19,x:104,z:-132},
{name:'RIVER BAIT SHOP',open:6,close:17,x:-102,z:146}
];
 const shopMeshes=[];businesses.forEach((b,i)=>{const g=new THREE.Mesh(new THREE.BoxGeometry(8,4,7),mk(0x303743,.8,.08));g.position.set(b.x,2,b.z);g.userData.tggBusiness=b;root.add(g);shopMeshes.push(g)});
 const pedestrians=[];for(let i=0;i<42;i++){const n=new THREE.Mesh(new THREE.BoxGeometry(.48,1.65,.48),mk([0x765843,0x4b6380,0x775075][i%3],.88,.02));n.position.set(-160+(i%14)*24,.83,-10+Math.floor(i/14)*18);n.userData.tggRoutine={home:i%9,work:(i+4)%11,night:i%3===0};root.add(n);pedestrians.push(n)}
 const hud=document.createElement('aside');hud.id='v1200DriveHud';hud.innerHTML='<small>DRIVING REALISM</small><b id="v1200Grip">GRIP 100%</b><span id="v1200Tires">TIRES 0%</span><span id="v1200Damage">DAMAGE 0%</span><span id="v1200Risk">HYDRO 0%</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v1200DriveBtn';btn.type='button';btn.className='action-primary';btn.textContent='DRIVING REALISM';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v1200DrivePanel';panel.hidden=true;panel.innerHTML='<div class="v1200-card"><header><div><small>V1101–V1200</small><h3>DRIVING + WORLD INTERACTION</h3></div><button id="v1200Close">CLOSE</button></header><div id="v1200Stats"></div><div id="v1200Stops"></div><div class="v1200-actions"><button id="v1200Fuel">REFUEL</button><button id="v1200Wash">WASH</button><button id="v1200Repair">REPAIR</button><button id="v1200Tow">CALL TOW</button></div></div>';document.body.appendChild(panel);
 panel.querySelector('#v1200Stops').innerHTML=serviceStops.map(s=>'<article><b>'+s.name+'</b><span>'+s.kind.toUpperCase()+'</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;render()};panel.querySelector('#v1200Close').onclick=()=>panel.hidden=true;
 function render(){panel.querySelector('#v1200Stats').innerHTML='<p>CRASHES '+state.crashes+' • REPAIRS '+state.repairs+' • WASHES '+state.washes+' • TOWS '+state.tows+'</p>'}
 panel.querySelector('#v1200Fuel').onclick=()=>{window.TGGLifeSandbox?.refuel?.();state.services++;save();window.__tggToast?.('VEHICLE REFUELED');render()};
 panel.querySelector('#v1200Wash').onclick=()=>{window.TGGTravelCinematic?.cleanVehicle?.();state.washes++;save();window.__tggToast?.('VEHICLE CLEANED');render()};
 panel.querySelector('#v1200Repair').onclick=()=>{window.TGGTravelCinematic?.serviceVehicle?.();state.damage=0;state.repairs++;save();window.__tggToast?.('VEHICLE REPAIRED');render()};
 panel.querySelector('#v1200Tow').onclick=()=>{state.tows++;save();window.TGGDeepWorld?.requestService?.('TOW TRUCK');window.__tggToast?.('TOW TRUCK DISPATCHED');render()};
 let last=performance.now(),clock=0,nextCrash=Date.now()+90000;
 function grip(){const w=window.TGGLifeSandbox?.state?.()?.weather||'clear';const season=window.TGGDeepWorld?.state?.()?.season||'summer';state.hydroplaneRisk=w==='rain'?Math.min(100,25+state.tireWear*.65):0;state.mudGrip=w==='rain'?.72:1;state.snowGrip=season==='winter'?.68:1;return Math.min(1,state.mudGrip,state.snowGrip)*(1-state.tireWear/180)*(1-state.hydroplaneRisk/250)}
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;const g=grip();
  const game=window.TGGGame?.getState?.();if(game?.inVehicle){state.tireWear=Math.min(100,state.tireWear+dt*.0018);state.tireTemp=Math.min(115,70+Math.abs(Math.sin(clock*.5))*28)}
  const w=window.TGGLifeSandbox?.state?.()?.weather||'clear';spray.forEach((s,i)=>{s.material.opacity=w==='rain'?.18+((Math.sin(clock*3+i)+1)*.08):0});marks.forEach((m,i)=>{m.material.opacity=(state.tireWear>55||g<.72)?.08+((i%3)*.02):0});
  const hour=window.TGGLifeSandbox?.state?.()?.time??18;shopMeshes.forEach(s=>{const b=s.userData.tggBusiness;const open=b.close>b.open?(hour>=b.open&&hour<b.close):(hour>=b.open||hour<b.close);s.material.emissive?.setHex(open?0x191919:0x000000)});
  pedestrians.forEach((n,i)=>{const night=hour>=19||hour<6,nActive=night?n.userData.tggRoutine.night:true;if(nActive){n.position.x+=Math.sin(clock*.18+i)*.006;n.position.z+=Math.cos(clock*.14+i)*.004}});
  state.nightCrowd=pedestrians.filter(n=>(hour>=19||hour<6)?n.userData.tggRoutine.night:true).length;
  if(Date.now()>nextCrash){state.crashes++;state.damage=Math.min(100,state.damage+4);save();window.__tggToast?.('TRAFFIC INCIDENT — ROADSIDE RESPONSE ACTIVE');nextCrash=Date.now()+105000}
  document.getElementById('v1200Grip').textContent='GRIP '+Math.round(g*100)+'%';document.getElementById('v1200Tires').textContent='TIRES '+Math.round(state.tireWear)+'%';document.getElementById('v1200Damage').textContent='DAMAGE '+Math.round(state.damage)+'%';document.getElementById('v1200Risk').textContent='HYDRO '+Math.round(state.hydroplaneRisk)+'%';
 }requestAnimationFrame(tick);
 window.TGGDrivingInteraction={version:VERSION,span:SPAN,state:()=>JSON.parse(JSON.stringify(state)),serviceStops:()=>serviceStops.map(x=>({...x})),businesses:()=>businesses.map(x=>({...x})),getStatus:()=>({version:VERSION,span:SPAN,ramps:ramps.length,serviceStops:serviceStops.length,businesses:businesses.length,pedestrians:pedestrians.length,weatherGrip:true,hydroplaning:true,tireWear:true,vehicleDamage:true,towService:true,carWash:true,repairShops:true,businessHours:true,nightCrowds:true,ok:true})};
 document.documentElement.dataset.tggV1200='on';window.dispatchEvent(new CustomEvent('tgg:v1200-ready',{detail:window.TGGDrivingInteraction.getStatus()}));
}).catch(e=>{window.TGGDrivingInteraction={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();