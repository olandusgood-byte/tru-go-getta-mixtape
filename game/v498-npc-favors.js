(()=>{
  const VERSION='4.98.0';
  const POLICY='local-only';
  const KEY='tgg-v498-npc-favors';
  const FAVORS={
    M:{threshold:35,label:'MANAGER MEETING',beat:'brand-meeting',cooldown:240000},
    'DJ V':{threshold:26,label:'SHOW SLOT',beat:'park-cypher',eliteBeat:'headline-night',cooldown:180000},
    Kane:{threshold:30,label:'PRODUCER SESSION',beat:'studio-call',cooldown:180000},
    'Rico Flame':{threshold:26,label:'STREET PLUG',beat:'street-meet',cooldown:150000}
  };
  const defaults={uses:{M:0,'DJ V':0,Kane:0,'Rico Flame':0},cooldowns:{},history:[],lastFavor:null};
  function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}'),uses:{...defaults.uses,...(JSON.parse(localStorage.getItem(KEY)||'{}').uses||{})}}}catch{return JSON.parse(JSON.stringify(defaults))}}
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function relation(name){return window.TGGNPCRelations?.relationship?.(name)||null}
  function world(){return window.TGGWorldDepth?.getStatus?.()||{}}
  function systems(){return window.TGGWorldSystems?.getStatus?.()||{}}
  function beatFor(name){
    const def=FAVORS[name];if(!def)return null;
    if(name==='DJ V'&&(Number(systems().cityRep)||0)>=65)return def.eliteBeat;
    return def.beat;
  }
  function availability(name){
    const def=FAVORS[name],rel=relation(name);
    if(!def||!rel)return {name,ready:false,reason:'missing_relation'};
    const affinity=Number(rel.relation?.affinity)||0;
    const cooldownUntil=Number(state.cooldowns[name])||0;
    const remaining=Math.max(0,cooldownUntil-Date.now());
    const activeBeat=world().activeBeat;
    const ready=affinity>=def.threshold&&remaining<=0&&!activeBeat;
    return {
      name,ready,affinity,threshold:def.threshold,label:def.label,beat:beatFor(name),
      remainingMs:remaining,activeBeat:activeBeat?.id||null,
      reason:affinity<def.threshold?'affinity':remaining>0?'cooldown':activeBeat?'active_beat':'ready'
    };
  }
  function callFavor(name){
    const status=availability(name);
    if(!status.ready)return {ok:status.ready,status:'blocked',...status};
    const def=FAVORS[name],beatId=beatFor(name);
    const beat=window.TGGWorldDepth?.spawnBeatFor?.(beatId,{source:'npc-favor',npcName:name});
    const accepted=!!beat&&beat.id===beatId;
    if(!accepted)return {ok:accepted,status:'spawn_failed',name,beat:beatId};
    state.uses[name]=(Number(state.uses[name])||0)+1;
    state.cooldowns[name]=Date.now()+def.cooldown;
    const entry={name,beat:beatId,label:def.label,uses:state.uses[name],at:Date.now(),cooldownUntil:state.cooldowns[name]};
    state.lastFavor=entry;
    state.history.push(entry);
    state.history=state.history.slice(-40);
    save();render();
    window.TGGGameFeel?.objective?.(name+' FAVOR',def.label+' • ROUTE ACTIVE');
    window.dispatchEvent(new CustomEvent('tgg:npc-favor',{detail:entry}));
    return {ok:accepted,status:'routed',...entry,navigation:window.TGGWorldDepth?.beatNavigation?.()||null};
  }
  function ensureDock(){
    let root=document.getElementById('v498FavorDock');
    if(!root){
      root=document.createElement('aside');
      root.id='v498FavorDock';
      root.hidden=true;
      root.innerHTML='<small>NPC FAVORS</small><div id="v498FavorList"></div>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v498FavorStyle';
      style.textContent='#v498FavorDock{position:fixed;right:16px;bottom:16px;z-index:12000;width:min(300px,calc(100vw - 32px));padding:10px;border:1px solid #c7ff0030;border-radius:14px;background:#070a10eb;box-shadow:0 18px 50px #0009;color:#eef2f7;font-family:Inter,system-ui,sans-serif}#v498FavorDock[hidden]{display:none}#v498FavorDock>small{display:block;color:#c7ff00;font-weight:900;letter-spacing:.12em;font-size:9px;margin-bottom:7px}#v498FavorList{display:grid;gap:6px}#v498FavorList button{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #ffffff1b;background:#10151f;color:#fff;border-radius:10px;padding:9px 10px;font-size:10px;font-weight:900;cursor:pointer}#v498FavorList button span{color:#c7ff00}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureDock(),list=document.getElementById('v498FavorList');
    if(!list)return;
    const ready=Object.keys(FAVORS).map(availability).filter(x=>x.ready);
    root.hidden=ready.length===0;
    const html=ready.map(x=>'<button type="button" data-v498-favor="'+x.name.replaceAll('"','&quot;')+'"><b>'+x.name+' • '+x.label+'</b><span>CALL FAVOR</span></button>').join('');
    if(list.innerHTML!==html)list.innerHTML=html;
    list.querySelectorAll('[data-v498-favor]').forEach(btn=>btn.onclick=()=>callFavor(btn.dataset.v498Favor));
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,uses:{...state.uses},cooldowns:{...state.cooldowns},history:state.history.slice(-40),lastFavor:state.lastFavor?{...state.lastFavor}:null,availability:Object.keys(FAVORS).map(availability)}}
  function run(){
    const checks={
      relations:!!window.TGGNPCRelations,
      world:!!window.TGGWorldDepth,
      spawnSpecific:typeof window.TGGWorldDepth?.spawnBeatFor==='function',
      dock:!!ensureDock(),
      definitions:Object.keys(FAVORS).length===4,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureDock();render();
    window.addEventListener('tgg:npc-choice-resolved',render);
    window.addEventListener('tgg:v497-ready',render);
    window.addEventListener('tgg:v460-ready',render);
    setInterval(render,1500);
    window.TGGNPCFavors={version:VERSION,mutationPolicy:POLICY,availability,callFavor,snapshot,run};
    window.TGGV498={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV498='on';
    window.dispatchEvent(new CustomEvent('tgg:v498-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();