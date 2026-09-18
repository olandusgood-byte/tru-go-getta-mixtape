(() => {
  const VERSION='V2.00 BIG BUILD';
  const startedAt=Date.now();
  let quality='high';
  let autosaves=0;

  function clearInputs(){
    ['forward','reverse','left','right','handbrake'].forEach(k=>window.TGGGame?.setDriveKey?.(k,false));
    ['up','down','left','right','sprint'].forEach(k=>window.TGGGame?.setWalkKey?.(k,false));
  }

  function applyAdaptiveQuality(){
    const renderer=window.TGG3D?.renderer;
    if(!renderer)return 'pending';
    const memory=Number(navigator.deviceMemory)||8;
    const cores=Number(navigator.hardwareConcurrency)||8;
    const mobile=matchMedia('(max-width: 650px)').matches;
    const lowPower=mobile||memory<=4||cores<=4;
    const cap=lowPower?1.15:1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,cap));
    quality=lowPower?'balanced':'high';
    return quality;
  }

  function autosave(){
    if(window.TGGGame?.getActiveScreen?.()!=='game')return false;
    try{
      window.TGGGame?.save?.(true);
      autosaves++;
      return true;
    }catch{return false;}
  }

  function status(){
    return {
      version:VERSION,
      uptimeMs:Date.now()-startedAt,
      quality,
      autosaves,
      gameReady:typeof window.TGGGame?.getState==='function',
      world3dReady:window.TGG3D?.isReady?.()===true,
      smoothPlayer:typeof window.TGGGame?.getWalkingState==='function',
      smoothDriving:typeof window.TGGGame?.getDrivingState==='function',
      garage3d:window.TGGGarage3D?.isReady?.()===true,
      studio3d:window.TGGStudio3D?.isReady?.()===true
    };
  }

  window.addEventListener('blur',clearInputs);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){clearInputs();autosave();}
  });
  window.addEventListener('beforeunload',()=>{try{window.TGGGame?.save?.(true)}catch{}});
  window.addEventListener('resize',()=>requestAnimationFrame(applyAdaptiveQuality),{passive:true});

  setInterval(autosave,30000);
  setTimeout(applyAdaptiveQuality,250);

  window.TGGFinalBuild={version:VERSION,status,clearInputs,autosave,applyAdaptiveQuality};
})();