(() => {
  const KEY='tgg-battle-v1';
  const moves={
    setup:{label:'SET THE TONE',base:28},
    punchline:{label:'LAND THE PUNCHLINE',base:38},
    rebuttal:{label:'FLIP THE REBUTTAL',base:42}
  };
  let state={started:false,rival:'Rico Blaze',style:null,score:0,rivalScore:82,moves:[],completed:false,won:false,rewardClaimed:false,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s);if(!Array.isArray(state.moves))state.moves=[]}catch{}return state}
  function reset(){Object.assign(state,{started:false,rival:'Rico Blaze',style:null,score:0,rivalScore:82,moves:[],completed:false,won:false,rewardClaimed:false,updatedAt:0});save();render();return state}
  function start(style='bars'){
    if(state.completed)return false;
    state.started=true;state.style=style;state.score=0;state.moves=[];state.completed=false;state.won=false;state.rewardClaimed=false;
    save();render();window.TGGGame?.show?.('battleBoard');notify('RIVAL BATTLE STARTED — '+state.rival.toUpperCase());return true;
  }
  function points(id){
    let p=moves[id]?.base||0;
    if(state.style==='bars'&&id==='punchline')p+=7;
    if(state.style==='crowd'&&id==='rebuttal')p+=7;
    return p;
  }
  function act(id){
    if(!state.started||state.completed||!moves[id])return false;
    if(state.moves.includes(id)){notify('ROUND ALREADY USED');return false}
    const p=points(id);state.moves.push(id);state.score=Math.min(120,state.score+p);
    if(state.moves.length===3){
      state.completed=true;state.started=false;state.won=state.score>state.rivalScore;
      if(state.won&&!state.rewardClaimed){
        const reward={cash:1000,xp:175,rep:150};
        const applied=window.TGGEconomy?.apply?.(reward)||reward;
        state.rewardClaimed=true;
        notify('BATTLE WON — '+state.score+' TO '+state.rivalScore+' • +$'+applied.cash);
      }else if(!state.won){notify('BATTLE LOST — RUN IT BACK');}
    }else notify('ROUND +'+p+' • SCORE '+state.score);
    save();render();return true;
  }
  function render(){
    const s=document.getElementById('battleScore'), rs=document.getElementById('rivalScore'), st=document.getElementById('battleStatus');
    if(s)s.textContent=String(state.score); if(rs)rs.textContent=String(state.rivalScore);
    if(st)st.textContent=state.completed?(state.won?'YOU WON THE BATTLE':'RICO TOOK THIS ROUND'):(state.started?'ROUND '+(state.moves.length+1)+'/3 • CHOOSE YOUR MOVE':'Mission 05 will bring you here.');
    document.querySelectorAll('[data-battle-move]').forEach(b=>b.disabled=!state.started||state.completed||state.moves.includes(b.dataset.battleMove));
    const back=document.getElementById('battleBack'); if(back)back.disabled=state.started&&!state.completed;
    return state;
  }
  document.querySelectorAll('[data-battle-move]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.battleMove)));
  document.getElementById('battleBack')?.addEventListener('click',()=>{if(state.started&&!state.completed){notify('FINISH THE BATTLE FIRST');return}window.TGGGame?.show?.('contentBoard')});
  load();window.TGGBattle={state,moves,load,save,reset,start,act,render,points};render();
})();