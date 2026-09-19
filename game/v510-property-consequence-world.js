(()=>{
  'use strict';
  const VERSION='5.10.0';
  const POLICY='local_only';
  const KEY='tgg-v510-property-consequence-world';
  const PROPERTY={
    apartment:{screen:'home',label:'MY APARTMENT',actions:[
      {id:'reset',label:'RESET',detail:'Recover energy and focus'},
      {id:'plan',label:'PLAN NEXT MOVE',detail:'Trade time for focus and momentum'},
      {id:'wardrobe',label:'WARDROBE',detail:'Open style controls'}
    ]},
    studio:{screen:'studio',label:'PRIVATE STUDIO',actions:[
      {id:'session',label:'RUN SESSION',detail:'Use the studio for a focused session'},
      {id:'rehearse',label:'REHEARSE',detail:'Build focus and performance momentum'},
      {id:'release',label:'RELEASE DESK',detail:'Open release controls'}
    ]},
    garage:{screen:'garage',label:'GARAGE',actions:[
      {id:'tune',label:'TUNE CAR',detail:'Apply owned garage vehicle bonus'},
      {id:'prep',label:'ROAD PREP',detail:'Build focus and driving momentum'},
      {id:'customize',label:'CUSTOMIZE',detail:'Open garage customization'}
    ]},
    office:{screen:'business',label:'BUSINESS OFFICE',actions:[
      {id:'pitch',label:'RUN PITCH',detail:'Use the office for a business move'},
      {id:'network',label:'NETWORK',detail:'Build social and business momentum'},
      {id:'route',label:'ROUTE NEXT MOVE',detail:'Route the next consequence-driven opportunity'}
    ]}
  };
  const defaults={currentInterior:null,entries:{apartment:0,studio:0,garage:0,office:0},hotspotUses:{},lastAction:null,lastRoute:null,routeHistory:[]};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...saved,entries:{...defaults.entries,...(saved.entries||{})},hotspotUses:{...(saved.hotspotUses||{})},routeHistory:Array.isArray(saved.routeHistory)?saved.routeHistory.slice(-40):[]};
    }catch{return clone(defaults)}
  }
  const state=load();
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state};
  const systems=()=>window.TGGWorldSystems?.getStatus?.()||{};
  const immersion=()=>window.TGGV509?.snapshot?.()||{};
  const district=()=>window.TGGDistrictReactions?.snapshot?.()||{};
  const aftermath=()=>window.TGGMissionAftermath?.snapshot?.()||{};
  function propertyLevel(id){return Math.max(0,Number(systems().properties?.[id])||0)}
  function definition(id){return PROPERTY[id]||null}

  function ensureHud(){
    let root=document.getElementById('v510PropertyHud');
    if(root)return root;
    root=document.createElement('aside');
    root.id='v510PropertyHud';
    root.hidden=true;
    root.innerHTML='<small>OWNED SPACE</small><b id="v510PropertyTitle">PROPERTY</b><span id="v510PropertyMeta"></span><div id="v510PropertyActions"></div><button id="v510RouteButton" type="button">ROUTE NEXT MOVE</button><em id="v510RouteMeta"></em>';
    document.body.appendChild(root);
    const style=document.createElement('style');
    style.id='v510PropertyStyle';
    style.textContent='#v510PropertyHud{position:fixed;right:18px;top:120px;z-index:11930;width:min(360px,calc(100vw - 36px));padding:14px;border:1px solid #c7ff0048;border-radius:18px;background:linear-gradient(145deg,#080b12f5,#020306f2);box-shadow:0 22px 60px #000b;color:#f7f9fc;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(14px)}#v510PropertyHud[hidden]{display:none}#v510PropertyHud small{display:block;color:#c7ff00;font-size:8px;font-weight:900;letter-spacing:.15em}#v510PropertyHud b{display:block;margin-top:4px;font-size:18px}#v510PropertyHud span,#v510PropertyHud em{display:block;margin-top:4px;color:#aeb8c6;font-size:9px;font-style:normal;font-weight:800}#v510PropertyActions{display:grid;grid-template-columns:1fr;gap:7px;margin-top:10px}#v510PropertyActions button,#v510RouteButton{min-height:42px;border:1px solid #ffffff1f;border-radius:12px;background:#141922;color:#fff;font-weight:900;font-size:10px;text-align:left;padding:8px 10px}#v510PropertyActions button:first-child,#v510RouteButton{background:#c7ff00;color:#050705}#v510RouteButton{width:100%;margin-top:9px;text-align:center}@media(max-width:760px){#v510PropertyHud{right:10px;top:auto;bottom:10px;width:calc(100vw - 20px)}}';
    document.head.appendChild(style);
    root.addEventListener('click',e=>{
      const action=e.target.closest('[data-v510-action]')?.dataset.v510Action;
      if(action&&state.currentInterior)performHotspot(state.currentInterior,action);
    });
    root.querySelector('#v510RouteButton').addEventListener('click',()=>activateConsequenceRoute());
    return root;
  }

  function routePreview(){
    const a=aftermath().lastAftermath||{};
    const d=district().lastReaction||{};
    const risk=Math.max(0,Number(immersion().risk)||0);
    const choice=String(a.choice||d.choice||'professional');
    const streak=Math.max(0,Number(a.streak)||Number(d.streak)||0);
    const tier=String(d.tier||'UNKNOWN');
    let beatId='brand-meeting';
    let reason='professional momentum';
    if(streak>=2||tier==='CONNECTED'||tier==='OWNED'){beatId='headline-night';reason='district momentum'}
    else if(choice==='street'||risk>=45){beatId='street-meet';reason='street pressure'}
    else if(choice==='loyal'){beatId='park-cypher';reason='relationship momentum'}
    return {beatId,reason,choice,streak,tier,risk,name:a.name||d.name||null,district:a.district||d.district||null};
  }

  function activateConsequenceRoute(force=false){
    const preview=routePreview();
    const existing=window.TGGWorldDepth?.getStatus?.().activeBeat||null;
    let beat=existing;
    if(!beat||force){
      beat=window.TGGWorldDepth?.spawnBeatFor?.(preview.beatId,{force,source:'v510-consequence-route',npcName:preview.name})||null;
    }
    const nav=window.TGGWorldDepth?.beatNavigation?.()||null;
    state.lastRoute={...preview,success:!!beat,activeBeat:beat?.id||null,navigation:nav,at:Date.now()};
    state.routeHistory.push({...state.lastRoute});
    state.routeHistory=state.routeHistory.slice(-40);
    save();render();
    if(beat)window.TGGGameFeel?.objective?.('NEXT MOVE • '+String(beat.label||preview.beatId).toUpperCase(),preview.reason.toUpperCase());
    window.dispatchEvent(new CustomEvent('tgg:v510-route',{detail:clone(state.lastRoute)}));
    return clone(state.lastRoute);
  }

  function actionEffect(id,action){
    if(id==='apartment'&&action==='plan'){window.TGGLifeSim?.change?.({focus:6,energy:-2,momentum:3});return 'PLAN LOCKED IN'}
    if(id==='studio'&&action==='rehearse'){window.TGGLifeSim?.change?.({focus:7,energy:-4,momentum:5});return 'REHEARSAL COMPLETE'}
    if(id==='garage'&&action==='prep'){window.TGGLifeSim?.change?.({focus:3,momentum:3});return 'ROAD PREP COMPLETE'}
    if(id==='office'&&action==='network'){window.TGGLifeSim?.change?.({social:5,focus:-2,momentum:4});return 'NETWORK MOVE COMPLETE'}
    return null;
  }

  function performHotspot(id,action){
    const def=definition(id);
    const spot=def?.actions?.find(x=>x.id===action);
    if(!def||!spot)return {ok:false,status:'unknown_hotspot',id,action};
    const level=propertyLevel(id);
    if(level<=0)return {ok:false,status:'locked',id,action,level};
    let result=null;
    if((id==='apartment'&&action==='reset')||(id==='studio'&&action==='session')||(id==='garage'&&action==='tune')||(id==='office'&&action==='pitch')){
      result=window.TGGWorldSystems?.useProperty?.(id)||{status:'unavailable'};
    }else if((id==='apartment'&&action==='wardrobe')){
      document.querySelector('[data-home="wardrobe"]')?.click();result={status:'opened'};
    }else if(id==='studio'&&action==='release'){
      document.querySelector('[data-studio="release"]')?.click();result={status:'opened'};
    }else if(id==='garage'&&action==='customize'){
      result={status:'opened'};
    }else if(id==='office'&&action==='route'){
      result=activateConsequenceRoute();
    }else{
      const label=actionEffect(id,action);
      result={status:label?'applied':'noop',label};
    }
    const key=id+':'+action;
    state.hotspotUses[key]=(Number(state.hotspotUses[key])||0)+1;
    state.lastAction={id,action,label:spot.label,level,status:String(result?.status||'used'),at:Date.now()};
    save();render();
    window.dispatchEvent(new CustomEvent('tgg:v510-property-action',{detail:clone(state.lastAction)}));
    return {ok:state.lastAction.status!=='unavailable'&&state.lastAction.status!=='noop',...clone(state.lastAction),uses:state.hotspotUses[key]};
  }

  function enterInterior(id,{show=true}={}){
    const def=definition(id);
    if(!def)return {ok:false,status:'unknown_property',id};
    const level=propertyLevel(id);
    state.currentInterior=id;
    state.entries[id]=(Number(state.entries[id])||0)+1;
    save();
    if(show&&document.getElementById(def.screen))window.TGGGame?.show?.(def.screen);
    render();
    return {ok:level>0,status:level>0?'entered':'locked-preview',id,level,screen:def.screen,entries:state.entries[id]};
  }
  function leaveInterior(){
    const prior=state.currentInterior;
    state.currentInterior=null;save();render();
    window.TGGGame?.show?.('game');
    return {left:prior};
  }

  function render(){
    const root=ensureHud();
    const id=state.currentInterior;
    const def=definition(id);
    root.hidden=!def;
    if(!def)return;
    const level=propertyLevel(id);
    root.querySelector('#v510PropertyTitle').textContent=def.label+' • LVL '+level;
    root.querySelector('#v510PropertyMeta').textContent='ENTRIES '+(state.entries[id]||0)+' • '+(level>0?'OWNED':'LOCKED');
    root.querySelector('#v510PropertyActions').innerHTML=def.actions.map(a=>'<button type="button" data-v510-action="'+a.id+'"><b>'+a.label+'</b><small>'+a.detail+'</small></button>').join('');
    const route=routePreview();
    root.querySelector('#v510RouteMeta').textContent='NEXT • '+route.beatId.replaceAll('-',' ').toUpperCase()+' • '+route.reason.toUpperCase();
  }

  function bindScreens(){
    const map={homeBtn:'apartment',studioBtn:'studio',garageBtn:'garage',businessBtn:'office'};
    Object.entries(map).forEach(([buttonId,id])=>{
      const b=document.getElementById(buttonId);
      if(b&&!b.dataset.v510Bound){
        b.dataset.v510Bound='true';
        b.addEventListener('click',()=>setTimeout(()=>enterInterior(id,{show:false}),0));
      }
    });
    ['homeBack','studioBack','garageBack','businessBack'].forEach(id=>{
      const b=document.getElementById(id);
      if(b&&!b.dataset.v510Bound){
        b.dataset.v510Bound='true';b.addEventListener('click',()=>{state.currentInterior=null;save();render()});
      }
    });
  }

  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,...clone(state),
      propertyLevels:Object.fromEntries(Object.keys(PROPERTY).map(id=>[id,propertyLevel(id)])),
      routePreview:routePreview(),
      definitions:clone(PROPERTY)
    };
  }
  function run(){
    const hud=ensureHud();
    bindScreens();
    const snap=snapshot();
    const checks={
      hud:!!hud,
      worldSystems:!!window.TGGWorldSystems,
      worldDepth:!!window.TGGWorldDepth,
      immersion:!!window.TGGV509,
      districtReactions:!!window.TGGDistrictReactions,
      apartmentOwned:snap.propertyLevels.apartment>=1,
      hotspots:Object.values(PROPERTY).every(x=>x.actions.length===3),
      route:!!snap.routePreview.beatId,
      policy:POLICY==='local_only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snap,at:new Date().toISOString()};
  }
  function boot(){
    ensureHud();bindScreens();
    window.addEventListener('tgg:district-reaction',()=>render());
    window.addEventListener('tgg:mission-aftermath',()=>render());
    window.TGGPropertyInteriors={version:VERSION,mutationPolicy:POLICY,enterInterior,leaveInterior,performHotspot,routePreview,activateConsequenceRoute,snapshot,run};
    window.TGGV510={version:VERSION,mutationPolicy:POLICY,run,snapshot,enterInterior,performHotspot,routePreview,activateConsequenceRoute};
    document.documentElement.dataset.tggV510='on';
    window.dispatchEvent(new CustomEvent('tgg:v510-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();