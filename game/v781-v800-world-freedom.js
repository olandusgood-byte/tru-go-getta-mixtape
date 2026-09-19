(()=>{'use strict';
const VERSION='8.00.0',KEY='tgg-v800-world-freedom';
const points=[
{id:'airport',name:'TGG INTERNATIONAL',kind:'travel',x:132,z:-122},
{id:'rail',name:'CENTRAL RAIL TERMINAL',kind:'travel',x:18,z:126},
{id:'camp',name:'PINE COUNTRY CAMPGROUND',kind:'rest',x:-136,z:-126},
{id:'marina',name:'LAKE MARINA',kind:'leisure',x:-112,z:118},
{id:'trail',name:'NORTH RIDGE TRAILHEAD',kind:'leisure',x:108,z:-136},
{id:'market',name:'WEST COUNTY MARKET',kind:'commerce',x:-148,z:22}
];
let state=(()=>{try{return {visited:[],scenic:0,rested:0,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {visited:[],scenic:0,rested:0}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const wait=()=>new Promise(r=>{const t=()=>window.TGG3D?.isReady?.()?r(window.TGG3D):requestAnimationFrame(t);t()});
wait().then(api=>{
 const THREE=window.THREE,root=new THREE.Group();root.name='TGG_WORLD_FREEDOM_V800';api.scene.add(root);
 const mat=new THREE.MeshStandardMaterial({color:0x202733,metalness:.4,roughness:.5});
 const glow=new THREE.MeshStandardMaterial({color:0x6ad9ff,emissive:0x1f8cc2,emissiveIntensity:2.5});
 points.forEach((p,i)=>{const g=new THREE.Group();const base=new THREE.Mesh(new THREE.CylinderGeometry(1.7,2.1,.35,18),mat);base.position.y=.18;g.add(base);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.11,2.9,8),mat);pole.position.y=1.6;g.add(pole);const orb=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),glow.clone());orb.position.y=3;g.add(orb);g.position.set(p.x,0,p.z);g.userData.tggPoint=p;root.add(g)});
 const toast=(m)=>window.__tggToast?.(m);
 const nearest=()=>{const pos=api.toWorld(window.TGGGame?.getState?.()||{x:50,y:50});return points.map(p=>({...p,d:Math.hypot(pos.x-p.x,pos.z-p.z)})).sort((a,b)=>a.d-b.d)[0]};
 function interact(){
  const p=nearest();if(!p||p.d>10)return {accepted:false,status:'too_far',nearest:p};
  if(!state.visited.includes(p.id)){state.visited.push(p.id);state.scenic++;toast('NEW LOCATION — '+p.name)}
  if(p.kind==='rest'){state.rested++;window.TGGLifeSandbox?.repair?.();toast('RESTED AT '+p.name)}
  if(p.id==='airport'||p.id==='rail')toast(p.name+' — LONG-DISTANCE TRAVEL HUB READY');
  save();return {accepted:true,point:p};
 }
 const btn=document.createElement('button');btn.id='v800WorldFreedomBtn';btn.type='button';btn.textContent='WORLD FREEDOM';btn.className='action-primary';
 const actions=document.querySelector('#game .action-deck .actions');if(actions)actions.appendChild(btn);
 const panel=document.createElement('section');panel.id='v800WorldFreedomPanel';panel.hidden=true;
 panel.innerHTML='<div class="v800-card"><header><div><small>WORLD FREEDOM</small><h3>GO ANYWHERE. DO MORE THAN MUSIC.</h3></div><button id="v800Close">CLOSE</button></header><div id="v800Points"></div><button id="v800Interact">USE NEAREST LOCATION</button></div>';document.body.appendChild(panel);
 const host=panel.querySelector('#v800Points');
 host.innerHTML=points.map(p=>'<article><b>'+p.name+'</b><span>'+p.kind.toUpperCase()+'</span></article>').join('');
 btn.onclick=()=>panel.hidden=false;panel.querySelector('#v800Close').onclick=()=>panel.hidden=true;panel.querySelector('#v800Interact').onclick=()=>interact();
 let last=-1;setInterval(()=>{const hour=Math.floor(window.TGGLifeSandbox?.state?.()?.time??18);if(hour===last)return;last=hour;document.documentElement.dataset.tggDaypart=hour<6?'late-night':hour<11?'morning':hour<17?'day':hour<21?'evening':'night'},1000);
 window.TGGWorldFreedom={version:VERSION,points:()=>points.map(x=>({...x})),nearest,interact,state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,locations:points.length,visited:state.visited.length,nonMusicActivities:true,travelHubs:2,restPoints:1,ok:true})};
 document.documentElement.dataset.tggV800='on';window.dispatchEvent(new CustomEvent('tgg:v800-ready',{detail:window.TGGWorldFreedom.getStatus()}));
}).catch(e=>{window.TGGWorldFreedom={version:VERSION,getStatus:()=>({version:VERSION,ok:false,error:String(e?.message||e)})}});
})();