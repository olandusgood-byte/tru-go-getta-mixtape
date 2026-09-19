(() => {
  const $=id=>document.getElementById(id);
  const KEY='tgg-v200-vertical-slice-runtime';
  const state={
    input:'keyboard',
    quality:'HIGH',
    fps:60,
    lastCheckpoint:0,
    storyEvent:null,
    startedAt:Date.now()
  };
  let audioCtx=null;
  let frameCount=0,frameStarted=performance.now(),lowFpsStreak=0,highFpsStreak=0;

  function safeStory(){try{return window.TGGStoryMissions?.status?.()||null}catch{return null}}
  function safeTarget(){try{return window.TGGNavigation?.getTarget?.()||null}catch{return null}}

  function ensureUi(){
    const city=document.querySelector('#game .city');
    if(!city)return;
    if(!$('sliceDirector')){
      const root=document.createElement('aside');
      root.id='sliceDirector';
      root.className='slice-director';
      root.innerHTML=`
        <button id="sliceObjectiveButton" type="button" class="slice-objective">
          <small id="sliceChapter">STORY MODE</small>
          <b id="sliceTitle">FREE ROAM</b>
          <span id="sliceDetail">Open Story Missions to begin.</span>
          <i><em id="sliceProgress">0%</em><strong id="sliceDistance">READY</strong></i>
        </button>
        <div class="slice-runtime">
          <span>INPUT <b id="sliceInput">KEYBOARD</b></span>
          <span>QUALITY <b id="sliceQuality">HIGH</b></span>
          <span>FPS <b id="sliceFps">60</b></span>
          <span>CHECKPOINT <b id="sliceCheckpoint">READY</b></span>
        </div>
        <div id="sliceHint" class="slice-hint">WASD WALK • SHIFT RUN • E CAR • F INTERACT • C CAMERA • M STORY</div>
      `;
      city.appendChild(root);
      $('sliceObjectiveButton')?.addEventListener('click',()=>window.TGGGame?.show?.('storyMissionsBoard'));
    }
    if(!$('sliceDirectorStyles')){
      const style=document.createElement('style');
      style.id='sliceDirectorStyles';
      style.textContent=`
        .slice-director{position:absolute;right:14px;top:14px;z-index:22;width:min(380px,calc(100% - 28px));display:grid;gap:8px;pointer-events:none}
        .slice-objective{pointer-events:auto;text-align:left;border:1px solid #ffffff18;border-radius:18px;background:linear-gradient(145deg,#080b12f2,#04060bf2);padding:13px 14px;box-shadow:0 18px 45px #0009,inset 0 1px #ffffff10;backdrop-filter:blur(12px);display:grid;gap:3px;color:#fff}
        .slice-objective small{font-size:8px;letter-spacing:.18em;color:#c7ff00;font-weight:900}.slice-objective b{font-size:16px;line-height:1.05}.slice-objective span{font-size:10px;color:#aeb6c5;line-height:1.35}
        .slice-objective i{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-style:normal}.slice-objective em{font-style:normal;font-size:9px;color:#c7ff00;font-weight:900}.slice-objective strong{font-size:9px}
        .slice-runtime{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:#05070bd9;border:1px solid #ffffff12;border-radius:12px;padding:7px;backdrop-filter:blur(10px)}
        .slice-runtime span{display:grid;gap:2px;font-size:6px;letter-spacing:.08em;color:#6f7786}.slice-runtime b{font-size:8px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .slice-hint{background:#05070bd9;border:1px solid #ffffff12;border-radius:10px;padding:7px 9px;text-align:center;font-size:7px;font-weight:900;letter-spacing:.06em;color:#cbd3df}
        .slice-director[data-arrived="1"] .slice-objective{border-color:#c7ff0075;box-shadow:0 0 0 1px #c7ff0028,0 18px 45px #0009}
        .slice-director[data-complete="1"] .slice-objective small,.slice-director[data-complete="1"] .slice-objective em{color:#5cff9a}
        @media(max-width:760px){.slice-director{top:8px;right:8px;width:min(300px,calc(100% - 16px))}.slice-objective{padding:10px 11px;border-radius:14px}.slice-objective b{font-size:13px}.slice-objective span{font-size:9px}.slice-runtime{grid-template-columns:repeat(2,1fr)}.slice-hint{font-size:6.5px}.game-shell{gap:10px}.actions{gap:8px!important}.actions button{min-height:56px!important}}
      `;
      document.head.appendChild(style);
    }
  }

  function tone(kind='objective'){
    try{
      audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      const now=audioCtx.currentTime;
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      const map={objective:[480,.08],chapter:[620,.16],complete:[760,.24],checkpoint:[360,.05]};
      const [freq,dur]=map[kind]||map.objective;
      osc.frequency.setValueAtTime(freq,now);
      if(kind==='complete')osc.frequency.exponentialRampToValueAtTime(1040,now+dur);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(.055,now+.01);
      gain.gain.exponentialRampToValueAtTime(.0001,now+dur);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+dur+.02);
    }catch{}
  }

  function vibrate(kind='objective'){
    try{
      const pattern=kind==='complete'?[45,30,90]:kind==='chapter'?[35,20,35]:[22];
      navigator.vibrate?.(pattern);
      const pads=navigator.getGamepads?.()||[];
      for(const pad of pads){
        const act=pad?.vibrationActuator;
        act?.playEffect?.('dual-rumble',{duration:kind==='complete'?220:90,strongMagnitude:kind==='complete'?.75:.35,weakMagnitude:.3});
      }
    }catch{}
  }

  function checkpoint(reason='AUTO'){
    const now=Date.now();
    if(now-state.lastCheckpoint<1200&&reason!=='PAGE HIDE')return false;
    state.lastCheckpoint=now;
    try{window.TGGGame?.save?.(true)}catch{}
    try{
      const payload={
        at:now,
        reason,
        game:window.TGGGame?.getState?.()||null,
        story:safeStory(),
        activeScreen:window.TGGGame?.getActiveScreen?.()||null
      };
      localStorage.setItem(KEY,JSON.stringify(payload));
    }catch{}
    const el=$('sliceCheckpoint');
    if(el)el.textContent=new Date(now).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(reason!=='AUTO')tone('checkpoint');
    return true;
  }

  function inputHint(mode){
    if(mode==='gamepad')return 'LEFT STICK WALK • RT RUN • A INTERACT • B CAR • Y CAMERA • M STORY';
    if(mode==='touch')return 'HOLD D-PAD TO MOVE • HOLD RUN TO SPRINT • TAP INTERACT • STORY FOR MISSIONS';
    return 'WASD WALK • SHIFT RUN • E CAR • F INTERACT • C CAMERA • M STORY';
  }

  function setInput(mode){
    if(!mode||state.input===mode)return;
    state.input=mode;
    const input=$('sliceInput'),hint=$('sliceHint');
    if(input)input.textContent=mode.toUpperCase();
    if(hint)hint.textContent=inputHint(mode);
  }

  function setQuality(mode){
    if(!window.TGG3D?.renderer)return;
    if(mode===state.quality)return;
    state.quality=mode;
    const renderer=window.TGG3D.renderer;
    const dpr=Math.max(1,window.devicePixelRatio||1);
    if(mode==='PERF'){
      renderer.setPixelRatio(Math.min(dpr,1.15));
      renderer.shadowMap.enabled=false;
    }else if(mode==='BALANCED'){
      renderer.setPixelRatio(Math.min(dpr,1.35));
      renderer.shadowMap.enabled=true;
    }else{
      renderer.setPixelRatio(Math.min(dpr,1.65));
      renderer.shadowMap.enabled=true;
    }
    const el=$('sliceQuality');if(el)el.textContent=mode;
  }

  function fpsLoop(){
    frameCount++;
    const now=performance.now();
    if(now-frameStarted>=2000){
      state.fps=Math.round(frameCount*1000/(now-frameStarted));
      frameCount=0;frameStarted=now;
      const el=$('sliceFps');if(el)el.textContent=String(state.fps);
      if(state.fps<34){lowFpsStreak++;highFpsStreak=0}
      else if(state.fps>54){highFpsStreak++;lowFpsStreak=0}
      else{lowFpsStreak=0;highFpsStreak=0}
      if(lowFpsStreak>=2)setQuality(state.quality==='HIGH'?'BALANCED':'PERF');
      if(highFpsStreak>=4)setQuality(state.quality==='PERF'?'BALANCED':'HIGH');
    }
    requestAnimationFrame(fpsLoop);
  }

  function render(){
    ensureUi();
    const st=safeStory();
    const target=safeTarget();
    const root=$('sliceDirector');
    if(!root)return;
    const current=st?.current;
    const completed=!!st?.completed;
    $('sliceChapter') && ($('sliceChapter').textContent=st?('CHAPTER '+st.chapter+' • '+st.chapterName):'STORY MODE');
    $('sliceTitle') && ($('sliceTitle').textContent=current?.title||(completed?'STORY ARC COMPLETE':'FREE ROAM'));
    $('sliceDetail') && ($('sliceDetail').textContent=current?.detail||(completed?'All current story chapters completed.':'Open Story Missions to begin.'));
    $('sliceProgress') && ($('sliceProgress').textContent=(st?.progress||0)+'%');
    $('sliceDistance') && ($('sliceDistance').textContent=target?(target.meters<=4?'ARRIVED':target.meters+' m'):'READY');
    root.dataset.arrived=target&&target.meters<=4?'1':'0';
    root.dataset.complete=completed?'1':'0';
  }

  function onStoryEvent(e){
    const d=e?.detail||{};
    state.storyEvent=d;
    checkpoint('STORY');
    if(d.type==='chapter-complete'){tone('complete');vibrate('complete')}
    else if(d.type==='chapter-start'){tone('chapter');vibrate('chapter')}
    else{tone('objective');vibrate('objective')}
    render();
  }

  function bind(){
    ensureUi();
    window.addEventListener('tgg-story-event',onStoryEvent);
    document.addEventListener('keydown',e=>{
      const t=e.target;
      if(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable)return;
      setInput('keyboard');
      if(window.TGGGame?.getActiveScreen?.()==='game'&&e.key?.toLowerCase()==='m'){
        e.preventDefault();window.TGGGame?.show?.('storyMissionsBoard');
      }
    },true);
    document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')setInput('touch')},{passive:true});
    window.addEventListener('gamepadconnected',()=>setInput('gamepad'));
    window.addEventListener('gamepaddisconnected',()=>setInput(matchMedia('(pointer:coarse)').matches?'touch':'keyboard'));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint('PAGE HIDE')});
    window.addEventListener('pagehide',()=>checkpoint('PAGE HIDE'));
    window.addEventListener('beforeunload',()=>checkpoint('PAGE HIDE'));
    setInterval(()=>checkpoint('AUTO'),15000);
    setInterval(render,350);
    render();
    requestAnimationFrame(fpsLoop);
  }

  window.TGGVerticalSlice={
    checkpoint,
    getState:()=>({...state}),
    setQuality,
    setInput,
    render
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
})();