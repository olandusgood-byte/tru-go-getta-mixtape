(() => {
  'use strict';
  const VERSION='5.09.0';
  const KEY='tgg-world-immersion-v509';
  const defaults={
    choices:0,worldCompletions:0,storyTransitions:0,
    districtMemory:{},crowdSentiment:0,risk:0,lastChoice:null,lastReaction:null,
    propertyVisits:{apartment:0,studio:0,garage:0,office:0}
  };
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const load=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...defaults,...saved,districtMemory:{...defaults.districtMemory,...(saved.districtMemory||{})},propertyVisits:{...defaults.propertyVisits,...(saved.propertyVisits||{})}};
    }catch{return structuredClone(defaults)}
  };
  const state=load();
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
  const city=()=>window.TGGLivingCity?.getStatus?.()||{};
  const world=()=>window.TGGWorldDepth?.getStatus?.()||{};
  const systems=()=>window.TGGWorldSystems?.getStatus?.()||{};
  const game=()=>window.TGGGame?.getState?.()||{};
  const currentDistrict=()=>String(city().district||'DOWNTOWN').toUpperCase();

  function recordDistrict(delta=0,reason='world'){
    const d=currentDistrict();
    const row=state.districtMemory[d]||{rep:0,heat:0,visits:0,lastReason:null};
    row.rep=clamp((Number(row.rep)||0)+delta,-100,100);
    row.heat=clamp((Number(row.heat)||0)+Math.abs(delta)*.75,0,100);
    row.visits=(Number(row.visits)||0)+1;
    row.lastReason=reason; row.at=Date.now();
    state.districtMemory[d]=row;
    save();
    return {...row,district:d};
  }

  function ensureCrowd(){
    const api=window.TGG3D;
    const list=api?.pedestrians,scene=api?.scene;
    if(!Array.isArray(list)||!scene||!list.length)return 0;
    const target=18;
    while(list.length<target){
      const source=list[list.length%Math.min(6,list.length)];
      const clone=source.clone(true);
      const i=list.length;
      const ring=Math.floor(i/6)+1;
      const route=(source.userData.route||[]).map(([x,z],j)=>[
        x+(ring*2.3)*((i+j)%2?1:-1),
        z+(ring*1.9)*((i+j)%3?1:-1)
      ]);
      clone.userData={...source.userData,route,routeIndex:1,parts:null,baseSpeed:(Number(source.userData.speed)||.02)*(1+(i%4)*.04),crowdClone:true};
      clone.userData.speed=clone.userData.baseSpeed;
      clone.userData.walkPhase=i*.71;
      clone.scale.multiplyScalar(.92+(i%3)*.04);
      if(route[0])clone.position.set(route[0][0],0,route[0][1]);
      scene.add(clone); list.push(clone);
    }
    return list.length;
  }

  function crowdProfile(){
    const c=city(),w=world();
    const heat=clamp(c.heat||0);
    const event=!!c.cityEvent;
    const pressure=clamp(w.districtPressure||0);
    const desired=Math.max(6,Math.min(18,6+Math.round(heat/11)+(event?3:0)+Math.round(pressure/35)));
    const mood=String(c.crowdMood||'steady').toLowerCase();
    const reaction=event?'event':heat>72?'hype':heat>45?'watching':mood.includes('tense')?'tense':'steady';
    return {desired,heat,pressure,event,reaction,mood};
  }

  function syncCrowd(){
    ensureCrowd();
    const list=window.TGG3D?.pedestrians||[];
    const p=crowdProfile();
    list.forEach((h,i)=>{
      h.visible=i<p.desired;
      h.userData.baseSpeed=h.userData.baseSpeed||Number(h.userData.speed)||.02;
      const pace=p.reaction==='hype'?1.32:p.reaction==='tense'?1.18:p.reaction==='event'?.82:1;
      h.userData.speed=h.userData.baseSpeed*pace;
      h.userData.crowdReaction=p.reaction;
      if(h.userData.parts?.body?.material){
        h.userData.parts.body.material.emissiveIntensity=p.reaction==='hype'?.18:0;
      }
    });
    state.crowdSentiment=clamp(50+(p.heat-50)*.35+(p.event?12:0)-state.risk*.18);
    state.lastReaction={...p,visible:list.filter(x=>x.visible).length,at:Date.now()};
    save();
    return state.lastReaction;
  }

  function consequenceFromChoice(name,approach,result){
    const delta=Number(result?.delta)||0;
    const pressure=clamp(world().districtPressure||0);
    const rep=approach==='professional'?3:approach==='loyal'?4:(pressure>55?2:-2);
    const memory=recordDistrict(rep,'npc:'+name+':'+approach);
    state.choices++;
    state.risk=clamp(state.risk+(approach==='street'?(pressure>60?7:3):approach==='professional'?-2:-1));
    state.lastChoice={name,approach,trustDelta:delta,district:memory.district,repDelta:rep,risk:state.risk,at:Date.now()};
    window.TGGLivingCity?.nudgeHeat?.(approach==='street'?5:approach==='loyal'?2:-1);
    if(approach==='street'&&pressure>60)window.TGGLivingCity?.setEvent?.({id:'choice-pressure',label:'STREET TALK SPREADING',minHeat:0});
    save();syncCrowd();
    window.dispatchEvent(new CustomEvent('tgg:v509-choice-consequence',{detail:{...state.lastChoice}}));
    return state.lastChoice;
  }

  function wrapNpcChoices(){
    const api=window.TGGWorldDepth;
    if(!api||api.__v509Wrapped)return false;
    const originalChoose=api.chooseNpcApproach?.bind(api);
    const originalInteract=api.interactNPC?.bind(api);
    if(originalChoose){
      api.chooseNpcApproach=(name,approach='professional')=>{
        const result=originalChoose(name,approach);
        consequenceFromChoice(name,approach,result);
        return result;
      };
    }
    if(originalInteract){
      api.interactNPC=(name)=>{
        const before=Number(world().lastNpcChoice?.at)||0;
        const result=originalInteract(name);
        const choice=world().lastNpcChoice;
        if(choice?.at&&choice.at!==before)consequenceFromChoice(name,choice.approach,result);
        return result;
      };
    }
    api.__v509Wrapped=true;
    return true;
  }

  const PROPERTY_SCREENS={home:'apartment',studio:'studio',garage:'garage',business:'office'};
  function activeScreen(){
    return window.TGGGame?.getActiveScreen?.()||document.querySelector('.screen.active')?.id||'';
  }
  function ensureInteriorHud(){
    let root=document.getElementById('v509InteriorHud');
    if(root)return root;
    root=document.createElement('section');
    root.id='v509InteriorHud';
    root.innerHTML='<div class="v509-interior-card"><small>PROPERTY INTERIOR</small><b id="v509InteriorTitle">PROPERTY</b><span id="v509InteriorMeta"></span><div class="v509-hotspots"><button data-v509="use">USE SPACE</button><button data-v509="upgrade">UPGRADE</button><button data-v509="exit">EXIT TO CITY</button></div></div>';
    document.body.appendChild(root);
    const style=document.createElement('style');
    style.id='v509Styles';
    style.textContent='#v509InteriorHud{position:fixed;right:18px;bottom:18px;z-index:80;display:none;width:min(340px,calc(100vw - 36px));font-family:Inter,system-ui,sans-serif}#v509InteriorHud.active{display:block}.v509-interior-card{padding:14px;border:1px solid #c7ff0050;border-radius:18px;background:linear-gradient(145deg,#080b12f4,#020306f2);box-shadow:0 20px 54px #000b;color:#fff;backdrop-filter:blur(14px)}.v509-interior-card small{display:block;color:#c7ff00;font-size:9px;letter-spacing:.16em}.v509-interior-card b{display:block;font-size:20px;margin-top:4px}.v509-interior-card span{display:block;color:#aeb6c5;font-size:11px;margin:4px 0 10px}.v509-hotspots{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.v509-hotspots button{min-height:42px;border:1px solid #ffffff1f;border-radius:12px;background:#151922;color:#fff;font-weight:900;font-size:10px}.v509-hotspots button:first-child{background:#c7ff00;color:#060806}@media(max-width:720px){#v509InteriorHud{right:10px;bottom:10px;width:calc(100vw - 20px)}.v509-hotspots{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    root.addEventListener('click',e=>{
      const action=e.target.closest('[data-v509]')?.dataset.v509;if(!action)return;
      const id=root.dataset.property;
      if(!id)return;
      if(action==='use'){
        const r=window.TGGWorldSystems?.useProperty?.(id);
        state.propertyVisits[id]=(Number(state.propertyVisits[id])||0)+1;
        recordDistrict(1,'property:'+id); save(); renderInterior(id,r);
      }else if(action==='upgrade'){
        const ok=window.TGGWorldSystems?.buyOrUpgrade?.(id);
        renderInterior(id,{ok,status:ok?'upgraded':'unavailable'});
      }else if(action==='exit'){
        window.TGGGame?.show?.('game');
        root.classList.remove('active');
      }
    });
    return root;
  }

  function renderInterior(id,last=null){
    const root=ensureInteriorHud();
    const st=systems(),lvl=Number(st.properties?.[id])||0,uses=Number(st.propertyUses?.[id])||0;
    root.dataset.property=id;
    root.querySelector('#v509InteriorTitle').textContent=(id==='apartment'?'MY APARTMENT':id==='studio'?'PRIVATE STUDIO':id==='garage'?'GARAGE':'BUSINESS OFFICE')+' • LVL '+lvl;
    root.querySelector('#v509InteriorMeta').textContent='USES '+uses+' • CITY REP '+Math.round(Number(st.cityRep)||0)+(last?.status?' • '+String(last.status).toUpperCase():'');
    root.classList.toggle('active',!!id);
    return {id,level:lvl,uses,last};
  }

  function syncInterior(){
    const screen=activeScreen();
    const id=PROPERTY_SCREENS[screen]||null;
    const root=ensureInteriorHud();
    if(id)renderInterior(id);
    else root.classList.remove('active');
    return id;
  }

  function bindPropertyEntrances(){
    for(const [screen,id] of Object.entries(PROPERTY_SCREENS)){
      const btn=document.getElementById(screen+'Btn');
      if(btn&&!btn.dataset.v509Bound){
        btn.dataset.v509Bound='true';
        btn.addEventListener('click',()=>{
          state.propertyVisits[id]=(Number(state.propertyVisits[id])||0)+1;
          recordDistrict(1,'enter:'+id);save();
          setTimeout(()=>renderInterior(id),0);
        });
      }
    }
  }

  function bindWorldEvents(){
    window.addEventListener('tgg:world-beat-complete',e=>{
      state.worldCompletions++;
      const kind=String(e.detail?.id||'world');
      const gain=/headline|show|cypher|brand/.test(kind)?5:3;
      recordDistrict(gain,'world-beat:'+kind);
      state.risk=clamp(state.risk-1);
      window.TGGLivingCity?.nudgeHeat?.(gain);
      save();syncCrowd();
    });
    window.addEventListener('tgg-story-event',e=>{
      state.storyTransitions++;
      if(/complete/i.test(String(e.detail?.type||'')))recordDistrict(4,'story-complete');
      save();syncCrowd();
    });
  }

  function snapshot(){
    return {
      version:VERSION,...state,
      activeScreen:activeScreen(),
      crowd:crowdProfile(),
      visibleCrowd:(window.TGG3D?.pedestrians||[]).filter(x=>x.visible).length,
      totalCrowd:(window.TGG3D?.pedestrians||[]).length,
      worldSystems:systems(),
      features:['dynamic-physical-crowd-density','crowd-mood-reactions','persistent-district-memory','npc-choice-city-consequences','property-interior-hotspots','property-use-and-upgrade-actions','world-beat-city-reactions']
    };
  }
  function run(){
    const total=ensureCrowd();
    const reaction=syncCrowd();
    wrapNpcChoices();bindPropertyEntrances();syncInterior();
    const snap=snapshot();
    return {ok:total>=12&&snap.features.length>=7&&!!reaction,total,visible:snap.visibleCrowd,activeProperty:PROPERTY_SCREENS[snap.activeScreen]||null};
  }
  function boot(){
    ensureInteriorHud();ensureCrowd();wrapNpcChoices();bindPropertyEntrances();bindWorldEvents();
    syncCrowd();syncInterior();
    setInterval(()=>{wrapNpcChoices();bindPropertyEntrances();syncCrowd();syncInterior()},1200);
    document.documentElement.dataset.tggV509='on';
    window.TGGV509={version:VERSION,run,snapshot,syncCrowd,syncInterior,recordDistrict,consequenceFromChoice};
    window.dispatchEvent(new CustomEvent('tgg:v509-ready',{detail:snapshot()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();