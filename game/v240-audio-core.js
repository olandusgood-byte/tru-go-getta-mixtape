(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    street:{id:'street',master:.78,bass:.34,reverb:.12,spatial:.72,ambience:.28,ui:.7},
    club:{id:'club',master:.9,bass:.82,reverb:.38,spatial:.76,ambience:.62,ui:.72},
    studio:{id:'studio',master:.82,bass:.46,reverb:.58,spatial:.68,ambience:.32,ui:.66},
    cinematic:{id:'cinematic',master:.86,bass:.58,reverb:.44,spatial:.84,ambience:.52,ui:.5}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'street'),
      master:clamp(Number.isFinite(Number(input.master))?Number(input.master):.78,0,1),
      bass:clamp(Number.isFinite(Number(input.bass))?Number(input.bass):.34,0,1),
      reverb:clamp(Number.isFinite(Number(input.reverb))?Number(input.reverb):.12,0,1),
      spatial:clamp(Number.isFinite(Number(input.spatial))?Number(input.spatial):.72,0,1),
      ambience:clamp(Number.isFinite(Number(input.ambience))?Number(input.ambience):.28,0,1),
      ui:clamp(Number.isFinite(Number(input.ui))?Number(input.ui):.7,0,1)
    };
  }
  function profile(id='street'){return normalize(PROFILES[id]||PROFILES.street)}
  function attenuation(distance=0,maxDistance=20){
    const d=Math.max(0,Number(distance)||0),m=Math.max(.001,Number(maxDistance)||20);
    return clamp(1-d/m,0,1);
  }
  const api={profile,normalize,attenuation,profiles:Object.keys(PROFILES)};
  globalThis.TGGV240Core=api;
  if(typeof window!=='undefined')window.TGGV240Core=api;
})();