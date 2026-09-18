(() => {
  function isSupportedModelUrl(value){
    if(typeof value!=='string'||!value.trim())return false;
    try{
      const u=new URL(value);
      if(u.protocol!=='https:')return false;
      const p=u.pathname.toLowerCase();
      return p.endsWith('.glb')||p.endsWith('.gltf');
    }catch{return false}
  }

  function normalizeConfig(input={}){
    const url=isSupportedModelUrl(input.playerModelUrl)?String(input.playerModelUrl):null;
    return {
      playerModelUrl:url,
      fallbackMode:'procedural',
      scale:Number.isFinite(Number(input.scale))?Number(input.scale):1,
      yOffset:Number.isFinite(Number(input.yOffset))?Number(input.yOffset):0,
      rotationY:Number.isFinite(Number(input.rotationY))?Number(input.rotationY):0
    };
  }

  function nextState(prev={},event,payload={}){
    const base={
      status:String(prev.status||'idle'),
      usingFallback:prev.usingFallback!==false,
      url:prev.url||null,
      reason:prev.reason||null
    };
    if(event==='begin')return {...base,status:'loading',usingFallback:true,reason:null};
    if(event==='success')return {...base,status:'ready',usingFallback:false,url:payload.url||base.url,reason:null};
    if(event==='failure')return {...base,status:'fallback',usingFallback:true,reason:payload.reason||'unknown'};
    if(event==='reset')return {status:'idle',usingFallback:true,url:null,reason:null};
    return base;
  }

  const api={isSupportedModelUrl,normalizeConfig,nextState};
  globalThis.TGGV226Core=api;
  if(typeof window!=='undefined')window.TGGV226Core=api;
})();