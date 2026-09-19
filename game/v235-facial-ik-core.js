(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    idle:{id:'idle',mouth:.02,gaze:.35,blink:.22,energy:.12,headYaw:.08,headPitch:.025,handReach:.12,stance:.08},
    talk:{id:'talk',mouth:.46,gaze:.72,blink:.2,energy:.42,headYaw:.18,headPitch:.07,handReach:.34,stance:.18},
    rap:{id:'rap',mouth:.82,gaze:.82,blink:.14,energy:.78,headYaw:.26,headPitch:.1,handReach:.68,stance:.36},
    perform:{id:'perform',mouth:.9,gaze:.9,blink:.12,energy:.92,headYaw:.32,headPitch:.12,handReach:.84,stance:.48},
    phone:{id:'phone',mouth:.34,gaze:.48,blink:.18,energy:.3,headYaw:.15,headPitch:.06,handReach:.56,stance:.12}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'custom'),
      mouth:clamp(Number.isFinite(Number(input.mouth))?Number(input.mouth):0,0,1),
      gaze:clamp(Number.isFinite(Number(input.gaze))?Number(input.gaze):.35,0,1),
      blink:clamp(Number.isFinite(Number(input.blink))?Number(input.blink):.2,0,1),
      energy:clamp(Number.isFinite(Number(input.energy))?Number(input.energy):.1,0,1),
      headYaw:clamp(Number.isFinite(Number(input.headYaw))?Number(input.headYaw):0,-.55,.55),
      headPitch:clamp(Number.isFinite(Number(input.headPitch))?Number(input.headPitch):0,-.4,.4),
      handReach:clamp(Number.isFinite(Number(input.handReach))?Number(input.handReach):.1,0,1),
      stance:clamp(Number.isFinite(Number(input.stance))?Number(input.stance):.1,0,.8)
    };
  }
  function profile(id='idle'){return normalize(PROFILES[id]||PROFILES.idle)}
  function look(target={x:0,z:1},origin={x:0,z:0},baseHeading=0){
    const dx=(Number(target.x)||0)-(Number(origin.x)||0);
    const dz=(Number(target.z)||0)-(Number(origin.z)||0);
    const worldYaw=Math.atan2(dx,dz);
    let yaw=worldYaw-(Number(baseHeading)||0);
    yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    return {yaw:clamp(yaw,-.55,.55),pitch:0};
  }
  const api={profile,normalize,look,profiles:Object.keys(PROFILES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();