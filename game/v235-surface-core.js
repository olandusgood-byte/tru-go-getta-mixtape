(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    asphalt:{id:'asphalt',roughness:.82,metalness:.06,opacity:1,intensity:0,emissive:false,color:0x242931},
    concrete:{id:'concrete',roughness:.88,metalness:.04,opacity:1,intensity:0,emissive:false,color:0x555b63},
    paint:{id:'paint',roughness:.36,metalness:.28,opacity:1,intensity:0,emissive:false,color:0xd7dbe1},
    glass:{id:'glass',roughness:.09,metalness:.08,opacity:.58,intensity:0,emissive:false,color:0x6fa4bb},
    grime:{id:'grime',roughness:.92,metalness:.02,opacity:.26,intensity:0,emissive:false,color:0x11151b},
    neon:{id:'neon',roughness:.28,metalness:.22,opacity:.92,intensity:3.4,emissive:true,color:0xc7ff00}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'surface'),
      roughness:clamp(Number.isFinite(Number(input.roughness))?Number(input.roughness):.7,0,1),
      metalness:clamp(Number.isFinite(Number(input.metalness))?Number(input.metalness):.1,0,1),
      opacity:clamp(Number.isFinite(Number(input.opacity))?Number(input.opacity):1,0,1),
      intensity:clamp(Number.isFinite(Number(input.intensity))?Number(input.intensity):0,0,8),
      emissive:!!input.emissive,
      color:Number.isFinite(Number(input.color))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.color)))):0xffffff
    };
  }
  function profile(id='asphalt'){return normalize(PROFILES[id]||PROFILES.asphalt)}
  function detailBudget(quality='high'){return quality==='performance'?38:quality==='balanced'?72:120}
  const api={profile,detailBudget,normalize,profiles:Object.keys(PROFILES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();