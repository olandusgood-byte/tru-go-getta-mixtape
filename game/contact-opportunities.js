(() => {
  const TIER_SCORE={STRANGER:0,INTRO:1,FAMILIAR:2,TRUSTED:3,'INNER CIRCLE':4};
  const opportunities=[
    {id:'manager-intro',npcId:'m',name:'Manager Introduction',minTier:'TRUSTED',eventId:'release-rush',detail:'M wants to see you execute a release run after earning real trust.'},
    {id:'producer-lockin',npcId:'producer',name:'Producer Lock-In',minTier:'FAMILIAR',eventId:'studio-pop-in',detail:'Kane opens a focused studio lock-in once your sessions become familiar.'},
    {id:'dj-test-spin',npcId:'dj',name:'DJ Test Spin',minTier:'FAMILIAR',eventId:'release-rush',detail:'DJ V will test a release once the relationship moves beyond the introduction.'}
  ];
  const chains=[
    {id:'manager-to-radio',name:'Manager To Radio',detail:'Turn M trust into a DJ V test-spin path.',steps:['manager-intro','dj-test-spin']}
  ];

  function memory(){
    const root=window.TGGRouteMemory?.state;
    if(!root)return null;
    if(!root.opportunities||typeof root.opportunities!=='object'||Array.isArray(root.opportunities)){
      root.opportunities={active:null,completed:[],history:[],chain:{active:null,step:0,completed:[],history:[],lastResult:null}};
    }
    if(!Array.isArray(root.opportunities.completed))root.opportunities.completed=[];
    if(!Array.isArray(root.opportunities.history))root.opportunities.history=[];
    if(root.opportunities.active&&typeof root.opportunities.active!=='object')root.opportunities.active=null;
    if(!root.opportunities.chain||typeof root.opportunities.chain!=='object'||Array.isArray(root.opportunities.chain))root.opportunities.chain={active:null,step:0,completed:[],history:[],lastResult:null};
    const chain=root.opportunities.chain;
    if(typeof chain.active!=='string')chain.active=null;
    chain.step=Math.max(0,Math.floor(Number(chain.step)||0));
    if(!Array.isArray(chain.completed))chain.completed=[];
    if(!Array.isArray(chain.history))chain.history=[];
    if(!chain.lastResult||typeof chain.lastResult!=='object')chain.lastResult=null;
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


  function chainGet(id){return chains.find(x=>x.id===id)||null}

  function chainStatus(){
    const state=memory()||{};
    const chainState=state.chain||{active:null,step:0,completed:[],history:[]};
    const chain=chainGet(chainState.active);
    return {
      active:chainState.active,
      step:chainState.step,
      total:chain?.steps?.length||0,
      expected:chain?.steps?.[chainState.step]||null,
      completed:chainState.completed.slice(),
      history:chainState.history.map(x=>({...x})),
      lastResult:chainState.lastResult
    };
  }

  function startChain(id){
    const state=memory();
    const chain=chainGet(id);
    if(!state||!chain)return {ok:false,status:'unknown_chain'};
    const first=chain.steps[0];
    const gate=available(first);
    if(!gate.ok)return {ok:false,status:'first_step_locked',chain:id,gate};
    state.chain.active=id;
    state.chain.step=0;
    state.chain.lastResult={ok:true,status:'started',chain:id,expected:first};
    save();
    const started=start(first);
    if(memory()?.active?.id!==first){
      state.chain.lastResult={ok:false,status:'first_step_start_failed',chain:id,expected:first};
      state.chain.active=null;
      state.chain.step=0;
      save();
      return state.chain.lastResult;
    }
    window.__tggToast?.('CONTACT CHAIN STARTED — '+chain.name.toUpperCase());
    render();
    return chainStatus();
  }

  function advanceChain(opportunityId){
    const state=memory();
    const chainState=state?.chain;
    const chain=chainGet(chainState?.active);
    if(!state||!chainState||!chain)return {ok:false,status:'no_active_chain'};
    const expected=chain.steps[chainState.step];
    if(opportunityId!==expected){
      chainState.lastResult={ok:false,status:'out_of_order',chain:chain.id,opportunityId,expected,step:chainState.step};
      save();
      return chainState.lastResult;
    }
    chainState.step+=1;
    if(chainState.step>=chain.steps.length){
      if(!chainState.completed.includes(chain.id))chainState.completed.push(chain.id);
      chainState.history.push({id:chain.id,completedAt:Date.now()});
      chainState.lastResult={ok:true,status:'completed',chain:chain.id};
      chainState.active=null;
      chainState.step=0;
      save();
      window.TGGProgression?.sync?.();
      window.__tggToast?.('CONTACT CHAIN COMPLETE — '+chain.name.toUpperCase());
      return chainState.lastResult;
    }
    const nextId=chain.steps[chainState.step];
    const gate=available(nextId);
    chainState.lastResult={ok:gate.ok,status:gate.ok?'advanced':'waiting_relationship',chain:chain.id,expected:nextId,step:chainState.step};
    save();
    if(gate.ok)start(nextId);
    return chainState.lastResult;
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
    const chainResult=advanceChain(finished.id);
    window.TGGProgression?.sync?.();
    window.__tggToast?.('CONTACT OPPORTUNITY COMPLETE — '+String(finished.id).toUpperCase().replaceAll('-',' '));
    render();
    return {ok:true,status:'completed',opportunity:finished.id,eventId,chain:chainResult};
  }

  function status(){
    const state=memory()||{active:null,completed:[],history:[]};
    return {
      active:state.active?{...state.active}:null,
      completed:state.completed.slice(),
      history:state.history.map(x=>({...x})),
      available:list(),
      chain:chainStatus()
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
    const chainState=chainStatus();
    const chain=chains[0];
    const chainText=chainState.active
      ? 'ACTIVE CHAIN: '+chain.name+' • '+chainState.step+'/'+chainState.total+' • NEXT '+String(chainState.expected||'COMPLETE').toUpperCase().replaceAll('-',' ')
      : 'CHAIN: '+chain.name+' • '+chain.steps.map(x=>x.toUpperCase().replaceAll('-',' ')).join(' → ');
    const chainGate=available(chain.steps[0]);
    const chainAction=chainGate.ok?'<button class="secondary" data-contact-chain="'+chain.id+'">START CONTACT CHAIN</button>':'<small>CHAIN LOCKED • FIRST STEP NEEDS '+chainGate.opportunity.minTier+'</small>';
    wrap.innerHTML='<b>V1.21 • CONTACT CHAINS + HISTORY</b><span>Relationship-gated hooks reuse existing city events. They never add bonus cash, XP or REP.</span><span>'+chainText+'</span>'+chainAction+rows;
    host.prepend(wrap);
    wrap.querySelectorAll('[data-contact-op]').forEach(btn=>btn.onclick=()=>start(btn.dataset.contactOp));
    wrap.querySelectorAll('[data-contact-chain]').forEach(btn=>btn.onclick=()=>startChain(btn.dataset.contactChain));
  }

  window.TGGContactOps={opportunities,chains,TIER_SCORE,memory,save,get,relationFor,available,list,start,chainGet,chainStatus,startChain,advanceChain,onEventComplete,status,render};
})();