(() => {
  const VERSION='V2.27';
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  const PERKS={
    studio:{id:'studio',name:'PRODUCER NETWORK',metric:'recordings',reward:{cash:0,xp:10,rep:5},detail:'Controlled Studio Row adds +10 XP and +5 REP to each new recording.'},
    downtown:{id:'downtown',name:'HOME COURT',metric:'battleWins',reward:{cash:50,xp:0,rep:6},detail:'Controlled Downtown adds +$50 and +6 REP to each battle win.'},
    mixtape:{id:'mixtape',name:'CROWD FAVORITE',metric:'shows',reward:{cash:75,xp:0,rep:5},detail:'Controlled Mixtape Ave adds +$75 and +5 REP to each completed show.'},
    media:{id:'media',name:'VISUAL PUSH',metric:'visuals',reward:{cash:0,xp:15,rep:10},detail:'Controlled Media District adds +15 XP and +10 REP to each new visual.'}
  };
  const defaults=()=>({
    version:VERSION,lastDay:1,fullTakeoverClaimed:false,
    totalPassiveIncome:0,totalBonusCash:0,totalBonusXp:0,totalBonusRep:0,
    perkTriggers:0,history:[],metrics:{recordings:0,battleWins:0,shows:0,visuals:0}
  });
  function createState(saved={}){
    const s={...defaults(),...(saved||{})};
    s.version=VERSION;
    s.lastDay=Math.max(1,Math.floor(Number(s.lastDay)||1));
    s.fullTakeoverClaimed=!!s.fullTakeoverClaimed;
    for(const k of ['totalPassiveIncome','totalBonusCash','totalBonusXp','totalBonusRep','perkTriggers']){
      s[k]=Math.max(0,Number(s[k])||0);
    }
    s.history=Array.isArray(s.history)?s.history.slice(-40):[];
    s.metrics={...defaults().metrics,...(s.metrics||{})};
    for(const k of Object.keys(s.metrics))s.metrics[k]=Math.max(0,Number(s.metrics[k])||0);
    return s;
  }
  function rows(influence){
    return Array.isArray(influence?.districts)?influence.districts:[];
  }
  function summary(influence){
    const ds=rows(influence);
    const controlled=ds.filter(d=>d.control==='TGG CONTROL');
    const rival=ds.filter(d=>d.control==='NIGHT SHIFT');
    const contested=ds.length-controlled.length-rival.length;
    const cityScore=clamp(influence?.cityScore||0);
    const rivalScore=clamp(influence?.rivalScore||0);
    const recognition=clamp(Math.round(cityScore+controlled.length*7-rival.length*4));
    return {
      controlled:controlled.map(d=>d.id),
      rival:rival.map(d=>d.id),
      contested,
      controlledCount:controlled.length,
      rivalCount:rival.length,
      cityScore,rivalScore,recognition,
      recognitionLabel:recognition>=85?'CITY ICON':recognition>=70?'HEADLINER':recognition>=55?'KNOWN NAME':recognition>=40?'LOCAL BUZZ':'ON THE COME UP',
      dailyIncome:controlled.length*65,
      pressure:clamp(rival.length*18+Math.max(0,rivalScore-cityScore))
    };
  }
  function perkStatus(influence){
    const sum=summary(influence);
    return Object.values(PERKS).map(p=>({...p,active:sum.controlled.includes(p.id)}));
  }
  function rewardAdd(a,b){
    return {cash:(a.cash||0)+(b.cash||0),xp:(a.xp||0)+(b.xp||0),rep:(a.rep||0)+(b.rep||0)};
  }
  function pushHistory(s,item){
    s.history=[...s.history,{...item,at:Date.now()}].slice(-40);
  }
  function processMetric(saved,influence,metric,count=1){
    const s=createState(saved);
    const perk=Object.values(PERKS).find(p=>p.metric===metric);
    const n=Math.max(0,Math.min(12,Math.floor(Number(count)||0)));
    let rewards={cash:0,xp:0,rep:0},triggers=0;
    if(perk&&n>0&&summary(influence).controlled.includes(perk.id)){
      for(let i=0;i<n;i++)rewards=rewardAdd(rewards,perk.reward);
      triggers=n;
      s.perkTriggers+=n;
      s.totalBonusCash+=rewards.cash;
      s.totalBonusXp+=rewards.xp;
      s.totalBonusRep+=rewards.rep;
      pushHistory(s,{type:'perk',district:perk.id,label:perk.name,count:n,rewards});
    }
    s.metrics[metric]=(Number(s.metrics[metric])||0)+n;
    return {...s,rewards,triggers,perk:perk?.id||null};
  }
  function processDay(saved,influence,day){
    const s=createState(saved);
    const target=Math.max(s.lastDay,Math.floor(Number(day)||s.lastDay));
    let rewards={cash:0,xp:0,rep:0},days=0;
    while(s.lastDay<target&&days<14){
      const sum=summary(influence);
      const cash=sum.dailyIncome;
      const rep=sum.controlledCount*2;
      s.lastDay++;
      days++;
      if(cash||rep){
        rewards=rewardAdd(rewards,{cash,xp:0,rep});
        s.totalPassiveIncome+=cash;
        s.totalBonusCash+=cash;
        s.totalBonusRep+=rep;
        pushHistory(s,{type:'income',label:'DAY '+s.lastDay+' TERRITORY INCOME',cash,rep,controlled:sum.controlledCount});
      }
    }
    return {...s,rewards,days};
  }
  function claimFullTakeover(saved,influence){
    const s=createState(saved),sum=summary(influence);
    if(s.fullTakeoverClaimed||sum.controlledCount<4)return {...s,claimed:false,rewards:{cash:0,xp:0,rep:0}};
    const rewards={cash:1500,xp:350,rep:75};
    s.fullTakeoverClaimed=true;
    s.totalBonusCash+=rewards.cash;s.totalBonusXp+=rewards.xp;s.totalBonusRep+=rewards.rep;
    pushHistory(s,{type:'takeover',label:'FULL CITY TAKEOVER',rewards});
    return {...s,claimed:true,rewards};
  }
  function snapshot(saved,influence){
    const s=createState(saved),sum=summary(influence);
    return {
      version:VERSION,...sum,
      fullTakeoverClaimed:s.fullTakeoverClaimed,
      totalPassiveIncome:s.totalPassiveIncome,
      totalBonusCash:s.totalBonusCash,totalBonusXp:s.totalBonusXp,totalBonusRep:s.totalBonusRep,
      perkTriggers:s.perkTriggers,
      perks:perkStatus(influence),
      history:s.history.slice(-12),
      metrics:{...s.metrics}
    };
  }
  globalThis.TGGV227Core={VERSION,PERKS,createState,summary,perkStatus,processMetric,processDay,claimFullTakeover,snapshot};
})();