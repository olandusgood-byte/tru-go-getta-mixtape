(() => {
  const VERSION='V3.00 FINAL MEGA BUILD';
  const startedAt=Date.now();
  let activePreset='high';
  let autosaves=0;
  let adaptiveRaf=0;
  let frameWindow=[];
  let lastFrame=performance.now();
  let currentPixelRatio=1;
  let lastAutoShiftAt=0;

  const PRESETS={
    ultra:{pixelRatio:2,shadows:true,crowd:1,walk:{walkSpeed:6.6,sprintSpeed:10.2,accel:20,decel:26,turnResponse:9.4,inputResponse:7},drive:{maxForward:11,maxReverse:-4.7,accel:6.8,reverseAccel:4.9,brake:12,coast:2.65,turnRate:100,steerIn:3.5,steerOut:6.2,lowSpeedSteer:.94,highSpeedSteer:.48,yawResponse:170,yawCenter:235}},
    high:{pixelRatio:1.6,shadows:true,crowd:.82,walk:{walkSpeed:6.5,sprintSpeed:10,accel:19,decel:25,turnResponse:9,inputResponse:6.7},drive:{maxForward:10.6,maxReverse:-4.6,accel:6.6,reverseAccel:4.8,brake:11.7,coast:2.75,turnRate:101,steerIn:3.4,steerOut:6,lowSpeedSteer:.93,highSpeedSteer:.49,yawResponse:168,yawCenter:230}},
    balanced:{pixelRatio:1.25,shadows:true,crowd:.62,walk:{walkSpeed:6.4,sprintSpeed:9.8,accel:18,decel:24,turnResponse:8.5,inputResponse:6.2},drive:{maxForward:10,maxReverse:-4.5,accel:6.4,reverseAccel:4.7,brake:11.5,coast:2.8,turnRate:102,steerIn:3.25,steerOut:5.9,lowSpeedSteer:.92,highSpeedSteer:.5,yawResponse:165,yawCenter:225}},
    performance:{pixelRatio:1,shadows:false,crowd:.42,walk:{walkSpeed:6.4,sprintSpeed:9.8,accel:18,decel:24,turnResponse:8.5,inputResponse:6.2},drive:{maxForward:10,maxReverse:-4.5,accel:6.4,reverseAccel:4.7,brake:11.5,coast:2.8,turnRate:102,steerIn:3.25,steerOut:5.9,lowSpeedSteer:.92,highSpeedSteer:.5,yawResponse:165,yawCenter:225}}
  };

  function clearInputs(){
    ['forward','reverse','left','right','handbrake'].forEach(k=>window.TGGGame?.setDriveKey?.(k,false));
    ['up','down','left','right','sprint'].forEach(k=>window.TGGGame?.setWalkKey?.(k,false));
  }

  function chooseInitialPreset(){
    const memory=Number(navigator.deviceMemory)||8;
    const cores=Number(navigator.hardwareConcurrency)||8;
    const mobile=matchMedia('(max-width: 720px)').matches;
    if(mobile||memory<=4||cores<=4)return 'balanced';
    if(memory>=12&&cores>=8)return 'ultra';
    return 'high';
  }

  function applyPreset(name,{automatic=false}={}){
    const preset=PRESETS[name]||PRESETS.high;
    const renderer=window.TGG3D?.renderer;
    activePreset=PRESETS[name]?name:'high';

    if(renderer){
      currentPixelRatio=Math.min(window.devicePixelRatio||1,preset.pixelRatio);
      renderer.setPixelRatio(currentPixelRatio);
      renderer.shadowMap.enabled=preset.shadows;
      renderer.domElement.dataset.tggMegaPreset=activePreset;
    }

    window.TGGRealism?.setQuality?.(activePreset);
    window.TGGRealityMaster?.setQuality?.(activePreset);
    window.TGGGame?.setWalkTuning?.(preset.walk);
    window.TGGGame?.setDriveTuning?.(preset.drive);
    window.TGGStreetPresence?.setDensity?.(preset.crowd);

    document.documentElement.dataset.tggMegaBuild='v300';
    document.documentElement.dataset.tggMegaPreset=activePreset;
    window.dispatchEvent(new CustomEvent('tgg:mega-preset',{detail:{preset:activePreset,automatic}}));
    return activePreset;
  }

  function startFrameGovernor(){
    if(adaptiveRaf)return;
    const tick=now=>{
      const dt=now-lastFrame;
      lastFrame=now;
      if(dt>0&&dt<250)frameWindow.push(dt);
      if(frameWindow.length>120)frameWindow.shift();

      if(frameWindow.length>=60&&now-lastAutoShiftAt>6000){
        const avg=frameWindow.reduce((a,b)=>a+b,0)/frameWindow.length;
        const fps=1000/avg;
        let next=activePreset;
        if(fps<38)next='performance';
        else if(fps<48&&activePreset==='ultra')next='high';
        else if(fps<44&&activePreset==='high')next='balanced';
        else if(fps>58&&activePreset==='performance')next='balanced';
        else if(fps>59&&activePreset==='balanced'&&(Number(navigator.hardwareConcurrency)||8)>=8)next='high';
        if(next!==activePreset){
          applyPreset(next,{automatic:true});
          lastAutoShiftAt=now;
          frameWindow.length=0;
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

  function readiness(){
    const matrix={
      gameplay:typeof window.TGGGame?.getState==='function',
      locomotion:typeof window.TGGGame?.getWalkingState==='function',
      vehicles:typeof window.TGGGame?.getDrivingState==='function',
      world3d:window.TGG3D?.isReady?.()===true,
      photoreal:typeof window.TGGRealism?.getStatus==='function',
      realityMaster:typeof window.TGGRealityMaster?.getStatus==='function',
      garage:window.TGGGarage3D?.isReady?.()===true,
      studio:window.TGGStudio3D?.isReady?.()===true,
      gamepad:typeof window.TGGGamepad?.isConnected==='function',
      story:typeof window.TGGStoryMissions?.status==='function',
      crowds:typeof window.TGGStreetPresence?.getStatus==='function',
      career:!!window.TGGCareer,
      economy:!!window.TGGEconomy,
      inventory:!!window.TGGInventory,
      crew:!!window.TGGCrew,
      events:!!window.TGGEvents,
      worldSync:!!window.TGGWorldSync,
      qa:!!window.TGGMegaQA
    };
    const values=Object.values(matrix);
    return {matrix,ready:values.filter(Boolean).length,total:values.length,percent:Math.round(values.filter(Boolean).length/values.length*100)};
  }

  function status(){
    const ready=readiness();
    return {
      version:VERSION,
      runtime:'consolidated-mega-build',
      baseReality:window.TGGRealityMaster?.getStatus?.()||null,
      uptimeMs:Date.now()-startedAt,
      preset:activePreset,
      autosaves,
      pixelRatio:Number(currentPixelRatio.toFixed(2)),
      readiness:ready,
      photoreal:window.TGGRealism?.getStatus?.()||null,
      walking:window.TGGGame?.getWalkTuning?.()||null,
      driving:window.TGGGame?.getDriveTuning?.()||null,
      crowdDensity:window.TGGStreetPresence?.getDensity?.()??null
    };
  }

  function runIntegratedQA(){
    const external=window.TGGMegaQA?.run?.();
    const ready=readiness();
    return {version:VERSION,external:external||null,readiness:ready,pass:ready.percent>=75};
  }

  window.addEventListener('blur',clearInputs);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();autosave();}});
  window.addEventListener('beforeunload',()=>{try{window.TGGGame?.save?.(true)}catch{}});
  window.addEventListener('resize',()=>requestAnimationFrame(()=>applyPreset(activePreset)),{passive:true});
  window.addEventListener('tgg:realism-ready',()=>applyPreset(activePreset));
  window.addEventListener('tgg:reality-master-ready',()=>applyPreset(activePreset));

  setInterval(autosave,30000);
  setTimeout(()=>{applyPreset(chooseInitialPreset());startFrameGovernor();},300);

  window.TGGFinalBuild={
    version:VERSION,
    presets:Object.keys(PRESETS),
    status,
    readiness,
    runIntegratedQA,
    clearInputs,
    autosave,
    applyPreset,
    startFrameGovernor
  };
})();