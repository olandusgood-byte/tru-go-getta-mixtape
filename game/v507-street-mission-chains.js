(()=>{
  const VERSION='5.7.0';
  const POLICY='local-only';
  const KEY='tgg-v507-street-mission-chains';
  const MISSIONS={
    M:{
      title:'MANAGER BUSINESS RUN',
      stages:[
        {id:'downtown-checkin',label:'CHECK IN DOWNTOWN',x:50,y:50,radius:7,color:'#3b82f6'},
        {id:'close-deal',label:'CLOSE THE BUSINESS DEAL',x:11,y:50,radius:7,color:'#3b82f6'}
      ],
      reward:{cash:220,xp:48,affinity:4},life:{focus:-3,momentum:6},message:'That was clean business. Bigger rooms are opening.'
    },
    'DJ V':{
      title:'DJ V PROMO RUN',
      stages:[
        {id:'downtown-promo',label:'PUSH THE RECORD DOWNTOWN',x:50,y:50,radius:7,color:'#a855f7'},
        {id:'park-performance',label:'ROCK THE PARK CROWD',x:76,y:63,radius:7,color:'#a855f7'}
      ],
      reward:{cash:200,xp:52,affinity:4},life:{energy:-5,social:6,momentum:7},message:'The crowd felt that. Your name is moving.'
    },
    Kane:{
      title:'KANE STUDIO DELIVERY',
      stages:[
        {id:'downtown-master',label:'PICK UP THE MASTER DOWNTOWN',x:50,y:50,radius:7,color:'#ff8a3d'},
        {id:'studio-lock',label:'LOCK THE SESSION AT STUDIO ROW',x:24,y:37,radius:7,color:'#ff8a3d'}
      ],
      reward:{cash:240,xp:56,affinity:5},life:{focus:-5,energy:-4,momentum:8},message:'Session locked. That record is ready for the next level.'
    },
    'Rico Flame':{
      title:'RICO STREET PUSH',
      stages:[
        {id:'downtown-link',label:'MAKE THE DOWNTOWN LINK',x:50,y:50,radius:7,color:'#ff3b30'},
        {id:'mixtape-push',label:'PUSH THE TAPE ON MIXTAPE AVE',x:76,y:63,radius:7,color:'#ff3b30'}
      ],
      reward:{cash:210,xp:54,affinity:4},life:{social:5,momentum:7},message:'Street heard it. Keep the pressure on.'
    }
  };
  const defaults={active:null,completed:0,lastCompleted:null,history:[]};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...saved,active:null,history:Array.isArray(saved.history)?saved.history.slice(-60):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify({...state,active:null}))}catch{}return state}
  function game(){return window.TGGGame?.getState?.()||{x:50,y:55,heading:0}}
  function startMission(name,{source='street-encounter-handoff',meetup=null}={}){
    const def=MISSIONS[name];
    if(!def)return {accepted:false,status:'unknown_contact',name};
    if(state.active)return {accepted:false,status:'mission_active',mission:clone(state.active)};
    state.active={
      id:name+'-street-'+Date.now(),name,title:def.title,source:String(source||'street-encounter-handoff'),
      meetupId:meetup?.id||null,stageIndex:0,stages:clone(def.stages),reward:clone(def.reward),
      status:'travel',startedAt:Date.now()
    };
    state.history.push({type:'start',id:state.active.id,name,title:def.title,at:Date.now()});
    state.history=state.history.slice(-60);
    save();render();
    const stage=state.active.stages[0];
    window.TGGGameFeel?.objective?.(def.title,stage.label+' • ROUTE ACTIVE');
    window.TGGMessages?.sendMessage?.(name,'I got one more move for you. Follow the route.','street-mission-start',{missionId:state.active.id,stage:stage.id});
    window.dispatchEvent(new CustomEvent('tgg:street-mission-start',{detail:clone(state.active)}));
    return {accepted:!!state.active,status:'routed',mission:clone(state.active),navigation:navigationTarget()};
  }
  function startFromMeetup(detail={}){
    if(detail.source!=='street-encounter-handoff'||!MISSIONS[detail.name])return false;
    return !!startMission(detail.name,{source:detail.source,meetup:detail})?.accepted;
  }
  function currentStage(){return state.active?.stages?.[state.active.stageIndex]||null}
  function navigationTarget(){
    const stage=currentStage();if(!stage||!state.active)return null;
    const g=game(),dx=Number(stage.x)-(Number(g.x)||50),dy=Number(stage.y)-(Number(g.y)||55);
    const distance=Math.hypot(dx,dy),bearing=Math.atan2(dy,dx)*180/Math.PI,heading=Number(g.heading)||0;
    return {
      id:state.active.id,name:state.active.name,title:state.active.title,
      stageId:stage.id,stageIndex:state.active.stageIndex,stageCount:state.active.stages.length,
      label:stage.label,x:stage.x,y:stage.y,radius:stage.radius,color:stage.color,
      distance,meters:Math.max(0,Math.round(distance*3.2)),arrived:distance<=Number(stage.radius||7),
      relative:((bearing-heading+540)%360)-180,source:state.active.source
    };
  }
  function applyStageEffect(name,stage){
    if(stage.id==='close-deal')window.TGGWorldSystems?.useProperty?.('office');
    if(stage.id==='park-performance')window.TGGLivingCity?.nudgeHeat?.(4);
    if(stage.id==='studio-lock')window.TGGWorldSystems?.useProperty?.('studio');
    if(stage.id==='mixtape-push')window.TGGLivingCity?.nudgeHeat?.(5);
    window.dispatchEvent(new CustomEvent('tgg:street-mission-stage',{detail:{name,stageId:stage.id,label:stage.label,at:Date.now()}}));
  }
  function finishMission(){
    const mission=clone(state.active);if(!mission)return {accepted:false,status:'no_mission'};
    const def=MISSIONS[mission.name],reward=def.reward;
    window.TGGGame?.reward?.(reward.cash,reward.xp);
    window.TGGNPCRelations?.adjustAffinity?.(mission.name,reward.affinity,'street-mission-complete');
    window.TGGLifeSim?.change?.(def.life||{});
    const completed={...mission,status:'complete',completedAt:Date.now(),reward:clone(reward)};
    state.completed=(Number(state.completed)||0)+1;
    state.lastCompleted=completed;
    state.history.push({type:'complete',id:completed.id,name:completed.name,reward:clone(reward),at:completed.completedAt});
    state.history=state.history.slice(-60);
    state.active=null;save();render();
    window.TGGMessages?.sendMessage?.(completed.name,def.message,'street-mission-complete',{missionId:completed.id,reward:clone(reward)});
    window.TGGGameFeel?.objective?.('STREET MISSION COMPLETE','+$'+reward.cash+' • +'+reward.xp+' XP • RELATIONSHIP UP');
    window.dispatchEvent(new CustomEvent('tgg:street-mission-complete',{detail:clone(completed)}));
    return {accepted:!!completed,status:'complete',mission:completed};
  }
  function advanceMission(){
    const nav=navigationTarget();
    if(!nav)return {accepted:false,status:'no_mission'};
    if(!nav.arrived){
      window.TGGGameFeel?.objective?.(state.active.title,nav.meters+' m • '+nav.label);
      return {accepted:false,status:'travel_required',navigation:nav};
    }
    const stage=currentStage();
    applyStageEffect(state.active.name,stage);
    state.history.push({type:'stage',id:state.active.id,name:state.active.name,stageId:stage.id,stageIndex:state.active.stageIndex,at:Date.now()});
    state.history=state.history.slice(-60);
    if(state.active.stageIndex<state.active.stages.length-1){
      state.active.stageIndex++;
      state.active.status='travel';
      save();render();
      const next=currentStage();
      window.TGGGameFeel?.objective?.(state.active.title,next.label+' • NEXT STOP');
      return {accepted:true,status:'stage_complete',stageId:stage.id,next:navigationTarget()};
    }
    return finishMission();
  }
  function cancelMission(reason='cancelled'){
    if(!state.active)return {accepted:false,status:'no_mission'};
    const old={...clone(state.active),reason:String(reason),at:Date.now()};
    state.history.push({type:'cancel',id:old.id,name:old.name,reason:old.reason,at:old.at});
    state.history=state.history.slice(-60);state.active=null;save();render();
    return {accepted:!!old,status:'cancelled',mission:old};
  }
  function ensureUi(){
    let root=document.getElementById('v507StreetMissionHud');
    if(!root){
      root=document.createElement('aside');root.id='v507StreetMissionHud';root.hidden=true;
      root.innerHTML='<small>NPC STREET MISSION</small><b id="v507MissionTitle">NO ACTIVE MISSION</b><span id="v507MissionStage"></span><em id="v507MissionRoute"></em>';
      document.body.appendChild(root);
      const style=document.createElement('style');style.id='v507StreetMissionStyle';
      style.textContent='#v507StreetMissionHud{position:fixed;right:16px;top:78px;z-index:11940;width:min(310px,calc(100vw - 32px));padding:10px 12px;border:1px solid #c7ff0045;border-radius:14px;background:#091006ed;color:#eef2f7;box-shadow:0 18px 50px #0009;font-family:Inter,system-ui,sans-serif}#v507StreetMissionHud[hidden]{display:none}#v507StreetMissionHud small{display:block;color:#c7ff00;font-size:8px;font-weight:900;letter-spacing:.12em}#v507StreetMissionHud b{display:block;margin-top:3px;font-size:11px}#v507StreetMissionHud span,#v507StreetMissionHud em{display:block;margin-top:3px;color:#aeb8c6;font-size:9px;font-style:normal;font-weight:800}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureUi(),nav=navigationTarget();
    root.hidden=!nav;if(!nav)return;
    document.getElementById('v507MissionTitle').textContent=nav.title;
    document.getElementById('v507MissionStage').textContent='STAGE '+(nav.stageIndex+1)+'/'+nav.stageCount+' • '+nav.label;
    document.getElementById('v507MissionRoute').textContent=nav.arrived?'ARRIVED • INTERACT':nav.meters+' m • FOLLOW CITY NAV';
    root.style.borderColor=(nav.color||'#c7ff00')+'66';
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,active:state.active?clone(state.active):null,navigation:navigationTarget(),completed:state.completed,lastCompleted:state.lastCompleted?clone(state.lastCompleted):null,history:state.history.slice(-60)}}
  function run(){
    const root=ensureUi();
    const checks={
      ui:!!root,game:!!window.TGGGame,relations:!!window.TGGNPCRelations,
      meetups:!!window.TGGMeetups,messages:!!window.TGGMessages,
      contacts:Object.keys(MISSIONS).length===4,navigation:typeof navigationTarget==='function',
      stages:Object.values(MISSIONS).every(x=>x.stages.length===2),policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureUi();render();
    window.addEventListener('tgg:meetup-complete',e=>{startFromMeetup(e.detail||{});render()});
    setInterval(render,400);
    window.TGGStreetMissions={version:VERSION,mutationPolicy:POLICY,startMission,startFromMeetup,navigationTarget,advanceMission,cancelMission,snapshot,run};
    window.TGGV507={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV507='on';
    window.dispatchEvent(new CustomEvent('tgg:v507-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();