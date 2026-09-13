(() => {
  const KEY='tgg-game-v1'; const $=id=>document.getElementById(id);
  let state={name:'PLAYER',style:'Artist',x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false};
  const screens=['menu','creator','game','pause','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge'];
  function show(id){
    const target=screens.includes(id)?id:'menu';
    screens.forEach(s=>$(s)?.classList.toggle('active',s===target));
    $('hud')?.classList.toggle('hidden',!['game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge'].includes(target));
    window.TGGCareer?.render?.();window.TGGBridge?.render?.();window.TGGProgression?.render?.();window.TGGInventory?.render?.();window.TGGCrew?.render?.();window.TGGEvents?.render?.();
    return target;
  }
  function toast(t){const el=$('toast');if(!el)return;el.textContent=t;el.classList.add('show');clearTimeout(window.__tggToastTimer);window.__tggToastTimer=setTimeout(()=>el.classList.remove('show'),1800)}
  function load(){
    try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&typeof x==='object'&&!Array.isArray(x))state={...state,...x}}
    catch(e){console.warn('TGG save load repaired:',e);toast('SAVE DATA RESET TO SAFE DEFAULTS')}
    update();window.TGGProgression?.sync?.();window.TGGSave?.repair?.();
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(state));toast('GAME SAVED');window.TGGProgression?.sync?.();return true}
    catch(e){console.error('TGG save failed:',e);toast('SAVE FAILED — STORAGE UNAVAILABLE');return false}
  }
  function spend(amount){amount=Math.max(0,Number(amount)||0);if(state.cash<amount){toast('NOT ENOUGH CASH');return false}state.cash-=amount;update();save();return true}
  function update(){
    $('hudName')?.textContent=state.name;$('hudLevel')?.textContent=state.level;$('hudCash')?.textContent=state.cash;$('hudXp')?.textContent=state.xp;$('hudNext')?.textContent=state.level*100;
    if($('player')){$('player').style.left=state.x+'%';$('player').style.top=state.y+'%'}
    $('missionStatus')?.textContent=state.accepted?'Mission active — finish the job.':'Find M and start a mission.';
    $('missionBtn')?.textContent=state.mission?(state.accepted?'COMPLETE MISSION':'TAKE MISSION'):'TALK TO M';
    window.TGGQuality?.refresh?.();
  }
  function addXp(n){state.xp+=Math.max(0,Number(n)||0);while(state.xp>=state.level*100){state.xp-=state.level*100;state.level++;toast('LEVEL UP — LEVEL '+state.level)}update();window.TGGProgression?.sync?.()}
  function reward(cash,xp){state.cash+=Math.max(0,Number(cash)||0);addXp(xp);save()}
  function move(dx,dy){state.x=Math.max(3,Math.min(94,state.x+dx));state.y=Math.max(8,Math.min(88,state.y+dy));update();if(state.accepted&&Math.abs(state.x-72)<5&&Math.abs(state.y-36)<6)toast('You found the mission spot — hit COMPLETE MISSION')}
  function mission(){if(!state.mission){state.mission='studio-run';state.accepted=false;toast('M has a job for you.')}else if(!state.accepted){state.accepted=true;toast('MISSION ACCEPTED — get to the marked spot')}else if(Math.abs(state.x-72)<10&&Math.abs(state.y-36)<10){reward(250,50);state.mission=null;state.accepted=false;toast('MISSION COMPLETE +$250 +50 XP')}else toast('Move closer to M to finish the mission');update()}
  window.__tggToast=toast;
  window.TGGGame={getState:()=>state,show,refresh:update,reward,spend,save};
  window.TGGQuality=window.TGGQuality||{
    version:'1.5.0',
    refresh(){const el=$('hud');if(el)el.dataset.gameReady='true'},
    snapshot(){return {version:'1.5.0',saveKey:KEY,saveAvailable:typeof localStorage!=='undefined',level:state.level,cash:state.cash,xp:state.xp,activeMission:state.mission||null,missionAccepted:!!state.accepted,apis:['TGGGame','TGGCareer','TGGContent','TGGExpansion','TGGProgression','TGGInventory','TGGCrew','TGGEconomy','TGGEvents','TGGChains','TGGDistricts'].map(k=>({key:k,ready:!!window[k]}))}},
    saveNow(){return save()},
    syncAll(){
      try{window.TGGSave?.repair?.()}catch(e){console.warn('Save repair skipped:',e)}
      try{window.TGGProgression?.sync?.()}catch(e){}
      try{window.TGGProgression?.render?.()}catch(e){}
      try{window.TGGInventory?.render?.()}catch(e){}
      try{window.TGGCrew?.render?.()}catch(e){}
      try{window.TGGEvents?.render?.()}catch(e){}
      update();return this.snapshot();
    }
  };
  window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});
  window.addEventListener('pagehide',()=>save());
  window.addEventListener('error',e=>{console.error('TGG runtime error:',e.error||e.message);toast('GAME ERROR ISOLATED — KEEP GETTING IT')});
  window.addEventListener('unhandledrejection',e=>{console.error('TGG promise error:',e.reason);toast('GAME ERROR ISOLATED — KEEP GETTING IT')});
  $('newGame').onclick=()=>show('creator');$('continueGame').onclick=()=>{load();show('game');toast('WELCOME BACK')};$('startGame').onclick=()=>{state={...state,name:($('stageName').value.trim()||'PLAYER'),style:$('styleChoice').value,x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false};save();show('game');toast('CITY LOADED — LET\'S GET IT')};$('missionBtn').onclick=mission;$('saveBtn').onclick=save;$('pauseBtn').onclick=()=>show('pause');$('resumeBtn').onclick=()=>show('game');$('menuBtn').onclick=()=>show('menu');$('progressionBtn').onclick=()=>{window.TGGProgression?.sync?.();show('progressionBoard')};$('progressionBack').onclick=()=>show('game');
  document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();const k=e.key.toLowerCase();move(k==='a'||k==='arrowleft'?-2:k==='d'||k==='arrowright'?2:0,k==='w'||k==='arrowup'?-2:k==='s'||k==='arrowdown'?2:0)}});
  document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;move(k==='ArrowLeft'?-2:k==='ArrowRight'?2:0,k==='ArrowUp'?-2:k==='ArrowDown'?2:0)});
  load();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update()});
})();
