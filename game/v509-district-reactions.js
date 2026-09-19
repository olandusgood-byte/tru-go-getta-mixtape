(()=>{
  const VERSION='5.9.0';
  const POLICY='local-only';
  const KEY='tgg-v509-district-reactions';
  const TIERS=[
    {min:50,id:'OWNED',label:'CITY STRONGHOLD'},
    {min:25,id:'CONNECTED',label:'DISTRICT CONNECTED'},
    {min:10,id:'RESPECTED',label:'LOCAL RESPECT'},
    {min:1,id:'NOTICED',label:'CITY NOTICED'},
    {min:0,id:'UNKNOWN',label:'STILL PROVING IT'}
  ];
  const defaults={districts:{},completed:0,lastReaction:null,history:[]};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...s,districts:{...(s.districts||{})},history:Array.isArray(s.history)?s.history.slice(-80):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function tierFor(rep){
    rep=Math.max(0,Number(rep)||0);
    return TIERS.find(x=>rep>=x.min)||TIERS[TIERS.length-1];
  }
  function applyAftermath(detail={}){
    const district=String(detail.district||'').trim();
    const name=String(detail.name||'').trim();
    if(!district||!name)return {accepted:false,status:'ignored'};
    const rep=Math.max(0,Number(detail.repAfter)||0);
    const prior=state.districts[district]||{rep:0,tier:'UNKNOWN',reactions:0};
    const nextTier=tierFor(rep);
    const changed=prior.tier!==nextTier.id;
    const reaction={
      id:district+'-'+Date.now(),district,name,rep,tier:nextTier.id,label:nextTier.label,
      priorTier:prior.tier||'UNKNOWN',changed,choice:String(detail.choice||'professional'),
      streak:Math.max(0,Number(detail.streak)||0),missionId:detail.missionId||null,at:Date.now()
    };
    state.districts[district]={rep,tier:nextTier.id,reactions:(Number(prior.reactions)||0)+1,lastAt:reaction.at,lastContact:name};
    state.completed=(Number(state.completed)||0)+1;
    state.lastReaction=reaction;
    state.history.push({type:'district-reaction',...reaction});
    state.history=state.history.slice(-80);
    save();

    const heat=nextTier.id==='OWNED'?3:nextTier.id==='CONNECTED'?2:1;
    window.TGGLivingCity?.nudgeHeat?.(heat);
    window.TGGNPCRelations?.adjustAffinity?.(name,changed?2:1,'district-reaction');
    window.TGGMessages?.sendMessage?.(
      name,
      changed
        ? district+' noticed that move. Your standing is now '+nextTier.label+'.'
        : district+' is still reacting to your last move.',
      'district-reaction',
      {district,rep,tier:nextTier.id,changed,missionId:reaction.missionId}
    );
    window.TGGGameFeel?.objective?.(
      district+' • '+nextTier.label,
      changed?'DISTRICT STATUS UPGRADED':'CITY REACTION RECORDED'
    );
    window.dispatchEvent(new CustomEvent('tgg:district-reaction',{detail:clone(reaction)}));
    render();
    return {accepted:true,status:'applied',reaction:clone(reaction)};
  }
  function ensureUi(){
    let root=document.getElementById('v509DistrictReactionHud');
    if(!root){
      root=document.createElement('aside');
      root.id='v509DistrictReactionHud';
      root.hidden=true;
      root.innerHTML='<small>DISTRICT REACTION</small><b id="v509DistrictName">CITY</b><span id="v509DistrictTier"></span><em id="v509DistrictRep"></em>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v509DistrictReactionStyle';
      style.textContent='#v509DistrictReactionHud{position:fixed;left:16px;top:190px;z-index:11920;width:min(300px,calc(100vw - 32px));padding:10px 12px;border:1px solid #38d99645;border-radius:14px;background:#06120ded;color:#eef2f7;box-shadow:0 18px 50px #0009;font-family:Inter,system-ui,sans-serif}#v509DistrictReactionHud[hidden]{display:none}#v509DistrictReactionHud small{display:block;color:#38d996;font-size:8px;font-weight:900;letter-spacing:.12em}#v509DistrictReactionHud b{display:block;margin-top:3px;font-size:11px}#v509DistrictReactionHud span,#v509DistrictReactionHud em{display:block;margin-top:3px;color:#aeb8c6;font-size:9px;font-style:normal;font-weight:800}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureUi(),r=state.lastReaction;
    root.hidden=!r;if(!r)return;
    document.getElementById('v509DistrictName').textContent=r.name+' • '+r.district;
    document.getElementById('v509DistrictTier').textContent=r.label+' • '+r.tier;
    document.getElementById('v509DistrictRep').textContent='DISTRICT REP '+r.rep+' • REACTION '+state.completed;
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,districts:clone(state.districts),
      completed:state.completed,lastReaction:state.lastReaction?clone(state.lastReaction):null,
      history:state.history.slice(-80)
    };
  }
  function run(){
    const root=ensureUi();
    const checks={
      ui:!!root,aftermath:!!window.TGGMissionAftermath,relations:!!window.TGGNPCRelations,
      messages:!!window.TGGMessages,livingCity:!!window.TGGLivingCity,
      tiers:TIERS.length===5,policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureUi();render();
    window.addEventListener('tgg:mission-aftermath',e=>applyAftermath(e.detail||{}));
    window.TGGDistrictReactions={version:VERSION,mutationPolicy:POLICY,applyAftermath,tierFor,snapshot,run};
    window.TGGV509={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV509='on';
    window.dispatchEvent(new CustomEvent('tgg:v509-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
