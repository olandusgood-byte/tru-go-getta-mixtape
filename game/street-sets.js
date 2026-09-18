(() => {
  const SETS=[
    {id:'block-to-studio',name:'Block To Studio',steps:['downtown-cypher','studio-sidewalk'],detail:'Build momentum Downtown, then carry it to Studio Row.'},
    {id:'studio-to-ave',name:'Studio To Ave',steps:['studio-sidewalk','mixtape-popout'],detail:'Turn a sidewalk set into a Mixtape Ave pop-out.'},
    {id:'full-city-set',name:'Full City Set',steps:['downtown-cypher','studio-sidewalk','mixtape-popout'],detail:'Run all three street stages in order.'}
  ];
  const $=id=>document.getElementById(id);

  function memory(){
    const root=window.TGGStreetEvents?.state;
    if(!root)return null;
    if(!root.sets||typeof root.sets!=='object'||Array.isArray(root.sets)){
      root.sets={active:null,step:0,completed:[],history:[],momentum:0,bestMomentum:0,lastEvent:null,lastResult:null};
    }
    const s=root.sets;
    if(typeof s.active!=='string')s.active=null;
    s.step=Math.max(0,Math.floor(Number(s.step)||0));
    if(!Array.isArray(s.completed))s.completed=[];
    if(!Array.isArray(s.history))s.history=[];
    s.momentum=Math.max(0,Math.min(100,Number(s.momentum)||0));
    s.bestMomentum=Math.max(s.momentum,Math.max(0,Math.min(100,Number(s.bestMomentum)||0)));
    if(typeof s.lastEvent!=='string')s.lastEvent=null;
    return s;
  }

  function save(){
    window.TGGStreetEvents?.save?.();
    return memory();
  }

  function get(id){return SETS.find(x=>x.id===id)||null}

  function momentumRank(value=memory()?.momentum||0){
    const n=Math.max(0,Number(value)||0);
    return n>=80?'LOCKED IN':n>=55?'LIVE':n>=30?'BUZZING':n>=12?'WARM':'COLD';
  }

  function crowdBonus(){
    const n=memory()?.momentum||0;
    return n>=60?2:n>=30?1:0;
  }

  function expected(){
    const s=memory();
    const set=get(s?.active);
    return set?.steps?.[s.step]||null;
  }

  function status(){
    const s=memory()||{active:null,step:0,completed:[],history:[],momentum:0,bestMomentum:0,lastResult:null};
    const set=get(s.active);
    return {
      active:s.active,
      name:set?.name||null,
      step:s.step,
      total:set?.steps?.length||0,
      expected:expected(),
      completed:s.completed.slice(),
      history:s.history.map(x=>({...x})),
      momentum:s.momentum,
      bestMomentum:s.bestMomentum,
      momentumRank:momentumRank(s.momentum),
      crowdBonus:crowdBonus(),
      lastResult:s.lastResult
    };
  }

  function start(id){
    const s=memory();
    const set=get(id);
    if(!s)return {ok:false,status:'street_events_unavailable'};
    if(!set)return {ok:false,status:'unknown_set'};
    if(window.TGGStreetEvents?.status?.().active)return {ok:false,status:'street_event_active'};
    s.active=id;
    s.step=0;
    s.lastResult={ok:true,status:'started',set:id,expected:set.steps[0]};
    save();
    render();
    window.__tggToast?.('STREET SET STARTED — '+set.name.toUpperCase());
    return status();
  }

  function updateMomentum(eventId,correctOrder){
    const s=memory();
    if(!s)return 0;
    const varied=!!s.lastEvent&&s.lastEvent!==eventId;
    const gain=correctOrder?(varied?18:12):(varied?6:3);
    s.momentum=Math.max(0,Math.min(100,s.momentum+gain));
    s.bestMomentum=Math.max(s.bestMomentum,s.momentum);
    s.lastEvent=eventId;
    return s.momentum;
  }

  function onEventComplete(eventId){
    const s=memory();
    if(!s)return {ok:false,status:'street_events_unavailable'};
    const set=get(s.active);
    const want=set?.steps?.[s.step]||null;

    if(!set){
      updateMomentum(eventId,false);
      s.lastResult={ok:true,status:'momentum_only',eventId,momentum:s.momentum};
      save();
      render();
      return s.lastResult;
    }

    if(eventId!==want){
      updateMomentum(eventId,false);
      s.lastResult={ok:false,status:'out_of_order',set:set.id,eventId,expected:want,step:s.step,momentum:s.momentum};
      save();
      render();
      return s.lastResult;
    }

    updateMomentum(eventId,true);
    s.step+=1;
    if(s.step>=set.steps.length){
      if(!s.completed.includes(set.id))s.completed.push(set.id);
      s.history.push({id:set.id,completedAt:Date.now(),momentum:s.momentum});
      s.lastResult={ok:true,status:'completed',set:set.id,eventId,momentum:s.momentum};
      s.active=null;
      s.step=0;
      save();
      window.TGGProgression?.sync?.();
      window.__tggToast?.('STREET SET COMPLETE — '+set.name.toUpperCase());
      render();
      return s.lastResult;
    }

    s.lastResult={ok:true,status:'advanced',set:set.id,eventId,step:s.step,expected:set.steps[s.step],momentum:s.momentum};
    save();
    window.__tggToast?.('SET ADVANCED — '+String(s.lastResult.expected).toUpperCase().replaceAll('-',' '));
    render();
    return s.lastResult;
  }

  function render(){
    const host=$('streetSetHud');
    if(!host)return;
    const s=status();
    const screen=window.TGGGame?.getActiveScreen?.();
    if(screen!=='game'){
      host.classList.remove('show');
      return;
    }
    const active=s.active
      ? '<span>ACTIVE: '+s.name+' • '+s.step+'/'+s.total+' • NEXT '+String(s.expected||'COMPLETE').toUpperCase().replaceAll('-',' ')+'</span>'
      : '<span>No set active • start a route below</span>';
    const buttons=SETS.map(set=>{
      const done=s.completed.includes(set.id);
      return '<button data-street-set="'+set.id+'">'+set.name+(done?' ✓':'')+'</button>';
    }).join('');
    host.innerHTML='<b>STREET SETS • '+s.momentumRank+'</b>'+active+'<small>MOMENTUM '+s.momentum+'/100 • CROWD +'+s.crowdBonus+'</small><div>'+buttons+'</div>';
    host.classList.add('show');
    host.querySelectorAll('[data-street-set]').forEach(btn=>btn.onclick=()=>start(btn.dataset.streetSet));
  }

  function bind(){
    render();
    window.addEventListener('tgg:street-set-refresh',render);
  }

  window.TGGStreetSets={SETS,memory,save,get,momentumRank,crowdBonus,expected,status,start,updateMomentum,onEventComplete,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();