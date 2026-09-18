(() => {
  const KEY='tgg-crew-campaign-v1';
  const moves={
    record:{label:'RECORD THE SINGLE',base:32,member:'kane'},
    visual:{label:'SHOOT THE VISUAL',base:32,member:'lens'},
    promo:{label:'PUSH THE ROLLOUT',base:32,member:'nova'}
  };
  let state={started:false,score:0,actions:[],completed:false,rewardClaimed:false,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s);if(!Array.isArray(state.actions))state.actions=[]}catch{}return state}
  function reset(){Object.assign(state,{started:false,score:0,actions:[],completed:false,rewardClaimed:false,updatedAt:0});save();render();return state}
  function ready(){return window.TGGCrew?.campaignReady?.()===true}
  function start(){
    if(state.completed)return false;
    if(!ready()){notify('BUILD THE FULL CREW FIRST');return false}
    state.started=true;state.score=0;state.actions=[];state.completed=false;state.rewardClaimed=false;save();render();window.TGGGame?.show?.('crewMissionBoard');notify('CAMPAIGN STARTED — TEAM LOCKED IN');return true;
  }
  function points(id){const m=moves[id];if(!m)return 0;return m.base+(window.TGGCrew?.has?.(m.member)?12:0)}
  function act(id){
    if(!state.started||state.completed||!moves[id])return false;
    if(state.actions.includes(id)){notify('CAMPAIGN STEP ALREADY COMPLETE');return false}
    const p=points(id);state.actions.push(id);state.score+=p;
    if(state.actions.length===3){
      state.completed=true;state.started=false;
      if(!state.rewardClaimed){
        const reward={cash:1200,xp:220,rep:180};
        const applied=window.TGGEconomy?.apply?.(reward)||reward;
        state.rewardClaimed=true;notify('CAMPAIGN COMPLETE — SCORE '+state.score+' • +$'+applied.cash);
      }
    }else notify(moves[id].label+' • +'+p+' TEAM SCORE');
    save();render();return true;
  }
  function render(){
    const score=document.getElementById('crewCampaignScore'),status=document.getElementById('crewCampaignStatus');
    if(score)score.textContent=String(state.score);
    if(status)status.textContent=state.completed?'CAMPAIGN COMPLETE • TEAM SCORE '+state.score:(state.started?'STEP '+(state.actions.length+1)+'/3 • EXECUTE THE PLAN':'Mission 06 will bring the crew here.');
    document.querySelectorAll('[data-crew-campaign]').forEach(b=>b.disabled=!state.started||state.completed||state.actions.includes(b.dataset.crewCampaign));
    const back=document.getElementById('crewCampaignBack');if(back)back.disabled=state.started&&!state.completed;
    return state;
  }
  document.querySelectorAll('[data-crew-campaign]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.crewCampaign)));
  document.getElementById('crewCampaignBack')?.addEventListener('click',()=>{if(state.started&&!state.completed){notify('FINISH THE CAMPAIGN FIRST');return}window.TGGGame?.show?.('contentBoard')});
  load();window.TGGCrewCampaign={state,moves,load,save,reset,ready,start,act,points,render};render();
})();