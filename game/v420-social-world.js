(()=>{
  const VERSION='V4.20 SOCIAL NETWORK CITY STATUS MEGA';
  const KEY='tgg-social-v420';
  const CONTACTS=['M','DJ V','Kane','Rico Flame'];
  const defaults={favors:{},cooldowns:{},statusScore:0,statusTier:'UNKNOWN',lastShift:null,history:[]};
  let state=load();
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...s,favors:{...(s.favors||{})},cooldowns:{...(s.cooldowns||{})},history:Array.isArray(s.history)?s.history:[]}}catch{return JSON.parse(JSON.stringify(defaults))}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function world(){return window.TGGWorldSystems?.getStatus?.()||{cityRep:0,consequence:0,reputationTier:'NEW FACE'}}
  function life(){return window.TGGLifeSim?.getStatus?.()||{relationships:{},social:50,momentum:0}}
  function lifestyle(){return window.TGGLifestyle?.getStatus?.()||{lifestyleScore:0,relationTiers:{}}}
  function calcStatus(){
    const w=world(),l=life(),ls=lifestyle();
    const rel=Object.values(l.relationships||{}).reduce((a,b)=>a+(Number(b)||0),0)/Math.max(1,Object.keys(l.relationships||{}).length||1);
    const raw=(Number(w.cityRep)||0)*.45+(Number(l.momentum)||0)*.22+(Number(l.social)||0)*.12+(Number(ls.lifestyleScore)||0)*.12+rel*.25-(Number(w.consequence)||0)*.35;
    state.statusScore=clamp(raw,0,200);
    state.statusTier=state.statusScore>=140?'CITY ICON':state.statusScore>=100?'HEADLINER':state.statusScore>=65?'CITY KNOWN':state.statusScore>=30?'CONNECTED':'UP NEXT';
    return state.statusScore;
  }
  function relation(name){return Number(life().relationships?.[name])||0}
  function contactTier(name){
    const v=relation(name);
    return v>=75?'INNER CIRCLE':v>=50?'TRUSTED':v>=25?'CONNECTED':v>=10?'KNOWN':'NEW';
  }
  function availableFavor(name){
    const tier=contactTier(name),now=Date.now(),cool=Number(state.cooldowns[name])||0;
    if(now<cool)return {ready:false,tier,reason:'COOLDOWN'};
    if(tier==='NEW')return {ready:false,tier,reason:'BUILD RELATIONSHIP'};
    return {ready:true,tier,reason:'READY'};
  }
  function requestFavor(name){
    if(!CONTACTS.includes(name))return false;
    const gate=availableFavor(name); if(!gate.ready)return false;
    const map={
      'M':{cash:220,xp:20,rep:5,label:'MANAGER CONNECT'},
      'DJ V':{cash:120,xp:35,rep:7,label:'DJ PLUG'},
      'Kane':{cash:80,xp:45,rep:8,label:'STUDIO FAVOR'},
      'Rico Flame':{cash:140,xp:25,rep:6,label:'STREET CO-SIGN'}
    };
    const r=map[name];
    window.TGGEconomy?.apply?.(r);
    window.TGGLifeSim?.change?.({social:2,momentum:3});
    window.TGGLifeSim?.relate?.(name,-2);
    state.favors[name]=(state.favors[name]||0)+1;
    state.cooldowns[name]=Date.now()+5*60*1000;
    state.history.push({type:'favor',name,at:Date.now(),label:r.label});state.history=state.history.slice(-25);
    state.lastShift={kind:'favor',label:r.label,at:Date.now()};
    save();sync();window.TGGGameFeel?.objective?.('CONTACT FAVOR',name+' came through: '+r.label);return true;
  }
  function socialConsequence(label,severity=1){
    severity=Math.max(1,Math.min(3,Number(severity)||1));
    window.TGGWorldSystems?.applyConsequence?.(label,severity);
    window.TGGLifeSim?.change?.({social:-severity*4,momentum:-severity*2});
    state.history.push({type:'consequence',label,at:Date.now(),severity});state.history=state.history.slice(-25);
    state.lastShift={kind:'consequence',label,at:Date.now()};save();sync();return true;
  }
  function cityReaction(){
    const tier=state.statusTier;
    return tier==='CITY ICON'?'Crowds recognize you almost everywhere.':tier==='HEADLINER'?'Promoters and contacts take your calls.':tier==='CITY KNOWN'?'People are starting to know your name.':tier==='CONNECTED'?'Your network is opening doors.':'You are still proving yourself.';
  }
  function ensure(){
    let el=document.getElementById('v420Social');if(el)return el;
    el=document.createElement('aside');el.id='v420Social';
    el.innerHTML='<small>CITY STATUS</small><b id="v420Tier">UP NEXT</b><span id="v420Score">STATUS 0</span><i id="v420Reaction">Build your name.</i><div id="v420Contacts"></div>';
    document.body.appendChild(el);return el;
  }
  function render(){
    ensure();calcStatus();
    document.getElementById('v420Tier').textContent=state.statusTier;
    document.getElementById('v420Score').textContent='STATUS '+Math.round(state.statusScore);
    document.getElementById('v420Reaction').textContent=cityReaction();
    const root=document.getElementById('v420Contacts');
    root.innerHTML=CONTACTS.map(name=>{
      const g=availableFavor(name),rel=relation(name);
      return '<button data-v420-favor="'+name+'" '+(g.ready?'':'disabled')+'><span>'+name+'</span><b>'+g.tier+'</b><i>REL '+Math.round(rel)+' • '+g.reason+'</i></button>';
    }).join('');
    root.querySelectorAll('[data-v420-favor]').forEach(b=>b.onclick=()=>requestFavor(b.dataset.v420Favor));
  }
  function sync(){calcStatus();save();render();return getStatus()}
  function getStatus(){return {version:VERSION,...state,cityReaction:cityReaction(),contacts:Object.fromEntries(CONTACTS.map(n=>[n,{relation:relation(n),tier:contactTier(n),favor:availableFavor(n)}])),features:['city-status-score','social-status-tiers','contact-favor-system','favor-cooldowns','relationship-costs','social-consequences','city-reaction-text','social-history']}}
  function boot(){
    ensure();sync();setInterval(sync,5000);
    window.addEventListener('tgg-story-event',e=>{if(/complete/i.test(String(e.detail?.type||''))){state.statusScore+=2;sync()}});
    document.documentElement.dataset.tggV420='on';
    window.TGGSocialWorld={version:VERSION,getStatus,requestFavor,socialConsequence,sync,contactTier,availableFavor};
    window.dispatchEvent(new CustomEvent('tgg:v420-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();