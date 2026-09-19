(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PRESETS={
    street:{id:'street',shake:.06,fovBoost:1.5,roll:.018,letterbox:0,vignette:.16,photo:false},
    action:{id:'action',shake:.32,fovBoost:10,roll:.085,letterbox:.025,vignette:.3,photo:false},
    cinematic:{id:'cinematic',shake:.12,fovBoost:3,roll:.025,letterbox:.12,vignette:.42,photo:false},
    photo:{id:'photo',shake:0,fovBoost:0,roll:0,letterbox:.06,vignette:.24,photo:true}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'street'),
      shake:clamp(Number.isFinite(Number(input.shake))?Number(input.shake):.06,0,1),
      fovBoost:clamp(Number.isFinite(Number(input.fovBoost))?Number(input.fovBoost):1.5,0,18),
      roll:clamp(Number.isFinite(Number(input.roll))?Number(input.roll):.018,0,.16),
      letterbox:clamp(Number.isFinite(Number(input.letterbox))?Number(input.letterbox):0,0,.18),
      vignette:clamp(Number.isFinite(Number(input.vignette))?Number(input.vignette):.16,0,.65),
      photo:!!input.photo
    };
  }
  function preset(id='street'){return normalize(PRESETS[id]||PRESETS.street)}
  function blend(a={},b={},t=.5){
    const A=normalize(a),B=normalize(b),u=clamp(t,0,1),mix=(x,y)=>x+(y-x)*u;
    return normalize({
      id:B.id||A.id,shake:mix(A.shake,B.shake),fovBoost:mix(A.fovBoost,B.fovBoost),
      roll:mix(A.roll,B.roll),letterbox:mix(A.letterbox,B.letterbox),vignette:mix(A.vignette,B.vignette),
      photo:u>.5?B.photo:A.photo
    });
  }
  const api={preset,normalize,blend,presets:Object.keys(PRESETS)};
  globalThis.TGGV234Core=api;
  if(typeof window!=='undefined')window.TGGV234Core=api;
})();