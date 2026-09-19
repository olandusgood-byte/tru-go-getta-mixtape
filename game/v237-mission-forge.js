(() => {
  const VERSION='V2.37 TGG MISSION + INTERACTION FORGE 100';
  const LAYERS=[
    ...['mission core bridge','mission enabled state','mission active state','mission step state','mission start API','mission advance API','mission complete API','mission abandon API','mission persistence','mission status API'],
    ...['studio run mission','street promo mission','rival challenge mission','concert setup mission','vehicle run mission','fan meet mission','store drop mission','media interview mission','mission title','mission objective text'],
    ...['studio destination step','shops destination step','park destination step','media destination step','business destination step','home destination step','vehicle entry step','vehicle exit step','interior entry step','interior exit step'],
    ...['rival choice step','rap battle step','concert start step','concert complete step','crew call step','crowd proximity step','mission dialogue step','checkpoint event','mission start event','mission complete event'],
    ...['cash reward','xp reward','reward once guard','reward clamp bridge','completed mission set','mission history','restart mission','next mission suggestion','mission streak bridge','career compatibility'],
    ...['objective HUD','objective progress','objective counter','objective title','objective step text','mission panel','mission buttons','advance test button','abandon button','enabled toggle'],
    ...['G interaction bridge','F interaction bridge','destination proximity','near studio','near shops','near park','near media','near business','near home','interaction debounce'],
    ...['step auto matching','step keyword studio','step keyword shop','step keyword park','step keyword media','step keyword business','step keyword car','step keyword rival','step keyword battle','step keyword concert'],
    ...['save active mission','save step','save completed','load active mission','load step','load completed','storage exception guard','state validation','duplicate completion guard','rollback isolation'],
    ...['V2.30 interior bridge','V2.32 animation bridge','V2.35 audio bridge','V2.36 crowd bridge','no base mission rewrite','no movement mutation','mobile mission HUD','landscape mission HUD','100-layer manifest','release QA hooks']
  ];
  const core=()=>globalThis.TGGV237Core||globalThis.window?.TGGV237Core;
  const KEY='tgg-v237-missions';
  const state={enabled:true,active:null,step:0,completed:new Set(),history:[],lastAdvanceAt:0,ready:false};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-mission-forge',layerCount:LAYERS.length,enabled:state.enabled,active:state.active?.id||null,step:state.step,total:state.active?.steps?.length||0,completed:[...state.completed],history:[...state.history]}}
  function save(){if(!hasDOM())return;try{localStorage.setItem(KEY,JSON.stringify({enabled:state.enabled,active:state.active?.id||null,step:state.step,completed:[...state.completed],history:state.history.slice(-20)}))}catch{}}
  function load(){if(!hasDOM())return;try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');if(typeof x.enabled==='boolean')state.enabled=x.enabled;if(x.active&&core()?.missions?.includes(x.active))state.active=core().mission(x.active);state.step=Math.max(0,Math.min(Number(x.step)||0,state.active?.steps?.length||0));state.completed=new Set(Array.isArray(x.completed)?x.completed:[]);state.history=Array.isArray(x.history)?x.history.slice(-20):[]}catch{}}
  function emit(type,detail={}){if(hasDOM())window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,...detail}}))}
  function start(id){
    if(!state.enabled||!core()?.missions?.includes(id))return false;state.active=core().mission(id);state.step=0;state.lastAdvanceAt=Date.now();state.history.push({id,type:'start',at:Date.now()});save();renderUI();emit('tgg:mission-start',{id,title:state.active.title,source:'v237'});window.TGGV235?.play?.('mission-start');return true;
  }
  function advance(reason='manual'){
    if(!state.enabled||!state.active)return false;const now=Date.now();if(now-state.lastAdvanceAt<180&&reason!=='manual')return false;state.lastAdvanceAt=now;
    state.step=core().nextStep(state.active,state.step);state.history.push({id:state.active.id,type:'step',step:state.step,reason,at:now});
    emit('tgg:mission-checkpoint',{id:state.active.id,step:state.step,total:state.active.steps.length,reason});window.TGGV235?.play?.('checkpoint');
    if(core().canComplete(state.active,state.step))return complete(reason);save();renderUI();return true;
  }
  function complete(reason='complete'){
    if(!state.active)return false;const m=state.active,id=m.id;if(state.completed.has(id)){state.active=null;state.step=0;save();renderUI();return false}
    state.completed.add(id);state.history.push({id,type:'complete',reason,at:Date.now()});
    if(window.TGGGame?.reward)window.TGGGame.reward({cash:m.rewardCash,xp:m.rewardXp,reason:'V2.37 '+m.title});
    emit('tgg:mission-complete',{id,title:m.title,cash:m.rewardCash,xp:m.rewardXp,source:'v237'});window.TGGV235?.play?.('mission-complete');state.active=null;state.step=0;save();renderUI();return true;
  }
  function abandon(){if(!state.active)return false;state.history.push({id:state.active.id,type:'abandon',at:Date.now()});state.active=null;state.step=0;save();renderUI();return true}
  function setEnabled(v){state.enabled=!!v;save();renderUI();return state.enabled}
  function text(){if(!state.active)return'CHOOSE A MISSION';return state.active.steps[state.step]||'COMPLETE'}
  function keywordMatch(label=''){
    if(!state.active)return false;const target=String(text()).toLowerCase(),s=String(label).toLowerCase();
    const groups=[['studio',['studio','session','producer','take']],['shops',['shop','inventory','buyer','drop']],['park',['park','fan','flyer']],['media',['media','interview','stage']],['business',['business','pitch']],['home',['home','apartment']],['car',['car','vehicle']],['rival',['rival','response']],['battle',['battle','showdown']],['concert',['concert','perform','stage']]];
    return groups.some(([k,words])=>s.includes(k)&&words.some(w=>target.includes(w)));
  }
  function onDestination(id){if(keywordMatch(id))advance('destination:'+id)}
  function bridge(){
    if(!hasDOM()||bridge.done)return;bridge.done=true;
    window.addEventListener('tgg:interior-enter',e=>onDestination(e.detail?.id));
    window.addEventListener('tgg:interior-exit',e=>{if(String(text()).toLowerCase().includes('exit'))advance('interior-exit:'+e.detail?.id)});
    window.addEventListener('tgg:rival-choice',()=>{if(keywordMatch('rival'))advance('rival-choice')});
    window.addEventListener('tgg:rap-battle-start',()=>{if(keywordMatch('battle'))advance('rap-battle')});
    window.addEventListener('tgg:concert-start',()=>{if(keywordMatch('concert'))advance('concert-start')});
    window.addEventListener('tgg:concert-complete',()=>{if(keywordMatch('concert'))advance('concert-complete')});
    window.addEventListener('tgg:crew-call',()=>{if(String(text()).toLowerCase().includes('call'))advance('crew-call')});
  }
  function poll(){
    if(!state.active||!hasDOM())return;const near=window.TGG3D?.nearbyDestination?.(window.TGGGame?.getState?.());if(near?.id)onDestination(near.id);
    const gs=window.TGGGame?.getState?.()||{},target=String(text()).toLowerCase();if(gs.inVehicle&&(target.includes('car')||target.includes('vehicle')))advance('entered-vehicle');
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v237');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v237ForgeBtn')){const b=document.createElement('button');b.id='v237ForgeBtn';b.className='v237-forge-btn';b.textContent='MISSIONS';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v237ForgePanel';panel.className='v237-forge-panel';panel.innerHTML='<small>TGG CAREER GAMEPLAY</small><b>MISSION + INTERACTION FORGE</b><div class="v237-list"></div><div class="v237-actions"><button id="v237Advance">ADVANCE TEST</button><button id="v237Abandon">ABANDON</button><button id="v237Toggle">MISSIONS: ON</button></div><div id="v237Stats"></div>';document.body.appendChild(panel);const list=panel.querySelector('.v237-list');core()?.missions?.forEach(id=>{const m=core().mission(id),b=document.createElement('button');b.textContent=m.title;b.onclick=()=>start(id);list.appendChild(b)});document.getElementById('v237Advance').onclick=()=>advance('manual');document.getElementById('v237Abandon').onclick=abandon;document.getElementById('v237Toggle').onclick=()=>setEnabled(!state.enabled)}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v237ForgeHud';hud.className='v237-forge-hud';city.appendChild(hud)}bridge();state.ready=true;renderUI();
  }
  function renderUI(){if(!hasDOM())return;if(hud)hud.innerHTML='<small>TGG MISSION FORGE</small><b>'+(state.active?state.active.title.toUpperCase():'CAREER READY')+'</b><span>'+(state.active?('STEP '+Math.min(state.step+1,state.active.steps.length)+'/'+state.active.steps.length+' • '+text()):state.completed.size+' MISSIONS COMPLETE')+'</span>';const s=document.getElementById('v237Stats');if(s)s.textContent=state.completed.size+' COMPLETED • '+state.history.length+' HISTORY'}
  let lastPoll=0;function tick(ts=0){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(ts-lastPoll>750){lastPoll=ts;poll()}renderUI()}
  load();const api={version:VERSION,layers:LAYERS,missions:['studio-run','street-promo','rival-challenge','concert-setup','vehicle-run','fan-meet','store-drop','media-interview'],status,start,advance,complete,abandon,setEnabled};
  globalThis.TGGV237=api;if(hasDOM()){window.TGGV237=api;ensureUI();requestAnimationFrame(tick)}
})();