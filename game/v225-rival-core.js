(() => {
  const VERSION='V2.25';
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  function createState(saved={}){
    return {
      rivalry:clamp(saved.rivalry??25),
      respect:clamp(saved.respect??10),
      alliance:clamp(saved.alliance??0),
      encounters:Math.max(0,Number(saved.encounters)||0),
      wins:Math.max(0,Number(saved.wins)||0),
      lastChoice:typeof saved.lastChoice==='string'?saved.lastChoice:null,
      route:typeof saved.route==='string'?saved.route:'UNDECIDED',
      history:Array.isArray(saved.history)?saved.history.slice(-24):[]
    };
  }
  function tier(s){
    const state=createState(s);
    if(state.alliance>=70&&state.respect>=70)return 'ALLIES';
    if(state.respect>=55&&state.rivalry<=55)return 'RESPECTED';
    if(state.rivalry>=55)return 'RIVALS';
    return 'WATCHING';
  }
  function routeFor(choice){
    return choice==='respect'?'RESPECT ROUTE':choice==='compete'?'RIVAL ROUTE':choice==='collab'?'COLLAB ROUTE':'UNDECIDED';
  }
  function canCollaborate(s,ctx={}){
    const state=createState(s);
    return state.respect>=70||state.alliance>=50||Number(ctx.crewStrength||0)>=67;
  }
  function applyChoice(s,choice,ctx={}){
    const next=createState(s);
    if(!['respect','compete','collab'].includes(choice))return null;
    if(choice==='collab'&&!canCollaborate(next,ctx))return null;
    let rewards={cash:0,xp:0,rep:0};
    if(choice==='respect'){
      next.rivalry=clamp(next.rivalry-9);
      next.respect=clamp(next.respect+14);
      next.alliance=clamp(next.alliance+4);
      rewards={cash:0,xp:12,rep:8};
    }else if(choice==='compete'){
      next.rivalry=clamp(next.rivalry+16);
      next.respect=clamp(next.respect+6);
      next.alliance=clamp(next.alliance-3);
      next.wins++;
      rewards={cash:60,xp:35,rep:4};
    }else{
      next.rivalry=clamp(next.rivalry-12);
      next.respect=clamp(next.respect+10);
      next.alliance=clamp(next.alliance+20);
      rewards={cash:140,xp:45,rep:12};
    }
    next.encounters++;
    next.lastChoice=choice;
    next.route=routeFor(choice);
    next.history=[...next.history,{
      choice,at:Date.now(),tierBefore:tier(s),tierAfter:tier(next),
      rivalry:next.rivalry,respect:next.respect,alliance:next.alliance
    }].slice(-24);
    return {...next,rewards};
  }
  globalThis.TGGV225Core={VERSION,createState,tier,routeFor,canCollaborate,applyChoice};
})();