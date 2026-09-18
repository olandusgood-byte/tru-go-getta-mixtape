(() => {
  const VERSION='V2.12 MEGA 100';
  const startedAt=Date.now();
  let quality='high';
  let autosaves=0;
  let adaptiveRaf=0;
  let frameWindow=[];
  let lastFrame=performance.now();
  let currentPixelRatio=1;

  function clearInputs(){
    ['forward','reverse','left','right','handbrake','boost'].forEach(k=>window.TGGGame?.setDriveKey?.(k,false));
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
    currentPixelRatio=Math.min(window.devicePixelRatio||1,cap);
    renderer.setPixelRatio(currentPixelRatio);
    quality=lowPower?'balanced':'high';
    return quality;
  }

  function startFrameGovernor(){
    if(adaptiveRaf)return;
    const tick=now=>{
      const dt=now-lastFrame;
      lastFrame=now;
      if(dt>0&&dt<250)frameWindow.push(dt);
      if(frameWindow.length>120)frameWindow.shift();

      if(frameWindow.length>=60){
        const avg=frameWindow.reduce((a,b)=>a+b,0)/frameWindow.length;
        const fps=1000/avg;
        const renderer=window.TGG3D?.renderer;
        const dpr=window.devicePixelRatio||1;
        if(renderer){
          if(fps<43&&currentPixelRatio>.82){
            currentPixelRatio=Math.max(.8,currentPixelRatio-.1);
            renderer.setPixelRatio(currentPixelRatio);
            quality='performance';
            frameWindow.length=0;
          }else if(fps>57&&quality==='performance'&&currentPixelRatio<Math.min(dpr,1.35)){
            currentPixelRatio=Math.min(Math.min(dpr,1.35),currentPixelRatio+.05);
            renderer.setPixelRatio(currentPixelRatio);
            if(currentPixelRatio>=Math.min(dpr,1.15))quality='balanced';
            frameWindow.length=0;
          }
        }
      }
      adaptiveRaf=requestAnimationFrame(tick);
    };
    adaptiveRaf=requestAnimationFrame(tick);
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
      pixelRatio:Number(currentPixelRatio.toFixed(2)),
      gameReady:typeof window.TGGGame?.getState==='function',
      world3dReady:window.TGG3D?.isReady?.()===true,
      smoothPlayer:typeof window.TGGGame?.getWalkingState==='function',
      smoothDriving:typeof window.TGGGame?.getDrivingState==='function',
      garage3d:window.TGGGarage3D?.isReady?.()===true,
      studio3d:window.TGGStudio3D?.isReady?.()===true,
      gamepadLayer:typeof window.TGGGamepad?.isConnected==='function'
    };
  }

  window.addEventListener('blur',clearInputs);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){clearInputs();autosave();}
  });
  window.addEventListener('beforeunload',()=>{try{window.TGGGame?.save?.(true)}catch{}});
  window.addEventListener('resize',()=>requestAnimationFrame(applyAdaptiveQuality),{passive:true});

  setInterval(autosave,30000);
  setTimeout(()=>{applyAdaptiveQuality();startFrameGovernor()},250);

  window.TGGFinalBuild={version:VERSION,status,clearInputs,autosave,applyAdaptiveQuality,startFrameGovernor};
})();