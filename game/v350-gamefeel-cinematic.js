(()=>{
  const VERSION='V3.50 GAME FEEL CINEMATIC MEGA';
  const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()?resolve(window.TGG3D):requestAnimationFrame(t);t()});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function ensureFx(){
    let el=document.getElementById('v350Fx');
    if(el)return el;
    el=document.createElement('div');
    el.id='v350Fx';
    el.innerHTML='<i class="v350-flash"></i><i class="v350-speed"></i><i class="v350-letterbox top"></i><i class="v350-letterbox bottom"></i><div class="v350-objective"><small>TRU GO GETTA WORLD</small><b id="v350ObjectiveTitle">CITY READY</b><span id="v350ObjectiveDetail">Move through the city and build your career.</span></div>';
    document.body.appendChild(el);
    return el;
  }
  function pulse(kind='soft'){
    const root=ensureFx();
    root.dataset.pulse=kind;
    clearTimeout(root._pulseTimer);
    root._pulseTimer=setTimeout(()=>delete root.dataset.pulse,kind==='hard'?240:150);
  }
  function cinematic(active=true){
    const root=ensureFx();
    root.classList.toggle('cinematic',!!active);
  }
  function objective(title,detail){
    const root=ensureFx(),box=root.querySelector('.v350-objective');
    const t=document.getElementById('v350ObjectiveTitle'),d=document.getElementById('v350ObjectiveDetail');
    if(t)t.textContent=String(title||'OBJECTIVE UPDATED');
    if(d)d.textContent=String(detail||'');
    box?.classList.add('show');clearTimeout(box?._timer);
    if(box)box._timer=setTimeout(()=>box.classList.remove('show'),1800);
  }
  function tone(kind='ui'){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      const ctx=(window.__tggV350AudioCtx ||= new Ctx());
      if(ctx.state==='suspended')ctx.resume();
      const now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
      const map={ui:[220,.025,.018],objective:[460,.065,.035],impact:[120,.045,.045],mission:[680,.11,.045]};
      const [f,dur,vol]=map[kind]||map.ui;
      o.type=kind==='impact'?'sawtooth':'sine';o.frequency.setValueAtTime(f,now);
      if(kind==='mission')o.frequency.exponentialRampToValueAtTime(920,now+dur);
      g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);
      o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+dur+.02);
    }catch{}
  }
  wait().then(api=>{
    try{
      const {camera}=api;ensureFx();
      let last=performance.now(),shake=0,shakeTarget=0,letterboxUntil=0;
      const tick=now=>{
        requestAnimationFrame(tick);
        const dt=Math.min(.05,(now-last)/1000);last=now;
        const vd=api.getVehicleDynamics?.()||{},pd=api.getPlayerDynamics?.()||{};
        const inVehicle=!!window.TGGGame?.getState?.()?.inVehicle;
        const speed=Math.abs(Number(vd.speed)||0);
        const sprint=!!pd.sprinting;
        shakeTarget=inVehicle?clamp(speed/10*.006,0,.006):(sprint?.003:0);
        shake+= (shakeTarget-shake)*Math.min(1,dt*7);
        if(camera){
          camera.rotation.x += (Math.sin(now*.017)*shake-camera.rotation.x*.02)*Math.min(1,dt*3.5);
          camera.rotation.y += Math.sin(now*.013)*shake*.18;
        }
        const root=document.getElementById('v350Fx');
        if(root){
          root.style.setProperty('--v350-speed',String(clamp(speed/11+(sprint?.18:0),0,1)));
          if(now>letterboxUntil)root.classList.remove('cinematic');
        }
      };
      requestAnimationFrame(tick);

      document.addEventListener('pointerdown',e=>{
        const btn=e.target.closest('button');
        if(!btn)return;
        tone('ui');
      },true);

      window.addEventListener('tgg-story-event',e=>{
        const d=e.detail||{};
        if(d.type==='chapter-start'||d.type==='chapter-complete'){
          cinematic(true);letterboxUntil=performance.now()+(d.type==='chapter-complete'?2600:1800);
          pulse(d.type==='chapter-complete'?'hard':'soft');tone('mission');
        }else{pulse('soft');tone('objective')}
        objective(d.title||'OBJECTIVE UPDATED',d.detail||'');
      });

      const oldToast=window.__tggToast;
      if(typeof oldToast==='function'&&!oldToast.__v350Wrapped){
        const wrapped=(msg)=>{pulse(/complete|reward|mission|win/i.test(String(msg))?'hard':'soft');tone(/complete|reward|mission|win/i.test(String(msg))?'mission':'ui');return oldToast(msg)};
        wrapped.__v350Wrapped=true;window.__tggToast=wrapped;
      }

      const watchControls=()=>{
        const st=window.TGGStreetPresence?.getStatus?.();
        if(st?.reactions>0)pulse('soft');
      };
      setInterval(watchControls,1200);

      document.documentElement.dataset.tggV350='on';
      const status={version:VERSION,features:['cinematic-letterbox','objective-callouts','impact-pulse','speed-vignette','camera-micro-shake','ui-audio-hooks','mission-audio-cues','story-cinematic-sync','crowd-reaction-feedback','reduced-motion-guard']};
      window.TGGGameFeel={...status,pulse,cinematic,objective,tone,getStatus:()=>({...status})};
      window.dispatchEvent(new CustomEvent('tgg:v350-ready',{detail:status}));
    }catch(error){
      document.documentElement.dataset.tggV350='fallback';
      window.TGGGameFeel={version:VERSION,error:String(error?.message||error),getStatus(){return {version:VERSION,mode:'safe-fallback'}}};
    }
  });
})();
