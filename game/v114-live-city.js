(() => {
  const VERSION='1.14.0';
  const KEY='tgg-v114-city-activities-v1';
  const activities=[
    {id:'studio-run',name:'Studio Run',kind:'MUSIC',reward:[120,35],detail:'Drive or walk to the studio, start a session and build career momentum.'},
    {id:'media-run',name:'Media Run',kind:'MEDIA',reward:[100,30],detail:'Take the city route to the media block for a photo/video opportunity.'},
    {id:'property-check',name:'Property Check-In',kind:'PROPERTY',reward:[75,20],detail:'Visit a discovered property and complete a local home-base check-in.'},
    {id:'vehicle-run',name:'Vehicle Run',kind:'VEHICLE',reward:[90,25],detail:'Enter the starter car and complete a short city drive activity.'},
    {id:'style-stop',name:'Style Stop',kind:'STYLE',reward:[70,20],detail:'Visit the style district and complete a city activity.'}
  ];
  const state={started:null,completed:[],lastCompletedAt:null};

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(saved&&typeof saved==='object')Object.assign(state,saved);
    }catch{}
    if(!Array.isArray(state.completed))state.completed=[];
    return state;
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function list(){return activities.map(x=>({...x,reward:[...x.reward],completed:state.completed.includes(x.id)}))}
  function snapshot(){
    const game=window.TGGGame?.getState?.()||{};
    return {
      version:VERSION,
      active:state.started,
      completed:state.completed.slice(),
      level:Math.max(1,Number(game.level)||1),
      inVehicle:!!game.inVehicle,
      status:state.started?'activity_ready':'city_ready',
      mutationPolicy:'local_gameplay_only'
    };
  }
  function start(id){
    const item=activities.find(x=>x.id===String(id));
    if(!item)return {ok:false,status:'unknown_activity'};
    state.started=item.id;
    save();
    window.__tggToast?.(item.name.toUpperCase()+' STARTED');
    return {ok:true,status:'started',activity:{...item}};
  }
  function complete(id){
    const item=activities.find(x=>x.id===String(id));
    if(!item)return {ok:false,status:'unknown_activity'};
    if(state.started!==item.id)return {ok:false,status:'activity_not_started',required:item.id};
    const reward=window.TGGGame?.reward;
    if(typeof reward!=='function')return {ok:false,status:'game_runtime_unavailable'};
    const result=reward(item.reward[0],item.reward[1]);
    if(!state.completed.includes(item.id))state.completed.push(item.id);
    state.started=null;
    state.lastCompletedAt=new Date().toISOString();
    save();
    window.__tggToast?.(item.name.toUpperCase()+' COMPLETE • +$'+item.reward[0]+' / +'+item.reward[1]+' XP');
    return {ok:true,status:'completed',activity:{...item},result};
  }
  function quickStart(id){
    const started=start(id);
    return started.ok?complete(id):started;
  }
  function propertyCheckIn(){return quickStart('property-check')}
  function vehicleRun(){
    const game=window.TGGGame;
    if(!game)return {ok:false,status:'game_runtime_unavailable'};
    if(!game.getState?.().inVehicle && game.toggleVehicle?.()===false)return {ok:false,status:'vehicle_not_ready'};
    return quickStart('vehicle-run');
  }
  function render(container){
    const el=typeof container==='string'?document.getElementById(container):container;
    if(!el)return null;
    const rows=list().map(x=>'<article class="mission-card"><b>'+x.name+'</b><span>'+x.kind+' • +$'+x.reward[0]+' / +'+x.reward[1]+' XP</span><small>'+x.detail+'</small><button class="primary" data-v114-start="'+x.id+'">'+(x.completed?'RUN AGAIN':'START ACTIVITY')+'</button></article>').join('');
    el.innerHTML='<div class="mission-card"><b>V1.14 • LIVE CITY ACTIVITIES</b><span>Local gameplay layer • no ownership, purchase, spawn or server mutation calls</span></div>'+rows;
    el.querySelectorAll('[data-v114-start]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.v114Start;
      if(id==='vehicle-run')vehicleRun();
      else if(id==='property-check')propertyCheckIn();
      else quickStart(id);
      render(el);
    }));
    return snapshot();
  }
  load();
  window.TGGV114={version:VERSION,activities,state,load,save,list,snapshot,start,complete,quickStart,propertyCheckIn,vehicleRun,render};
})();