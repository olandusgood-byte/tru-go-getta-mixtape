(()=>{
  const VERSION='4.99.0';
  const POLICY='local-only';
  const KEY='tgg-v499-contact-consequences';
  const defaults={
    contacts:{
      M:{debt:0,completed:0,missed:0,respect:0},
      'DJ V':{debt:0,completed:0,missed:0,respect:0},
      Kane:{debt:0,completed:0,missed:0,respect:0},
      'Rico Flame':{debt:0,completed:0,missed:0,respect:0}
    },
    active:[],history:[],lastOutcome:null
  };
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      const contacts={};
      Object.keys(defaults.contacts).forEach(name=>contacts[name]={...defaults.contacts[name],...(saved.contacts?.[name]||{})});
      return {...clone(defaults),...saved,contacts,active:Array.isArray(saved.active)?saved.active:[],history:Array.isArray(saved.history)?saved.history.slice(-50):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function relation(name){return window.TGGNPCRelations?.relationship?.(name)||null}
  function onFavor(detail={}){
    const name=detail.name,beat=detail.beat;
    if(!state.contacts[name]||!beat)return false;
    const contact=state.contacts[name];
    contact.debt=(Number(contact.debt)||0)+1;
    const worldBeat=window.TGGWorldDepth?.getStatus?.().activeBeat;
    const entry={
      id:name+'-'+beat+'-'+Date.now(),name,beat,label:detail.label||beat,
      startedAt:Date.now(),expiresAt:Number(worldBeat?.expiresAt)||Date.now()+180000
    };
    state.active=state.active.filter(x=>x.name!==name);
    state.active.push(entry);
    state.history.push({type:'favor-start',...entry});
    state.history=state.history.slice(-50);
    save();render();
    return true;
  }
  function resolveOutcome(detail={},completed=false){
    const name=detail.npcName;
    if(!name||!state.contacts[name]||detail.source!=='npc-favor')return false;
    const contact=state.contacts[name];
    const active=state.active.find(x=>x.name===name&&x.beat===detail.id)||null;
    if(completed){
      contact.debt=Math.max(0,(Number(contact.debt)||0)-1);
      contact.completed=(Number(contact.completed)||0)+1;
      contact.respect=(Number(contact.respect)||0)+4;
      window.TGGNPCRelations?.adjustAffinity?.(name,4,'favor-complete');
      state.lastOutcome={type:'favor-complete',name,beat:detail.id,respect:contact.respect,debt:contact.debt,at:Date.now()};
    }else{
      contact.missed=(Number(contact.missed)||0)+1;
      contact.respect=(Number(contact.respect)||0)-3;
      window.TGGNPCRelations?.adjustAffinity?.(name,-6,'favor-missed');
      window.TGGWorldSystems?.applyConsequence?.('missed '+name+' favor',1);
      state.lastOutcome={type:'favor-missed',name,beat:detail.id,respect:contact.respect,debt:contact.debt,at:Date.now()};
    }
    state.active=state.active.filter(x=>!(x.name===name&&x.beat===detail.id));
    state.history.push({...state.lastOutcome,obligationId:active?.id||null});
    state.history=state.history.slice(-50);
    save();render();
    window.TGGGameFeel?.objective?.(completed?name+' FAVOR COMPLETE':name+' FAVOR MISSED',completed?'RELATIONSHIP UP':'TRUST + CITY PRESSURE HIT');
    window.dispatchEvent(new CustomEvent('tgg:npc-favor-outcome',{detail:state.lastOutcome}));
    return true;
  }
  function ensureHud(){
    let root=document.getElementById('v499ContactHud');
    if(!root){
      root=document.createElement('aside');
      root.id='v499ContactHud';
      root.hidden=true;
      root.innerHTML='<small>CONTACT OBLIGATIONS</small><div id="v499ContactList"></div>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v499ContactStyle';
      style.textContent='#v499ContactHud{position:fixed;left:16px;bottom:16px;z-index:11990;width:min(330px,calc(100vw - 32px));padding:10px;border:1px solid #7a8cff40;border-radius:14px;background:#070a10eb;color:#eef2f7;box-shadow:0 18px 50px #0009;font-family:Inter,system-ui,sans-serif}#v499ContactHud[hidden]{display:none}#v499ContactHud>small{display:block;color:#8ba4ff;font-weight:900;letter-spacing:.12em;font-size:9px;margin-bottom:7px}#v499ContactList{display:grid;gap:6px}.v499-row{display:grid;grid-template-columns:1fr auto;gap:6px;border:1px solid #ffffff14;border-radius:9px;background:#10151f;padding:8px}.v499-row b{font-size:10px}.v499-row span{font-size:9px;color:#b7c1ce}.v499-row i{font-size:9px;color:#c7ff00;font-style:normal;font-weight:900}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureHud(),list=document.getElementById('v499ContactList');
    if(!list)return;
    const now=Date.now();
    root.hidden=state.active.length===0;
    list.innerHTML=state.active.map(x=>{
      const seconds=Math.max(0,Math.ceil((Number(x.expiresAt)-now)/1000));
      const rel=relation(x.name);
      const debt=state.contacts[x.name]?.debt||0;
      return '<div class="v499-row"><div><b>'+x.name+' • '+String(x.label).toUpperCase()+'</b><span>AFFINITY '+Math.round(rel?.relation?.affinity||0)+' • DEBT '+debt+'</span></div><i>'+seconds+'s</i></div>';
    }).join('');
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,contacts:clone(state.contacts),
      active:clone(state.active),history:state.history.slice(-50),
      lastOutcome:state.lastOutcome?{...state.lastOutcome}:null
    };
  }
  function run(){
    const checks={
      relations:!!window.TGGNPCRelations,
      affinityAdjust:typeof window.TGGNPCRelations?.adjustAffinity==='function',
      world:!!window.TGGWorldDepth,
      systems:!!window.TGGWorldSystems,
      hud:!!ensureHud(),
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureHud();render();
    window.addEventListener('tgg:npc-favor',e=>onFavor(e.detail||{}));
    window.addEventListener('tgg:world-beat-complete',e=>resolveOutcome(e.detail||{},true));
    window.addEventListener('tgg:world-beat-expired',e=>resolveOutcome(e.detail||{},false));
    setInterval(render,1000);
    window.TGGContactConsequences={version:VERSION,mutationPolicy:POLICY,onFavor,resolveOutcome,snapshot,run};
    window.TGGV499={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV499='on';
    window.dispatchEvent(new CustomEvent('tgg:v499-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();