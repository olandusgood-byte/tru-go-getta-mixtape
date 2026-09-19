(()=>{
  const VERSION='5.0.0';
  const POLICY='local-only';
  const KEY='tgg-v500-career-contracts';
  const CONTRACTS=[
    {id:'dj-showcase',sponsor:'DJ V',label:'CITY SHOWCASE SLOT',beat:'park-cypher',minAffinity:30,minRep:0,property:'apartment'},
    {id:'kane-session',sponsor:'Kane',label:'PRODUCER MASTER SESSION',beat:'studio-call',minAffinity:28,minRep:0,property:'studio'},
    {id:'m-brand-run',sponsor:'M',label:'BRAND & BUSINESS RUN',beat:'brand-meeting',minAffinity:35,minRep:20,property:'office'},
    {id:'rico-street-run',sponsor:'Rico Flame',label:'STREET CAMPAIGN',beat:'street-meet',minAffinity:26,minRep:5,property:'garage'}
  ];
  const defaults={active:null,completed:0,failed:0,history:[],lastRecommendation:null};
  function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}'),history:Array.isArray(JSON.parse(localStorage.getItem(KEY)||'{}').history)?JSON.parse(localStorage.getItem(KEY)||'{}').history.slice(-40):[]}}catch{return {...defaults}}}
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function rel(name){return window.TGGNPCRelations?.relationship?.(name)||null}
  function contacts(){return window.TGGContactConsequences?.snapshot?.()||{}}
  function systems(){return window.TGGWorldSystems?.getStatus?.()||{}}
  function world(){return window.TGGWorldDepth?.getStatus?.()||{}}
  function scoreContract(def){
    const r=rel(def.sponsor);
    const affinity=Number(r?.relation?.affinity)||0;
    const cityRep=Number(systems().cityRep)||0;
    const propertyLevel=Number(systems().properties?.[def.property])||0;
    const contact=contacts().contacts?.[def.sponsor]||{};
    const eligible=affinity>=def.minAffinity&&cityRep>=def.minRep&&!state.active&&!world().activeBeat;
    const score=affinity+(Number(contact.respect)||0)*3+propertyLevel*4+cityRep*.2-(Number(contact.missed)||0)*5;
    return {id:def.id,sponsor:def.sponsor,label:def.label,beat:def.beat,eligible,score,affinity,cityRep,property:def.property,propertyLevel,minAffinity:def.minAffinity,minRep:def.minRep};
  }
  function recommendContract(){
    const options=CONTRACTS.map(scoreContract).filter(x=>x.eligible).sort((a,b)=>b.score-a.score);
    const next=options[0]||null;
    state.lastRecommendation=next?{...next,at:Date.now()}:null;
    save();render();
    return next;
  }
  function startContract(id=null){
    if(state.active)return {ok:false,status:'contract_active',active:{...state.active}};
    if(world().activeBeat)return {ok:false,status:'world_beat_active',beat:world().activeBeat.id};
    const recommendation=id?scoreContract(CONTRACTS.find(x=>x.id===id)||{}):recommendContract();
    if(!recommendation?.eligible)return {ok:false,status:'not_eligible',recommendation};
    const beat=window.TGGWorldDepth?.spawnBeatFor?.(recommendation.beat,{source:'career-contract',npcName:recommendation.sponsor});
    const accepted=!!beat&&beat.id===recommendation.beat;
    if(!accepted)return {ok:accepted,status:'spawn_failed',recommendation};
    state.active={
      id:recommendation.id,sponsor:recommendation.sponsor,label:recommendation.label,
      beat:recommendation.beat,startedAt:Date.now(),expiresAt:Number(beat.expiresAt)||Date.now()+180000
    };
    state.history.push({type:'start',...state.active});
    state.history=state.history.slice(-40);
    save();render();
    window.TGGGameFeel?.objective?.(recommendation.label,recommendation.sponsor+' • CAREER CONTRACT');
    window.dispatchEvent(new CustomEvent('tgg:career-contract-start',{detail:{...state.active}}));
    return {ok:accepted,status:'started',active:{...state.active},navigation:window.TGGWorldDepth?.beatNavigation?.()||null};
  }
  function settle(detail={},completed=false){
    if(!state.active||detail.source!=='career-contract'||detail.id!==state.active.beat)return false;
    const active={...state.active};
    if(completed){
      state.completed++;
      window.TGGNPCRelations?.adjustAffinity?.(active.sponsor,6,'career-contract-complete');
      window.TGGGame?.reward?.(0,12);
      state.history.push({type:'complete',...active,at:Date.now()});
    }else{
      state.failed++;
      window.TGGNPCRelations?.adjustAffinity?.(active.sponsor,-5,'career-contract-failed');
      window.TGGWorldSystems?.applyConsequence?.('failed '+active.sponsor+' career contract',1);
      state.history.push({type:'failed',...active,at:Date.now()});
    }
    state.active=null;
    state.history=state.history.slice(-40);
    save();render();
    window.dispatchEvent(new CustomEvent('tgg:career-contract-outcome',{detail:{...active,completed}}));
    return true;
  }
  function ensureHud(){
    let root=document.getElementById('v500ContractHud');
    if(!root){
      root=document.createElement('aside');
      root.id='v500ContractHud';
      root.innerHTML='<small>V5.00 • CAREER DIRECTOR</small><b id="v500ContractTitle">SCANNING CONTACTS...</b><span id="v500ContractMeta"></span><button id="v500ContractStart" type="button">START CONTRACT</button>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v500ContractStyle';
      style.textContent='#v500ContractHud{position:fixed;right:16px;top:74px;z-index:11980;width:min(330px,calc(100vw - 32px));padding:11px;border:1px solid #ffcc6645;border-radius:14px;background:#080b12ed;color:#eef2f7;box-shadow:0 18px 50px #0008;font-family:Inter,system-ui,sans-serif}#v500ContractHud small{display:block;color:#ffcc66;font-size:9px;font-weight:900;letter-spacing:.12em}#v500ContractHud b{display:block;margin:6px 0 3px;font-size:11px}#v500ContractHud span{display:block;color:#aeb8c6;font-size:9px}#v500ContractHud button{margin-top:8px;width:100%;border:1px solid #ffcc6640;background:#ffcc6612;color:#ffdf91;border-radius:9px;padding:8px;font-size:9px;font-weight:900;cursor:pointer}#v500ContractHud button:disabled{opacity:.45;cursor:not-allowed}';
      document.head.appendChild(style);
      document.getElementById('v500ContractStart')?.addEventListener('click',()=>startContract());
    }
    return root;
  }
  function render(){
    ensureHud();
    const title=document.getElementById('v500ContractTitle');
    const meta=document.getElementById('v500ContractMeta');
    const button=document.getElementById('v500ContractStart');
    if(!title||!meta||!button)return;
    if(state.active){
      const nav=window.TGGWorldDepth?.beatNavigation?.();
      title.textContent=state.active.label+' • '+state.active.sponsor;
      meta.textContent=(nav?.arrived?'ARRIVED':(nav?.meters??'--')+'m')+' • ACTIVE CAREER CONTRACT';
      button.disabled=true;button.textContent='CONTRACT ACTIVE';
      return;
    }
    const next=CONTRACTS.map(scoreContract).filter(x=>x.eligible).sort((a,b)=>b.score-a.score)[0]||null;
    if(next){
      title.textContent=next.label+' • '+next.sponsor;
      meta.textContent='AFFINITY '+Math.round(next.affinity)+' • REP '+Math.round(next.cityRep)+' • '+next.property.toUpperCase()+' LVL '+next.propertyLevel;
      button.disabled=false;button.textContent='START CONTRACT';
    }else{
      title.textContent='BUILD RELATIONSHIPS TO UNLOCK CONTRACTS';
      meta.textContent='Talk to contacts, complete favors and raise city rep.';
      button.disabled=true;button.textContent='NO CONTRACT READY';
    }
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,active:state.active?{...state.active}:null,completed:state.completed,failed:state.failed,history:state.history.slice(-40),lastRecommendation:state.lastRecommendation?{...state.lastRecommendation}:null,options:CONTRACTS.map(scoreContract)}}
  function run(){
    const checks={
      relations:!!window.TGGNPCRelations,
      contacts:!!window.TGGContactConsequences,
      world:!!window.TGGWorldDepth,
      spawnSpecific:typeof window.TGGWorldDepth?.spawnBeatFor==='function',
      hud:!!ensureHud(),
      contracts:CONTRACTS.length===4,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureHud();render();
    window.addEventListener('tgg:npc-affinity-adjusted',render);
    window.addEventListener('tgg:npc-favor-outcome',render);
    window.addEventListener('tgg:world-beat-complete',e=>settle(e.detail||{},true));
    window.addEventListener('tgg:world-beat-expired',e=>settle(e.detail||{},false));
    setInterval(render,1500);
    window.TGGCareerContracts={version:VERSION,mutationPolicy:POLICY,recommendContract,startContract,scoreContract,snapshot,run};
    window.TGGV500={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV500='on';
    window.dispatchEvent(new CustomEvent('tgg:v500-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();