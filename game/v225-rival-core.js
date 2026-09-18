(() => {
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const clone=s=>({
    rivalry:clamp(s?.rivalry??25),
    respect:clamp(s?.respect??10),
    chemistry:clamp(s?.chemistry??0),
    history:Array.isArray(s?.history)?s.history.map(x=>({...x})).slice(-20):[],
    lastChoice:s?.lastChoice||null,
    crewRepDelta:Number(s?.crewRepDelta)||0,
    cashDelta:Number(s?.cashDelta)||0,
    xpDelta:Number(s?.xpDelta)||0,
    repDelta:Number(s?.repDelta)||0
  });

  function createState(seed={}){
    return clone({
      rivalry:seed.rivalry??25,
      respect:seed.respect??10,
      chemistry:seed.chemistry??0,
      history:seed.history||[],
      lastChoice:seed.lastChoice||null
    });
  }

  function canCollaborate(state,ctx={}){
    const chemistry=clamp(ctx.crewChemistry??state?.chemistry??0);
    const respect=clamp(state?.respect??0);
    return chemistry>=60||respect>=75;
  }

  function relationshipTier(state={}){
    const rivalry=clamp(state.rivalry),respect=clamp(state.respect),chemistry=clamp(state.chemistry);
    if(chemistry>=60&&respect>=75&&rivalry<=25)return'ALLIES';
    if(rivalry>=65&&respect<=35)return'RIVALS';
    if(respect>=55&&rivalry<=45)return'RESPECTED';
    return'WATCHING';
  }

  function applyChoice(state,choice,ctx={}){
    const next=createState(state),key=String(choice||'').toLowerCase();
    next.crewRepDelta=0;next.cashDelta=0;next.xpDelta=0;next.repDelta=0;
    if(key==='respect'){
      next.rivalry=clamp(next.rivalry-12);
      next.respect=clamp(next.respect+14);
      next.chemistry=clamp(next.chemistry+4);
      next.repDelta=5;
    }else if(key==='compete'){
      next.rivalry=clamp(next.rivalry+16);
      next.respect=clamp(next.respect+5);
      next.crewRepDelta=12;
      next.xpDelta=18;
    }else if(key==='collab'){
      if(!canCollaborate(next,ctx))return next;
      next.rivalry=clamp(next.rivalry-10);
      next.respect=clamp(next.respect+18);
      next.chemistry=clamp(next.chemistry+16);
      next.cashDelta=80;
      next.repDelta=8;
    }else{
      return next;
    }
    next.lastChoice=key;
    next.history.push({choice:key,at:Date.now(),tier:relationshipTier(next)});
    next.history=next.history.slice(-20);
    return next;
  }

  const api={createState,canCollaborate,relationshipTier,applyChoice};
  globalThis.TGGV225Core=api;
  if(typeof window!=='undefined')window.TGGV225Core=api;
})();