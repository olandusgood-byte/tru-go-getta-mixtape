(()=>{
  const VERSION='4.97.0';
  const KEY='tgg-v497-npc-relations';
  const POLICY='local-only';
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const PROFILES={
    M:{role:'MANAGER',property:'office',preferred:'professional',opportunity:'career'},
    'DJ V':{role:'DJ / PROMOTER',property:'apartment',preferred:'loyal',opportunity:'show'},
    Kane:{role:'PRODUCER',property:'studio',preferred:'professional',opportunity:'studio'},
    'Rico Flame':{role:'STREET ARTIST',property:'garage',preferred:'street',opportunity:'street'}
  };
  const defaults={
    relations:{
      M:{affinity:22,meetings:0,lastChoice:null,streak:0},
      'DJ V':{affinity:18,meetings:0,lastChoice:null,streak:0},
      Kane:{affinity:20,meetings:0,lastChoice:null,streak:0},
      'Rico Flame':{affinity:16,meetings:0,lastChoice:null,streak:0}
    },
    pending:null,history:[],lastResolved:null
  };
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      const relations={};
      Object.keys(PROFILES).forEach(name=>relations[name]={...defaults.relations[name],...(saved.relations?.[name]||{})});
      return {...clone(defaults),...saved,relations,history:Array.isArray(saved.history)?saved.history.slice(-50):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function world(){return window.TGGWorldDepth?.getStatus?.()||{}}
  function systems(){return window.TGGWorldSystems?.getStatus?.()||{}}
  function life(){return window.TGGLifeSim?.getStatus?.()||{}}
  function propertyLevel(name){
    const id=PROFILES[name]?.property;
    return Number(systems().properties?.[id])||0;
  }
  function npcState(name){return String(world().npcStates?.[name]||'around')}
  function choicePreview(name,choice){
    const rel=state.relations[name]||defaults.relations[name];
    const profile=PROFILES[name];
    const prop=propertyLevel(name);
    const pressure=Number(world().districtPressure)||0;
    const momentum=Number(life().momentum)||0;
    let affinity=choice==='loyal'?5:choice==='professional'?4:2;
    if(choice===profile.preferred)affinity+=2;
    if(prop>0)affinity+=Math.min(3,prop);
    if(choice==='street'&&pressure>=55)affinity+=2;
    if(choice==='professional'&&momentum>=45)affinity+=1;
    if(choice==='street'&&pressure<30)affinity-=1;
    const xp=Math.max(1,Math.round(2+affinity/2));
    return {name,choice,affinityDelta:affinity,xp,property:profile.property,propertyLevel:prop,npcState:npcState(name),currentAffinity:Number(rel.affinity)||0};
  }
  function ensurePanel(){
    let root=document.getElementById('v497NpcChoice');
    if(!root){
      root=document.createElement('section');
      root.id='v497NpcChoice';
      root.hidden=true;
      root.innerHTML='<div class="v497-card"><small>V4.97 • RELATIONSHIP DECISION</small><h3 id="v497Name">NPC</h3><p id="v497Role">ROLE</p><b id="v497Prompt">Choose how you approach this conversation.</b><div id="v497Meta"></div><div class="v497-choices"><button data-v497-choice="professional">PROFESSIONAL<small>business-first</small></button><button data-v497-choice="loyal">LOYAL<small>relationship-first</small></button><button data-v497-choice="street">STREET<small>pressure + edge</small></button></div><button id="v497Close" type="button">NOT NOW</button></div>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v497NpcChoiceStyle';
      style.textContent='#v497NpcChoice{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;background:#02040aaa;padding:20px}#v497NpcChoice[hidden]{display:none}.v497-card{width:min(560px,94vw);border:1px solid #ffffff20;border-radius:20px;background:#080b12f2;box-shadow:0 28px 80px #000b;padding:22px;color:#eef2f7;font-family:Inter,system-ui,sans-serif}.v497-card small{color:#9aa6b6;font-size:10px;font-weight:900;letter-spacing:.12em}.v497-card h3{margin:8px 0 2px;font-size:30px}.v497-card p{margin:0 0 12px;color:#c7ff00;font-size:12px;font-weight:900}.v497-card b{display:block;margin-bottom:12px}.v497-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.v497-choices button,#v497Close{border:1px solid #ffffff1d;background:#121722;color:white;border-radius:12px;padding:12px;font-weight:900;cursor:pointer}.v497-choices button:hover{border-color:#c7ff00;color:#c7ff00}.v497-choices button small{display:block;margin-top:4px;font-size:8px;letter-spacing:.03em}#v497Meta{font-size:11px;color:#aeb8c6}@media(max-width:620px){.v497-choices{grid-template-columns:1fr}}';
      document.head.appendChild(style);
      root.querySelectorAll('[data-v497-choice]').forEach(btn=>btn.addEventListener('click',()=>resolveChoice(btn.dataset.v497Choice)));
      document.getElementById('v497Close')?.addEventListener('click',()=>closeChoice());
    }
    return root;
  }
  function renderPanel(){
    const root=ensurePanel();
    const pending=state.pending;
    root.hidden=!pending;
    if(!pending)return;
    const profile=PROFILES[pending.name],rel=state.relations[pending.name];
    const prop=propertyLevel(pending.name);
    document.getElementById('v497Name').textContent=pending.name;
    document.getElementById('v497Role').textContent=profile.role+' • '+npcState(pending.name).toUpperCase();
    document.getElementById('v497Prompt').textContent='Choose your approach. This changes trust, world pressure and future opportunities.';
    document.getElementById('v497Meta').textContent='AFFINITY '+Math.round(rel.affinity)+' • MEETINGS '+rel.meetings+' • '+profile.property.toUpperCase()+' LVL '+prop+' MODIFIER';
    root.querySelectorAll('[data-v497-choice]').forEach(btn=>{
      const p=choicePreview(pending.name,btn.dataset.v497Choice);
      btn.title='Affinity '+(p.affinityDelta>=0?'+':'')+p.affinityDelta+' • XP +'+p.xp;
    });
  }
  function interact(name){
    if(!PROFILES[name])return {ok:false,status:'unknown_npc',name};
    const rel=state.relations[name];
    rel.meetings=(Number(rel.meetings)||0)+1;
    state.pending={name,openedAt:Date.now(),npcState:npcState(name)};
    state.history.push({type:'meet',name,at:Date.now()});
    state.history=state.history.slice(-50);
    save();renderPanel();
    const profile=PROFILES[name];
    return {ok:!!PROFILES[name],status:'choice_required',name,role:profile.role,dialogue:name+': How you want to play this?',choices:['professional','loyal','street'],relation:{...rel}};
  }
  function resolveChoice(choice){
    const pending=state.pending;
    if(!pending||!PROFILES[pending.name])return {ok:false,status:'no_pending_choice'};
    if(!['professional','loyal','street'].includes(choice))return {ok:false,status:'invalid_choice',choice};
    const name=pending.name,rel=state.relations[name],preview=choicePreview(name,choice);
    const base=window.TGGWorldDepth?.chooseNpcApproach?.(name,choice)||{};
    const prior=String(rel.lastChoice||'');
    rel.affinity=clamp((Number(rel.affinity)||0)+preview.affinityDelta);
    rel.streak=prior===choice?(Number(rel.streak)||0)+1:1;
    rel.lastChoice=choice;
    window.TGGGame?.reward?.(0,preview.xp);
    const status=world();
    let opportunity=null;
    if(!status.activeBeat && rel.affinity>=30){
      opportunity=window.TGGWorldDepth?.spawnBeat?.()||null;
    }
    const resolved={
      ok:!!pending&&!!PROFILES[name],status:'resolved',name,choice,affinity:rel.affinity,affinityDelta:preview.affinityDelta,
      xp:preview.xp,property:preview.property,propertyLevel:preview.propertyLevel,
      streak:rel.streak,worldChoice:base,opportunity:opportunity?.id||null,at:Date.now()
    };
    state.lastResolved=resolved;
    state.history.push({type:'choice',...resolved});
    state.history=state.history.slice(-50);
    state.pending=null;
    save();renderPanel();
    window.TGGGameFeel?.objective?.(name+' • '+choice.toUpperCase(),'AFFINITY '+Math.round(rel.affinity)+(opportunity?' • NEW OPPORTUNITY':''));
    window.dispatchEvent(new CustomEvent('tgg:npc-choice-resolved',{detail:resolved}));
    return resolved;
  }
  function closeChoice(){state.pending=null;save();renderPanel();return true}
  function adjustAffinity(name,delta=0,reason='world-outcome'){
    if(!PROFILES[name])return {ok:false,status:'unknown_npc',name};
    const rel=state.relations[name];
    const before=Number(rel.affinity)||0;
    rel.affinity=clamp(before+(Number(delta)||0));
    const entry={type:'affinity',name,delta:Number(delta)||0,before,after:rel.affinity,reason,at:Date.now()};
    state.history.push(entry);
    state.history=state.history.slice(-50);
    state.lastResolved={...(state.lastResolved||{}),name,affinity:rel.affinity,affinityDelta:entry.delta,reason,at:entry.at};
    save();renderPanel();
    window.dispatchEvent(new CustomEvent('tgg:npc-affinity-adjusted',{detail:entry}));
    return {ok:rel.affinity!==before||entry.delta===0,status:'adjusted',...entry};
  }
  function relationship(name){return PROFILES[name]?{name,profile:{...PROFILES[name]},relation:{...state.relations[name]},propertyLevel:propertyLevel(name),npcState:npcState(name)}:null}
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,pending:state.pending?{...state.pending}:null,
      lastResolved:state.lastResolved?{...state.lastResolved}:null,
      relations:clone(state.relations),history:state.history.slice(-50)
    };
  }
  function run(){
    const checks={
      worldDepth:!!window.TGGWorldDepth,
      worldSystems:!!window.TGGWorldSystems,
      choiceApi:typeof interact==='function'&&typeof resolveChoice==='function',
      profiles:Object.keys(PROFILES).length===4,
      panel:!!ensurePanel(),
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensurePanel();renderPanel();
    window.TGGNPCRelations={version:VERSION,mutationPolicy:POLICY,interact,resolveChoice,adjustAffinity,closeChoice,relationship,choicePreview,snapshot,run};
    window.TGGV497={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV497='on';
    window.dispatchEvent(new CustomEvent('tgg:v497-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();