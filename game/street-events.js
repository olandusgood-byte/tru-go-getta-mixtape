(() => {
  const KEY='tgg-street-events-v1';
  const HOTSPOTS=[
    {id:'downtown-cypher',name:'Downtown Cypher',x:8,z:8,radius:6,type:'CYPHER',detail:'Step into the circle and make the block react.'},
    {id:'studio-sidewalk',name:'Studio Sidewalk',x:-14,z:-10,radius:5.5,type:'PERFORMANCE',detail:'Run a quick performance outside Studio Row.'},
    {id:'mixtape-popout',name:'Mixtape Pop-Out',x:18,z:-14,radius:5.5,type:'POP-OUT',detail:'Pull a small crowd on Mixtape Ave.'}
  ];
  let state={completed:[],runs:{},lastEvent:null,crowdHype:0,updatedAt:0};
  let active=null;
  let activeTimer=null;
  let crowd=[];
  const $=id=>document.getElementById(id);

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'null');
      if(saved&&typeof saved==='object')state={...state,...saved};
    }catch{}
    if(!Array.isArray(state.completed))state.completed=[];
    if(!state.runs||typeof state.runs!=='object')state.runs={};
    state.crowdHype=Math.max(0,Math.min(100,Number(state.crowdHype)||0));
    return state;
  }

  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function playerWorld(){
    const s=window.TGGGame?.getState?.();
    if(!s)return null;
    return {x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92,inVehicle:!!s.inVehicle};
  }

  function get(id){return HOTSPOTS.find(x=>x.id===id)||null}

  function nearest(radiusBoost=0){
    const p=playerWorld();
    if(!p||p.inVehicle)return null;
    let best=null;
    HOTSPOTS.forEach(event=>{
      const distance=Math.hypot(p.x-event.x,p.z-event.z);
      if(distance<=event.radius+radiusBoost&&(!best||distance<best.distance))best={event,distance};
    });
    return best;
  }

  function crowdCandidates(center,count=4){
    const list=Array.isArray(window.TGG3D?.pedestrians)?window.TGG3D.pedestrians:[];
    return list
      .map((human,index)=>({human,index,distance:Math.hypot(human.position.x-center.x,human.position.z-center.z)}))
      .sort((a,b)=>a.distance-b.distance)
      .slice(0,Math.min(count,list.length));
  }

  function releaseCrowd(){
    crowd.forEach(({human})=>{
      if(Number.isFinite(human.userData.streetEventOldSpeed))human.userData.speed=human.userData.streetEventOldSpeed;
      delete human.userData.streetEventOldSpeed;
      delete human.userData.streetEventMode;
      delete human.userData.streetEventSlot;
    });
    crowd=[];
  }

  function captureCrowd(event){
    releaseCrowd();
    crowd=crowdCandidates(event,4);
    crowd.forEach(({human},slot)=>{
      human.userData.streetEventOldSpeed=Number(human.userData.speed)||.02;
      human.userData.streetEventMode=true;
      human.userData.streetEventSlot=slot;
      human.userData.speed=0;
    });
    return crowd.length;
  }

  function start(id){
    const event=get(id);
    if(!event)return {ok:false,status:'unknown_event'};
    const p=playerWorld();
    if(!p||p.inVehicle)return {ok:false,status:'on_foot_required'};
    const distance=Math.hypot(p.x-event.x,p.z-event.z);
    if(distance>event.radius+1)return {ok:false,status:'too_far',distance};
    if(active)return {ok:false,status:'event_already_active',active:{...active}};

    const crowdCount=captureCrowd(event);
    active={id:event.id,name:event.name,type:event.type,startedAt:Date.now(),crowdCount,phase:'BUILD'};
    render();
    window.__tggToast?.(event.name.toUpperCase()+' — CROWD BUILDING');
    clearTimeout(activeTimer);
    activeTimer=setTimeout(()=>finish(),6200);
    return {ok:true,status:'started',active:{...active}};
  }

  function startNearest(){
    const hit=nearest();
    if(!hit)return {ok:false,status:'no_event_nearby'};
    return start(hit.event.id);
  }

  function finish(){
    if(!active)return {ok:false,status:'no_active_event'};
    const done={...active};
    state.runs[done.id]=(Number(state.runs[done.id])||0)+1;
    if(!state.completed.includes(done.id))state.completed.push(done.id);
    state.lastEvent=done.id;
    state.crowdHype=Math.min(100,state.crowdHype+8+done.crowdCount*2);
    save();
    active=null;
    clearTimeout(activeTimer);
    activeTimer=null;
    releaseCrowd();
    render();
    window.__tggToast?.(done.name.toUpperCase()+' — CROWD FELT THAT');
    return {ok:true,status:'completed',event:done.id,hype:state.crowdHype};
  }

  function status(){
    return {
      active:active?{...active}:null,
      completed:state.completed.slice(),
      runs:{...state.runs},
      lastEvent:state.lastEvent,
      crowdHype:state.crowdHype,
      crowdCount:crowd.length,
      nearest:nearest()
    };
  }

  function animateCrowd(){
    if(active&&crowd.length){
      const p=playerWorld();
      if(p){
        const t=performance.now()/1000;
        crowd.forEach(({human},slot)=>{
          const angle=(slot/crowd.length)*Math.PI*2+.35;
          const radius=2.3+(slot%2)*.35;
          const tx=p.x+Math.cos(angle)*radius;
          const tz=p.z+Math.sin(angle)*radius;
          human.position.x+=(tx-human.position.x)*.12;
          human.position.z+=(tz-human.position.z)*.12;
          human.rotation.y=Math.atan2(p.x-human.position.x,p.z-human.position.z);
          human.position.y=Math.max(0,Math.sin(t*5+slot)*.05);
          const parts=human.userData.parts;
          if(parts){
            const react=Math.sin(t*7+slot)*.32;
            parts.leftArm.rotation.x=-1.1+react;
            parts.rightArm.rotation.x=-1.1-react;
            parts.leftLeg.rotation.x*=.65;
            parts.rightLeg.rotation.x*=.65;
          }
        });
      }
      const elapsed=Date.now()-active.startedAt;
      active.phase=elapsed<1800?'BUILD':elapsed<4400?'LIVE':'FINISH';
    }
    render();
    requestAnimationFrame(animateCrowd);
  }

  function render(){
    const prompt=$('streetEventPrompt');
    const hud=$('streetEventHud');
    if(!prompt||!hud)return;
    const screen=window.TGGGame?.getActiveScreen?.();
    if(screen!=='game'){
      prompt.classList.remove('show');
      hud.classList.remove('show');
      return;
    }
    if(active){
      prompt.classList.remove('show');
      hud.innerHTML='<b>'+active.name+'</b><span>'+active.phase+' • '+active.crowdCount+' PEOPLE LOCKED IN</span><small>CROWD HYPE '+state.crowdHype+'/100</small>';
      hud.classList.add('show');
      return;
    }
    hud.classList.remove('show');
    const hit=nearest();
    if(hit){
      prompt.textContent='G • START '+hit.event.name.toUpperCase();
      prompt.disabled=false;
      prompt.classList.add('show');
      return;
    }
    prompt.disabled=true;
    prompt.classList.remove('show');
  }

  function bind(){
    $('streetEventPrompt')?.addEventListener('click',()=>startNearest());
    document.addEventListener('keydown',e=>{
      if(String(e.key||'').toLowerCase()!=='g')return;
      const t=e.target;
      if(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable)return;
      if(window.TGGGame?.getActiveScreen?.()!=='game')return;
      if(nearest()){e.preventDefault();startNearest();}
    });
  }

  load();
  window.TGGStreetEvents={HOTSPOTS,state,load,save,get,nearest,start,startNearest,finish,status,captureCrowd,releaseCrowd,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();animateCrowd()},{once:true});
  else {bind();animateCrowd();}
})();