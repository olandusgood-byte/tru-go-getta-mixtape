(() => {
  const KEY='tgg-circuits-v1';
  const circuits=[
    {
      id:'first-lap',
      name:'First Lap',
      detail:'Prove you can move through more than one side of the city.',
      steps:['street-cypher','studio-pop-in']
    },
    {
      id:'city-run',
      name:'City Run',
      detail:'Complete the full city activity route in order.',
      steps:['street-cypher','studio-pop-in','release-rush']
    }
  ];
  let state={active:null,step:0,completed:[],history:[],updatedAt:0,lastResult:null};

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...state,...saved};
    }catch(e){}
    if(typeof state.active!=='string')state.active=null;
    state.step=Math.max(0,Math.floor(Number(state.step)||0));
    if(!Array.isArray(state.completed))state.completed=[];
    if(!Array.isArray(state.history))state.history=[];
    if(!state.lastResult||typeof state.lastResult!=='object')state.lastResult=null;
    return state;
  }

  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function get(id){return circuits.find(x=>x.id===id)||null}

  function expected(){
    const circuit=get(state.active);
    return circuit?.steps?.[state.step]||null;
  }

  function status(){
    const circuit=get(state.active);
    return {
      active:state.active,
      name:circuit?.name||null,
      step:state.step,
      total:circuit?.steps?.length||0,
      expected:expected(),
      completed:state.completed.slice(),
      history:state.history.slice(),
      lastResult:state.lastResult
    };
  }

  function start(id){
    const circuit=get(id);
    if(!circuit)return {ok:false,status:'unknown_circuit'};
    state.active=id;
    state.step=0;
    state.lastResult={ok:true,status:'started',circuit:id,expected:circuit.steps[0]};
    save();
    window.__tggToast?.('CITY CIRCUIT STARTED — '+circuit.name.toUpperCase());
    render();
    return status();
  }

  function onEventComplete(eventId){
    const circuit=get(state.active);
    if(!circuit)return {ok:false,status:'no_active_circuit',eventId};
    const want=circuit.steps[state.step];
    if(eventId!==want){
      state.lastResult={ok:false,status:'out_of_order',circuit:circuit.id,eventId,expected:want,step:state.step};
      save();
      render();
      return state.lastResult;
    }
    state.step+=1;
    if(state.step>=circuit.steps.length){
      if(!state.completed.includes(circuit.id))state.completed.push(circuit.id);
      state.history.push({id:circuit.id,completedAt:Date.now()});
      state.lastResult={ok:true,status:'completed',circuit:circuit.id,eventId};
      state.active=null;
      state.step=0;
      save();
      window.TGGProgression?.sync?.();
      window.__tggToast?.('CITY CIRCUIT COMPLETE — '+circuit.name.toUpperCase());
      render();
      return state.lastResult;
    }
    state.lastResult={ok:true,status:'advanced',circuit:circuit.id,eventId,step:state.step,expected:circuit.steps[state.step]};
    save();
    window.__tggToast?.('CIRCUIT ADVANCED — NEXT '+String(circuit.steps[state.step]).toUpperCase().replaceAll('-',' '));
    render();
    return state.lastResult;
  }

  const variants={
    'street-cypher':{
      rookie:'OPEN CYPHER',
      regular:'NO HOOK CYPHER',
      known:'FEATURED CYPHER',
      headliner:'HEADLINE CYPHER'
    },
    'studio-pop-in':{
      rookie:'LATE NIGHT SESSION',
      regular:'ONE TAKE SESSION',
      known:'LOCK-IN SESSION',
      headliner:'EXECUTIVE SESSION'
    },
    'release-rush':{
      rookie:'STREET DROP',
      regular:'MIDNIGHT DROP',
      known:'CITY DROP',
      headliner:'PREMIERE DROP'
    }
  };

  function variant(eventId){
    const mastery=window.TGGEvents?.mastery?.(eventId)||{tier:'rookie',name:'ROOKIE'};
    const label=variants[eventId]?.[mastery.tier]||String(eventId||'CITY EVENT').toUpperCase().replaceAll('-',' ');
    return {
      eventId,
      mastery:mastery.tier,
      masteryName:mastery.name,
      label,
      rewardMultiplier:1,
      cosmeticOnly:true
    };
  }

  function render(){
    const host=document.getElementById('eventsList');
    if(!host)return;
    host.querySelector('[data-city-circuits]')?.remove();
    const wrap=document.createElement('div');
    wrap.className='mission-card city-circuits';
    wrap.dataset.cityCircuits='1';
    const current=status();
    const active=current.active
      ? '<span>ACTIVE: '+current.name+' • '+current.step+'/'+current.total+' • NEXT: '+String(current.expected||'COMPLETE').toUpperCase().replaceAll('-',' ')+'</span>'
      : '<span>No circuit active. Start a route and finish its activities in order.</span>';
    const rows=circuits.map(c=>{
      const done=state.completed.includes(c.id);
      const route=c.steps.map(x=>String(x).toUpperCase().replaceAll('-',' ')).join(' → ');
      return '<div class="circuit-row"><b>'+c.name+(done?' ✓':'')+'</b><span>'+c.detail+'</span><small>'+route+'</small><button class="secondary" data-circuit-start="'+c.id+'">'+(state.active===c.id?'RESTART CIRCUIT':'START CIRCUIT')+'</button></div>';
    }).join('');
    wrap.innerHTML='<b>V1.16 • CITY CIRCUITS</b>'+active+rows;
    host.prepend(wrap);
    wrap.querySelectorAll('[data-circuit-start]').forEach(btn=>btn.onclick=()=>start(btn.dataset.circuitStart));
  }

  load();
  window.TGGCircuits={circuits,state,load,save,get,start,expected,status,onEventComplete,variant,render};
})();