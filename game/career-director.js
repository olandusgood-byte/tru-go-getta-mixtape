(() => {
  const KEY='tgg-career-director-v1';
  const $=id=>document.getElementById(id);
  const defaults=()=>({
    fans:0,buzz:0,streak:0,completedContracts:0,
    rank:'STREET START',
    activeContract:null,
    history:[],
    lastOpportunityAt:0,
    updatedAt:0
  });
  const ranks=[
    {fans:7500,name:'CITY STAR'},
    {fans:3000,name:'HEADLINER'},
    {fans:1000,name:'CITY KNOWN'},
    {fans:250,name:'LOCAL BUZZ'},
    {fans:0,name:'STREET START'}
  ];
  const contracts={
    manager:{title:'MANAGER MOVE',detail:'Complete a city job for M.',metric:'jobs',target:1,reward:{cash:300,xp:65,rep:18,fans:90,buzz:12},go:'jobs'},
    dj:{title:'CLUB ROTATION',detail:'Finish a live show and move the crowd.',metric:'shows',target:1,reward:{cash:420,xp:80,rep:25,fans:150,buzz:18},go:'show'},
    producer:{title:'LOCK IN SESSION',detail:'Record a new track with the producer connection.',metric:'recordings',target:1,reward:{cash:350,xp:70,rep:30,fans:110,buzz:14},go:'studio'},
    director:{title:'CAMPAIGN READY',detail:'Release a mixtape to unlock the full visual campaign.',metric:'mixtapes',target:1,reward:{cash:700,xp:120,rep:45,fans:300,buzz:28},go:'career'}
  };
  let state=defaults();

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
      if(!Array.isArray(state.history))state.history=[];
    }catch(e){state=defaults();}
    updateRank();
    return state;
  }
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function notify(text){window.__tggToast?window.__tggToast(text):console.log(text)}
  function snapshot(){
    const career=window.TGGCareer?.career||{};
    const life=window.TGGWorldLife?.getState?.()||{};
    const content=window.TGGContent?.state||{};
    return {
      recordings:Number(career.recordings)||0,
      mixtapes:Number(career.mixtapes)||0,
      jobs:Array.isArray(content.completed)?content.completed.length:0,
      shows:Number(life.shows)||0,
      battleWins:Number(life.battleWins)||0,
      training:Number(life.training)||0
    };
  }
  function updateRank(){
    const next=ranks.find(x=>state.fans>=x.fans)||ranks[ranks.length-1];
    state.rank=next.name;
  }
  function metricValue(metric){return Number(snapshot()[metric])||0}

  function captureOpportunity(){
    if(state.activeContract)return false;
    const life=window.TGGWorldLife?.getState?.();
    const opp=life?.activeOpportunity;
    if(!opp||!opp.contactId||!contracts[opp.contactId])return false;
    const stamp=Number(opp.createdAt)||0;
    if(stamp&&stamp<=Number(state.lastOpportunityAt||0))return false;
    const template=contracts[opp.contactId];
    state.activeContract={
      id:opp.contactId+'-'+(stamp||Date.now()),
      contactId:opp.contactId,
      title:template.title,
      detail:template.detail,
      metric:template.metric,
      baseline:metricValue(template.metric),
      target:template.target,
      reward:{...template.reward},
      go:template.go,
      startedAt:stamp||Date.now()
    };
    state.lastOpportunityAt=stamp||Date.now();
    save();render();
    notify('CAREER CONTRACT ACTIVE — '+template.title);
    return true;
  }

  function completeContract(){
    const c=state.activeContract;if(!c)return false;
    const current=metricValue(c.metric);
    if(current<c.baseline+c.target)return false;
    const r=c.reward||{};
    window.TGGGame?.reward?.(r.cash||0,r.xp||0);
    window.TGGCareer?.addRep?.(r.rep||0);
    state.fans+=Number(r.fans)||0;
    state.buzz=Math.min(100,Math.max(0,state.buzz+(Number(r.buzz)||0)));
    state.streak++;
    state.completedContracts++;
    state.history.unshift({title:c.title,completedAt:Date.now(),reward:{...r}});
    state.history=state.history.slice(0,8);
    state.activeContract=null;
    updateRank();save();
    window.TGGWorldLife?.clearOpportunity?.();
    window.TGGProgression?.sync?.();
    render();
    notify('CONTRACT COMPLETE — +'+(r.fans||0)+' FANS • +'+(r.buzz||0)+' BUZZ');
    return true;
  }

  function recommendation(){
    if(state.activeContract)return {
      title:state.activeContract.title,
      detail:state.activeContract.detail,
      go:state.activeContract.go
    };
    const m=snapshot(),life=window.TGGWorldLife?.getState?.()||{};
    if(m.recordings<1)return {title:'CUT YOUR FIRST RECORD',detail:'Hit Recording Studio and record a track.',go:'studio'};
    if(m.battleWins<1)return {title:'WIN THE ROOM',detail:'Take a rap battle and build your name.',go:'battle'};
    if(m.shows<1)return {title:'TOUCH THE STAGE',detail:'Run a live show and move the crowd.',go:'show'};
    if(m.jobs<1)return {title:'WORK THE CITY',detail:'Complete a city job to build cash and rep.',go:'jobs'};
    if(m.recordings<3)return {title:'BUILD THE CATALOG',detail:'Record enough tracks to prepare a mixtape.',go:'studio'};
    if(m.mixtapes<1)return {title:'DROP THE TAPE',detail:'Release your first mixtape from Career HQ.',go:'career'};
    if((life.training||0)<3)return {title:'LEVEL UP YOUR GAME',detail:'Train stamina, focus or stage presence.',go:'gym'};
    return {title:'CALL THE NETWORK',detail:'Use your phone contacts to open the next contract.',go:'phone'};
  }

  function go(target){
    if(target==='battle'||target==='show'||target==='phone'||target==='gym'){
      window.TGGWorldLife?.setTab?.(target);
      window.TGGGame?.show?.('worldLifeBoard');
      return true;
    }
    if(target==='jobs'){window.TGGGame?.show?.('contentBoard');return true}
    if(target==='studio'){window.TGGGame?.show?.('studio');return true}
    if(target==='career'){window.TGGGame?.show?.('career');return true}
    return false;
  }

  function decayBuzz(){
    const last=Number(state.updatedAt)||Date.now();
    const hours=(Date.now()-last)/3600000;
    if(hours>=12){
      state.buzz=Math.max(0,state.buzz-Math.floor(hours/12)*2);
      save();
    }
  }

  function render(){
    updateRank();
    const stats=$('careerDirectorStats');
    if(stats)stats.innerHTML=
      '<span><b>'+state.rank+'</b><small>CAREER RANK</small></span>'+
      '<span><b>'+state.fans.toLocaleString()+'</b><small>FANS</small></span>'+
      '<span><b>'+state.buzz+'</b><small>BUZZ</small></span>'+
      '<span><b>'+state.streak+'</b><small>STREAK</small></span>';

    const contract=$('careerContract');
    if(contract){
      const c=state.activeContract;
      if(c){
        const now=metricValue(c.metric)-c.baseline;
        contract.innerHTML='<small>ACTIVE CONTRACT</small><b>'+c.title+'</b><span>'+c.detail+'</span>'+
          '<div class="career-progress"><i style="width:'+Math.min(100,(now/c.target)*100)+'%"></i></div>'+
          '<em>'+Math.min(now,c.target)+' / '+c.target+'</em>';
      }else{
        contract.innerHTML='<small>ACTIVE CONTRACT</small><b>NO CONTRACT</b><span>Call a contact in World Life → Phone to open a career move.</span>';
      }
    }
    const next=recommendation();
    const nextBox=$('careerNextMove');
    if(nextBox)nextBox.innerHTML='<small>SMART NEXT MOVE</small><b>'+next.title+'</b><span>'+next.detail+'</span>';
    const goBtn=$('careerDirectorGo');
    if(goBtn){goBtn.dataset.go=next.go;goBtn.textContent=state.activeContract?'WORK CONTRACT':'DO NEXT MOVE'}
    const history=$('careerDirectorHistory');
    if(history)history.innerHTML=state.history.length
      ?state.history.slice(0,4).map(x=>'<span><b>'+x.title+'</b><small>+'+(x.reward?.fans||0)+' fans</small></span>').join('')
      :'<span><b>NO CONTRACTS COMPLETE YET</b><small>Your run starts now.</small></span>';
  }

  function tick(){
    captureOpportunity();
    completeContract();
    render();
  }
  function bind(){
    $('careerDirectorGo')?.addEventListener('click',e=>go(e.currentTarget.dataset.go||recommendation().go));
    decayBuzz();render();
    setInterval(tick,900);
  }

  window.TGGCareerDirector={
    getState:()=>JSON.parse(JSON.stringify(state)),
    snapshot,recommendation,go,captureOpportunity,completeContract,render
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();