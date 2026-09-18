(() => {
  const MISSION_STAGES={
    'flyer-run':[
      {destination:'business',label:'DOWNTOWN FLYER DROP',action:'POST FLYERS',color:'#ffcf4a'},
      {destination:'park',label:'PARK STREET TEAM',action:'HAND OUT FLYERS',color:'#4cff88'}
    ],
    'studio-session':[
      {destination:'studio',label:'STUDIO CHECK-IN',action:'CUT VOCALS',color:'#ff466d'},
      {destination:'media',label:'MEDIA ROUGH MIX',action:'SEND ROUGH MIX',color:'#7b86ff'}
    ],
    'mixtape-promo':[
      {destination:'media',label:'MEDIA DISTRICT PROMO',action:'PUSH THE RELEASE',color:'#c56cff'},
      {destination:'business',label:'DOWNTOWN DROP',action:'LOCK THE STREET PUSH',color:'#ffcf4a'},
      {destination:'park',label:'PARK STREET TEAM',action:'FINISH PROMO RUN',color:'#4cff88'}
    ]
  };
  const fallback={
    business:{x:-36,z:0},
    studio:{x:-24,z:-12},
    media:{x:0,z:36},
    park:{x:24,z:12}
  };
  let originalInteract=null;
  let objectiveEl=null;
  let lastObjectiveKey='';
  let lastCompletionAt=0;

  function state(){return window.TGGGame?.getState?.()||null}
  function toWorld(s){return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92}}
  function destination(id){
    const d=(window.TGG3D?.destinations||[]).find(x=>x.id===id);
    return d?{x:d.x,z:d.z}:fallback[id]||null;
  }
  function activeMission(){return window.TGGContent?.current?.()||null}
  function currentStage(){
    const mission=activeMission();
    if(!mission)return null;
    const stages=MISSION_STAGES[mission.id];
    if(!stages?.length)return null;
    const progress=Math.max(0,Number(window.TGGContent?.state?.progress)||0);
    const stage=stages[Math.min(progress,stages.length-1)];
    const pos=destination(stage.destination);
    if(!pos)return null;
    return {...stage,...pos,mission,progress,goal:Math.max(1,Number(mission.goal)||1)};
  }
  function distance(stage=currentStage()){
    const s=state();
    if(!s||!stage)return Infinity;
    const p=toWorld(s);
    return Math.hypot(p.x-stage.x,p.z-stage.z);
  }
  function near(stage=currentStage()){return !!stage&&distance(stage)<=7.2}
  function getNavTarget(){
    const stage=currentStage();
    if(!stage)return null;
    return {label:stage.label,x:stage.x,z:stage.z,color:stage.color||'#c7ff00'};
  }
  function autoNextChain(){
    const chain=window.TGGChains?.current?.();
    if(!chain)return false;
    window.TGGChains?.sync?.();
    const still=window.TGGChains?.current?.();
    if(!still)return false;
    const done=window.TGGContent?.state?.completed||[];
    const next=still.missions.find(id=>!done.includes(id));
    if(!next)return false;
    window.TGGStreetContacts?.focusMission?.(next);
    window.dispatchEvent(new CustomEvent('tgg:mission-handoff',{detail:{chainId:still.id,nextMissionId:next}}));
    return true;
  }
  function performObjective(){
    const stage=currentStage();
    if(!stage||!near(stage))return false;
    if(window.TGGV218?.shouldHandleStage?.(stage)){
      return window.TGGV218.enterObjective?.(stage)??true;
    }
    const now=Date.now();
    if(now-lastCompletionAt<650)return true;
    lastCompletionAt=now;
    const missionId=stage.mission.id;
    const beforeProgress=Number(window.TGGContent?.state?.progress)||0;
    const completed=window.TGGContent?.advance?.()===true;
    if(completed){
      window.dispatchEvent(new CustomEvent('tgg:mission-complete',{detail:{missionId,missionName:stage.mission.name,district:stage.mission.district,reward:stage.mission.reward,xp:stage.mission.xp,rep:stage.mission.rep}}));
      window.TGGChains?.sync?.();
      setTimeout(()=>autoNextChain(),420);
      window.__tggToast?.('WORLD OBJECTIVE COMPLETE — '+stage.mission.name);
    }else if(window.TGGContent?.state?.active===missionId){
      const after=Number(window.TGGContent?.state?.progress)||0;
      if(after>beforeProgress){
        window.dispatchEvent(new CustomEvent('tgg:mission-checkpoint',{detail:{missionId,missionName:stage.mission.name,progress:after,goal:stage.goal,nextStage:currentStage()?.label||null}}));
        window.__tggToast?.('CHECKPOINT COMPLETE — NEXT STOP MARKED');
      }
    }
    window.TGGGame?.save?.(true);
    return true;
  }
  function installObjectiveHud(){
    const versionBadge=document.querySelector('.v201-badge');
    if(versionBadge)versionBadge.textContent='V2.02 WORLD';
    const city=document.querySelector('.city');
    if(!city||document.getElementById('worldObjective'))return;
    objectiveEl=document.createElement('div');
    objectiveEl.id='worldObjective';
    objectiveEl.className='world-objective';
    objectiveEl.innerHTML='<div class="wo-kicker"><span>ACTIVE WORLD MOVE</span><b id="woDistance">--</b></div><div class="wo-title" id="woTitle">NO ACTIVE MOVE</div><div class="wo-detail"><span id="woDetail">Open CITY JOBS to start a move.</span><strong id="woAction">TRAVEL</strong></div><div class="wo-progress"><i id="woProgress"></i></div>';
    city.appendChild(objectiveEl);
  }
  function updateHud(){
    installObjectiveHud();
    const city=document.querySelector('.city');
    const button=document.getElementById('interact3dBtn');
    const stage=currentStage();
    const active=!!stage&&window.TGGGame?.getActiveScreen?.()==='game';
    city?.classList.toggle('world-objective-live',active);
    objectiveEl?.classList.toggle('active',active);
    if(!active){
      if(button)button.classList.remove('objective-ready');
      return;
    }
    const d=distance(stage);
    const meters=Math.max(0,Math.round(d*3.2));
    const ready=d<=7.2;
    objectiveEl?.style.setProperty('--objective',stage.color||'#c7ff00');
    objectiveEl?.classList.toggle('ready',ready);
    const title=document.getElementById('woTitle');
    const detail=document.getElementById('woDetail');
    const dist=document.getElementById('woDistance');
    const action=document.getElementById('woAction');
    const progress=document.getElementById('woProgress');
    if(title)title.textContent=stage.label;
    if(detail)detail.textContent=stage.mission.name+' • '+stage.mission.district;
    if(dist)dist.textContent=ready?'READY':meters+' M';
    if(action)action.textContent=ready?'F / INTERACT — '+stage.action:'GO TO MARKER';
    if(progress)progress.style.width=Math.min(100,(stage.progress/stage.goal)*100)+'%';
    if(button&&ready){
      button.disabled=false;
      button.textContent=stage.action;
      button.classList.add('objective-ready');
    }else if(button){
      button.classList.remove('objective-ready');
    }
    const key=stage.mission.id+':'+stage.progress;
    if(key!==lastObjectiveKey){lastObjectiveKey=key;}
  }
  function wrapInteract(){
    if(!window.TGG3D||originalInteract)return;
    originalInteract=window.TGG3D.interactNearest?.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(near())return performObjective();
      return originalInteract?.()??false;
    };
  }
  function tick(){
    wrapInteract();
    updateHud();
    requestAnimationFrame(tick);
  }
  function status(){
    const stage=currentStage();
    return {active:!!stage,mission:stage?.mission?.id||null,progress:stage?.progress||0,goal:stage?.goal||0,near:near(stage),distance:Number.isFinite(distance(stage))?Number(distance(stage).toFixed(2)):null};
  }
  window.TGGWorldGameplay={currentStage,distance,near,getNavTarget,performObjective,status};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(tick),{once:true});
  else requestAnimationFrame(tick);
})();