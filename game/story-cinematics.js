(() => {
  const ROOT_ID='storyCinematic';
  let timer=0,lastEvent=null,lastShownKey='',restoreTimer=0,restoreCamera='',showFrame=0;

  const CHAPTERS={
    1:{name:'FIRST CONTRACT',accent:'#ff466d',badge:'01'},
    2:{name:'CITY BUZZ',accent:'#c7ff00',badge:'02'},
    3:{name:'CITY TAKEOVER',accent:'#48d7ff',badge:'03'}
  };

  function ensure(){
    let root=document.getElementById(ROOT_ID);
    if(root)return root;
    root=document.createElement('div');
    root.id=ROOT_ID;
    root.className='story-cinematic';
    root.setAttribute('aria-live','polite');
    root.innerHTML=
      '<div class="story-cine-bars top"></div>'+
      '<div class="story-cine-frame">'+
        '<div class="story-cine-badge" id="storyCineBadge">TGG</div>'+
        '<div class="story-cine-copy">'+
          '<small id="storyCineKicker">STORY MODE</small>'+
          '<strong id="storyCineTitle">OBJECTIVE UPDATED</strong>'+
          '<span id="storyCineDetail"></span>'+
          '<div class="story-cine-meta"><i id="storyCineType">MISSION</i><i id="storyCineCrowd">CITY LIVE</i></div>'+
        '</div>'+
      '</div>'+
      '<div class="story-cine-bars bottom"></div>'+
      '<div class="story-cine-scan"></div>';
    document.body.appendChild(root);

    const style=document.createElement('style');
    style.id='storyCinematicStyles';
    style.textContent=`
      .story-cinematic{--cine:#c7ff00;position:fixed;inset:0;z-index:9996;pointer-events:none;display:grid;place-items:center;opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s ease;background:radial-gradient(circle at 50% 48%,transparent 0 24%,rgba(0,0,0,.18) 58%,rgba(0,0,0,.78) 100%);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
      .story-cinematic.show{opacity:1;visibility:visible}
      .story-cine-bars{position:absolute;left:0;right:0;height:9vh;background:#020305;transform:scaleY(0);transition:transform .26s cubic-bezier(.2,.9,.2,1);box-shadow:0 0 34px #000}
      .story-cine-bars.top{top:0;transform-origin:top}.story-cine-bars.bottom{bottom:0;transform-origin:bottom}
      .story-cinematic.show .story-cine-bars{transform:scaleY(1)}
      .story-cine-frame{box-sizing:border-box;display:flex;align-items:center;gap:18px;width:min(900px,90vw);padding:26px 34px;border-top:1px solid color-mix(in srgb,var(--cine) 42%,transparent);border-bottom:1px solid #ffffff18;background:linear-gradient(90deg,transparent,#05070bdd 12%,#05070bf5 50%,#05070bdd 88%,transparent);transform:translateY(18px) scale(.985);opacity:0;transition:transform .32s ease,opacity .32s ease}
      .story-cinematic.show .story-cine-frame{transform:none;opacity:1}
      .story-cine-badge{width:82px;height:82px;display:grid;place-items:center;flex:0 0 82px;border-radius:22px;border:1px solid var(--cine);background:linear-gradient(145deg,color-mix(in srgb,var(--cine) 19%,#05070b),#070a10);box-shadow:0 0 42px color-mix(in srgb,var(--cine) 22%,transparent),inset 0 0 24px #0008;color:#fff;font-size:25px;font-weight:1000;letter-spacing:-.05em}
      .story-cine-copy{min-width:0;flex:1;text-align:left}
      .story-cine-copy small{display:block;font-size:9px;font-weight:950;letter-spacing:.25em;color:var(--cine);margin-bottom:8px}
      .story-cine-copy strong{display:block;font-size:clamp(30px,4.5vw,64px);line-height:.92;letter-spacing:-.05em;text-transform:uppercase;color:#fff;text-shadow:0 16px 42px #000}
      .story-cine-copy>span{display:block;max-width:720px;margin:11px 0 0;font-size:11px;line-height:1.5;letter-spacing:.065em;text-transform:uppercase;color:#b9c2d2}
      .story-cine-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.story-cine-meta i{font-style:normal;padding:6px 9px;border:1px solid #ffffff18;border-radius:999px;background:#0b0f16c7;color:#dce3ee;font-size:8px;font-weight:900;letter-spacing:.12em}
      .story-cine-meta i:first-child{border-color:color-mix(in srgb,var(--cine) 42%,transparent);color:var(--cine)}
      .story-cine-scan{position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(180deg,transparent 0 3px,#fff 4px,transparent 5px);mix-blend-mode:soft-light}
      .story-cinematic.objective{background:transparent;place-items:start center;padding-top:max(82px,9vh)}
      .story-cinematic.objective .story-cine-bars,.story-cinematic.objective .story-cine-scan{display:none}
      .story-cinematic.objective .story-cine-frame{width:min(620px,92vw);padding:14px 16px;gap:12px;border:1px solid color-mix(in srgb,var(--cine) 44%,transparent);border-radius:16px;background:linear-gradient(135deg,#071008f3,#05070bf2);box-shadow:0 18px 50px #000a}
      .story-cinematic.objective .story-cine-badge{width:50px;height:50px;flex-basis:50px;border-radius:13px;font-size:16px}
      .story-cinematic.objective .story-cine-copy small{font-size:7px;margin-bottom:4px}.story-cinematic.objective .story-cine-copy strong{font-size:18px;letter-spacing:-.02em}.story-cinematic.objective .story-cine-copy>span{font-size:9px;margin-top:4px}.story-cinematic.objective .story-cine-meta{margin-top:7px}.story-cinematic.objective .story-cine-meta i{padding:4px 7px;font-size:7px}
      .story-cinematic.complete .story-cine-frame{border-color:color-mix(in srgb,var(--cine) 62%,transparent);box-shadow:0 0 70px color-mix(in srgb,var(--cine) 14%,transparent)}
      .story-cinematic.complete .story-cine-copy small{color:#fff}.story-cinematic.complete .story-cine-copy strong{color:var(--cine)}
      .story-cinematic.complete .story-cine-badge{animation:tggMissionPulse .7s ease 2}
      @keyframes tggMissionPulse{50%{transform:scale(1.08);box-shadow:0 0 70px color-mix(in srgb,var(--cine) 45%,transparent)}}
      @media(max-width:760px){.story-cine-frame{gap:12px;padding:20px 16px;width:calc(100vw - 24px);max-width:calc(100vw - 24px)}.story-cine-badge{width:58px;height:58px;flex-basis:58px;border-radius:16px;font-size:18px}.story-cine-copy strong{font-size:clamp(25px,8vw,42px)}.story-cine-copy>span{font-size:9px}.story-cinematic.objective{padding-top:72px}.story-cinematic.objective .story-cine-frame{width:calc(100vw - 24px);max-width:calc(100vw - 24px)}}
      @media(prefers-reduced-motion:reduce){.story-cinematic,.story-cine-frame,.story-cine-bars,.story-cine-badge{transition:none!important;animation:none!important}}
    `;
    document.head.appendChild(style);
    return root;
  }

  function crowdText(){
    const c=window.TGGCrowdPresentation?.getStatus?.();
    if(!c?.ready)return 'CITY LIVE';
    const parts=[];
    if(Number(c.visibleFans)>0)parts.push(c.visibleFans+' FANS');
    if(Number(c.cheering)>0)parts.push(c.cheering+' CHEERING');
    if(Number(c.recording)>0)parts.push(c.recording+' RECORDING');
    return parts.join(' • ')||'CITY WATCHING';
  }

  function badgeFor(payload){
    const st=window.TGGStoryMissions?.status?.();
    const talk=st?.current?.talk;
    if(talk==='manager')return 'M';
    if(talk==='kane')return 'K';
    if(talk==='director')return 'DK';
    if(talk==='dj')return 'DJ';
    if(payload.type==='chapter-complete')return '✓';
    return CHAPTERS[Number(payload.chapter)]?.badge||'TGG';
  }

  function typeFor(payload){
    if(payload.type==='chapter-complete')return 'MISSION PASSED';
    if(payload.type==='chapter-start')return 'STORY CHAPTER';

    const explicit=String(payload.objectiveType||payload.kind||'').toLowerCase();
    const go=String(payload.go||'').toLowerCase();
    if(explicit==='talk'||explicit==='contact')return 'CONTACT';
    if(explicit==='arrive'||explicit==='travel')return 'TRAVEL';
    if(explicit==='flag'||explicit==='story-action')return 'STORY ACTION';
    if(explicit==='metric'){
      if(go==='show')return 'LIVE EVENT';
      if(go==='battle')return 'CYPHER';
      return 'CAREER';
    }

    const st=window.TGGStoryMissions?.status?.();
    const current=st?.current;
    const payloadTitle=String(payload.title||'').trim().toUpperCase();
    const currentTitle=String(current?.title||'').trim().toUpperCase();
    const currentMatches=!payloadTitle||!currentTitle||payloadTitle===currentTitle;
    if(currentMatches){
      if(current?.kind==='talk')return 'CONTACT';
      if(current?.kind==='arrive')return 'TRAVEL';
      if(current?.kind==='metric')return current?.go==='show'?'LIVE EVENT':current?.go==='battle'?'CYPHER':'CAREER';
      if(current?.kind==='flag')return 'STORY ACTION';
    }

    const text=(payloadTitle+' '+String(payload.detail||'').toUpperCase()).trim();
    if(/\b(MEET|TALK TO|LINK|CALL)\b/.test(text))return 'CONTACT';
    if(/\b(DRIVE TO|GET TO|GO TO|HEAD TO|ARRIVE|REACH|FOLLOW THE MARKER)\b/.test(text))return 'TRAVEL';
    if(/\b(BATTLE|CYPHER|RAP BATTLE)\b/.test(text))return 'CYPHER';
    if(/\b(SHOW|STAGE|PERFORM|CONCERT)\b/.test(text))return 'LIVE EVENT';
    if(/\b(RECORD|STUDIO|TRACK|MIXTAPE|RELEASE|DROP)\b/.test(text))return 'CAREER';
    if(/\b(VIDEO|VISUAL|PHOTO|PREMIERE|SHOOT)\b/.test(text))return 'STORY ACTION';
    return 'OBJECTIVE';
  }

  function cameraCue(type){
    if(window.TGGGame?.getActiveScreen?.()!=='game'||!window.TGG3D?.setCameraMode)return;
    clearTimeout(restoreTimer);
    restoreCamera=window.TGG3D?.getCameraMode?.()||'orbit';
    if(type==='chapter-start'||type==='chapter-complete')window.TGG3D.setCameraMode('orbit',true);
    else if(type==='objective')window.TGG3D.setCameraMode('chase',true);
    restoreTimer=setTimeout(()=>{
      if(restoreCamera&&window.TGGGame?.getActiveScreen?.()==='game')window.TGG3D?.setCameraMode?.(restoreCamera,true);
    },type==='objective'?1550:2850);
  }

  function hide(){\n    clearTimeout(timer);\n    if(showFrame){cancelAnimationFrame(showFrame);showFrame=0;}\n    ensure().classList.remove('show');\n  }

  function show(payload={}){
    const root=ensure();
    const type=payload.type||'objective';
    const chapter=Number(payload.chapter)||0;
    const title=String(payload.title||'OBJECTIVE UPDATED');
    const detail=String(payload.detail||'');
    const key=[type,chapter,title,detail].join('|');
    if(key===lastShownKey&&Date.now()-(lastEvent?.shownAt||0)<800)return false;
    lastShownKey=key;
    lastEvent={...payload,shownAt:Date.now()};

    const cfg=CHAPTERS[chapter]||CHAPTERS[2];
    root.style.setProperty('--cine',cfg.accent);
    root.className='story-cinematic '+(type==='objective'?'objective':type==='chapter-complete'?'complete':'chapter');

    const kicker=document.getElementById('storyCineKicker');
    const titleEl=document.getElementById('storyCineTitle');
    const detailEl=document.getElementById('storyCineDetail');
    const badge=document.getElementById('storyCineBadge');
    const typeEl=document.getElementById('storyCineType');
    const crowd=document.getElementById('storyCineCrowd');

    if(kicker)kicker.textContent=type==='chapter-complete'?'TRU GO GETTA • MISSION PASSED':type==='objective'?'NEW OBJECTIVE':'CHAPTER '+chapter+' • '+cfg.name;
    if(titleEl)titleEl.textContent=title;
    if(detailEl)detailEl.textContent=detail;
    if(badge)badge.textContent=badgeFor(payload);
    if(typeEl)typeEl.textContent=typeFor(payload);
    if(crowd)crowd.textContent=crowdText();

    cameraCue(type);
    clearTimeout(timer);
    if(showFrame)cancelAnimationFrame(showFrame);\n    showFrame=requestAnimationFrame(()=>{showFrame=0;root.classList.add('show')});
    const duration=type==='objective'?1500:type==='chapter-complete'?3400:2750;
    timer=setTimeout(hide,duration);
    return true;
  }

  window.addEventListener('tgg-story-event',e=>show(e.detail||{}));

  window.TGGStoryCinematics={
    version:'V2.20',
    show,hide,
    refreshCrowd(){
      const el=document.getElementById('storyCineCrowd');
      if(el)el.textContent=crowdText();
      return crowdText();
    },
    getState:()=>({
      version:'V2.20',
      visible:ensure().classList.contains('show'),
      className:ensure().className,
      accent:getComputedStyle(ensure()).getPropertyValue('--cine').trim(),
      crowd:crowdText(),
      lastEvent:lastEvent?{...lastEvent}:null
    })
  };

  ensure();
})();