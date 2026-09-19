(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    mic:{id:'mic',hand:'right',reach:.86,look:.92,duration:3200,bodyTwist:.14,armLift:.92},
    console:{id:'console',hand:'both',reach:.72,look:.76,duration:2800,bodyTwist:.08,armLift:.68},
    door:{id:'door',hand:'right',reach:.8,look:.62,duration:1400,bodyTwist:.1,armLift:.58},
    npc:{id:'npc',hand:'right',reach:.32,look:1,duration:2600,bodyTwist:.12,armLift:.28},
    counter:{id:'counter',hand:'both',reach:.68,look:.7,duration:2200,bodyTwist:.06,armLift:.54},
    phone:{id:'phone',hand:'left',reach:.56,look:.58,duration:3600,bodyTwist:.04,armLift:.88}
  };
  function normalize(input={}){
    const hand=['left','right','both','none'].includes(input.hand)?input.hand:'right';
    return {
      id:String(input.id||'interaction'),
      hand,
      reach:clamp(Number.isFinite(Number(input.reach))?Number(input.reach):.5,0,1),
      look:clamp(Number.isFinite(Number(input.look))?Number(input.look):.7,0,1),
      duration:Math.round(clamp(Number.isFinite(Number(input.duration))?Number(input.duration):2200,250,12000)),
      bodyTwist:clamp(Number.isFinite(Number(input.bodyTwist))?Number(input.bodyTwist):.08,0,.5),
      armLift:clamp(Number.isFinite(Number(input.armLift))?Number(input.armLift):.55,0,1.35)
    };
  }
  function interaction(id='npc'){return normalize(PROFILES[id]||PROFILES.npc)}
  function wrapAngle(a){
    let x=Number(a)||0;
    while(x>Math.PI)x-=Math.PI*2;
    while(x<-Math.PI)x+=Math.PI*2;
    return x;
  }
  function lookAngles(from={},to={},baseYaw=0){
    const dx=(Number(to.x)||0)-(Number(from.x)||0);
    const dy=(Number(to.y)||0)-(Number(from.y)||0);
    const dz=(Number(to.z)||0)-(Number(from.z)||0);
    const horizontal=Math.max(.001,Math.hypot(dx,dz));
    const worldYaw=Math.atan2(dx,dz);
    const yaw=clamp(wrapAngle(worldYaw-(Number(baseYaw)||0)),-1.4,1.4);
    const pitch=clamp(-Math.atan2(dy,horizontal),-.65,.65);
    return {yaw,pitch,distance:Math.hypot(horizontal,dy)};
  }
  function weight(now,start,end){
    const n=Number(now)||0,s=Number(start)||0,e=Number(end)||0;
    if(e<=s||n<=s||n>=e)return 0;
    const dur=e-s,fade=Math.max(80,Math.min(320,dur*.2));
    return clamp(Math.min((n-s)/fade,(e-n)/fade),0,1);
  }
  const api={interaction,normalize,lookAngles,weight,interactions:Object.keys(PROFILES)};
  globalThis.TGGV237Core=api;
  if(typeof window!=='undefined')window.TGGV237Core=api;
})();