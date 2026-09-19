(() => {
  const ROOT_ID='storyCinematic';
  let timer=0,lastEvent=null,lastShownKey='';

  function ensure(){
    let root=document.getElementById(ROOT_ID);
    if(root)return root;
    root=document.createElement('div');
    root.id=ROOT_ID;
    root.className='story-cinematic';
    root.setAttribute('aria-live','polite');
    root.innerHTML=
      '<div class="story-cine-bars top"></div>'+
      '<div class="story-cine-copy">'+
        '<small id="storyCineKicker">STORY MODE</small>'+
        '<strong id="storyCineTitle">OBJECTIVE UPDATED</strong>'+
        '<span id="storyCineDetail"></span>'+
      '</div>'+
      '<div class="story-cine-bars bottom"></div>';
    document.body.appendChild(root);

    const style=document.createElement('style');
    style.id='storyCinematicStyles';
    style.textContent=`
      .story-cinematic{position:fixed;inset:0;z-index:9996;pointer-events:none;display:grid;place-items:center;opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease;background:radial-gradient(circle at 50% 50%,transparent 0 28%,rgba(0,0,0,.12) 60%,rgba(0,0,0,.7) 100%)}
      .story-cinematic.show{opacity:1;visibility:visible}
      .story-cine-bars{position:absolute;left:0;right:0;height:8.5vh;background:#020305;transform:scaleY(0);transition:transform .28s cubic-bezier(.2,.9,.2,1)}
      .story-cine-bars.top{top:0;transform-origin:top}.story-cine-bars.bottom{bottom:0;transform-origin:bottom}
      .story-cinematic.show .story-cine-bars{transform:scaleY(1)}
      .story-cine-copy{min-width:min(760px,88vw);max-width:88vw;text-align:center;padding:24px 34px;border-top:1px solid #ffffff18;border-bottom:1px solid #ffffff18;transform:translateY(18px) scale(.98);opacity:0;transition:transform .32s ease,opacity .32s ease;background:linear-gradient(90deg,transparent,#05070bd9 16%,#05070bef 50%,#05070bd9 84%,transparent)}
      .story-cinematic.show .story-cine-copy{transform:none;opacity:1}
      .story-cine-copy small{display:block;font-size:10px;font-weight:950;letter-spacing:.24em;color:#c7ff00;margin-bottom:8px}
      .story-cine-copy strong{display:block;font-size:clamp(26px,4.2vw,58px);line-height:.95;letter-spacing:-.045em;text-transform:uppercase;color:#fff;text-shadow:0 14px 40px #000}
      .story-cine-copy span{display:block;max-width:700px;margin:11px auto 0;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#b9c2d2}
      .story-cinematic.objective{background:transparent;place-items:start center;padding-top:max(84px,10vh)}
      .story-cinematic.objective .story-cine-bars{display:none}
      .story-cinematic.objective .story-cine-copy{min-width:0;width:min(520px,88vw);padding:13px 18px;border:1px solid #c7ff0048;border-radius:14px;background:linear-gradient(135deg,#071008f2,#05070bed);box-shadow:0 18px 50px #000a;text-align:left}
      .story-cinematic.objective .story-cine-copy small{font-size:8px;margin-bottom:5px}
      .story-cinematic.objective .story-cine-copy strong{font-size:18px;letter-spacing:-.015em}
      .story-cinematic.objective .story-cine-copy span{font-size:9px;margin:5px 0 0}
      .story-cinematic.complete .story-cine-copy{border-color:#c7ff0050}
      .story-cinematic.complete .story-cine-copy small{color:#fff}
      .story-cinematic.complete .story-cine-copy strong{color:#c7ff00}
      @media(max-width:760px){
        .story-cine-copy{padding:18px 20px;max-width:92vw}
        .story-cine-copy strong{font-size:clamp(25px,9vw,42px)}
        .story-cine-copy span{font-size:10px}
        .story-cinematic.objective{padding-top:74px}
        .story-cinematic.objective .story-cine-copy{width:calc(100vw - 24px)}
      }
      @media(prefers-reduced-motion:reduce){
        .story-cinematic,.story-cine-copy,.story-cine-bars{transition:none!important}
      }
    `;
    document.head.appendChild(style);
    return root;
  }

  function hide(){
    const root=ensure();
    root.classList.remove('show');
  }

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

    root.className='story-cinematic '+(type==='objective'?'objective':type==='chapter-complete'?'complete':'chapter');
    const kicker=document.getElementById('storyCineKicker');
    const titleEl=document.getElementById('storyCineTitle');
    const detailEl=document.getElementById('storyCineDetail');

    if(kicker)kicker.textContent=type==='chapter-complete'?'MISSION PASSED':type==='objective'?'OBJECTIVE UPDATED':'CHAPTER '+chapter;
    if(titleEl)titleEl.textContent=title;
    if(detailEl)detailEl.textContent=detail;

    clearTimeout(timer);
    requestAnimationFrame(()=>root.classList.add('show'));
    const duration=type==='objective'?1450:type==='chapter-complete'?3300:2600;
    timer=setTimeout(hide,duration);
    return true;
  }

  window.addEventListener('tgg-story-event',e=>show(e.detail||{}));

  window.TGGStoryCinematics={
    show,hide,
    getState:()=>({
      visible:ensure().classList.contains('show'),
      className:ensure().className,
      lastEvent:lastEvent?{...lastEvent}:null
    })
  };

  ensure();
})();