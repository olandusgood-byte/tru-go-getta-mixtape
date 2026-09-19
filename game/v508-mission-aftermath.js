(()=>{
  const VERSION='5.8.0';
  const POLICY='local-only';
  const KEY='tgg-v508-mission-aftermath';
  const CONTACT_META={
    M:{district:'BUSINESS DISTRICT',followup:'property-deal',color:'#3b82f6'},
    'DJ V':{district:'PARKSIDE',followup:'headline-night',color:'#a855f7'},
    Kane:{district:'STUDIO ROW',followup:'brand-meeting',color:'#ff8a3d'},
    'Rico Flame':{district:'MIXTAPE AVE',followup:'brand-meeting',color:'#ff3b30'}
  };
  const defaults={
    districtRep:{'BUSINESS DISTRICT':0,PARKSIDE:0,'STUDIO ROW':0,'MIXTAPE AVE':0},
    contactStreaks:{M:0,'DJ V':0,Kane:0,'Rico Flame':0},
    completed:0,lastAftermath:null,history:[]
  };
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {
        ...clone(defaults),...saved,
        districtRep:{...defaults.districtRep,...(saved.districtRep||{})},
        contactStreaks:{...defaults.contactStreaks,...(saved.contactStreaks||{})},
        history:Array.isArray(saved.history)?saved.history.slice(-60):[]
      };
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function choiceFor(name){return String(window.TGGNPCRelations?.relationship?.(name)?.relation?.lastChoice||'professional')}
  function repDelta(choice,reward={}){
    const base=Math.max(2,Math.round((Number(reward.xp)||40)/14));
    return choice==='street'?base+2:choice==='loyal'?base+1:base;
  }
  function cityRep(){
    const vals=Object.values(state.districtRep||{}).map(Number);
    return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
  }
  function spawnFollowup(name,meta){
    if(window.TGGWorldDepth?.getStatus?.().activeBeat){
      const active=window.TGGWorldDepth.getStatus().activeBeat;
      return {kind:'existing-world-beat',success:true,id:active.id||null,label:active.label||null};
    }
    const beat=window.TGGWorldDepth?.spawnBeatFor?.(meta.followup,{source:'street-mission-aftermath',npcName:name})||null;
    return {
      kind:'world-beat',
      success:!!beat,
      id:beat?.id||meta.followup,
      label:beat?.label||null,
      navigation:window.TGGWorldDepth?.beatNavigation?.()||null
    };
  }
  function applyMission(detail={}){
    const name=String(detail.name||'');
    const meta=CONTACT_META[name];
    if(!meta||detail.status!=='complete')return {accepted:false,status:'ignored',name};
    const choice=choiceFor(name);
    const delta=repDelta(choice,detail.reward||{});
    const before=Number(state.districtRep[meta.district])||0;
    const after=clamp(before+delta);
    state.districtRep[meta.district]=after;
    state.contactStreaks[name]=(Number(state.contactStreaks[name])||0)+1;
    state.completed=(Number(state.completed)||0)+1;

    if(choice==='street')window.TGGLivingCity?.nudgeHeat?.(3);
    else if(choice==='loyal')window.TGGLivingCity?.nudgeHeat?.(2);
    else{
      window.TGGLivingCity?.nudgeHeat?.(1);
      window.TGGWorldSystems?.coolConsequence?.(1);
    }

    const followup=spawnFollowup(name,meta);
    const aftermath={
      id:name+'-aftermath-'+Date.now(),name,district:meta.district,choice,
      repBefore:before,repAfter:after,repDelta:delta,cityRep:cityRep(),
      streak:state.contactStreaks[name],missionId:detail.id||null,
      missionTitle:detail.title||null,reward:clone(detail.reward||{}),
      followup,at:Date.now()
    };
    state.lastAftermath=aftermath;
    state.history.push({type:'aftermath',...aftermath});
    state.history=state.history.slice(-60);
    save();render();
    const next=followup.label||String(followup.id||'NEXT OPPORTUNITY').replaceAll('-',' ').toUpperCase();
    window.TGGGameFeel?.objective?.(meta.district+' REP +'+delta,next+' • WORLD REACTION');
    window.TGGMessages?.sendMessage?.(name,'That move changed how the city sees you. I put the next opportunity on your map.','mission-aftermath',{
      district:meta.district,repAfter:after,choice,followupId:followup.id
    });
    window.dispatchEvent(new CustomEvent('tgg:mission-aftermath',{detail:clone(aftermath)}));
    return {accepted:true,status:'applied',aftermath:clone(aftermath)};
  }
  function ensureUi(){
    let root=document.getElementById('v508AftermathHud');
    if(!root){
      root=document.createElement('aside');
      root.id='v508AftermathHud';
      root.hidden=true;
      root.innerHTML='<small>CITY AFTERMATH</small><b id="v508AftermathTitle">WORLD REACTION</b><span id="v508AftermathRep"></span><em id="v508AftermathNext"></em>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v508AftermathStyle';
      style.textContent='#v508AftermathHud{position:fixed;right:16px;top:190px;z-index:11930;width:min(310px,calc(100vw - 32px));padding:10px 12px;border:1px solid #ffc84a45;border-radius:14px;background:#120e05ed;color:#eef2f7;box-shadow:0 18px 50px #0009;font-family:Inter,system-ui,sans-serif}#v508AftermathHud[hidden]{display:none}#v508AftermathHud small{display:block;color:#ffc84a;font-size:8px;font-weight:900;letter-spacing:.12em}#v508AftermathHud b{display:block;margin-top:3px;font-size:11px}#v508AftermathHud span,#v508AftermathHud em{display:block;margin-top:3px;color:#aeb8c6;font-size:9px;font-style:normal;font-weight:800}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureUi(),a=state.lastAftermath;
    root.hidden=!a;if(!a)return;
    document.getElementById('v508AftermathTitle').textContent=a.name+' • '+a.district;
    document.getElementById('v508AftermathRep').textContent='DISTRICT REP '+a.repAfter+' • '+a.choice.toUpperCase()+' • STREAK '+a.streak;
    const nav=window.TGGWorldDepth?.beatNavigation?.();
    document.getElementById('v508AftermathNext').textContent=nav
      ?(nav.arrived?'NEXT OPPORTUNITY • ARRIVED':'NEXT OPPORTUNITY • '+nav.meters+' m')
      :'WORLD REACTION RECORDED';
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,
      districtRep:clone(state.districtRep),contactStreaks:clone(state.contactStreaks),
      cityRep:cityRep(),completed:state.completed,
      lastAftermath:state.lastAftermath?clone(state.lastAftermath):null,
      history:state.history.slice(-60)
    };
  }
  function run(){
    const root=ensureUi();
    const checks={
      ui:!!root,worldDepth:!!window.TGGWorldDepth,relations:!!window.TGGNPCRelations,
      messages:!!window.TGGMessages,livingCity:!!window.TGGLivingCity,
      contacts:Object.keys(CONTACT_META).length===4,
      reputation:Object.keys(state.districtRep||{}).length===4,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureUi();render();
    window.addEventListener('tgg:street-mission-complete',e=>{applyMission(e.detail||{});render()});
    setInterval(()=>{if(state.lastAftermath)render()},600);
    window.TGGMissionAftermath={version:VERSION,mutationPolicy:POLICY,applyMission,cityRep,snapshot,run};
    window.TGGV508={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV508='on';
    window.dispatchEvent(new CustomEvent('tgg:v508-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();