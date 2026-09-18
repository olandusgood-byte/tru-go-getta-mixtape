(() => {
  const KEY='tgg-performance-v1';
  const basePoints={intro:30,crowd:35,closer:40};
  let state={started:false,route:null,score:0,actions:[],completed:false,rewardClaimed:false,updatedAt:0};

  const notify=text=>window.__tggToast?.(text);
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...state,...saved};
      if(!Array.isArray(state.actions))state.actions=[];
    }catch{}
    return state;
  }
  function reset(){
    state={started:false,route:null,score:0,actions:[],completed:false,rewardClaimed:false,updatedAt:0};
    save();
    render();
    return state;
  }
  function start(route){
    if(state.completed)return false;
    if(!['club','festival'].includes(route))return false;
    if(!window.TGGInventory?.has?.('headline-pass',1)){
      const story=window.TGGStoryMission04?.state;
      const validStoryHandoff=
        story?.accepted===true &&
        story?.choice===route &&
        story?.completed!==true &&
        story?.step==='performance';
      if(validStoryHandoff){
        window.TGGInventory?.mission04Pack?.();
        if(!window.TGGInventory?.has?.('headline-pass',1)){
          window.TGGInventory?.add?.('headline-pass',1);
        }
      }
      if(!window.TGGInventory?.has?.('headline-pass',1)){
        notify('NEED INVENTORY — HEADLINE PASS');
        return false;
      }
    }
    state.started=true;
    state.route=route;
    state.score=0;
    state.actions=[];
    state.completed=false;
    state.rewardClaimed=false;
    save();
    render();
    window.TGGGame?.show?.('showBoard');
    notify(route==='club'?'CLUB HEADLINE — LIGHTS UP':'FESTIVAL STAGE — CROWD READY');
    return true;
  }
  function pointsFor(id){
    let points=basePoints[id]||0;
    if(state.route==='club'&&id==='intro')points+=5;
    if(state.route==='festival'&&id==='crowd')points+=5;
    return points;
  }
  function act(id){
    if(!state.started||state.completed||!basePoints[id])return false;
    if(state.actions.includes(id)){notify('MOVE ALREADY USED');return false;}
    const points=pointsFor(id);
    state.actions.push(id);
    state.score=Math.min(105,state.score+points);
    if(state.actions.length===3&&state.score>=90){
      state.completed=true;
      state.started=false;
      if(!state.rewardClaimed){
        const base={cash:800,xp:150,rep:100};
        const applied=window.TGGEconomy?.apply?.(base)||base;
        state.rewardClaimed=true;
        window.TGGInventory?.remove?.('headline-pass',1);
        notify('HEADLINE COMPLETE — CROWD '+state.score+' • +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
      }
    }else{
      notify('CROWD +'+points+' • SCORE '+state.score);
    }
    save();
    render();
    return true;
  }
  function render(){
    const score=document.getElementById('showScore');
    const status=document.getElementById('showStatus');
    const bar=document.getElementById('showMeterFill');
    if(score)score.textContent=String(state.score);
    if(bar)bar.style.width=Math.min(100,state.score)+'%';
    if(status){
      status.textContent=state.completed
        ? 'SHOW COMPLETE • Return to Manager M.'
        : state.started
          ? (state.route==='club'?'CLUB HEADLINE':'FESTIVAL HEADLINE')+' • '+state.actions.length+'/3 moves used'
          : 'Mission 04 will bring you here for the headline set.';
    }
    document.querySelectorAll('[data-show-move]').forEach(btn=>{
      btn.disabled=!state.started||state.completed||state.actions.includes(btn.dataset.showMove);
    });
    const back=document.getElementById('showBack');
    if(back)back.disabled=state.started&&!state.completed;
    return state;
  }

  document.querySelectorAll('[data-show-move]').forEach(btn=>btn.addEventListener('click',()=>act(btn.dataset.showMove)));
  document.getElementById('showBack')?.addEventListener('click',()=>{
    if(state.started&&!state.completed){notify('FINISH THE SET FIRST');return;}
    window.TGGGame?.show?.('contentBoard');
  });

  load();
  window.TGGPerformance={state,load,save,reset,start,act,render,pointsFor};
  render();
})();