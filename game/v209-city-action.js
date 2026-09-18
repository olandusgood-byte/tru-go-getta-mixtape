(() => {
  let sceneEl=null;
  let impactFlash=null;
  let lastImpactAt=0;
  let sceneTimer=0;

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function install(){
    document.body.classList.add('tgg-v209');
    const badge=document.querySelector('.v201-badge');
    if(badge)badge.textContent='V2.14 PLAYTEST HARDENING 100';
    const city=document.querySelector('.city');
    if(city&&!sceneEl){
      sceneEl=document.createElement('div');
      sceneEl.id='missionScene';
      sceneEl.className='mission-scene';
      sceneEl.innerHTML='<small id="msKicker">CITY MOVE</small><b id="msTitle">READY</b><span id="msDetail">MAKE THE NEXT MOVE.</span>';
      city.appendChild(sceneEl);
    }
    if(city&&!impactFlash){
      impactFlash=document.createElement('div');
      impactFlash.id='impactFlash';
      impactFlash.className='impact-flash';
      city.appendChild(impactFlash);
    }
  }

  function showScene(kicker,title,detail,duration=2200){
    install();
    const k=document.getElementById('msKicker'),t=document.getElementById('msTitle'),d=document.getElementById('msDetail');
    if(k)k.textContent=String(kicker||'CITY MOVE').toUpperCase();
    if(t)t.textContent=String(title||'READY').toUpperCase();
    if(d)d.innerHTML=esc(detail||'');
    sceneEl?.classList.add('active');
    clearTimeout(sceneTimer);
    sceneTimer=setTimeout(()=>sceneEl?.classList.remove('active'),duration);
  }

  function handleImpact(){
    const state=window.TGGGame?.getState?.();
    const drive=window.TGGGame?.getDrivingState?.();
    if(!state?.inVehicle||Math.abs(Number(drive?.speed)||0)<2.8)return null;
    const near=window.TGG3D?.nearestTraffic?.();
    if(!near||!Number.isFinite(near.distance)||near.distance>2.15)return null;
    const now=Date.now();
    if(now-lastImpactAt<1050)return null;
    lastImpactAt=now;
    const speed=Math.abs(Number(drive.speed)||0);
    const strength=Math.max(.28,Math.min(1,(speed/10.5)+((2.15-near.distance)/2.15)*.45));
    const hit=window.TGGGame?.vehicleImpact?.(strength);
    if(!hit)return null;
    document.body.classList.add('tgg-impact');
    impactFlash?.classList.add('active');
    setTimeout(()=>{document.body.classList.remove('tgg-impact');impactFlash?.classList.remove('active')},320);
    const mph=Math.round(hit.preSpeed*7.2);
    window.__tggToast?.('TRAFFIC IMPACT • '+mph+' MPH');
    window.dispatchEvent(new CustomEvent('tgg:traffic-impact',{detail:{distance:near.distance,mph,strength}}));
    return {distance:near.distance,mph,strength};
  }

  window.addEventListener('tgg:mission-start',e=>{
    const d=e.detail||{};
    showScene(d.contactName+' • '+d.role,'JOB STARTED',d.missionName+' — follow the live city marker.',2500);
  });
  window.addEventListener('tgg:mission-checkpoint',e=>{
    const d=e.detail||{};
    const next=d.nextStage?('Next: '+d.nextStage):'Next stop marked.';
    showScene('CHECKPOINT '+d.progress+'/'+d.goal,d.missionName,next,1900);
  });
  window.addEventListener('tgg:mission-complete',e=>{
    const d=e.detail||{};
    showScene('MOVE COMPLETE',d.missionName,'+$'+(d.reward||0)+' • +'+(d.xp||0)+' XP • +'+(d.rep||0)+' REP',2800);
  });
  window.addEventListener('tgg:mission-handoff',e=>{
    const d=e.detail||{};
    const c=window.TGGStreetContacts?.contactForMission?.(d.nextMissionId);
    showScene('NEXT CONTACT',c?.name||'STREET CONTACT',c?('Meet '+c.name+' • '+c.role+' to start the next move.'):'Follow job navigation.',2800);
  });

  function tick(){
    install();
    handleImpact();
    requestAnimationFrame(tick);
  }

  function status(){
    return {ready:true,lastImpactAt,sceneActive:!!sceneEl?.classList.contains('active')};
  }
  window.TGGCityAction={status,showScene,handleImpact};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(tick),{once:true});
  else requestAnimationFrame(tick);
})();