(() => {
  const CREWS=[
    {id:'block-crew',name:'BLOCK CREW',homeEvent:'downtown-cypher',members:[0,1]},
    {id:'ave-crew',name:'AVE CREW',homeEvent:'mixtape-popout',members:[2,3]},
    {id:'studio-crew',name:'STUDIO CREW',homeEvent:'studio-sidewalk',members:[4,5]}
  ];

  function rootState(){
    return window.TGGStreetEvents?.state||null;
  }

  function contactName(index){
    const contact=window.TGGStreetLife?.CONTACTS?.[Number(index)];
    return String(contact?.name||('Local '+(Number(index)+1)));
  }

  function memory(){
    const root=rootState();
    if(!root)return null;
    if(!root.audience||typeof root.audience!=='object'||Array.isArray(root.audience)){
      root.audience={people:{},crews:{},history:[],updatedAt:0,lastEvent:null};
    }
    const a=root.audience;
    if(!a.people||typeof a.people!=='object'||Array.isArray(a.people))a.people={};
    if(!a.crews||typeof a.crews!=='object'||Array.isArray(a.crews))a.crews={};
    if(!Array.isArray(a.history))a.history=[];
    CREWS.forEach(crew=>{
      if(!a.crews[crew.id]||typeof a.crews[crew.id]!=='object'){
        a.crews[crew.id]={appearances:0,homeAppearances:0,events:{},lastEvent:null,updatedAt:0};
      }
      if(!a.crews[crew.id].events||typeof a.crews[crew.id].events!=='object')a.crews[crew.id].events={};
    });
    return a;
  }

  function save(){
    const a=memory();
    if(a)a.updatedAt=Date.now();
    window.TGGStreetEvents?.save?.();
    return a;
  }

  function person(index){
    const a=memory();
    if(!a)return null;
    const id='ped-'+Number(index);
    if(!a.people[id]||typeof a.people[id]!=='object'){
      a.people[id]={
        id,
        index:Number(index),
        name:contactName(index),
        appearances:0,
        events:{},
        lastEvent:null,
        firstSeenAt:0,
        lastSeenAt:0
      };
    }
    if(!a.people[id].events||typeof a.people[id].events!=='object')a.people[id].events={};
    a.people[id].name=contactName(index);
    return a.people[id];
  }

  function personTier(value){
    const n=Math.max(0,Number(value)||0);
    return n>=10?'CORE SUPPORTER':n>=6?'SUPPORTER':n>=3?'REGULAR':n>=1?'RECOGNIZES YOU':'NEW FACE';
  }

  function crewDef(id){return CREWS.find(x=>x.id===id)||null}

  function crewForEvent(eventId){return CREWS.find(x=>x.homeEvent===eventId)||null}

  function crewBond(id){
    const crew=crewDef(id);
    const a=memory();
    if(!crew||!a)return 0;
    return crew.members.reduce((sum,index)=>{
      const p=a.people['ped-'+index];
      return sum+Math.max(0,Number(p?.events?.[crew.homeEvent])||0);
    },0);
  }

  function crewTier(id){
    const bond=crewBond(id);
    return bond>=12?'CORE CREW':bond>=6?'LOCKED IN':bond>=3?'OUTSIDE':'NEW CREW';
  }

  function crewSnapshot(id){
    const def=crewDef(id);
    const a=memory();
    if(!def||!a)return null;
    const state=a.crews[id]||{};
    return {
      id:def.id,
      name:def.name,
      homeEvent:def.homeEvent,
      members:def.members.map(index=>({
        index,
        name:contactName(index),
        appearances:Number(a.people['ped-'+index]?.appearances)||0,
        homeAppearances:Number(a.people['ped-'+index]?.events?.[def.homeEvent])||0,
        tier:personTier(a.people['ped-'+index]?.appearances)
      })),
      bond:crewBond(id),
      tier:crewTier(id),
      appearances:Number(state.appearances)||0,
      homeAppearances:Number(state.homeAppearances)||0
    };
  }

  function favoriteEvent(index){
    const p=person(index);
    const entries=Object.entries(p?.events||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
    return entries[0]?.[0]||null;
  }

  function audienceProfile(){
    const a=memory()||{people:{},history:[]};
    const people=Object.values(a.people||{});
    return {
      uniqueSeen:people.filter(p=>(Number(p.appearances)||0)>0).length,
      totalAppearances:people.reduce((sum,p)=>sum+(Number(p.appearances)||0),0),
      regulars:people.filter(p=>(Number(p.appearances)||0)>=3).length,
      supporters:people.filter(p=>(Number(p.appearances)||0)>=6).length,
      coreSupporters:people.filter(p=>(Number(p.appearances)||0)>=10).length,
      lastEvent:a.lastEvent||null,
      crews:CREWS.map(c=>crewSnapshot(c.id))
    };
  }

  function recordEvent(eventId,indices=[]){
    const a=memory();
    if(!a)return {ok:false,status:'street_events_unavailable'};
    const unique=[...new Set((indices||[]).map(Number).filter(Number.isFinite))];
    const now=Date.now();

    unique.forEach(index=>{
      const p=person(index);
      p.appearances=Math.max(0,Number(p.appearances)||0)+1;
      p.events[eventId]=Math.max(0,Number(p.events[eventId])||0)+1;
      p.lastEvent=eventId;
      if(!p.firstSeenAt)p.firstSeenAt=now;
      p.lastSeenAt=now;
    });

    CREWS.forEach(crew=>{
      const seen=unique.filter(index=>crew.members.includes(index));
      if(!seen.length)return;
      const s=a.crews[crew.id];
      s.appearances=Math.max(0,Number(s.appearances)||0)+seen.length;
      s.events[eventId]=Math.max(0,Number(s.events[eventId])||0)+seen.length;
      if(eventId===crew.homeEvent)s.homeAppearances=Math.max(0,Number(s.homeAppearances)||0)+seen.length;
      s.lastEvent=eventId;
      s.updatedAt=now;
    });

    a.lastEvent=eventId;
    a.history.push({eventId,indices:unique,at:now});
    if(a.history.length>60)a.history=a.history.slice(-60);
    save();
    window.TGGProgression?.sync?.();
    window.dispatchEvent(new CustomEvent('tgg:street-audience-update',{detail:audienceProfile()}));
    return {ok:true,status:'recorded',eventId,indices:unique,profile:audienceProfile()};
  }

  function rankCandidates(candidates=[],eventId){
    const a=memory();
    const home=crewForEvent(eventId);
    return [...candidates].sort((left,right)=>{
      const score=item=>{
        const p=a?.people?.['ped-'+item.index];
        const attendance=Math.max(0,Number(p?.events?.[eventId])||0);
        const isHome=home?.members?.includes(item.index)?1:0;
        return isHome*30+attendance*4-Math.min(20,Number(item.distance)||0);
      };
      return score(right)-score(left);
    });
  }

  function summaryLine(){
    const p=audienceProfile();
    const strongest=[...p.crews].sort((a,b)=>b.bond-a.bond)[0];
    const crewText=strongest&&strongest.bond>0?strongest.name+' '+strongest.tier:'NO CREW LOCKED';
    return 'AUDIENCE '+p.uniqueSeen+' • REGULARS '+p.regulars+' • '+crewText;
  }

  function render(){
    const host=document.querySelector('#streetSetHud [data-audience-summary]');
    if(host)host.textContent=summaryLine();
  }

  function onAudienceUpdate(){render()}

  memory();
  window.TGGStreetAudience={
    CREWS,memory,save,person,personTier,crewDef,crewForEvent,crewBond,crewTier,crewSnapshot,
    favoriteEvent,audienceProfile,recordEvent,rankCandidates,summaryLine,render
  };
  window.addEventListener('tgg:street-audience-update',onAudienceUpdate);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
  else render();
})();