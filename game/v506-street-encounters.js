(()=>{
  const VERSION='5.6.0';
  const POLICY='local-only';
  const KEY='tgg-v506-street-encounters';
  const COLORS={M:'#3b82f6','DJ V':'#a855f7',Kane:'#ff8a3d','Rico Flame':'#ff3b30'};
  const FALLBACKS={M:{x:72,y:36},'DJ V':{x:52,y:68},Kane:{x:24,y:37},'Rico Flame':{x:76,y:63}};
  const HANDOFFS={
    M:{x:11,y:50,radius:7,color:'#3b82f6',label:'MANAGER FOLLOW-UP • BUSINESS DISTRICT'},
    'DJ V':{x:76,y:63,radius:7,color:'#a855f7',label:'DJ V FOLLOW-UP • THE PARK'},
    Kane:{x:24,y:37,radius:7,color:'#ff8a3d',label:'KANE FOLLOW-UP • RECORDING STUDIO'},
    'Rico Flame':{x:76,y:63,radius:7,color:'#ff3b30',label:'RICO FOLLOW-UP • MIXTAPE AVE'}
  };
  const CONTACTS=Object.keys(FALLBACKS);
  const defaults={active:null,history:[],completed:0,lastCompleted:null,lastOffered:null};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...saved,active:null,history:Array.isArray(saved.history)?saved.history.slice(-50):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify({...state,active:null}))}catch{}return state}
  function game(){return window.TGGGame?.getState?.()||{x:50,y:55,heading:0}}
  function namedNpcTarget(name){
    const npc=(window.TGG3D?.namedNpcs||[]).find(x=>x?.userData?.name===name);
    if(npc?.position){
      return {x:50+(Number(npc.position.x)||0)/.92,y:50+(Number(npc.position.z)||0)/.92,color:COLORS[name]||'#c7ff00'};
    }
    return {...(FALLBACKS[name]||{x:50,y:50}),color:COLORS[name]||'#c7ff00'};
  }
  function routeBusy(){
    return !!window.TGGWorldDepth?.getStatus?.().activeBeat||!!window.TGGMeetups?.snapshot?.().active;
  }
  function chooseContact(){
    const g=game();
    return CONTACTS.map(name=>{
      const t=namedNpcTarget(name);
      const distance=Math.hypot(t.x-(Number(g.x)||50),t.y-(Number(g.y)||55));
      const affinity=Number(window.TGGNPCRelations?.relationship?.(name)?.relation?.affinity)||0;
      return {name,target:t,distance,affinity};
    }).sort((a,b)=>a.distance-b.distance||b.affinity-a.affinity)[0]||null;
  }
  function spawnEncounter(name=null,{source='street-director',force=false}={}){
    if(state.active)return {accepted:false,status:'encounter_active',encounter:clone(state.active)};
    if(!force&&routeBusy())return {accepted:false,status:'route_busy'};
    const selected=name?{name,target:namedNpcTarget(name)}:chooseContact();
    if(!selected||!CONTACTS.includes(selected.name))return {accepted:false,status:'unknown_contact',name};
    const target=namedNpcTarget(selected.name);
    state.active={
      id:selected.name+'-'+Date.now(),name:selected.name,source:String(source||'street-director'),
      label:'STREET ENCOUNTER • '+selected.name,x:target.x,y:target.y,
      radius:7,color:target.color||COLORS[selected.name],status:'travel',createdAt:Date.now()
    };
    state.lastOffered={name:selected.name,at:Date.now(),source:state.active.source};
    state.history.push({type:'spawn',...state.active});
    state.history=state.history.slice(-50);
    save();render();
    window.TGGGameFeel?.objective?.('STREET ENCOUNTER',selected.name+' • FIND THEM IN THE CITY');
    window.dispatchEvent(new CustomEvent('tgg:street-encounter-start',{detail:clone(state.active)}));
    return {accepted:true,status:'routed',encounter:clone(state.active),navigation:navigationTarget()};
  }
  function navigationTarget(){
    if(!state.active)return null;
    const target=namedNpcTarget(state.active.name);
    state.active.x=target.x;state.active.y=target.y;state.active.color=target.color||state.active.color;
    const g=game(),dx=state.active.x-(Number(g.x)||50),dy=state.active.y-(Number(g.y)||55);
    const distance=Math.hypot(dx,dy),bearing=Math.atan2(dy,dx)*180/Math.PI,heading=Number(g.heading)||0;
    return {
      id:state.active.id,name:state.active.name,label:state.active.label,x:state.active.x,y:state.active.y,
      radius:state.active.radius,color:state.active.color,status:state.active.status,source:state.active.source,
      distance,meters:Math.max(0,Math.round(distance*3.2)),arrived:distance<=state.active.radius,
      relative:((bearing-heading+540)%360)-180
    };
  }
  function beginConversation(){
    const nav=navigationTarget();
    if(!nav)return {accepted:false,status:'no_encounter'};
    if(!nav.arrived){
      window.TGGGameFeel?.objective?.('FIND '+nav.name,nav.meters+' m • FOLLOW STREET MARKER');
      return {accepted:false,status:'travel_required',navigation:nav};
    }
    const result=window.TGGNPCRelations?.interact?.(nav.name)||{ok:false,status:'relations_unavailable'};
    if(!result?.ok)return {accepted:false,status:'conversation_failed',result};
    state.active.status='conversation';
    state.history.push({type:'conversation',id:state.active.id,name:state.active.name,at:Date.now()});
    state.history=state.history.slice(-50);
    save();render();
    window.dispatchEvent(new CustomEvent('tgg:street-encounter-conversation',{detail:{id:state.active.id,name:state.active.name}}));
    return {accepted:true,status:'choice_required',name:state.active.name,result};
  }
  function buildHandoff(name,resolved){
    const world=window.TGGWorldDepth?.getStatus?.()||{};
    if(world.activeBeat)return {kind:'world-opportunity',success:true,id:world.activeBeat.id};
    const target=HANDOFFS[name]||FALLBACKS[name];
    const meetup=window.TGGMeetups?.createMeetup?.(name,{source:'street-encounter-handoff',target,label:target.label||('FOLLOW UP WITH '+name)});
    const handoff={kind:'meetup',success:!!meetup?.accepted,status:meetup?.status||'unavailable',target:target?{...target}:null};
    window.TGGMessages?.sendMessage?.(name,'Good running into you. Follow the next move on your map.','street-handoff',{choice:resolved?.choice||null,target:target?{...target}:null});
    return handoff;
  }
  function finishFromChoice(detail={}){
    if(!state.active||state.active.status!=='conversation'||detail.name!==state.active.name)return false;
    const encounter=clone(state.active);
    const handoff=buildHandoff(encounter.name,detail);
    const completed={...encounter,choice:detail.choice||null,affinity:Number(detail.affinity)||0,handoff,completedAt:Date.now()};
    state.completed=(Number(state.completed)||0)+1;
    state.lastCompleted=completed;
    state.history.push({type:'complete',...completed});
    state.history=state.history.slice(-50);
    state.active=null;save();render();
    window.TGGGameFeel?.objective?.(encounter.name+' • STREET LINK COMPLETE',handoff.success?'NEXT MOVE ROUTED':'CONTACT UPDATED');
    window.dispatchEvent(new CustomEvent('tgg:street-encounter-complete',{detail:clone(completed)}));
    return completed;
  }
  function cancelEncounter(reason='cancelled'){
    if(!state.active)return false;
    state.history.push({type:'cancel',id:state.active.id,name:state.active.name,reason,at:Date.now()});
    state.history=state.history.slice(-50);state.active=null;save();render();return true;
  }
  function ensureUi(){
    let button=document.getElementById('v506StreetEncounterBtn');
    const actions=document.querySelector('#game .action-deck .actions')||window.TGG3D?.interactionActionsHost?.();
    if(!button&&actions){
      button=document.createElement('button');button.id='v506StreetEncounterBtn';button.type='button';button.textContent='STREET ENCOUNTER';
      button.addEventListener('click',()=>spawnEncounter());actions.appendChild(button);
    }
    let hud=document.getElementById('v506StreetEncounterHud');
    if(!hud){
      hud=document.createElement('aside');hud.id='v506StreetEncounterHud';hud.hidden=true;
      hud.innerHTML='<small>STREET ENCOUNTER</small><b id="v506EncounterName">CONTACT</b><span id="v506EncounterRoute">ROUTE READY</span>';
      document.body.appendChild(hud);
      const style=document.createElement('style');style.id='v506StreetEncounterStyle';
      style.textContent='#v506StreetEncounterHud{position:fixed;left:16px;bottom:16px;z-index:11950;width:min(280px,calc(100vw - 32px));padding:10px 12px;border:1px solid #65d6ff45;border-radius:14px;background:#071019ed;color:#eef2f7;box-shadow:0 18px 50px #0009;font-family:Inter,system-ui,sans-serif}#v506StreetEncounterHud[hidden]{display:none}#v506StreetEncounterHud small{display:block;color:#65d6ff;font-size:8px;font-weight:900;letter-spacing:.12em}#v506StreetEncounterHud b{display:block;margin-top:3px;font-size:12px}#v506StreetEncounterHud span{display:block;margin-top:4px;color:#9fb0c3;font-size:9px;font-weight:800}#v506StreetEncounterBtn{border-color:#65d6ff45!important;color:#9ee7ff!important}';
      document.head.appendChild(style);
    }
    return {button,hud};
  }
  function render(){
    const {button,hud}=ensureUi();
    const nav=navigationTarget();
    if(button){button.disabled=!!state.active;button.textContent=state.active?'ENCOUNTER ACTIVE':'STREET ENCOUNTER';}
    if(!hud)return;
    hud.hidden=!nav;
    if(nav){
      document.getElementById('v506EncounterName').textContent=nav.name+' • '+String(nav.status||'travel').toUpperCase();
      document.getElementById('v506EncounterRoute').textContent=nav.arrived?'INTERACT NOW':nav.meters+' m • FOLLOW CITY NAV';
      hud.style.borderColor=(nav.color||'#65d6ff')+'66';
    }
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,active:state.active?clone(state.active):null,navigation:navigationTarget(),completed:state.completed,lastCompleted:state.lastCompleted?clone(state.lastCompleted):null,lastOffered:state.lastOffered?clone(state.lastOffered):null,history:state.history.slice(-50)}}
  function run(){
    const ui=ensureUi();
    const checks={
      game:!!window.TGGGame,threeD:!!window.TGG3D,relations:!!window.TGGNPCRelations,
      meetups:!!window.TGGMeetups,messages:!!window.TGGMessages,button:!!ui.button,hud:!!ui.hud,
      navigation:typeof navigationTarget==='function',policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureUi();render();
    window.addEventListener('tgg:npc-choice-resolved',e=>{finishFromChoice(e.detail||{});render()});
    setInterval(render,350);
    window.TGGStreetEncounters={version:VERSION,mutationPolicy:POLICY,spawnEncounter,chooseContact,navigationTarget,beginConversation,finishFromChoice,cancelEncounter,namedNpcTarget,snapshot,run};
    window.TGGV506={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV506='on';
    window.dispatchEvent(new CustomEvent('tgg:v506-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();