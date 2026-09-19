(()=>{
  const VERSION='V3.60 LIVING CITY REACTIVE WORLD MEGA';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state={
    district:'DOWNTOWN',
    heat:0,
    crowdMood:'CALM',
    cityEvent:null,
    timeOfDay:'NIGHT',
    tick:0
  };
  const DISTRICTS=[
    {name:'STUDIO ROW',x:[0,42],y:[0,48],mood:'CREATIVE'},
    {name:'DOWNTOWN',x:[42,70],y:[20,72],mood:'BUSY'},
    {name:'MIXTAPE AVE',x:[55,100],y:[45,100],mood:'HYPE'},
    {name:'PARKSIDE',x:[0,55],y:[48,100],mood:'SOCIAL'}
  ];
  const EVENTS=[
    {id:'open-mic',label:'OPEN MIC FORMING',mood:'HYPE',minHeat:10},
    {id:'street-cypher',label:'STREET CYPHER',mood:'HYPE',minHeat:18},
    {id:'producer-pop-up',label:'PRODUCER POP-UP',mood:'CREATIVE',minHeat:6},
    {id:'block-party',label:'BLOCK PARTY',mood:'SOCIAL',minHeat:24}
  ];
  function districtFor(s){
    const x=Number(s?.x)||50,y=Number(s?.y)||55;
    return DISTRICTS.find(d=>x>=d.x[0]&&x<d.x[1]&&y>=d.y[0]&&y<d.y[1])||DISTRICTS[1];
  }
  function ensureHud(){
    let root=document.getElementById('v360CityHud');
    if(root)return root;
    root=document.createElement('aside');
    root.id='v360CityHud';
    root.innerHTML='<small>LIVING CITY</small><b id="v360District">DOWNTOWN</b><span id="v360Mood">CALM</span><i id="v360Event">CITY FLOW NORMAL</i>';
    document.body.appendChild(root);
    return root;
  }
  function setPrompt(text,active=true){
    let el=document.getElementById('v360Prompt');
    if(!el){
      el=document.createElement('div');el.id='v360Prompt';
      document.body.appendChild(el);
    }
    el.textContent=text||'';
    el.classList.toggle('show',!!active&&!!text);
  }
  function setEvent(next){
    state.cityEvent=next||null;
    const e=document.getElementById('v360Event');
    if(e)e.textContent=next?.label||'CITY FLOW NORMAL';
    if(next)window.TGGGameFeel?.objective?.(next.label,state.district+' is heating up.');
    return state.cityEvent;
  }
  function syncCrowdDensity(){
    const quality=document.documentElement.dataset.tggMasterQuality||'high';
    const base=quality==='performance'?'LOW':quality==='balanced'?'MEDIUM':'HIGH';
    const boosted=state.heat>26&&base==='LOW'?'MEDIUM':base;
    window.TGGStreetPresence?.setDensity?.(boosted);
  }
  function update(){
    const game=window.TGGGame?.getState?.();
    if(!game)return;
    const d=districtFor(game);
    if(d.name!==state.district){
      state.district=d.name;
      state.heat=clamp(state.heat+4,0,100);
      window.TGGGameFeel?.objective?.('ENTERED '+d.name,d.mood+' DISTRICT');
    }
    const speed=Math.abs(Number(window.TGG3D?.getVehicleDynamics?.()?.speed)||0);
    const walking=Number(window.TGG3D?.getPlayerDynamics?.()?.speed)||0;
    const storyActive=!!window.TGGStoryMissions?.getState?.()?.active;
    const activity=(speed>4?2:0)+(walking>2?1:0)+(storyActive?2:0);
    state.heat=clamp(state.heat+(activity?0.04*activity:-0.018),0,100);
    state.crowdMood=state.heat>32?'HYPE':state.heat>16?d.mood:'CALM';
    const hour=new Date().getHours();
    state.timeOfDay=hour>=6&&hour<12?'MORNING':hour>=12&&hour<18?'DAY':hour>=18&&hour<22?'EVENING':'NIGHT';
    state.tick++;

    if(!state.cityEvent&&state.tick%240===0){
      const candidates=EVENTS.filter(e=>state.heat>=e.minHeat);
      if(candidates.length)setEvent(candidates[Math.floor((state.tick/240)%candidates.length)]);
    }
    if(state.cityEvent&&state.tick%720===0)setEvent(null);

    const root=ensureHud();
    root.dataset.heat=Math.round(state.heat);
    document.getElementById('v360District').textContent=state.district;
    document.getElementById('v360Mood').textContent=state.crowdMood+' • '+state.timeOfDay;
    syncCrowdDensity();

    const nearby=window.TGG3D?.nearbyDestination?.(game);
    if(nearby)setPrompt('INTERACT • '+nearby.label,true);
    else if(state.cityEvent)setPrompt(state.cityEvent.label+' • EXPLORE '+state.district,true);
    else setPrompt('',false);
  }
  function nudgeHeat(amount=5){
    state.heat=clamp(state.heat+(Number(amount)||0),0,100);
    return state.heat;
  }
  function getStatus(){return {version:VERSION,...state,features:[
    'district-heat-system','time-of-day-ambience','reactive-crowd-mood',
    'dynamic-city-events','context-interaction-prompts','performance-safe-density-sync',
    'district-entry-callouts','story-activity-reactivity'
  ]};}

  const boot=()=>{
    ensureHud();
    document.documentElement.dataset.tggV360='on';
    setInterval(update,250);
    window.addEventListener('tgg-story-event',()=>nudgeHeat(8));
    document.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b)return;
      if(/mission|battle|show|event|career|studio/i.test(b.id+' '+b.textContent))nudgeHeat(2.5);
    },true);
    window.TGGLivingCity={version:VERSION,getStatus,nudgeHeat,setEvent,update};
    window.dispatchEvent(new CustomEvent('tgg:v360-ready',{detail:getStatus()}));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();