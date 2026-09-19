(() => {
  const KEY='tgg-district-story-v1';

  const routes=[
    {
      id:'city-story-lap',
      name:'City Story Lap',
      detail:'Move from the block to the studio to the release lane in district order.',
      circuit:'city-run',
      steps:[
        {eventId:'street-cypher',district:'downtown',npcId:'m',beat:'GET SEEN',detail:'Build a name Downtown.'},
        {eventId:'studio-pop-in',district:'studio-row',npcId:'producer',beat:'GET SHARP',detail:'Turn momentum into a real studio session.'},
        {eventId:'release-rush',district:'mixtape-ave',npcId:'dj',beat:'GET HEARD',detail:'Carry the run into Mixtape Ave.'}
      ]
    }
  ];

  let state={activeRoute:null,completed:[],updatedAt:0,lastResult:null,remoteStoryStatus:'offline_ready'};

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(saved&&typeof saved==='object')state={...state,...saved};
    }catch(e){}
    if(typeof state.activeRoute!=='string')state.activeRoute=null;
    if(!Array.isArray(state.completed))state.completed=[];
    if(!state.lastResult||typeof state.lastResult!=='object')state.lastResult=null;
    if(typeof state.remoteStoryStatus!=='string')state.remoteStoryStatus='offline_ready';
    return state;
  }

  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function get(id){return routes.find(x=>x.id===id)||null}

  function districtState(route){
    const r=route||get(state.activeRoute);
    if(!r)return {ok:false,locked:[],steps:[]};
    const steps=r.steps.map(step=>{
      const district=window.TGGDistricts?.get?.(step.district);
      const open=!!window.TGGDistricts?.canEnter?.(step.district);
      return {
        eventId:step.eventId,
        district:step.district,
        districtName:district?.name||step.district,
        level:district?.level||1,
        open,
        beat:step.beat,
        npcId:step.npcId||null,
        detail:step.detail
      };
    });
    return {ok:steps.every(x=>x.open),locked:steps.filter(x=>!x.open),steps};
  }

  function currentBeat(){
    const route=get(state.activeRoute);
    if(!route)return null;
    const circuit=window.TGGCircuits?.status?.()||{};
    if(circuit.active!==route.circuit)return null;
    return route.steps.find(x=>x.eventId===circuit.expected)||null;
  }

  function status(){
    const route=get(state.activeRoute);
    const districts=route?districtState(route):{ok:false,locked:[],steps:[]};
    const circuit=window.TGGCircuits?.status?.()||{};
    return {
      activeRoute:state.activeRoute,
      routeName:route?.name||null,
      completed:state.completed.slice(),
      currentBeat:currentBeat(),
      circuit,
      districts,
      remoteStoryStatus:state.remoteStoryStatus,
      lastResult:state.lastResult
    };
  }

  function start(id){
    const route=get(id);
    if(!route)return {ok:false,status:'unknown_route'};
    const districts=districtState(route);
    if(!districts.ok){
      state.lastResult={
        ok:false,
        status:'district_locked',
        route:id,
        locked:districts.locked.map(x=>({district:x.district,level:x.level}))
      };
      save();
      render();
      return state.lastResult;
    }
    const circuit=window.TGGCircuits?.start?.(route.circuit);
    if(!circuit||circuit.ok===false){
      state.lastResult={ok:false,status:'circuit_start_failed',route:id};
      save();
      render();
      return state.lastResult;
    }
    state.activeRoute=id;
    state.lastResult={ok:true,status:'started',route:id,circuit:route.circuit};
    save();
    window.TGGRouteMemory?.recordBeat?.(currentBeat());
    window.__tggToast?.('DISTRICT STORY STARTED — '+route.name.toUpperCase());
    render();
    return status();
  }

  function onCircuitResult(result){
    const route=get(state.activeRoute);
    if(!route||!result||result.circuit!==route.circuit)return status();
    if(result.status==='completed'){
      if(!state.completed.includes(route.id))state.completed.push(route.id);
      state.lastResult={ok:true,status:'completed',route:route.id,circuit:route.circuit};
      state.activeRoute=null;
      save();
      window.TGGProgression?.sync?.();
      window.__tggToast?.('DISTRICT STORY COMPLETE — '+route.name.toUpperCase());
    }else{
      state.lastResult={
        ok:result.ok!==false,
        status:result.status||'updated',
        route:route.id,
        circuit:route.circuit,
        expected:result.expected||null
      };
      save();
      if(result.status==='advanced')window.TGGRouteMemory?.recordBeat?.(currentBeat());
    }
    render();
    return status();
  }

  function summarizeRemoteStory(bundle){
    if(!bundle||bundle.ok!==true)return {ok:false,status:String(bundle?.status||'offline_ready'),summary:null};
    const count=value=>Array.isArray(value)?value.length:Array.isArray(value?.items)?value.items.length:Array.isArray(value?.data)?value.data.length:0;
    return {
      ok:true,
      status:'ready',
      summary:{
        missions:count(bundle.missions),
        encounters:count(bundle.encounters),
        storyKeys:Object.keys(bundle.story&&typeof bundle.story==='object'?bundle.story:{}).slice(0,12),
        memory:count(bundle.memory)
      }
    };
  }

  async function refreshRemoteStory(){
    const bundle=await window.TGGWorldSync?.missionStoryBundle?.();
    const summary=summarizeRemoteStory(bundle);
    state.remoteStoryStatus=summary.status;
    save();
    render(summary.summary);
    return summary;
  }

  function render(remoteSummary){
    const host=document.getElementById('eventsList');
    if(!host)return;
    host.querySelector('[data-district-story]')?.remove();
    const wrap=document.createElement('div');
    wrap.className='mission-card district-story';
    wrap.dataset.districtStory='1';
    const current=status();
    const route=routes[0];
    const ds=districtState(route);
    const beat=current.currentBeat;
    const districtLine=ds.steps.map(x=>(x.open?'OPEN ':'LOCKED ')+x.districtName+' L'+x.level).join(' • ');
    const remote=remoteSummary
      ? 'REMOTE READ: '+remoteSummary.missions+' missions • '+remoteSummary.encounters+' encounters'
      : 'REMOTE STORY: '+String(state.remoteStoryStatus).toUpperCase().replaceAll('_',' ');
    const active=state.activeRoute
      ? '<span>ACTIVE BEAT: '+esc(beat?.beat||'ROUTE COMPLETE')+' • '+esc(beat?.detail||'Finish the active circuit.')+'</span>'
      : '<span>Route the verified local circuit through district unlocks. Remote story remains read-only.</span>';
    wrap.innerHTML=
      '<b>V1.17 • DISTRICT STORY ROUTING</b>'+
      active+
      '<span>'+esc(districtLine)+'</span>'+
      '<span>'+esc(remote)+'</span>'+
      '<button class="secondary" data-story-route="'+route.id+'">'+(state.activeRoute===route.id?'RESTART STORY ROUTE':'START STORY ROUTE')+'</button>'+
      '<button class="secondary" data-story-refresh="1">REFRESH READ-ONLY STORY</button>';
    host.prepend(wrap);
    window.TGGRouteMemory?.render?.();
    wrap.querySelector('[data-story-route]')?.addEventListener('click',()=>start(route.id));
    wrap.querySelector('[data-story-refresh]')?.addEventListener('click',()=>refreshRemoteStory());
  }

  load();
  window.TGGDistrictStory={routes,state,load,save,get,districtState,currentBeat,status,start,onCircuitResult,summarizeRemoteStory,refreshRemoteStory,render};
})();