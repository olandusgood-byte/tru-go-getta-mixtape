(() => {
  const KEY='tgg-game-v1';
  const $=id=>document.getElementById(id);
  let state={name:'PLAYER',style:'Artist',x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false,autoMode:true,heading:0};
  let activeScreen='menu';
  const screens=['menu','creator','game','pause','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','avatar','park','studio','shops','home','media','businessBoard'];

  function show(id){
    activeScreen=id;
    screens.forEach(s=>$(s)?.classList.toggle('active',s===id));
    $('hud')?.classList.toggle('hidden',!['game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','businessBoard'].includes(id));
    window.TGGCareer?.render?.();
    window.TGGBridge?.render?.();
    window.TGGProgression?.render?.();
    window.TGGInventory?.render?.();
    window.TGGCrew?.render?.();
    window.TGGEvents?.render?.();
    if(id==='game')requestAnimationFrame(()=>window.TGGWorld3D?.resize?.());
  }

  function toast(t){
    const el=$('toast');
    if(!el)return;
    el.textContent=t;
    el.classList.add('show');
    clearTimeout(window.__tggToastTimer);
    window.__tggToastTimer=setTimeout(()=>el.classList.remove('show'),1800);
  }

  function load(){
    let found=false;
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const x=JSON.parse(raw);
        if(x&&typeof x==='object'){
          state={...state,...x};
          found=true;
        }
      }
    }catch(e){}
    update();
    window.TGGProgression?.sync?.();
    return found;
  }

  function save(quiet=false){
    localStorage.setItem(KEY,JSON.stringify(state));
    if(!quiet)toast('GAME SAVED');
    window.TGGProgression?.sync?.();
    return state;
  }

  function spend(amount){
    amount=Math.max(0,Number(amount)||0);
    if(state.cash<amount){toast('NOT ENOUGH CASH');return false}
    state.cash-=amount;
    update();
    save();
    return true;
  }

  function activityReward(kind){
    const rewards={video:[120,35],photos:[80,25],premiere:[180,50],record:[100,30],mix:[90,28],release:[160,45],court:[60,20],fitness:[70,24],lobby:[40,12]};
    const r=rewards[kind]||[50,15];
    reward(r[0],r[1]);
    toast(kind.toUpperCase()+' COMPLETE • +$'+r[0]+' / +'+r[1]+' XP');
    window.TGGProgression?.sync?.();
    window.TGGCareer?.sync?.();
    window.TGGWorldSync?.sync?.();
  }

  function update(){
    $('hudName') && ($('hudName').textContent=state.name);
    $('hudLevel') && ($('hudLevel').textContent=state.level);
    $('hudCash') && ($('hudCash').textContent=state.cash);
    $('hudXp') && ($('hudXp').textContent=state.xp);
    $('hudNext') && ($('hudNext').textContent=state.level*100);
    if($('player')){$('player').style.left=state.x+'%';$('player').style.top=state.y+'%';$('player').style.setProperty('--player-turn',Math.max(-18,Math.min(18,Math.cos((Number(state.heading)||0)*Math.PI/180)*18))+'deg')}
    window.TGGAvatar?.renderMini?.();
    $('missionStatus') && ($('missionStatus').textContent=state.accepted?'Mission active — finish the job.':'Find M and start a mission.');
    $('missionBtn') && ($('missionBtn').textContent=state.mission?(state.accepted?'COMPLETE MISSION':'TAKE MISSION'):'TALK TO M');
  }

  function addXp(n){
    state.xp+=Math.max(0,Number(n)||0);
    while(state.xp>=state.level*100){
      state.xp-=state.level*100;
      state.level++;
      toast('LEVEL UP — LEVEL '+state.level);
    }
    update();
    window.TGGProgression?.sync?.();
  }

  function reward(cash,xp){
    state.cash+=Math.max(0,Number(cash)||0);
    addXp(xp);
    save(true);
    return {cash:state.cash,xp:state.xp,level:state.level};
  }

  function move(dx,dy){
    if(activeScreen!=='game')return false;
    if(dx||dy)state.heading=Math.atan2(dy,dx)*180/Math.PI;
    state.x=Math.max(3,Math.min(94,state.x+dx));
    state.y=Math.max(8,Math.min(88,state.y+dy));
    update();
    if(state.accepted&&Math.abs(state.x-72)<5&&Math.abs(state.y-36)<6)toast('You found the mission spot — hit COMPLETE MISSION');
    return true;
  }

  function mission(){
    if(activeScreen!=='game')return false;
    if(!state.mission){
      state.mission='studio-run';
      state.accepted=false;
      toast('M has a job for you.');
    }else if(!state.accepted){
      state.accepted=true;
      toast('MISSION ACCEPTED — get to the marked spot');
    }else if(Math.abs(state.x-72)<10&&Math.abs(state.y-36)<10){
      reward(250,50);
      state.mission=null;
      state.accepted=false;
      save(true);
      toast('MISSION COMPLETE +$250 +50 XP');
    }else{
      toast('Move closer to M to finish the mission');
    }
    update();
    return true;
  }

  function resetForNewGame(){
    state={
      name:($('stageName')?.value.trim()||'PLAYER'),
      style:$('styleChoice')?.value||'Artist',
      x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false,autoMode:true,heading:0
    };
    update();
    save(true);
    return state;
  }

  function bindControls(){
    $('newGame')?.addEventListener('click',()=>show('creator'));
    $('continueGame')?.addEventListener('click',()=>{
      if(!load()){
        show('menu');
        toast('NO SAVE FOUND — CREATE A PLAYER');
        return;
      }
      show('game');
      toast('WELCOME BACK');
    });
    $('startGame')?.addEventListener('click',()=>{
      resetForNewGame();
      show('game');
      toast("CITY LOADED — LET'S GET IT");
    });
    $('avatarStart')?.addEventListener('click',()=>{
      resetForNewGame();
      window.TGGAvatar?.open?.();
    });
    $('missionBtn')?.addEventListener('click',mission);
    $('saveBtn')?.addEventListener('click',()=>save(false));
    $('pauseBtn')?.addEventListener('click',()=>show('pause'));
    $('resumeBtn')?.addEventListener('click',()=>show('game'));
    $('menuBtn')?.addEventListener('click',()=>show('menu'));
    $('progressionBtn')?.addEventListener('click',()=>{window.TGGProgression?.sync?.();show('progressionBoard')});
    $('progressionBack')?.addEventListener('click',()=>show('game'));

    $('characterBtn')?.addEventListener('click',()=>window.TGGAvatar?.open?.());
    $('parkBtn')?.addEventListener('click',()=>show('park'));
    $('studioBtn')?.addEventListener('click',()=>show('studio'));
    $('shopsBtn')?.addEventListener('click',()=>show('shops'));
    $('homeBtn')?.addEventListener('click',()=>show('home'));
    $('mediaBtn')?.addEventListener('click',()=>show('media'));
    $('businessBtn')?.addEventListener('click',()=>window.TGGBusiness?.open?.());
    $('cityAssetsBtn')?.addEventListener('click',()=>{window.TGGBusiness?.open?.();window.TGGBusiness?.loadAssets?.()});

    $('mediaBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-media]').forEach(b=>b.addEventListener('click',()=>activityReward(b.dataset.media)));
    $('homeBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.home;
      if(a==='wardrobe'){window.TGGAvatar?.open?.();return}
      if(a==='save'){save();return}
      if(a==='career'){show('career')}
    }));
    $('shopsBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-shop]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.shop;
      if(a==='clothes'){window.TGGAvatar?.open?.();return}
      if(a==='shoes'){window.TGGAvatar?.open?.();toast('SOLE HOUSE — SHOES READY');return}
      if(a==='barber'){window.TGGAvatar?.open?.();toast('THE BARBER — HAIR CUSTOMIZATION');return}
      if(a==='jewelry'){window.TGGAvatar?.open?.();toast('ICE BOX — CHAIN CUSTOMIZATION')}
    }));
    $('studioBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-studio]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.studio;
      if(a==='record')activityReward('record');
      if(a==='mix')activityReward('mix');
      if(a==='release')activityReward('release');
    }));
    $('parkBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-park]').forEach(b=>b.addEventListener('click',()=>activityReward(b.dataset.park)));

    document.addEventListener('keydown',e=>{
      if(activeScreen!=='game')return;
      const t=e.target;
      const typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
      if(typing)return;
      const k=e.key.length===1?e.key.toLowerCase():e.key;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){
        e.preventDefault();
        move(k==='a'||k==='ArrowLeft'?-2:k==='d'||k==='ArrowRight'?2:0,k==='w'||k==='ArrowUp'?-2:k==='s'||k==='ArrowDown'?2:0);
      }
    });
    document.querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>{
      if(activeScreen!=='game')return;
      const k=b.dataset.key;
      move(k==='ArrowLeft'?-2:k==='ArrowRight'?2:0,k==='ArrowUp'?-2:k==='ArrowDown'?2:0);
    }));
  }

  window.__tggToast=toast;
  window.TGGAutoMode={enabled:()=>true,toggle:()=>true};
  window.TGGGame={getState:()=>state,getActiveScreen:()=>activeScreen,show,refresh:update,reward,spend,save,load,move,mission,resetForNewGame};

  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindControls,{once:true});
  else bindControls();
})();