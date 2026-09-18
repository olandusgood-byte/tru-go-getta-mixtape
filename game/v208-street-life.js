(() => {
  const MAP={m:'m',kane:'producer','dj-v':'dj'};
  const FALLBACK={
    m:'Keep moving — the city notices consistency.',
    kane:'Bring the work in sharp. We can build something serious.',
    'dj-v':'If the record moves out here, the whole city hears it.'
  };
  let alertEl=null,lastNearMissAt=0,lastContactId=null;

  function install(){
    document.body.classList.add('tgg-v208');
    const badge=document.querySelector('.v201-badge');
    if(badge)badge.textContent='V2.11 LIVING TRAFFIC';
    const city=document.querySelector('.city');
    if(city&&!document.getElementById('streetLifeAlert')){
      alertEl=document.createElement('div');
      alertEl.id='streetLifeAlert';
      alertEl.className='street-life-alert';
      alertEl.innerHTML='<b id="slaTitle">STREET LIFE</b><span id="slaText">CITY ACTIVE</span>';
      city.appendChild(alertEl);
    }else alertEl=document.getElementById('streetLifeAlert');
    const card=document.getElementById('streetContactCard');
    if(card&&!document.getElementById('scDialogue')){
      const tier=document.createElement('i');tier.id='scTier';tier.className='sc-tier';tier.textContent='STREET CONTACT';
      const line=document.createElement('em');line.id='scDialogue';line.className='sc-dialogue';line.textContent='Pull up and talk.';
      card.appendChild(tier);card.appendChild(line);
    }
  }
  function state(){return window.TGGGame?.getState?.()||null}
  function toWorld(s){return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92}}
  function relationshipLine(c){
    const id=MAP[c?.id]||c?.id;
    const d=window.TGGRouteMemory?.dialogue?.(id);
    return {tier:d?.tier||'STREET CONTACT',line:d?.line||FALLBACK[c?.id]||'Keep making moves.'};
  }
  function animateContacts(t){
    const s=state();if(!s)return;
    const p=toWorld(s);
    for(const c of window.TGGStreetContacts?.contacts||[]){
      const o=window.TGGStreetContacts?.getObject?.(c.id);if(!o)continue;
      const dx=p.x-o.position.x,dz=p.z-o.position.z,dist=Math.hypot(dx,dz);
      if(dist<14&&!s.inVehicle){
        const target=Math.atan2(dx,dz);
        let delta=Math.atan2(Math.sin(target-o.rotation.y),Math.cos(target-o.rotation.y));
        o.rotation.y+=delta*.08;
      }
      if(!c.existing){
        const base=Number(o.userData.streetBaseY??o.position.y);
        if(o.userData.streetBaseY==null)o.userData.streetBaseY=base;
        o.position.y=base+Math.sin(t*.0022+(c.id==='kane'?0:1.7))*.055;
      }
    }
  }
  function updateDialogue(){
    const c=window.TGGStreetContacts?.closest?.();
    const visible=!!c&&c.distance<=10&&window.TGGGame?.getActiveScreen?.()==='game';
    const tier=document.getElementById('scTier'),line=document.getElementById('scDialogue');
    if(!visible){lastContactId=null;return}
    const talk=relationshipLine(c);
    if(tier)tier.textContent=talk.tier;
    if(line)line.textContent=c.name+': '+talk.line;
    if(lastContactId!==c.id){
      lastContactId=c.id;
      window.TGGRouteMemory?.syncRelationships?.();
    }
  }
  function nearMiss(){
    const s=state(),drive=window.TGGGame?.getDrivingState?.();
    if(!s?.inVehicle||Math.abs(Number(drive?.speed)||0)<4)return null;
    const car=window.TGG3D?.car;if(!car)return null;
    let best=null,dist=Infinity;
    for(const v of window.TGG3D?.traffic||[]){
      const d=Math.hypot(car.position.x-v.position.x,car.position.z-v.position.z);
      if(d<dist){dist=d;best=v}
    }
    if(best&&dist<3.15&&Date.now()-lastNearMissAt>2400){
      lastNearMissAt=Date.now();
      alertEl?.classList.add('active');
      const title=document.getElementById('slaTitle'),text=document.getElementById('slaText');
      if(title)title.textContent='NEAR MISS';
      if(text)text.textContent='KEEP IT CLEAN • '+Math.round(Math.abs(drive.speed)*7.2)+' MPH';
      setTimeout(()=>{
        alertEl?.classList.remove('active');
        if(title)title.textContent='STREET LIFE';
        if(text)text.textContent='CITY ACTIVE';
      },1200);
      return {distance:Number(dist.toFixed(2)),speed:Number(drive.speed.toFixed(2))};
    }
    return null;
  }
  function tick(t=0){
    install();
    animateContacts(t);
    updateDialogue();
    nearMiss();
    requestAnimationFrame(tick);
  }
  function status(){
    const c=window.TGGStreetContacts?.closest?.();
    return {ready:true,nearestContact:c?.id||null,contactDistance:c?Number(c.distance.toFixed(2)):null,lastNearMissAt};
  }
  window.TGGStreetLife={status,relationshipLine,nearMiss};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(tick),{once:true});
  else requestAnimationFrame(tick);
})();