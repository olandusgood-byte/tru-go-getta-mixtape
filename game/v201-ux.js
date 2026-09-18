(() => {
  const $=id=>document.getElementById(id);
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  onReady(()=>{
    document.body.classList.add('tgg-v201');

    const topbar=document.querySelector('.topbar');
    if(topbar && !document.querySelector('.v201-badge')){
      const badge=document.createElement('span');
      badge.className='v201-badge';
      badge.textContent='V2.05 DRIVE';
      const hud=$('hud');
      topbar.insertBefore(badge,hud||null);
    }

    const deck=document.querySelector('.action-deck');
    const actions=deck?.querySelector('.actions');
    if(deck&&actions){
      const groups={
        core:['missionBtn','vehicleBtn','interact3dBtn','camera3dBtn','driftBtn','hornBtn','recoverCarBtn','characterBtn'],
        places:['studioBtn','parkBtn','shopsBtn','homeBtn','mediaBtn','garageBtn'],
        career:['businessBtn','careerBtn','eventsBtn','contentBtn','expansionBtn','progressionBtn','inventoryBtn','crewBtn','bridgeBtn'],
        utility:['saveBtn','pauseBtn']
      };
      Object.entries(groups).forEach(([group,ids])=>ids.forEach(id=>{const el=$(id);if(el)el.dataset.actionGroup=group;}));
      deck.dataset.activeGroup='core';

      const tabs=document.createElement('div');
      tabs.className='action-tabs';
      [['core','CORE'],['places','PLACES'],['career','CAREER']].forEach(([key,label],i)=>{
        const b=document.createElement('button');
        b.type='button';
        b.textContent=label;
        b.dataset.group=key;
        if(i===0)b.classList.add('active');
        b.addEventListener('click',()=>{
          deck.dataset.activeGroup=key;
          tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
        });
        tabs.appendChild(b);
      });
      actions.before(tabs);
    }

    const movePad=document.querySelector('.move-pad');
    const moveTitle=movePad?.querySelector('.control-title b');
    const moveHelp=movePad?.querySelector('.control-title small');
    if(moveTitle&&!moveTitle.querySelector('.control-mode-badge')){
      const badge=document.createElement('span');
      badge.className='control-mode-badge';
      badge.textContent='ON FOOT';
      moveTitle.appendChild(badge);
    }

    const up=document.querySelector('[data-key="ArrowUp"]');
    const down=document.querySelector('[data-key="ArrowDown"]');
    const left=document.querySelector('[data-key="ArrowLeft"]');
    const right=document.querySelector('[data-key="ArrowRight"]');
    const sprint=$('sprintBtn');
    const setPad=(el,symbol,label)=>{if(el)el.innerHTML='<span>'+symbol+'</span><small>'+label+'</small>';};
    let lastMode='';
    function refreshMode(){
      const inVehicle=!!window.TGGGame?.getState?.().inVehicle;
      const mode=inVehicle?'drive':'walk';
      if(mode!==lastMode){
        lastMode=mode;
        movePad?.classList.toggle('drive-mode',inVehicle);
        const badge=moveTitle?.querySelector('.control-mode-badge');
        if(badge)badge.textContent=inVehicle?'DRIVING':'ON FOOT';
        if(inVehicle){
          setPad(up,'▲','GAS');
          setPad(down,'▼','BRAKE / REV');
          setPad(left,'◀','STEER L');
          setPad(right,'▶','STEER R');
          if(sprint){sprint.innerHTML='<span>●</span><small>CAR</small>';sprint.setAttribute('aria-label','Driving mode');}
          if(moveHelp)moveHelp.textContent='Tap or hold GAS to move • BRAKE / REV backs up • STEER stays softer at speed • Space / DRIFT = handbrake.';
        }else{
          setPad(up,'▲','FORWARD');
          setPad(down,'▼','BACK');
          setPad(left,'◀','LEFT');
          setPad(right,'▶','RIGHT');
          if(sprint){sprint.innerHTML='<span>RUN</span><small>SPRINT</small>';sprint.setAttribute('aria-label','Hold to sprint');}
          if(moveHelp)moveHelp.textContent='WASD / arrows to move • hold SHIFT or RUN to sprint • gamepad left stick supported.';
        }
      }
      requestAnimationFrame(refreshMode);
    }
    refreshMode();
  });
})();