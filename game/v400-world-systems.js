(()=>{
  const VERSION='V4.00 WORLD SYSTEMS';
  const KEY='tgg-world-v400';
  const PROPERTY=[
    {id:'apartment',name:'APARTMENT',baseCost:600,max:5,bonus:'energy'},
    {id:'studio',name:'PRIVATE STUDIO',baseCost:950,max:5,bonus:'focus'},
    {id:'garage',name:'GARAGE',baseCost:800,max:4,bonus:'vehicle'},
    {id:'office',name:'BUSINESS OFFICE',baseCost:1200,max:4,bonus:'income'}
  ];
  const CHAINS=[
    {id:'local-run',name:'LOCAL RUN',steps:['street-promo','studio-grind'],rep:8,cash:180},
    {id:'city-push',name:'CITY PUSH',steps:['street-promo','studio-grind','live-show'],rep:18,cash:420},
    {id:'boss-move',name:'BOSS MOVE',steps:['business-move','live-show'],rep:24,cash:650}
  ];
  const defaults={
    day:1,cityRep:0,consequence:0,lastDayAt:Date.now(),
    properties:{apartment:1,studio:0,garage:0,office:0},
    propertyUses:{apartment:0,studio:0,garage:0,office:0},
    chainProgress:{},completedChains:[],careerScore:0,lastConsequence:null
  };
  let state=load();

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...defaults,...saved,properties:{...defaults.properties,...(saved.properties||{})},propertyUses:{...defaults.propertyUses,...(saved.propertyUses||{})},chainProgress:{...(saved.chainProgress||{})},completedChains:Array.isArray(saved.completedChains)?saved.completedChains:[]};
    }catch{return JSON.parse(JSON.stringify(defaults))}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function game(){return window.TGGGame?.getState?.()||{cash:0,level:1}}
  function life(){return window.TGGLifeSim?.getStatus?.()||{energy:100,focus:100,social:50,momentum:0,relationships:{}}}
  function opp(){return window.TGGOpportunityLoop?.getStatus?.()||{}}

  function propertyCost(id){
    const def=PROPERTY.find(x=>x.id===id); if(!def)return Infinity;
    const lvl=Number(state.properties[id])||0;
    return Math.round(def.baseCost*Math.pow(1.65,lvl));
  }
  function propertyBonus(){
    const p=state.properties;
    return {
      energy:(p.apartment||0)*3,
      focus:(p.studio||0)*4,
      vehicle:(p.garage||0)*.05,
      income:(p.office||0)*.04
    };
  }
  function buyOrUpgrade(id){
    const def=PROPERTY.find(x=>x.id===id); if(!def)return false;
    const lvl=Number(state.properties[id])||0;
    if(lvl>=def.max)return false;
    const cost=propertyCost(id);
    if(!window.TGGGame?.spend?.(cost))return false;
    state.properties[id]=lvl+1;
    state.cityRep=clamp(state.cityRep+4,0,999);
    state.careerScore+=8+(lvl*2);
    window.TGGLifeSim?.change?.({momentum:3,focus:def.bonus==='focus'?4:0,energy:def.bonus==='energy'?5:0});
    window.TGGGameFeel?.objective?.('PROPERTY UPGRADED',def.name+' LEVEL '+state.properties[id]);
    save();render();return true;
  }

  function useProperty(id){
    const lvl=Number(state.properties[id])||0;
    if(lvl<=0)return {ok:false,status:'locked',id};
    state.propertyUses[id]=(Number(state.propertyUses[id])||0)+1;
    const scale=1+Math.max(0,lvl-1)*.2;
    if(id==='apartment'){
      window.TGGLifeSim?.change?.({energy:Math.round(10*scale),focus:Math.round(4*scale),social:2});
      coolConsequence(Math.max(2,lvl));
      window.TGGGameFeel?.objective?.('APARTMENT RESET','ENERGY + FOCUS RESTORED');
    }else if(id==='studio'){
      window.TGGLifeSim?.change?.({focus:Math.round(12*scale),energy:-2,momentum:Math.round(5*scale)});
      state.cityRep=clamp(state.cityRep+1+lvl*.35,0,999);
      window.TGGGameFeel?.objective?.('PRIVATE STUDIO SESSION','FOCUS + MOMENTUM BOOST');
    }else if(id==='garage'){
      window.TGGLifeSim?.change?.({focus:2,momentum:2});
      coolConsequence(1);
      window.TGGGameFeel?.objective?.('GARAGE TUNE','VEHICLE PREP BONUS ACTIVE');
    }else if(id==='office'){
      const payout=Math.round(35*lvl*(1+propertyBonus().income));
      window.TGGGame?.reward?.(payout,Math.max(2,lvl));
      state.cityRep=clamp(state.cityRep+lvl*.5,0,999);
      window.TGGGameFeel?.objective?.('OFFICE BUSINESS MOVE','+    const r=life().relationships||{};
    return Object.values(r).reduce((a,b)=>a+(Number(b)||0),0);
  }
  function reputationTier(){
    const v=state.cityRep;
    return v>=180?'CITY ICON':v>=120?'HEADLINER':v>=70?'CITY KNOWN':v>=30?'LOCAL NAME':'NEW FACE';
  }
  function applyConsequence(reason,severity=1){
    severity=Math.max(1,Math.min(3,Number(severity)||1));
    state.consequence=clamp(state.consequence+severity*6,0,100);
    state.lastConsequence={reason:String(reason||'career choice'),severity,at:Date.now()};
    window.TGGLifeSim?.change?.({momentum:-severity*3,social:-severity*2});
    window.TGGLivingCity?.nudgeHeat?.(severity*2);
    save();render();return state.lastConsequence;
  }
  function coolConsequence(amount=2){
    state.consequence=clamp(state.consequence-amount,0,100);save();render();return state.consequence;
  }

  function activeChain(){
    const ids=CHAINS.map(x=>x.id);
    const eligible=CHAINS.filter(c=>!state.completedChains.includes(c.id));
    if(!eligible.length)return CHAINS[CHAINS.length-1];
    if(state.cityRep>=80&&eligible.find(x=>x.id==='boss-move'))return eligible.find(x=>x.id==='boss-move');
    if(state.cityRep>=35&&eligible.find(x=>x.id==='city-push'))return eligible.find(x=>x.id==='city-push');
    return eligible.find(x=>x.id==='local-run')||eligible[0]||CHAINS[0];
  }
  function onOpportunityComplete(id){
    const chain=activeChain(); if(!chain)return;
    const idx=Number(state.chainProgress[chain.id])||0;
    if(chain.steps[idx]!==id)return;
    state.chainProgress[chain.id]=idx+1;
    state.cityRep=clamp(state.cityRep+5,0,999);
    state.careerScore+=10;
    if(state.chainProgress[chain.id]>=chain.steps.length){
      if(!state.completedChains.includes(chain.id))state.completedChains.push(chain.id);
      const bonus=propertyBonus();
      const cash=Math.round(chain.cash*(1+bonus.income));
      window.TGGGame?.reward?.(cash,Math.round(chain.rep*2));
      window.TGGCareer?.addRep?.(chain.rep);
      state.cityRep=clamp(state.cityRep+chain.rep,0,999);
      state.careerScore+=chain.rep*2;
      window.TGGGameFeel?.objective?.('CHAIN COMPLETE',chain.name+' • $'+cash+' BONUS');
    }else{
      window.TGGGameFeel?.objective?.('CHAIN ADVANCED',chain.name+' • '+state.chainProgress[chain.id]+'/'+chain.steps.length);
    }
    save();render();
  }

  function tickDay(){
    const now=Date.now();
    if(now-state.lastDayAt<20*60*1000)return false;
    const days=Math.max(1,Math.floor((now-state.lastDayAt)/(20*60*1000)));
    state.day+=days;
    state.lastDayAt=now;
    const bonus=propertyBonus();
    if(bonus.energy||bonus.focus)window.TGGLifeSim?.change?.({energy:bonus.energy,focus:bonus.focus});
    coolConsequence(days*3);
    if((life().momentum||0)<10)applyConsequence('lost momentum',1);
    save();render();return true;
  }

  function eligibleMove(move){
    const rel=relationScore(),rep=state.cityRep,l=life();
    if(move==='industry-meeting')return rel>=20&&rep>=25&&l.focus>=25;
    if(move==='headline-slot')return rep>=70&&l.energy>=35&&l.momentum>=30;
    if(move==='property-deal')return rep>=40&&Number(game().cash||0)>=800;
    return true;
  }

  function ensurePanel(){
    let el=document.getElementById('v400WorldSystems'); if(el)return el;
    el=document.createElement('section'); el.id='v400WorldSystems';
    el.innerHTML='<small>V4.00 WORLD SYSTEMS</small><div class="v400-grid"><b id="v400Rep">NEW FACE • REP 0</b><b id="v400Day">DAY 1</b><b id="v400Career">CAREER 0</b><b id="v400Heat">CONSEQUENCE 0</b></div><div id="v400Chain"></div><div id="v400Properties"></div>';
    document.body.appendChild(el); return el;
  }
  function render(){
    ensurePanel();
    const chain=activeChain(),progress=Number(state.chainProgress[chain.id])||0;
    document.getElementById('v400Rep').textContent=reputationTier()+' • REP '+Math.round(state.cityRep);
    document.getElementById('v400Day').textContent='DAY '+state.day;
    document.getElementById('v400Career').textContent='CAREER '+Math.round(state.careerScore);
    document.getElementById('v400Heat').textContent='CONSEQUENCE '+Math.round(state.consequence);
    document.getElementById('v400Chain').innerHTML='<span>'+chain.name+'</span><i>'+progress+'/'+chain.steps.length+' • NEXT '+(chain.steps[progress]||'COMPLETE').replaceAll('-',' ').toUpperCase()+'</i>';
    const root=document.getElementById('v400Properties');
    root.innerHTML=PROPERTY.map(p=>{
      const lvl=Number(state.properties[p.id])||0;
      const max=lvl>=p.max;
      return '<button data-v400-property="'+p.id+'" '+(max?'disabled':'')+'><span>'+p.name+'</span><b>LVL '+lvl+'/'+p.max+'</b><i>'+(max?'MAX':'$'+propertyCost(p.id))+'</i></button>';
    }).join('');
    root.querySelectorAll('[data-v400-property]').forEach(b=>b.onclick=()=>buyOrUpgrade(b.dataset.v400Property));
  }

  function hookOpportunity(){
    let seen=0;
    setInterval(()=>{
      tickDay();
      const st=window.TGGOpportunityLoop?.getStatus?.();
      const done=Number(st?.completed)||0;
      if(done>seen){
        const active=st?.active?.id;
        const historyKey='tgg-opportunities-v390';
        try{
          const raw=JSON.parse(localStorage.getItem(historyKey)||'{}');
          const last=raw.completed?.[raw.completed.length-1]?.id;
          if(last)onOpportunityComplete(last);
        }catch{}
        seen=done;
      }
    },1200);
  }

  function getStatus(){
    return {version:VERSION,...state,reputationTier:reputationTier(),relationScore:relationScore(),propertyBonus:propertyBonus(),activeChain:activeChain(),features:[
      'property-ownership-upgrades','city-reputation-system','career-consequence-system','mission-chain-progression',
      'relationship-gated-moves','daily-world-progression','property-bonus-loop','career-score-system','physical-property-use-loop'
    ]};
  }
  function boot(){
    ensurePanel();render();hookOpportunity();
    document.documentElement.dataset.tggV400='on';
    window.TGGWorldSystems={version:VERSION,getStatus,buyOrUpgrade,useProperty,applyConsequence,coolConsequence,onOpportunityComplete,eligibleMove,reputationTier,propertyBonus};
    window.dispatchEvent(new CustomEvent('tgg:v400-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
