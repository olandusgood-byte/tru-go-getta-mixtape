(()=>{
  'use strict';
  const VERSION='5.25.0';
  const POLICY='local-only';
  const KEY='tgg-v525-contact-world-mega';
  const TARGETS={
    M:{x:58,y:46,label:'BUSINESS LINK'},
    'DJ V':{x:50,y:62,label:'EVENT LINK'},
    Kane:{x:24,y:37,label:'STUDIO LINK'},
    'Rico Flame':{x:74,y:62,label:'STREET LINK'}
  };
  const defaults={
    presence:null,lastPresence:null,activeCallback:null,lastCallback:null,
    callOutcomes:0,callbackAccepts:0,missionOutcomes:0,contractOutcomes:0,
    cityReactions:0,lastCinematic:null,history:[]
  };
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...defaults,...raw,history:Array.isArray(raw.history)?raw.history.slice(-80):[]};
    }catch{return {...defaults}}
  }
  let state=load();
  let presenceSignature='';
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function push(type,detail={}){
    state.history.push({type,...clone(detail),at:Date.now()});
    state.history=state.history.slice(-80);
  }
  function ensureHud(){
    let root=document.getElementById('v525ContactWorldHud');
    if(root)return root;
    root=document.createElement('aside');
    root.id='v525ContactWorldHud';
    root.hidden=true;
    root.innerHTML='<small>V5.25 • CONTACT WORLD</small><b id="v525ContactWorldTitle">CITY CONTACTS ACTIVE</b><span id="v525ContactWorldMeta"></span>';
    document.body.appendChild(root);
    const style=document.createElement('style');
    style.id='v525ContactWorldStyle';
    style.textContent='#v525ContactWorldHud{position:fixed;left:16px;top:78px;z-index:11870;width:min(330px,calc(100vw - 32px));padding:10px 12px;border:1px solid #69f0ae42;border-radius:14px;background:#07110ded;color:#eef2f7;box-shadow:0 18px 50px #0008;font-family:Inter,system-ui,sans-serif;pointer-events:none}#v525ContactWorldHud[hidden]{display:none}#v525ContactWorldHud small{display:block;color:#69f0ae;font-size:8px;font-weight:900;letter-spacing:.12em}#v525ContactWorldHud b{display:block;margin-top:4px;font-size:11px}#v525ContactWorldHud span{display:block;margin-top:3px;color:#aeb8c6;font-size:9px;font-weight:800}';
    document.head.appendChild(style);
    return root;
  }
  function render(){
    const root=ensureHud();
    const title=document.getElementById('v525ContactWorldTitle');
    const meta=document.getElementById('v525ContactWorldMeta');
    const callback=state.activeCallback;
    const presence=state.presence;
    root.hidden=!(callback||presence||state.lastCinematic);
    if(!title||!meta)return;
    if(presence){
      title.textContent=presence.name+' • '+presence.label;
      meta.textContent='PHYSICAL CONTACT • '+presence.source.toUpperCase();
    }else if(callback){
      title.textContent=callback.name+' • CALLBACK READY';
      meta.textContent=callback.branch.toUpperCase()+' • ROUTE WHEN READY';
    }else if(state.lastCinematic){
      title.textContent=state.lastCinematic.title;
      meta.textContent=state.lastCinematic.detail;
    }
  }
  function routeCandidate(){
    const mission=window.TGGStreetMissions?.navigationTarget?.();
    if(mission?.name&&Number.isFinite(Number(mission.x))&&Number.isFinite(Number(mission.y))){
      return {name:mission.name,x:Number(mission.x),y:Number(mission.y),label:String(mission.label||mission.title||'MISSION CONTACT'),source:'street-mission'};
    }
    const meetup=window.TGGMeetups?.navigationTarget?.();
    if(meetup?.name&&Number.isFinite(Number(meetup.x))&&Number.isFinite(Number(meetup.y))){
      return {name:meetup.name,x:Number(meetup.x),y:Number(meetup.y),label:String(meetup.label||'CONTACT MEETUP'),source:'meetup'};
    }
    const contract=window.TGGCareerContracts?.snapshot?.()?.active||null;
    const beat=window.TGGWorldDepth?.beatNavigation?.();
    if(contract?.sponsor&&beat&&Number.isFinite(Number(beat.x))&&Number.isFinite(Number(beat.y))){
      return {name:contract.sponsor,x:Number(beat.x),y:Number(beat.y),label:String(contract.label||beat.label||'CAREER CONTRACT'),source:'career-contract'};
    }
    return null;
  }
  function clearPresence(){
    const prior=state.presence;
    if(prior?.name)window.TGG3D?.clearNamedNpcOverride?.(prior.name,'v525:'+prior.source);
    if(prior)state.lastPresence={...prior,clearedAt:Date.now()};
    state.presence=null;
    presenceSignature='';
    save();render();
    return prior;
  }
  function syncPresence(){
    const route=routeCandidate();
    if(!route){if(state.presence)clearPresence();return null}
    const sig=[route.name,route.source,route.x.toFixed(2),route.y.toFixed(2),route.label].join('|');
    if(sig===presenceSignature)return state.presence?{...state.presence}:null;
    if(state.presence?.name&&(state.presence.name!==route.name||state.presence.source!==route.source)){
      window.TGG3D?.clearNamedNpcOverride?.(state.presence.name,'v525:'+state.presence.source);
    }
    const routed=window.TGG3D?.setNamedNpcOverride?.(route.name,{x:route.x,y:route.y},{source:'v525:'+route.source,label:route.label,snap:true});
    if(!routed?.ok)return null;
    state.presence={...route,routedAt:Date.now()};
    presenceSignature=sig;
    state.lastPresence={...state.presence};
    save();render();
    return {...state.presence};
  }
  function cinematic(title,detail,contact=null){
    state.cityReactions=(Number(state.cityReactions)||0)+1;
    state.lastCinematic={title:String(title),detail:String(detail),contact:contact||null,at:Date.now()};
    window.TGGGameFeel?.objective?.(String(title),String(detail));
    window.TGGV509?.syncCrowd?.();
    window.dispatchEvent(new CustomEvent('tgg:v525-city-reaction',{detail:{...state.lastCinematic}}));
    save();render();
    return {...state.lastCinematic};
  }
  function registerCallOutcome(detail={}){
    const name=String(detail.name||'');
    if(!TARGETS[name])return {accepted:false,status:'unknown_contact',name};
    const durationMs=Math.max(0,Number(detail.durationMs)||0);
    const target=TARGETS[name];
    const callback={
      id:name+'-callback-'+Date.now(),name,
      branch:durationMs>=1500?'deeper-link':'quick-follow-up',
      durationMs,action:String(detail.action||'follow-up'),
      target:{x:target.x,y:target.y,radius:7},
      label:target.label+' • CALLBACK',
      createdAt:Date.now()
    };
    state.callOutcomes=(Number(state.callOutcomes)||0)+1;
    state.activeCallback=callback;
    state.lastCallback={...callback,status:'ready'};
    push('call-outcome',callback);
    window.TGGMessages?.sendMessage?.(name,'Tap back in when you are ready to link.','callback-opportunity',{target:callback.target,branch:callback.branch});
    cinematic('CALLBACK OPEN',name+' • '+callback.branch.replaceAll('-',' ').toUpperCase(),name);
    save();render();
    return {accepted:true,status:'callback_ready',callback:{...callback}};
  }
  function acceptCallback(){
    const cb=state.activeCallback;
    if(!cb)return {accepted:false,status:'no_callback'};
    if(window.TGGStreetMissions?.snapshot?.()?.active)return {accepted:false,status:'mission_active'};
    if(window.TGGMeetups?.snapshot?.()?.active)return {accepted:false,status:'meetup_active'};
    const routed=window.TGGMeetups?.createMeetup?.(cb.name,{source:'call-callback',target:cb.target,label:cb.label});
    if(!routed?.accepted)return {accepted:false,status:routed?.status||'route_failed',route:routed||null};
    state.callbackAccepts=(Number(state.callbackAccepts)||0)+1;
    state.lastCallback={...cb,status:'accepted',acceptedAt:Date.now()};
    state.activeCallback=null;
    window.TGGNPCRelations?.adjustAffinity?.(cb.name,1,'call-callback-accepted');
    window.TGGV509?.recordDistrict?.(2,'v525:callback:'+cb.name);
    push('callback-accepted',state.lastCallback);
    save();
    syncPresence();
    cinematic('CONTACT LINK ROUTED',cb.name+' • PHYSICAL MEETUP ACTIVE',cb.name);
    return {accepted:true,status:'routed',meetup:routed.meetup||null,presence:state.presence?{...state.presence}:null};
  }
  function recordMissionOutcome(detail={}){
    const name=String(detail.name||'CONTACT');
    state.missionOutcomes=(Number(state.missionOutcomes)||0)+1;
    const district=window.TGGV509?.recordDistrict?.(5,'v525:mission:'+name)||null;
    window.TGGLivingCity?.nudgeHeat?.(3);
    push('mission-outcome',{name,id:detail.id||null,reward:clone(detail.reward||{}),district});
    cinematic('MISSION ECHO',name+' • DISTRICT REP UP',name);
    save();
    return {accepted:true,status:'recorded',name,district};
  }
  function recordContractOutcome(detail={}){
    const sponsor=String(detail.sponsor||'CONTACT');
    const completed=detail.completed===true;
    state.contractOutcomes=(Number(state.contractOutcomes)||0)+1;
    const delta=completed?4:-3;
    const district=window.TGGV509?.recordDistrict?.(delta,'v525:contract:'+sponsor+':'+(completed?'complete':'failed'))||null;
    window.TGGLivingCity?.nudgeHeat?.(completed?2:4);
    push('contract-outcome',{sponsor,id:detail.id||null,completed,district});
    cinematic(completed?'CONTRACT MOMENTUM':'CONTRACT FALLOUT',sponsor+' • '+(completed?'CITY RESPONSE UP':'CITY PRESSURE UP'),sponsor);
    save();
    return {accepted:true,status:'recorded',sponsor,completed,district};
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,
      ...clone(state),
      route:routeCandidate(),
      actors:window.TGG3D?.getNamedNpcPresence?.()||[],
      features:[
        'physical-contact-route-presence',
        'call-to-callback-branching',
        'callback-to-physical-meetup',
        'mission-reputation-consequences',
        'contract-reputation-consequences',
        'city-reaction-cinematic-hooks'
      ]
    };
  }
  function run(){
    const hud=ensureHud();
    const snap=snapshot();
    const checks={
      hud:!!hud,
      threeD:!!window.TGG3D,
      presenceApi:typeof window.TGG3D?.setNamedNpcOverride==='function'&&typeof window.TGG3D?.clearNamedNpcOverride==='function'&&typeof window.TGG3D?.getNamedNpcPresence==='function',
      namedContacts:(window.TGG3D?.namedNpcs||[]).length>=4,
      meetups:!!window.TGGMeetups,
      missions:!!window.TGGStreetMissions,
      calls:!!window.TGGCallSessions,
      contracts:!!window.TGGCareerContracts,
      immersion:!!window.TGGV509,
      features:snap.features.length===6,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snap,at:new Date().toISOString()};
  }
  window.TGGV525={version:VERSION,mutationPolicy:POLICY,run,snapshot,syncPresence,acceptCallback,registerCallOutcome,recordMissionOutcome,recordContractOutcome};
  function boot(){
    ensureHud();
    window.addEventListener('tgg:meetup-start',syncPresence);
    window.addEventListener('tgg:meetup-complete',()=>setTimeout(syncPresence,0));
    window.addEventListener('tgg:street-mission-start',syncPresence);
    window.addEventListener('tgg:street-mission-stage',()=>setTimeout(syncPresence,0));
    window.addEventListener('tgg:street-mission-complete',e=>{recordMissionOutcome(e.detail||{});setTimeout(syncPresence,0)});
    window.addEventListener('tgg:career-contract-start',syncPresence);
    window.addEventListener('tgg:career-contract-outcome',e=>{recordContractOutcome(e.detail||{});setTimeout(syncPresence,0)});
    window.addEventListener('tgg:call-session-end',e=>registerCallOutcome(e.detail||{}));
    setInterval(syncPresence,350);
    syncPresence();render();
    window.TGGContactWorld={version:VERSION,mutationPolicy:POLICY,syncPresence,clearPresence,registerCallOutcome,acceptCallback,recordMissionOutcome,recordContractOutcome,cinematic,snapshot,run};
    document.documentElement.dataset.tggV525='on';
    window.dispatchEvent(new CustomEvent('tgg:v525-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();