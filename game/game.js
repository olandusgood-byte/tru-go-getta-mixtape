(() => {
  const KEY='tgg-game-v1';
  const $=id=>document.getElementById(id);
  let state={name:'PLAYER',style:'Artist',x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false};
  let activeScreen='menu';
  const screens=['menu','creator','game','pause'];

  function show(id){
    activeScreen=id;
    screens.forEach(s=>$(s).classList.toggle('active',s===id));
    $('hud').classList.toggle('hidden',id!=='game');
  }

  function toast(t){
    $('toast').textContent=t;
    $('toast').classList.add('show');
    clearTimeout(window.__t);
    window.__t=setTimeout(()=>$('toast').classList.remove('show'),1800);
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
    return found;
  }

  function save(quiet=false){
    localStorage.setItem(KEY,JSON.stringify(state));
    if(!quiet) toast('GAME SAVED');
  }

  function update(){
    $('hudName').textContent=state.name;
    $('hudLevel').textContent=state.level;
    $('hudCash').textContent=state.cash;
    $('hudXp').textContent=state.xp;
    $('hudNext').textContent=state.level*100;
    $('player').style.left=state.x+'%';
    $('player').style.top=state.y+'%';
    $('missionStatus').textContent=state.accepted?'Mission active — finish the job.':'Find M and start a mission.';
    $('missionBtn').textContent=state.mission?(state.accepted?'COMPLETE MISSION':'TAKE MISSION'):'TALK TO M';
  }

  function addXp(n){
    state.xp+=n;
    while(state.xp>=state.level*100){
      state.xp-=state.level*100;
      state.level++;
      toast('LEVEL UP — LEVEL '+state.level);
    }
    update();
  }

  function move(dx,dy){
    if(activeScreen!=='game') return;
    state.x=Math.max(3,Math.min(94,state.x+dx));
    state.y=Math.max(8,Math.min(88,state.y+dy));
    update();
    if(state.accepted && Math.abs(state.x-72)<5&&Math.abs(state.y-36)<6){
      toast('You found the mission spot — hit COMPLETE MISSION');
    }
  }

  function mission(){
    if(activeScreen!=='game') return;
    if(!state.mission){
      state.mission='studio-run';
      state.accepted=false;
      toast('M has a job for you.');
      update();
      return;
    }
    if(!state.accepted){
      state.accepted=true;
      toast('MISSION ACCEPTED — get to the marked spot');
      update();
      return;
    }
    if(Math.abs(state.x-72)<10&&Math.abs(state.y-36)<10){
      state.cash+=250;
      addXp(50);
      state.mission=null;
      state.accepted=false;
      update();
      save(true);
      toast('MISSION COMPLETE +$250 +50 XP');
    }else{
      toast('Move closer to M to finish the mission');
    }
  }

  $('newGame').onclick=()=>show('creator');
  $('continueGame').onclick=()=>{
    if(!load()){
      show('menu');
      toast('NO SAVE FOUND — CREATE A PLAYER');
      return;
    }
    show('game');
    toast('WELCOME BACK');
  };
  $('startGame').onclick=()=>{
    state={...state,name:($('stageName').value.trim()||'PLAYER'),style:$('styleChoice').value,x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false};
    update();
    save(true);
    show('game');
    toast('CITY LOADED — LET\'S GET IT');
  };
  $('missionBtn').onclick=mission;
  $('saveBtn').onclick=()=>save(false);
  $('pauseBtn').onclick=()=>show('pause');
  $('resumeBtn').onclick=()=>show('game');
  $('menuBtn').onclick=()=>show('menu');

  document.addEventListener('keydown',e=>{
    if(activeScreen!=='game') return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){
      e.preventDefault();
      const k=e.key.toLowerCase();
      move(k==='a'||k==='arrowleft'?-2:k==='d'||k==='arrowright'?2:0,k==='w'||k==='arrowup'?-2:k==='s'||k==='arrowdown'?2:0);
    }
  });

  document.querySelectorAll('[data-key]').forEach(b=>{
    b.onclick=()=>{
      if(activeScreen!=='game') return;
      const k=b.dataset.key;
      move(k==='ArrowLeft'?-2:k==='ArrowRight'?2:0,k==='ArrowUp'?-2:k==='ArrowDown'?2:0);
    };
  });

  load();
})();
