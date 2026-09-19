(()=>{
'use strict';
const VERSION='7.62.0',SPAN='V7.54-V7.62',KEY='tgg-v762-street-racing';
const wait=()=>new Promise(resolve=>{const tick=()=>window.TGG3D?.isReady?.()&&window.THREE?resolve():requestAnimationFrame(tick);tick()});
const clone=v=>JSON.parse(JSON.stringify(v));
const defaults={active:false,armed:false,routeId:null,index:0,laps:0,startAt:0,bestMs:null,completed:0,lastResult:null};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}'),active:false,armed:false,index:0,startAt:0}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state};

wait().then(()=>{
  const THREE=window.THREE,api=window.TGG3D,scene=api.scene;
  const root=new THREE.Group();root.name='TGG_STREET_RACING_V762';scene.add(root);
  const hot=new THREE.MeshStandardMaterial({color:0xff4d3d,emissive:0x9a120b,emissiveIntensity:2.4,roughness:.28});
  const frame=new THREE.MeshStandardMaterial({color:0x3b414b,metalness:.72,roughness:.36});
  const routes={
    beltway:{id:'beltway',name:'CITY BELTWAY',laps:2,color:'#ff4d3d',points:[[-104,-104],[0,-112],[104,-104],[112,0],[104,104],[0,112],[-104,104],[-112,0]]},
    highway:{id:'highway',name:'NORTH-SOUTH HIGHWAY SPRINT',laps:1,color:'#65d6ff',points:[[88,-74],[112,-42],[112,42],[88,104],[34,112],[6,108]]},
    lake:{id:'lake',name:'LAKE ROAD RUN',laps:1,color:'#c7ff00',points:[[-112,54],[-106,92],[-82,116],[-48,110],[-30,84],[-58,68],[-92,70]]},
    industrial:{id:'industrial',name:'INDUSTRIAL NIGHT RUN',laps:1,color:'#c56cff',points:[[74,-84],[110,-72],[120,-22],[106,24],[88,58],[62,32],[72,-18]]}
  };
  const routeList=Object.values(routes),gates=[];
  routeList.forEach((route,ri)=>route.points.forEach(([x,z],pi)=>{
    const g=new THREE.Group();g.position.set(x,0,z);g.visible=false;
    const mat=hot.clone();mat.color.set(route.color);mat.emissive.set(route.color);
    const l=new THREE.Mesh(new THREE.BoxGeometry(.25,4.4,.25),frame);l.position.set(-4.2,2.2,0);g.add(l);
    const r=new THREE.Mesh(new THREE.BoxGeometry(.25,4.4,.25),frame);r.position.set(4.2,2.2,0);g.add(r);
    const top=new THREE.Mesh(new THREE.BoxGeometry(8.7,.28,.28),mat);top.position.set(0,4.25,0);g.add(top);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.1,.14,10,32),mat);ring.rotation.x=Math.PI/2;ring.position.y=.1;g.add(ring);
    root.add(g);gates.push({routeId:route.id,index:pi,g,ring,top});
  }));

  const hud=document.createElement('section');hud.id='v762RaceHud';hud.hidden=true;
  hud.innerHTML='<small>STREET RACING</small><b id="v762RaceName">RACE</b><span id="v762RaceProgress">CHECKPOINT</span><strong id="v762RaceTime">0:00.000</strong>';
  document.body.appendChild(hud);
  const menu=document.createElement('section');menu.id='v762RaceMenu';menu.hidden=true;
  menu.innerHTML='<div class="v762-card"><header><div><small>TGG STREET RACING</small><h3>CHOOSE A RUN</h3></div><button id="v762RaceClose" type="button">CLOSE</button></header><div id="v762RaceRoutes"></div></div>';
  document.body.appendChild(menu);
  const style=document.createElement('style');
  style.textContent='#v762RaceHud{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:1350;min-width:min(380px,86%);padding:10px 14px;border:1px solid #ffffff24;border-radius:14px;background:#070a10df;color:#fff;text-align:center;font-family:Inter,system-ui,sans-serif;pointer-events:none}#v762RaceHud[hidden]{display:none}#v762RaceHud small{display:block;color:#ff6b5d;font-size:8px;font-weight:900;letter-spacing:.16em}#v762RaceHud b{display:block;font-size:16px;margin-top:2px}#v762RaceHud span{display:block;color:#aeb8c6;font-size:9px;margin-top:2px}#v762RaceHud strong{display:block;font-size:20px;margin-top:3px}#v762RaceMenu{position:fixed;inset:0;z-index:18000;display:grid;place-items:center;padding:18px;background:#02040ab8;font-family:Inter,system-ui,sans-serif}#v762RaceMenu[hidden]{display:none}.v762-card{width:min(620px,96vw);border:1px solid #ffffff22;border-radius:22px;background:#090d14f5;color:#fff;padding:18px}.v762-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v762-card small{color:#ff6b5d;font-size:9px;font-weight:900;letter-spacing:.14em}.v762-card h3{margin:4px 0 14px;font-size:26px}.v762-card header button,.v762-route{border:1px solid #ffffff1f;background:#121824;color:#fff;border-radius:12px;padding:10px 12px;font-weight:900}.v762-route{width:100%;display:flex;justify-content:space-between;gap:10px;margin-top:8px;text-align:left}.v762-route span{color:#9da8b8;font-size:9px}';
  document.head.appendChild(style);

  const actions=document.querySelector('#game .action-deck .actions');
  if(actions&&!document.getElementById('v762RaceBtn')){const btn=document.createElement('button');btn.id='v762RaceBtn';btn.type='button';btn.className='action-primary';btn.textContent='STREET RACING';actions.appendChild(btn);btn.addEventListener('click',()=>menu.hidden=false)}
  const routesHost=document.getElementById('v762RaceRoutes');
  routesHost.innerHTML=routeList.map(r=>'<button class="v762-route" type="button" data-race="'+r.id+'"><b>'+r.name+'</b><span>'+r.points.length+' CHECKPOINTS • '+r.laps+' LAP'+(r.laps>1?'S':'')+'</span></button>').join('');
  routesHost.querySelectorAll('[data-race]').forEach(btn=>btn.addEventListener('click',()=>armRace(btn.dataset.race)));
  document.getElementById('v762RaceClose').addEventListener('click',()=>menu.hidden=true);

  const route=()=>routes[state.routeId]||null;
  const format=ms=>{const t=Math.max(0,Number(ms)||0),m=Math.floor(t/60000),s=Math.floor((t%60000)/1000),x=Math.floor(t%1000);return m+':'+String(s).padStart(2,'0')+'.'+String(x).padStart(3,'0')};
  function showGate(){gates.forEach(g=>g.g.visible=!!(state.active&&g.routeId===state.routeId&&g.index===state.index))}
  function armRace(id){if(!routes[id])return {accepted:false,status:'unknown_route'};state={...state,armed:true,active:false,routeId:id,index:0,laps:0,startAt:0,lastResult:null};save();showGate();menu.hidden=true;window.__tggToast?.('RACE ROUTED — DRIVE TO '+routes[id].name+' START');return {accepted:true,status:'armed',route:id}}
  function startRace(){const r=route();if(!r)return {accepted:false,status:'no_route'};const game=window.TGGGame?.getState?.();if(!game?.inVehicle)return {accepted:false,status:'vehicle_required'};const p=api.toWorld(game),s=r.points[0],d=Math.hypot(p.x-s[0],p.z-s[1]);if(d>13)return {accepted:false,status:'move_to_start',distance:d};state.active=true;state.armed=false;state.index=1;state.laps=0;state.startAt=performance.now();save();showGate();hud.hidden=false;return {accepted:true,status:'started'}}
  function finish(){const ms=Math.max(1,performance.now()-state.startAt),r=route();state.active=false;state.armed=false;state.completed=(Number(state.completed)||0)+1;state.bestMs=state.bestMs==null?ms:Math.min(state.bestMs,ms);state.lastResult={routeId:r.id,name:r.name,ms,laps:r.laps,finishedAt:Date.now()};save();showGate();hud.hidden=true;window.__tggToast?.('RACE COMPLETE — '+format(ms));return clone(state.lastResult)}
  function hit(){const r=route();if(!state.active||!r)return false;state.index++;if(state.index>=r.points.length){state.laps++;if(state.laps>=r.laps){finish();return true}state.index=0}save();showGate();return true}
  function navigationTarget(){const r=route();if(!r||(!state.armed&&!state.active))return null;const idx=state.active?state.index:0,p=r.points[idx],pct=api.toPercent(p[0],p[1]),game=window.TGGGame?.getState?.(),wp=api.toWorld(game),dist=Math.hypot(wp.x-p[0],wp.z-p[1]);return {...pct,label:(state.active?'CHECKPOINT ':'START ')+(idx+1),color:r.color,radius:9,arrived:dist<9}}
  function syncHud(){const r=route();if(!r)return;document.getElementById('v762RaceName').textContent=r.name;document.getElementById('v762RaceProgress').textContent='LAP '+Math.min(r.laps,state.laps+1)+'/'+r.laps+' • CHECKPOINT '+(state.index+1)+'/'+r.points.length;document.getElementById('v762RaceTime').textContent=format(state.startAt?performance.now()-state.startAt:0)}
  let lastHit=0;function tick(now){requestAnimationFrame(tick);if(state.active){syncHud();const t=navigationTarget();if(t?.arrived&&now-lastHit>850){lastHit=now;hit()}}else if(state.armed){const t=navigationTarget();if(t?.arrived&&window.TGGGame?.getState?.()?.inVehicle)startRace()}gates.forEach((g,i)=>{if(g.g.visible){g.ring.rotation.z=now*.0014;g.top.material.emissiveIntensity=1.8+Math.sin(now*.004+i)*.8}})}requestAnimationFrame(tick);
  function getStatus(){return {version:VERSION,span:SPAN,routes:routeList.length,totalCheckpoints:gates.length,active:state.active,armed:state.armed,completed:Number(state.completed)||0,navigationIntegrated:true,worldScale:Number(api.WORLD_SCALE)||0,ok:routeList.length===4&&gates.length===28&&(Number(api.WORLD_SCALE)||0)>=2.5}}
  window.TGGStreetRacing={version:VERSION,span:SPAN,openMenu:()=>menu.hidden=false,closeMenu:()=>menu.hidden=true,armRace,startRace,navigationTarget,getStatus,snapshot:()=>clone(state)};
  document.documentElement.dataset.tggStreetRacing='v762';
  window.dispatchEvent(new CustomEvent('tgg:v762-street-racing-ready',{detail:getStatus()}));
}).catch(error=>{window.TGGStreetRacing={version:VERSION,span:SPAN,getStatus:()=>({version:VERSION,span:SPAN,ok:false,error:String(error?.message||error)})};document.documentElement.dataset.tggStreetRacing='fallback'});
})();