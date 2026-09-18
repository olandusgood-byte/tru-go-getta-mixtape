(() => {
  const TIER_SCORE={STRANGER:0,INTRO:1,FAMILIAR:2,TRUSTED:3,'INNER CIRCLE':4};
  const opportunities=[
    {id:'manager-intro',npcId:'m',name:'Manager Introduction',minTier:'TRUSTED',eventId:'release-rush',detail:'M wants to see you execute a release run after earning real trust.'},
    {id:'producer-lockin',npcId:'producer',name:'Producer Lock-In',minTier:'FAMILIAR',eventId:'studio-pop-in',detail:'Kane opens a focused studio lock-in once your sessions become familiar.'},
    {id:'dj-test-spin',npcId:'dj',name:'DJ Test Spin',minTier:'FAMILIAR',eventId:'release-rush',detail:'DJ V will test a release once the relationship moves beyond the introduction.'}
  ];

  function memory(){
    const root=window.TGGRouteMemory?.state;
    if(!root)return null;
    if(!root.opportunities||typeof root.opportunities!=='object'||Array.isArray(root.opportunities)){
      root.opportunities={active:null,completed:[],history:[]};
    }
    if(!Array.isArray(root.opportunities.completed))root.opportunities.completed=[];
    if(!Array.isArray(root.opportunities.history))root.opportunities.history=[];
    if(root.opportunities.active&&typeof root.opportunities.active!=='object')root.opportunities.active=null;
    return root.opportunities;
  }

  function save(){
    window.TGGRouteMemory?.save?.();
    return memory();
  }

  function get(id){return opportunities.find(x=>x.id===id)||null}

  function relationFor(op){
    return window.TGGRouteMemory?.relationship?.(op?.npcId)||{tier:'STRANGER',met:false};
  }

  function available(id){
    const op=get(id);
    if(!op)return {ok:false,status:'unknown_opportunity'};
    const rel=relationFor(op);
    const ok=(TIER_SCORE[rel.tier]||0)>=(TIER_SCORE[op.minTier]||0);
    return {ok,status:ok?'available':'relationship_locked',opportunity:op,relationship:rel};
  }

  function list(){
    const state=memory()||{completed:[]};
    return opportunities.map(op=>{
      const gate=available(op.id);
      return {
        id:op.id,
        npcId:op.npcId,
        name:op.name,
        eventId:op.eventId,
        detail:op.detail,
        minTier:op.minTier,
        available:gate.ok,
        relationship:gate.relationship,
        completed:state.completed.includes(op.id)
      };
    });
  }

  function start(id){
    const state=memory();
    if(!state)return {ok:false,status:'memory_unavailable'};
    const gate=available(id);
    if(!gate.ok)return gate;
    const op=gate.opportunity;
    const runs=Math.max(0,Number(window.TGGEvents?.state?.runs?.[op.eventId])||0);
    state.active={id:op.id,eventId:op.eventId,npcId:op.npcId,startedAt:Date.now(),baseRun:runs};
    save();
    window.__tggToast?.('CONTACT OPPORTUNITY STARTED — '+op.name.toUpperCase());
    render();
    return status();
  }

  function onEventComplete(eventId){
    const state=memory();
    const active=state?.active;
    if(!active||active.eventId!==eventId)return {ok:false,status:'no_matching_opportunity'};
    const currentRuns=Math.max(0,Number(window.TGGEvents?.state?.runs?.[eventId])||0);
    if(currentRuns<=Math.max(0,Number(active.baseRun)||0))return {ok:false,status:'run_not_advanced'};
    if(!state.completed.includes(active.id))state.completed.push(active.id);
    state.history.push({id:active.id,eventId,completedAt:Date.now()});
    const finished={...active};
    state.active=null;
    save();
    window.TGGProgression?.sync?.();
    window.__tggToast?.('CONTACT OPPORTUNITY COMPLETE — '+String(finished.id).toUpperCase().replaceAll('-',' '));
    render();
    return {ok:true,status:'completed',opportunity:finished.id,eventId};
  }

  function status(){
    const state=memory()||{active:null,completed:[],history:[]};
    return {
      active:state.active?{...state.active}:null,
      completed:state.completed.slice(),
      history:state.history.map(x=>({...x})),
      available:list()
    };
  }

  function render(){
    const host=document.getElementById('eventsList');
    if(!host)return;
    host.querySelector('[data-contact-opportunities]')?.remove();
    const state=memory()||{active:null,completed:[]};
    const rows=list().map(op=>{
      const rel=op.relationship?.tier||'STRANGER';
      const action=op.available
        ? '<button class="secondary" data-contact-op="'+op.id+'">'+(state.active?.id===op.id?'RESTART OPPORTUNITY':'START OPPORTUNITY')+'</button>'
        : '<small>LOCKED • NEEDS '+op.minTier+'</small>';
      return '<div class="circuit-row"><b>'+op.name+(op.completed?' ✓':'')+'</b><span>'+op.detail+'</span><small>'+op.npcId.toUpperCase()+' • '+rel+' • COMPLETE: '+op.eventId.toUpperCase().replaceAll('-',' ')+'</small>'+action+'</div>';
    }).join('');
    const wrap=document.createElement('div');
    wrap.className='mission-card contact-opportunities';
    wrap.dataset.contactOpportunities='1';
    wrap.innerHTML='<b>V1.20 • CONTACT OPPORTUNITIES</b><span>Relationship-gated hooks reuse existing city events. They never add bonus cash, XP or REP.</span>'+rows;
    host.prepend(wrap);
    wrap.querySelectorAll('[data-contact-op]').forEach(btn=>btn.onclick=()=>start(btn.dataset.contactOp));
  }

  window.TGGContactOps={opportunities,TIER_SCORE,memory,save,get,relationFor,available,list,start,onEventComplete,status,render};
})();