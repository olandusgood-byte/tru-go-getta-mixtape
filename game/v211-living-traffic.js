(() => {
  const INTERSECTIONS=[-24,0,24];
  let hud=null;
  let contactTalkUntil=0;
  let lastTrafficState='';
  let lastCollisionAvoidAt=0;

  function install(){
    document.body.classList.add('tgg-v211');
    const badge=document.querySelector('.v201-badge');
    if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    const city=document.querySelector('.city');
    if(city&&!document.getElementById('livingTrafficHud')){
      hud=document.createElement('div');
      hud.id='livingTrafficHud';
      hud.className='living-traffic-hud';
      hud.innerHTML='<span><i id="trafficXDot"></i>X TRAFFIC <b id="trafficXState">GO</b></span><span><i id="trafficZDot"></i>Z TRAFFIC <b id="trafficZState">STOP</b></span>';
      city.appendChild(hud);
    }else hud=document.getElementById('livingTrafficHud');
  }

  function signal(axis,t=performance.now()){
    return window.TGGCityDepth?.signalForAxis?.(axis,t)||'green';
  }

  function axisCoord(vehicle,axis){
    return axis==='x'?Number(vehicle.position.x)||0:Number(vehicle.position.z)||0;
  }

  function distanceAhead(coord,dir,stop){
    const span=96;
    let d=dir>0?stop-coord:coord-stop;
    while(d<0)d+=span;
    return d;
  }

  function nextSignalDistance(vehicle){
    const def=vehicle?.userData?.traffic;
    if(!def)return Infinity;
    const coord=axisCoord(vehicle,def.axis);
    return Math.min(...INTERSECTIONS.map(stop=>distanceAhead(coord,def.dir,stop)));
  }

  function playerAvoidFactor(vehicle){
    const state=window.TGGGame?.getState?.();
    const playerCar=window.TGG3D?.car;
    if(!state?.inVehicle||!playerCar||vehicle===playerCar)return 1;
    const d=Math.hypot(vehicle.position.x-playerCar.position.x,vehicle.position.z-playerCar.position.z);
    if(d<3.25){
      lastCollisionAvoidAt=Date.now();
      return 0;
    }
    if(d<5.25)return .2;
    if(d<7.25)return .48;
    return 1;
  }

  function lightFactor(vehicle,t){
    const def=vehicle?.userData?.traffic;
    if(!def)return 1;
    const state=signal(def.axis,t);
    const ahead=nextSignalDistance(vehicle);
    if(ahead>9)return 1;
    if(state==='red'){
      if(ahead<4.9)return 0;
      if(ahead<7)return .24;
      return .52;
    }
    if(state==='yellow'){
      if(ahead<4.5)return .2;
      return .58;
    }
    return 1;
  }

  function trafficFactor(vehicle,t){
    return Math.min(lightFactor(vehicle,t),playerAvoidFactor(vehicle));
  }

  function updateTraffic(t){
    const traffic=window.TGG3D?.traffic||[];
    let stopped=0,slowed=0;
    traffic.forEach(vehicle=>{
      const factor=trafficFactor(vehicle,t);
      const braking=factor<.65;
      window.TGG3D?.setTrafficSpeed?.(vehicle,factor,braking);
      if(factor<.1)stopped++;
      else if(factor<.75)slowed++;
    });
    const x=signal('x',t),z=signal('z',t);
    const stateKey=x+':'+z+':'+stopped+':'+slowed;
    if(stateKey!==lastTrafficState){
      lastTrafficState=stateKey;
      const xText=document.getElementById('trafficXState');
      const zText=document.getElementById('trafficZState');
      const xDot=document.getElementById('trafficXDot');
      const zDot=document.getElementById('trafficZDot');
      if(xText)xText.textContent=x==='green'?'GO':x==='yellow'?'WAIT':'STOP';
      if(zText)zText.textContent=z==='green'?'GO':z==='yellow'?'WAIT':'STOP';
      if(xDot)xDot.dataset.signal=x;
      if(zDot)zDot.dataset.signal=z;
      if(hud)hud.dataset.traffic=(stopped?'stopped':slowed?'slowed':'flowing');
    }
    return {x,z,stopped,slowed,count:traffic.length};
  }

  function animateContact(t){
    const closest=window.TGGStreetContacts?.closest?.();
    if(!closest||closest.distance>13)return null;
    const o=window.TGGStreetContacts?.getObject?.(closest.id);
    if(!o)return null;
    const state=window.TGGGame?.getState?.();
    if(state?.inVehicle)return null;
    const talk=closest.distance<=7.2||performance.now()<contactTalkUntil;
    const parts=o.userData?.parts;
    if(parts){
      const wave=talk?Math.sin(t*.009)*.55:0;
      parts.rightArm.rotation.x=window.THREE.MathUtils.lerp(parts.rightArm.rotation.x,talk?-1.1+wave:0,.13);
      parts.leftArm.rotation.x=window.THREE.MathUtils.lerp(parts.leftArm.rotation.x,talk?.15:0,.1);
      parts.head.rotation.y=window.THREE.MathUtils.lerp(parts.head.rotation.y,talk?Math.sin(t*.003)*.14:0,.08);
      parts.body.rotation.y=window.THREE.MathUtils.lerp(parts.body.rotation.y,talk?Math.sin(t*.002)*.08:0,.08);
    }else{
      o.rotation.z=window.THREE.MathUtils.lerp(o.rotation.z,talk?Math.sin(t*.004)*.035:0,.08);
    }
    if(o.userData?.contactRing){
      const pulse=1+(talk?Math.sin(t*.006)*.09:Math.sin(t*.003)*.035);
      o.userData.contactRing.scale.setScalar(pulse);
    }
    return {id:closest.id,distance:closest.distance,talking:talk};
  }

  window.addEventListener('tgg:mission-start',()=>{contactTalkUntil=performance.now()+1800});
  window.addEventListener('tgg:mission-handoff',()=>{contactTalkUntil=performance.now()+2400});

  function tick(t=0){
    install();
    const traffic=updateTraffic(t);
    const contact=animateContact(t);
    requestAnimationFrame(tick);
  }

  function status(){
    const traffic=updateTraffic(performance.now());
    const c=window.TGGStreetContacts?.closest?.();
    return {
      ready:true,
      traffic,
      nearestContact:c?.id||null,
      nearestContactDistance:c?Number(c.distance.toFixed(2)):null,
      lastCollisionAvoidAt
    };
  }

  window.TGGLivingTraffic={status,signal,nextSignalDistance,trafficFactor,updateTraffic};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(tick),{once:true});
  else requestAnimationFrame(tick);
})();