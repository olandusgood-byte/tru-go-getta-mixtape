(()=>{
  const VERSION='V3.70 NPC TRAFFIC WORLD INTERACTION MEGA';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const runtime={
    npcReactions:0,
    trafficAwareness:0,
    interactionState:'IDLE',
    simTier:'HIGH',
    nearbyNpcCount:0
  };

  function worldPos(){
    const s=window.TGGGame?.getState?.()||{x:50,y:55,inVehicle:false};
    return {x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92,state:s};
  }

  function nearestPeople(){
    const pw=worldPos();
    const people=window.TGGStreetPresence?.people||[];
    return people.filter(p=>p?.visible).map(p=>({
      p,
      d:Math.hypot((p.position?.x||0)-pw.x,(p.position?.z||0)-pw.z)
    })).sort((a,b)=>a.d-b.d);
  }

  function updateNpcReactions(){
    const heat=Number(window.TGGLivingCity?.getStatus?.()?.heat)||0;
    const mood=window.TGGLivingCity?.getStatus?.()?.crowdMood||'CALM';
    const nearby=nearestPeople();
    runtime.nearbyNpcCount=nearby.filter(x=>x.d<9).length;
    runtime.npcReactions=0;

    nearby.slice(0,12).forEach(({p,d},i)=>{
      if(!p?.userData)return;
      const parts=p.userData.parts||{};
      const close=d<3.2,watch=d<7;
      const intensity=clamp((heat/100)+(close?.45:watch?.16:0),0,1);
      if(watch){
        runtime.npcReactions++;
        p.userData.v370Reaction=close?(mood==='HYPE'?'HYPE':'AVOID'):'WATCH';
        if(parts.head)parts.head.rotation.y*=.7;
        if(parts.arms?.[0]&&mood==='HYPE'&&intensity>.45){
          parts.arms[0].rotation.z=.25+Math.sin(performance.now()*.004+i)*.18;
        }
        p.scale.setScalar((p.userData.v370BaseScale??=p.scale.x)*(1+Math.sin(performance.now()*.003+i)*.006));
      }else{
        p.userData.v370Reaction='ROAM';
      }
    });

    const closest=nearby[0];
    const inVehicle=!!worldPos().state.inVehicle;
    if(closest&&closest.d<2.6&&!inVehicle){
      runtime.interactionState='NPC_NEARBY';
      window.TGGGameFeel?.objective?.('STREET INTERACTION','Someone nearby is paying attention.');
    }else runtime.interactionState='IDLE';
  }

  function updateTrafficAwareness(){
    const api=window.TGG3D;
    const traffic=api?.traffic||[];
    const pw=worldPos();
    const car=api?.car;
    const inVehicle=!!pw.state.inVehicle;
    const subject=inVehicle&&car?.position?car.position:{x:pw.x,z:pw.z};
    runtime.trafficAwareness=0;

    traffic.forEach((v,i)=>{
      if(!v?.position)return;
      const d=Math.hypot((v.position.x||0)-(subject.x||0),(v.position.z||0)-(subject.z||0));
      const aware=d<10;
      if(aware){
        runtime.trafficAwareness++;
        const ratio=clamp((10-d)/10,0,1);
        v.userData.v370Aware=true;
        if(v.userData.brakeLights){
          v.userData.brakeLights.forEach(l=>{
            if(l?.material)l.material.emissiveIntensity=Math.max(Number(l.material.emissiveIntensity)||0,1+ratio*3);
          });
        }
        v.rotation.z=Math.sin(performance.now()*.002+i)*.006*ratio;
      }else v.userData.v370Aware=false;
    });
  }

  function syncSimulationTier(){
    const root=document.documentElement;
    const fps=root.dataset.tggV320FpsBand||'high';
    const quality=root.dataset.tggMasterQuality||'high';
    runtime.simTier=(quality==='performance'||fps==='low')?'LOW':(quality==='balanced'||fps==='mid')?'MEDIUM':'HIGH';
    const desired=runtime.simTier==='LOW'?'LOW':runtime.simTier==='MEDIUM'?'MEDIUM':'HIGH';
    window.TGGStreetPresence?.setDensity?.(desired);
  }

  function installInteractionHooks(){
    document.addEventListener('keydown',e=>{
      if((e.key==='e'||e.key==='E')&&runtime.interactionState==='NPC_NEARBY'){
        runtime.interactionState='TALK';
        window.TGGGameFeel?.objective?.('STREET TALK','You stopped to connect with the city.');
        window.TGGLivingCity?.nudgeHeat?.(1.5);
      }
    });
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');
      if(!b)return;
      if(/interact|talk|event|world life/i.test((b.id||'')+' '+(b.textContent||''))){
        window.TGGLivingCity?.nudgeHeat?.(1);
      }
    },true);
  }

  function getStatus(){
    return {
      version:VERSION,
      ...runtime,
      features:[
        'proximity-npc-reactions','crowd-mood-response','street-interaction-state',
        'traffic-player-awareness','traffic-brake-response','simulation-tier-scaling',
        'keyboard-street-talk-hook','world-heat-interaction-hook'
      ]
    };
  }

  function boot(){
    installInteractionHooks();
    document.documentElement.dataset.tggV370='on';
    setInterval(()=>{
      try{
        syncSimulationTier();
        updateNpcReactions();
        updateTrafficAwareness();
      }catch{}
    },260);
    window.TGGWorldInteraction={version:VERSION,getStatus,refresh(){syncSimulationTier();updateNpcReactions();updateTrafficAwareness();return getStatus()}};
    window.dispatchEvent(new CustomEvent('tgg:v370-ready',{detail:getStatus()}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();