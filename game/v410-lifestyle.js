(()=>{
  const VERSION='V4.10 PROPERTY RELATIONSHIP LIFESTYLE MEGA';
  const KEY='tgg-lifestyle-v410';
  const defaults={
    bankedIncome:0,upkeepPaid:0,missedUpkeep:0,lastCycle:Date.now(),
    relationTiers:{},propertyVisits:{apartment:0,studio:0,garage:0,office:0},
    lifestyleScore:0
  };
  let state=load();
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}'),relationTiers:{...(JSON.parse(localStorage.getItem(KEY)||'{}').relationTiers||{})},propertyVisits:{...defaults.propertyVisits,...(JSON.parse(localStorage.getItem(KEY)||'{}').propertyVisits||{})}}}catch{return JSON.parse(JSON.stringify(defaults))}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function world(){return window.TGGWorldSystems?.getStatus?.()||{properties:{apartment:1,studio:0,garage:0,office:0},cityRep:0,consequence:0}}
  function life(){return window.TGGLifeSim?.getStatus?.()||{relationships:{},momentum:0,energy:100,focus:100}}
  function relationTier(score){
    score=Number(score)||0;
    return score>=75?'INNER CIRCLE':score>=50?'TRUSTED':score>=25?'CONNECTED':score>=10?'KNOWN':'NEW';
  }
  function syncRelations(){
    const rel=life().relationships||{};
    Object.entries(rel).forEach(([name,score])=>state.relationTiers[name]=relationTier(score));
    save();render();
  }
  function propertyIncome(){
    const p=world().properties||{};
    return Math.round((p.apartment||0)*10+(p.studio||0)*28+(p.garage||0)*20+(p.office||0)*65);
  }
  function propertyUpkeep(){
    const p=world().properties||{};
    return Math.round((p.apartment||0)*8+(p.studio||0)*18+(p.garage||0)*14+(p.office||0)*30);
  }
  function cycle(force=false){
    const now=Date.now(),span=15*60*1000;
    if(!force&&now-state.lastCycle<span)return false;
    const periods=Math.max(1,Math.floor((now-state.lastCycle)/span));
    state.lastCycle=now;
    for(let i=0;i<periods;i++){
      const income=propertyIncome(),upkeep=propertyUpkeep();
      state.bankedIncome+=income;
      if(window.TGGGame?.spend?.(upkeep)){state.upkeepPaid+=upkeep;state.lifestyleScore+=2}
      else{state.missedUpkeep++;state.lifestyleScore=Math.max(0,state.lifestyleScore-4);window.TGGWorldSystems?.applyConsequence?.('missed property upkeep',1)}
      if((life().momentum||0)>35)state.bankedIncome+=Math.round(income*.12);
    }
    save();render();return true;
  }
  function collectIncome(){
    const amount=Math.max(0,Math.round(state.bankedIncome));
    if(!amount)return false;
    window.TGGGame?.reward?.(amount,Math.max(1,Math.round(amount/20)));
    state.bankedIncome=0;state.lifestyleScore+=3;save();render();
    window.TGGGameFeel?.objective?.('PROPERTY INCOME','Collected $'+amount+' from your world assets.');
    return true;
  }
  function visit(id){
    if(!(id in state.propertyVisits))return false;
    state.propertyVisits[id]=(state.propertyVisits[id]||0)+1;
    const effects={
      apartment:{energy:8,focus:2,momentum:1},
      studio:{energy:-2,focus:7,momentum:3},
      garage:{energy:1,focus:2,momentum:1},
      office:{energy:-1,focus:5,momentum:4}
    };
    window.TGGLifeSim?.change?.(effects[id]||{});
    state.lifestyleScore+=1;save();render();return true;
  }
  function relationBonus(name){
    const score=Number(life().relationships?.[name])||0;
    const tier=relationTier(score);
    return {tier,discount:tier==='INNER CIRCLE'?.12:tier==='TRUSTED'?.08:tier==='CONNECTED'?.04:0,access:tier!=='NEW'};
  }
  function ensure(){
    let el=document.getElementById('v410Lifestyle');if(el)return el;
    el=document.createElement('aside');el.id='v410Lifestyle';
    el.innerHTML='<small>LIFESTYLE + ASSETS</small><div class="v410-stats"><b id="v410Income">BANKED $0</b><b id="v410Upkeep">UPKEEP $0</b><b id="v410Score">LIFESTYLE 0</b></div><button id="v410Collect">COLLECT PROPERTY INCOME</button><div id="v410Relations"></div>';
    document.body.appendChild(el);
    el.querySelector('#v410Collect')?.addEventListener('click',collectIncome);
    return el;
  }
  function render(){
    ensure();
    document.getElementById('v410Income').textContent='BANKED $'+Math.round(state.bankedIncome);
    document.getElementById('v410Upkeep').textContent='UPKEEP $'+propertyUpkeep()+' / CYCLE';
    document.getElementById('v410Score').textContent='LIFESTYLE '+Math.round(state.lifestyleScore);
    const root=document.getElementById('v410Relations');
    const rel=life().relationships||{};
    root.innerHTML=Object.entries(rel).slice(0,4).map(([name,score])=>'<span><b>'+name+'</b><i>'+relationTier(score)+' • '+Math.round(score)+'</i></span>').join('')||'<span><b>RELATIONSHIPS</b><i>BUILD YOUR NETWORK</i></span>';
    const collect=document.getElementById('v410Collect');if(collect)collect.disabled=state.bankedIncome<1;
  }
  function bindWorld(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const t=((b.id||'')+' '+(b.textContent||'')).toLowerCase();
      if(t.includes('apartment')||t.includes('home'))visit('apartment');
      else if(t.includes('studio'))visit('studio');
      else if(t.includes('garage'))visit('garage');
      else if(t.includes('business')||t.includes('career'))visit('office');
    },true);
  }
  function getStatus(){return {version:VERSION,...state,propertyIncome:propertyIncome(),propertyUpkeep:propertyUpkeep(),relationTiers:{...state.relationTiers},features:['property-passive-income','property-upkeep-loop','missed-upkeep-consequences','relationship-tiers','relationship-access-bonuses','property-visit-effects','lifestyle-score','momentum-income-bonus']}}
  function boot(){
    ensure();syncRelations();bindWorld();render();setInterval(()=>{cycle(false);syncRelations()},15000);
    document.documentElement.dataset.tggV410='on';
    window.TGGLifestyle={version:VERSION,getStatus,cycle,collectIncome,visit,relationBonus,syncRelations};
    window.dispatchEvent(new CustomEvent('tgg:v410-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();