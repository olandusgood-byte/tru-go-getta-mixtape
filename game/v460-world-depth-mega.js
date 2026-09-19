(()=>{
  const VERSION='V4.60 WORLD DEPTH NPC MISSION PROPERTY SOCIAL MEGA';
  const KEY='tgg-world-depth-v460';
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const defaults={
    tick:0, districtPressure:22, opportunityHeat:18, propertyUtility:0,
    socialMomentum:25, npcTrust:18, missionIntensity:1, activeBeat:null,
    history:[], npcStates:{M:'working','DJ V':'networking',Kane:'studio','Rico Flame':'street'},
    lastEventAt:0
  };
  let state=load();
  function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function game(){return window.TGGGame?.getState?.()||{}}
  function world(){return window.TGGWorldSystems?.getStatus?.()||{}}
  function life(){return window.TGGLifeSim?.getStatus?.()||{}}
  function social(){return window.TGGSocialWorld?.getStatus?.()||{}}
  function home(){return window.TGGHomeSocial?.getStatus?.()||{}}
  function family(){return window.TGGFamilyHousehold?.getStatus?.()||{}}
  function city(){return window.TGGLivingCity?.getStatus?.()||{}}
  function routine(){return window.TGGRoutineWorld?.getStatus?.()||{}}

  const BEATS=[
    {id:'studio-call',label:'PRODUCER CALL',district:'STUDIO ROW',minRep:0,kind:'studio',reward:[120,22],target:{label:'RECORDING STUDIO',x:24,y:37,radius:7,color:'#ff466d'}},
    {id:'street-meet',label:'STREET CONTACT',district:'MIXTAPE AVE',minRep:8,kind:'social',reward:[95,20],target:{label:'MIXTAPE AVE',x:76,y:63,radius:7,color:'#48d7ff'}},
    {id:'park-cypher',label:'PARK CYPHER',district:'PARKSIDE',minRep:12,kind:'perform',reward:[160,34],target:{label:'THE PARK',x:76,y:63,radius:7,color:'#4cff88'}},
    {id:'brand-meeting',label:'BRAND MEETING',district:'DOWNTOWN',minRep:30,kind:'business',reward:[240,38],target:{label:'BUSINESS DISTRICT',x:11,y:50,radius:7,color:'#c7ff00'}},
    {id:'headline-night',label:'HEADLINE NIGHT',district:'DOWNTOWN',minRep:65,kind:'perform',reward:[420,58],target:{label:'DOWNTOWN STAGE',x:50,y:50,radius:7,color:'#ffc84a'}},
    {id:'property-deal',label:'PROPERTY DEAL',district:'DOWNTOWN',minRep:40,kind:'property',reward:[180,28],target:{label:'MY APARTMENT',x:63,y:24,radius:7,color:'#ffc84a'}}
  ];

  function hydrateBeat(beat){
    if(!beat)return null;
    const template=BEATS.find(x=>x.id===beat.id);
    return template?{...template,...beat,target:{...(template.target||{}),...(beat.target||{})}}:beat;
  }
  function beatNavigation(){
    const beat=hydrateBeat(state.activeBeat);
    if(!beat?.target)return null;
    const g=game(),t=beat.target;
    const dx=(Number(t.x)||50)-(Number(g.x)||50);
    const dy=(Number(t.y)||50)-(Number(g.y)||55);
    const distance=Math.hypot(dx,dy);
    const bearing=Math.atan2(dy,dx)*180/Math.PI;
    const heading=Number(g.heading)||0;
    const relative=((bearing-heading+540)%360)-180;
    return {
      beatId:beat.id,label:beat.label,targetLabel:t.label||beat.district,
      x:t.x,y:t.y,radius:Number(t.radius)||7,color:t.color||'#c7ff00',
      distance,meters:Math.max(0,Math.round(distance*3.2)),
      arrived:distance<=(Number(t.radius)||7),relative
    };
  }

  function propertyUtility(){
    const p=world().properties||{};
    const weighted=(Number(p.apartment)||0)*3+(Number(p.studio)||0)*5+(Number(p.garage)||0)*2+(Number(p.office)||0)*4;
    state.propertyUtility=clamp(weighted*4,0,100);
    return state.propertyUtility;
  }
  function recalc(){
    const l=life(), s=social(), w=world(), c=city(), r=routine(), h=home(), f=family();
    const relationAvg=Object.values(l.relationships||{}).reduce((a,b)=>a+(Number(b)||0),0)/Math.max(1,Object.keys(l.relationships||{}).length);
    state.socialMomentum=clamp((Number(s.statusScore)||0)*.45+(Number(l.social)||0)*.35+relationAvg*.2);
    state.npcTrust=clamp(relationAvg*.7+(Number(h.support)||0)*.15+(Number(f.householdScore)||Number(f.household?.stability)||0)*.15);
    state.districtPressure=clamp((Number(c.heat)||0)*.5+(Number(w.consequence)||0)*.3+(100-(Number(r.wellness)||70))*.2);
    state.opportunityHeat=clamp((Number(l.momentum)||0)*.35+(Number(w.cityRep)||0)*.25+state.socialMomentum*.2+propertyUtility()*.2);
    state.missionIntensity=state.districtPressure>=65?3:state.opportunityHeat>=55?2:1;
    return state;
  }
  function chooseBeat(){
    recalc();
    const w=world(), c=city();
    const rep=Number(w.cityRep)||0;
    const district=String(c.district||'DOWNTOWN');
    const eligible=BEATS.filter(b=>rep>=b.minRep);
    if(!eligible.length)return null;
    const local=eligible.filter(b=>b.district===district);
    const pool=local.length?local:eligible;
    const idx=(state.tick+Math.round(state.opportunityHeat)+Math.round(state.socialMomentum))%pool.length;
    return pool[idx];
  }
  function spawnBeat(force=false){
    if(state.activeBeat&&!force)return state.activeBeat;
    const beat=chooseBeat(); if(!beat)return null;
    state.activeBeat=hydrateBeat({...beat,createdAt:Date.now(),expiresAt:Date.now()+180000});
    state.lastEventAt=Date.now();
    state.history.push({type:'beat',id:beat.id,at:state.lastEventAt});
    state.history=state.history.slice(-40);
    save();render();
    window.TGGGameFeel?.objective?.(beat.label,beat.district+' • WORLD OPPORTUNITY');
    window.TGGLivingCity?.nudgeHeat?.(2+state.missionIntensity);
    return state.activeBeat;
  }
  function completeBeat(){
    const beat=hydrateBeat(state.activeBeat);if(!beat)return false;
    state.activeBeat=beat;
    const route=beatNavigation();
    if(route&&!route.arrived){
      window.TGGGame?.show?.('game');
      window.TGGGameFeel?.objective?.('TRAVEL TO '+route.targetLabel,route.meters+' m • '+beat.label);
      render();
      return {ok:false,status:'travel_required',route};
    }
    const base=beat.reward||[100,20];
    const bonus=1+propertyUtility()/500+state.socialMomentum/800;
    const cash=Math.round(base[0]*bonus),xp=Math.round(base[1]*(1+state.missionIntensity*.08));
    window.TGGGame?.reward?.(cash,xp);
    if(beat.kind==='social')window.TGGLifeSim?.change?.({social:7,momentum:3});
    if(beat.kind==='studio')window.TGGLifeSim?.change?.({focus:-4,energy:-5,momentum:7});
    if(beat.kind==='perform')window.TGGLifeSim?.change?.({energy:-10,social:8,momentum:9});
    if(beat.kind==='business')window.TGGLifeSim?.change?.({focus:-5,momentum:6});
    if(beat.kind==='property')window.TGGWorldSystems?.coolConsequence?.(3);
    window.TGGWorldSystems?.coolConsequence?.(1);
    state.npcTrust=clamp(state.npcTrust+2+state.missionIntensity);
    state.history.push({type:'complete',id:beat.id,cash,xp,at:Date.now()});
    state.history=state.history.slice(-40);
    state.activeBeat=null;save();render();
    window.TGGGameFeel?.objective?.('WORLD BEAT COMPLETE','+$'+cash+' • +'+xp+' XP');
    return true;
  }
  function updateNpcStates(){
    const hour=new Date().getHours(),c=city();
    const busy=state.districtPressure>50;
    state.npcStates.M=hour<12?'planning':hour<18?'meetings':'managing';
    state.npcStates['DJ V']=busy?'event-hosting':hour>=18?'club':'networking';
    state.npcStates.Kane=hour>=10&&hour<=23?'studio':'offline';
    state.npcStates['Rico Flame']=String(c.district)==='MIXTAPE AVE'?'nearby':'street';
  }
  function npcDialogue(name){
    recalc();updateNpcStates();
    const status=state.npcStates[name]||'around';
    const trust=Math.round(state.npcTrust);
    if(trust>=70)return name+': We can make a major move right now. • '+status.toUpperCase();
    if(trust>=40)return name+': I got something for you if you stay locked in. • '+status.toUpperCase();
    return name+': Build your name and keep showing up. • '+status.toUpperCase();
  }
  function tick(){
    state.tick++;recalc();updateNpcStates();
    if(state.activeBeat&&Date.now()>state.activeBeat.expiresAt){
      state.history.push({type:'expired',id:state.activeBeat.id,at:Date.now()});
      state.activeBeat=null;
    }
    const shouldSpawn=!state.activeBeat && (state.tick%24===0 || state.opportunityHeat>72) && Date.now()-state.lastEventAt>30000;
    if(shouldSpawn)spawnBeat();
    save();render();
  }
  function ensure(){
    let el=document.getElementById('v460WorldDepth');if(el)return el;
    el=document.createElement('aside');el.id='v460WorldDepth';
    el.innerHTML='<small>V4.60 WORLD DEPTH</small><b id="v460Beat">CITY FLOW ACTIVE</b><span id="v460Stats">NPC TRUST 18 • OPPORTUNITY 18</span><i id="v460District">DISTRICT PRESSURE 22</i><span id="v460Route" style="display:flex;align-items:center;gap:7px;font-style:normal"><strong id="v460RouteArrow" style="display:inline-block">➤</strong><em id="v460RouteText" style="font-style:normal">WORLD NAV READY</em></span><div><button id="v460Spawn">FIND OPPORTUNITY</button><button id="v460Complete">COMPLETE WORLD BEAT</button></div>';
    document.body.appendChild(el);
    document.getElementById('v460Spawn').onclick=()=>spawnBeat(true);
    document.getElementById('v460Complete').onclick=completeBeat;
    return el;
  }
  function render(){
    ensure();recalc();
    if(state.activeBeat)state.activeBeat=hydrateBeat(state.activeBeat);
    const route=beatNavigation();
    document.getElementById('v460Beat').textContent=state.activeBeat?state.activeBeat.label+' • '+state.activeBeat.district:'CITY FLOW ACTIVE';
    document.getElementById('v460Stats').textContent='NPC TRUST '+Math.round(state.npcTrust)+' • OPPORTUNITY '+Math.round(state.opportunityHeat)+' • PROPERTY '+Math.round(state.propertyUtility);
    document.getElementById('v460District').textContent='DISTRICT PRESSURE '+Math.round(state.districtPressure)+' • MISSION TIER '+state.missionIntensity;
    const routeText=document.getElementById('v460RouteText');
    const routeArrow=document.getElementById('v460RouteArrow');
    if(routeText)routeText.textContent=route?(route.arrived?'ARRIVED • '+route.targetLabel:route.meters+' m • '+route.targetLabel):'WORLD NAV READY';
    if(routeArrow){routeArrow.style.transform='rotate('+(route?.relative||0)+'deg)';routeArrow.style.color=route?.color||'#c7ff00';}
    const complete=document.getElementById('v460Complete');
    if(complete){complete.disabled=!state.activeBeat;complete.textContent=route&&!route.arrived?'ROUTE TO WORLD BEAT':'COMPLETE WORLD BEAT';}
  }
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const t=((b.id||'')+' '+(b.textContent||'')).toLowerCase();
      if(/talk to m/.test(t))window.TGGGameFeel?.objective?.('M',npcDialogue('M'));
      if(/studio|record|mix/.test(t)){state.npcTrust=clamp(state.npcTrust+.4);state.opportunityHeat=clamp(state.opportunityHeat+1.2)}
      if(/event|show|battle|crew/.test(t)){state.socialMomentum=clamp(state.socialMomentum+1.5);state.districtPressure=clamp(state.districtPressure+1)}
      if(/home|apartment|property/.test(t))propertyUtility();
    },true);
    window.addEventListener('tgg-story-event',e=>{
      if(/complete/i.test(String(e.detail?.type||''))){state.opportunityHeat=clamp(state.opportunityHeat+8);state.npcTrust=clamp(state.npcTrust+3);save();render()}
    });
  }
  function getStatus(){return {version:VERSION,...state,npcStates:{...state.npcStates},navigation:beatNavigation(),features:[
    'cross-system-world-orchestrator','dynamic-npc-schedules','npc-trust-dialogue','district-pressure-simulation',
    'adaptive-world-opportunities','mission-intensity-scaling','property-utility-world-effects','social-momentum-effects',
    'time-limited-world-beats','cross-system-rewards-consequences','physical-world-beat-routing',
    'arrival-gated-world-beat-completion','heading-aware-world-navigation'
  ]}}
  function boot(){
    ensure();bind();tick();setInterval(tick,5000);
    document.documentElement.dataset.tggV460='on';
    window.TGGWorldDepth={version:VERSION,getStatus,spawnBeat,completeBeat,npcDialogue,recalc,beatNavigation};
    window.dispatchEvent(new CustomEvent('tgg:v460-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();