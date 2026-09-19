(() => {
  const VERSION='V2.44 TGG STORY WORLD DIRECTOR 100';
  const PACKS=['story','objectives','navigation','contacts','interaction','cinematic','events','rewards','persistence','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV244Core||globalThis.window?.TGGV244Core;
  const KEY='tgg-v244-story-world';
  const state={
    enabled:true,active:null,step:0,completed:[],history:[],rewarded:[],startedAt:0,lastAdvanceAt:0,
    ready:false,arrivals:0,interactions:0,events:0,actions:0,visuals:null
  };
  let panel=null,hud=null,lastTick=0,lastTargetId='',routeGeo=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const THREE=()=>hasDOM()?window.THREE:null:null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

  function currentStory(){return state.active?core()?.story?.(state.active)||null:null}
  function currentStep(){const s=currentStory();return s?.steps?.[state.step]||null}
  function gameState(){return hasDOM()?window.TGGGame?.getState?.()||{}:{}}
  function percentDistance(target){
    if(!target)return Infinity;const g=gameState();
    return Math.hypot((Number(g.x)||50)-target.x,(Number(g.y)||50)-target.y);
  }
  function near(target=currentStep()?.target){return !!target&&percentDistance(target)<=Number(target.radius||7)}
  function worldTarget(target=currentStep()?.target){return core()?.toWorld?.(target)||null}

  function save(){
    if(!hasDOM())return;
    try{localStorage.setItem(KEY,JSON.stringify({
      enabled:state.enabled,active:state.active,step:state.step,completed:state.completed,
      history:state.history.slice(-30),rewarded:state.rewarded,startedAt:state.startedAt,lastAdvanceAt:state.lastAdvanceAt
    }))}catch{}
  }
  function migrateLegacy(){
    if(!hasDOM())return;
    try{
      const old=JSON.parse(localStorage.getItem('tgg-story-missions-v1')||'null');
      if(!old)return;
      if(old.chapter2?.completed&&!state.completed.includes('city-buzz'))state.completed.push('city-buzz');
      else if(old.chapter2?.active&&!state.active){
        state.active='city-buzz';state.step=clamp(old.chapter2.step,0,9);state.startedAt=Number(old.chapter2.startedAt)||Date.now();
      }
    }catch{}
  }
  function load(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(typeof x.enabled==='boolean')state.enabled=x.enabled;
      if(core()?.stories?.includes(x.active))state.active=x.active;
      state.step=Math.max(0,Math.floor(Number(x.step)||0));
      state.completed=Array.isArray(x.completed)?x.completed.filter(x=>core()?.stories?.includes(x)):[];
      state.history=Array.isArray(x.history)?x.history.slice(-30):[];
      state.rewarded=Array.isArray(x.rewarded)?x.rewarded.filter(x=>core()?.stories?.includes(x)):[];
      state.startedAt=Number(x.startedAt)||0;state.lastAdvanceAt=Number(x.lastAdvanceAt)||0;
    }catch{}
    migrateLegacy();save();
  }

  function status(){
    const s=currentStory(),step=currentStep();
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-story-world-director',layerCount:LAYERS.length,
      enabled:state.enabled,active:state.active,step:state.step,total:s?.steps?.length||0,
      progress:s?core()?.progress?.(s.id,state.step)||0:0,current:step?{...step}:null,
      near:near(step?.target),completed:[...state.completed],rewarded:[...state.rewarded],
      arrivals:state.arrivals,interactions:state.interactions,events:state.events,actions:state.actions,
      history:state.history.slice(-8)
    };
  }

  function emit(type,detail={}){if(hasDOM())window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,story:state.active,step:state.step,...detail}}))}
  function toast(msg){if(hasDOM())window.__tggToast?.(msg)}

  function presentationFor(step){
    if(!hasDOM()||!step)return;
    if(step.kind==='talk'){
      window.TGGV242?.start?.('mission-intro',{auto:true});
      window.TGGV232?.play?.('talk',1800);
      window.TGGV240?.applyProfile?.('cinematic');
      window.TGGV240?.play?.('mission-start');
      window.TGGV235?.pulseCrowd?.('mission',1500);
    }else if(step.id==='battle'){
      window.TGGV242?.start?.('battle',{auto:true});
      window.TGGV240?.applyProfile?.('street');
    }else if(step.id==='concert'){
      window.TGGV242?.start?.('concert',{auto:true});
      window.TGGV240?.applyProfile?.('club');
    }else if(step.id==='video'){
      window.TGGV242?.start?.('showcase',{auto:true});
      window.TGGV234?.applyPreset?.('cinematic');
    }else{
      window.TGGV234?.applyPreset?.('street');
      window.TGGV240?.applyProfile?.('street');
    }
    window.TGGV238?.emit?.('mission',{strength:.5});
  }

  function start(id='city-buzz'){
    if(!state.enabled||!core()?.stories?.includes(id))return false;
    if(state.completed.includes(id)){toast(core().story(id).title+' ALREADY COMPLETE');return status()}
    state.active=id;state.step=0;state.startedAt=Date.now();state.lastAdvanceAt=Date.now();
    state.history.push({type:'start',story:id,step:0,at:Date.now()});save();renderUI();
    const step=currentStep();presentationFor(step);
    emit('tgg:v244-story-start',{title:core().story(id).title,objective:step?.id});
    toast('STORY STARTED — '+core().story(id).title);
    return status();
  }

  function rewardStory(s){
    if(!s||state.rewarded.includes(s.id))return false;
    window.TGGGame?.reward?.(s.rewardCash,s.rewardXp);
    window.TGGCareer?.addRep?.(s.rewardRep);
    state.rewarded.push(s.id);return true;
  }
  function complete(reason='complete'){
    const s=currentStory();if(!s)return false;
    const id=s.id;const paid=rewardStory(s);
    if(!state.completed.includes(id))state.completed.push(id);
    state.history.push({type:'complete',story:id,reason,at:Date.now()});state.active=null;state.step=0;save();
    window.TGGV238?.emit?.('mission',{strength:1});
    window.TGGV234?.pulse?.('mission',.65,900);
    window.TGGV240?.play?.('mission-complete');
    window.TGGV243?.mark?.('mission',{story:id,title:s.title});
    emit('tgg:v244-story-complete',{id,title:s.title,cash:paid?s.rewardCash:0,xp:paid?s.rewardXp:0,rep:paid?s.rewardRep:0});
    toast(s.title+' COMPLETE — +$'+s.rewardCash+' • +'+s.rewardXp+' XP • +'+s.rewardRep+' REP');
    renderUI();return true;
  }
  function advance(reason='checkpoint'){
    const s=currentStory(),step=currentStep();if(!s||!step)return false;
    state.history.push({type:'checkpoint',story:s.id,step:state.step,id:step.id,reason,at:Date.now()});
    state.step++;state.lastAdvanceAt=Date.now();
    window.TGGV238?.emit?.('mission',{strength:.66});
    window.TGGV240?.play?.('checkpoint');
    emit('tgg:v244-story-checkpoint',{id:step.id,reason,next:currentStep()?.id||null});
    if(state.step>=s.steps.length)return complete(reason);
    save();presentationFor(currentStep());renderUI();
    toast('STORY ADVANCED — '+currentStep().title);
    return status();
  }

  function reset(id=state.active||'city-buzz'){
    state.active=null;state.step=0;state.startedAt=0;state.lastAdvanceAt=0;
    state.completed=state.completed.filter(x=>x!==id);state.rewarded=state.rewarded.filter(x=>x!==id);
    state.history.push({type:'reset',story:id,at:Date.now()});save();renderUI();toast('STORY RESET — '+core()?.story?.(id)?.title);return status();
  }
  function setEnabled(v){state.enabled=!!v;if(!state.enabled)state.active=null;save();renderUI();return state.enabled}

  function follow(){
    if(!state.active)return start('city-buzz');
    window.TGGGame?.show?.('game');
    renderUI();return status();
  }
  function interact(){
    const step=currentStep();if(!step)return false;
    if(step.kind==='talk'&&window.TGGV245?.interceptStoryTalk?.(step))return true;
    if(step.kind==='arrive'){
      if(near(step.target)){state.arrivals++;return advance('arrival')}
      toast('FOLLOW THE STORY MARKER — '+step.target.label);return false;
    }
    if(step.kind==='talk'){
      if(!near(step.target)){toast('MOVE CLOSER TO '+step.target.label);return false}
      state.interactions++;window.TGGV232?.play?.('talk',1900);window.TGGV235?.pulseCrowd?.('mission',1300);
      return advance('conversation');
    }
    if(step.kind==='action'){
      if(!near(step.target)){toast('GET TO '+step.target.label+' FIRST');return false}
      if(step.action==='record'){window.TGGGame?.show?.('studio');toast('RECORD A TRACK TO COMPLETE THE OBJECTIVE');return true}
      if(step.action==='video'){window.TGGGame?.show?.('media');toast('SHOOT A MUSIC VIDEO TO COMPLETE THE OBJECTIVE');return true}
    }
    if(step.kind==='event'){
      if(!near(step.target)){toast('GET TO '+step.target.label+' FIRST');return false}
      if(step.id==='battle'){
        const event=Array.isArray(window.TGGEvents?.events)?window.TGGEvents.events.find(x=>x?.id==='street-cypher'):null;
        if(event&&window.TGGV221?.openBattle){window.TGGV221.openBattle(event);return true}
        window.dispatchEvent(new CustomEvent('tgg:story-battle-request',{detail:{source:'v244'}}));toast('START THE DOWNTOWN RAP BATTLE');return true;
      }
      if(step.id==='concert'){
        if(window.TGGV222?.openShow){return window.TGGV222.openShow()===true}
        window.dispatchEvent(new CustomEvent('tgg:story-concert-request',{detail:{source:'v244'}}));toast('START THE LIVE SHOW');return true;
      }
    }
    return false;
  }

  function handleAction(action){
    const step=currentStep();if(!step||step.kind!=='action'||step.action!==action||!near(step.target))return false;
    state.actions++;return advance('action:'+action);
  }
  function handleEvent(name,detail={}){
    const step=currentStep();if(!step||step.kind!=='event'||step.event!==name||!near(step.target))return false;
    if(name==='tgg:rap-battle-complete'&&detail?.passed!==true){toast('WIN THE CYPHER TO ADVANCE');return false}
    state.events++;return advance('event:'+name);
  }

  function navigationTarget(){
    const step=currentStep();if(!step?.target)return null;
    const w=worldTarget(step.target);if(!w)return null;
    return {label:'STORY • '+step.target.label,x:w.x,z:w.z,color:step.target.color||'#c7ff00',story:true,radius:step.target.radius,arrived:near(step.target),id:step.id};
  }

  function labelSprite(text,color='#c7ff00'){
    const T=THREE();if(!T)return null;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='rgba(3,5,10,.9)';ctx.strokeStyle=color;ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(8,8,496,112,22);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='900 30px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const spr=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));spr.scale.set(7.8,1.95,1);return spr;
  }
  function contactNpc(id,name,x,y,color,seed){
    const T=THREE();if(!T)return null;const profile=window.TGGV235Core?.profile?.(seed)||{};
    const g=new T.Group();g.name='v244-contact-'+id;g.userData.v244Contact=id;
    const top=new T.MeshStandardMaterial({color:profile.outfit?.top??color,roughness:.68,metalness:.06});
    const skin=new T.MeshStandardMaterial({color:profile.skin??0x8f5f43,roughness:.7});
    const dark=new T.MeshStandardMaterial({color:profile.outfit?.pants??0x10131a,roughness:.8});
    const accent=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.8,roughness:.3,metalness:.35});
    const body=new T.Mesh(new T.CapsuleGeometry(.58,1.25,5,9),top);body.position.y=2;body.castShadow=true;g.add(body);
    const head=new T.Mesh(new T.SphereGeometry(.5,14,10),skin);head.position.y=3.32;head.castShadow=true;g.add(head);
    [-.29,.29].forEach(dx=>{const leg=new T.Mesh(new T.CapsuleGeometry(.17,.86,4,8),dark);leg.position.set(dx,.86,0);g.add(leg)});
    [-.78,.78].forEach((dx,i)=>{const arm=new T.Mesh(new T.CapsuleGeometry(.14,.72,4,8),top);arm.position.set(dx,2.06,0);arm.rotation.z=i?-.12:.12;g.add(arm)});
    const diamond=new T.Mesh(new T.OctahedronGeometry(.34),accent);diamond.position.y=4.55;g.add(diamond);
    const ring=new T.Mesh(new T.RingGeometry(1.15,1.4,32),new T.MeshBasicMaterial({color,transparent:true,opacity:.28,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.06;g.add(ring);
    const label=labelSprite(name,'#'+new T.Color(color).getHexString());if(label){label.position.y=5.45;g.add(label)}
    const light=new T.PointLight(color,1.4,8,2);light.position.y=3;g.add(light);
    const w=core().toWorld({x,y});g.position.set(w.x,0,w.z);scene()?.add(g);
    return {id,name,x,y,color,group:g,diamond,ring,label,light};
  }
  function buildVisuals(){
    if(state.visuals||!scene()||!THREE())return state.visuals;
    const T=THREE(),root=new T.Group();root.name='tgg-v244-story-world';scene().add(root);
    const contacts=[
      contactNpc('manager','M • MANAGER',72,36,0xff466d,801),
      contactNpc('kane','KANE • PRODUCER',24,37,0x7b86ff,802),
      contactNpc('director','DIRECTOR K • MEDIA',50,89,0xc56cff,803)
    ].filter(Boolean);
    const beacon=new T.Group();beacon.name='v244-objective-beacon';
    const ring=new T.Mesh(new T.RingGeometry(2.1,2.65,42),new T.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.66,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;beacon.add(ring);
    const beam=new T.Mesh(new T.CylinderGeometry(.68,1.35,9.5,18,1,true),new T.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.12,depthWrite:false,side:T.DoubleSide}));beam.position.y=4.7;beacon.add(beam);
    const marker=new T.Mesh(new T.OctahedronGeometry(.5),new T.MeshStandardMaterial({color:0xc7ff00,emissive:0xc7ff00,emissiveIntensity:3.2,metalness:.45,roughness:.2}));marker.position.y=3.15;beacon.add(marker);
    const light=new T.PointLight(0xc7ff00,4.2,13,2);light.position.y=2.5;beacon.add(light);beacon.visible=false;scene().add(beacon);
    routeGeo=new T.BufferGeometry();const route=new T.Line(routeGeo,new T.LineDashedMaterial({color:0xc7ff00,transparent:true,opacity:.65,dashSize:1.1,gapSize:.55,depthWrite:false}));route.visible=false;scene().add(route);
    state.visuals={root,contacts,beacon,ring,beam,marker,light,route};return state.visuals;
  }
  function setVisualTarget(step){
    const v=buildVisuals();if(!v)return;
    const target=step?.target,w=worldTarget(target);
    if(!target||!w){v.beacon.visible=false;v.route.visible=false;return}
    const color=new THREE().Color(target.color||'#c7ff00');
    v.beacon.visible=true;v.route.visible=true;v.beacon.position.set(w.x,0,w.z);
    v.ring.material.color.copy(color);v.beam.material.color.copy(color);v.marker.material.color.copy(color);v.marker.material.emissive.copy(color);v.light.color.copy(color);v.route.material.color.copy(color);
    const g=gameState(),p=core().toWorld({x:Number(g.x)||50,y:Number(g.y)||50});
    const T=THREE();routeGeo.setFromPoints([new T.Vector3(p.x,.12,p.z),new T.Vector3(w.x,.12,w.z)]);v.route.computeLineDistances();
    const activeContact=step.kind==='talk'?step.contact:null;
    v.contacts.forEach(c=>{const hot=c.id===activeContact;c.light.intensity=hot?5.2:1.15;c.ring.material.opacity=hot ? .9 : .22;c.group.scale.setScalar(hot?1.07:1)});
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v244');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v244StoryBtn')){
      const b=document.createElement('button');b.id='v244StoryBtn';b.className='v244-story-btn';b.textContent='STORY';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v244StoryPanel';panel.className='v244-story-panel';
      panel.innerHTML='<small>V2.44 • STORY WORLD</small><b id="v244Title">CITY BUZZ</b><p id="v244Detail">Connected artist career gameplay across the live city.</p><div class="v244-progress"><i id="v244Progress"></i></div><div id="v244Steps" class="v244-step-list"></div><div class="v244-actions"><button id="v244Primary" class="primary">START CITY BUZZ</button><button id="v244Reset">RESET</button></div>';
      document.body.appendChild(panel);
      document.getElementById('v244Primary').onclick=()=>state.active?interact():start('city-buzz');
      document.getElementById('v244Reset').onclick=()=>reset();
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v244StoryHud';hud.className='v244-story-hud';
      hud.innerHTML='<small>STORY WORLD</small><b id="v244HudTitle">CITY BUZZ</b><span id="v244HudDetail">Start the story.</span><em id="v244HudDistance"></em><button id="v244HudAction">START STORY</button>';
      city.appendChild(hud);document.getElementById('v244HudAction').onclick=()=>state.active?interact():start('city-buzz');
    }
    buildVisuals();state.ready=true;
  }

  function renderUI(){
    if(!hasDOM())return;if(!state.ready)ensureUI();
    const s=currentStory(),step=currentStep(),pct=s?core().progress(s.id,state.step):0;
    const title=document.getElementById('v244Title'),detail=document.getElementById('v244Detail'),bar=document.getElementById('v244Progress'),list=document.getElementById('v244Steps'),primary=document.getElementById('v244Primary');
    if(title)title.textContent=s?.title||'CITY BUZZ';
    if(detail)detail.textContent=step?.detail||(state.completed.includes('city-buzz')?'Story complete. Replay or reset when you want another run.':'Connected artist career gameplay across the live city.');
    if(bar)bar.style.width=(state.completed.includes('city-buzz')&&!s?100:pct)+'%';
    if(list){
      const def=s||core()?.story?.('city-buzz');
      list.innerHTML=(def?.steps||[]).map((x,i)=>'<div class="v244-step '+(state.active&&i===state.step?'active ':'')+((state.active&&i<state.step)||(!state.active&&state.completed.includes(def.id))?'done':'')+'"><i>'+(((state.active&&i<state.step)||(!state.active&&state.completed.includes(def.id)))?'✓':String(i+1).padStart(2,'0'))+'</i><div><b>'+x.title+'</b><span>'+x.detail+'</span></div></div>').join('');
    }
    if(primary){
      if(state.active)primary.textContent=step?.kind==='talk'?'TALK / INTERACT':step?.kind==='arrive'?'CHECK ARRIVAL':step?.kind==='action'?'OPEN '+step.action.toUpperCase():step?.id==='battle'?'START CYPHER':'START SHOW';
      else primary.textContent=state.completed.includes('city-buzz')?'CITY BUZZ COMPLETE':'START CITY BUZZ';
      primary.disabled=!state.active&&state.completed.includes('city-buzz');
    }
    if(hud){
      const show=window.TGGGame?.getActiveScreen?.()==='game'&&(!!state.active||!state.completed.includes('city-buzz'));
      hud.classList.toggle('active',show);hud.classList.toggle('arrived',!!state.active&&near(step?.target));
      const ht=document.getElementById('v244HudTitle'),hd=document.getElementById('v244HudDetail'),dist=document.getElementById('v244HudDistance'),act=document.getElementById('v244HudAction');
      if(ht)ht.textContent=step?.title||(state.active?'CITY BUZZ':'CITY BUZZ');
      if(hd)hd.textContent=step?.detail||(state.active?'FOLLOW THE OBJECTIVE':'Connected story missions ready.');
      if(dist)dist.textContent=step?.target?(near(step.target)?'AT OBJECTIVE':Math.round(percentDistance(step.target)*3.2)+' m • '+step.target.label):(state.completed.includes('city-buzz')?'100% COMPLETE':'READY');
      if(act)act.textContent=!state.active?'START STORY':step?.kind==='talk'?(near(step.target)?'TALK':'FOLLOW MARKER'):step?.kind==='arrive'?(near(step.target)?'ARRIVED — CONTINUE':'FOLLOW MARKER'):step?.kind==='action'?(near(step.target)?'OPEN '+step.action.toUpperCase():'GO TO '+step.target.label):step?.id==='battle'?'START CYPHER':'START SHOW';
    }
    document.documentElement.style.setProperty('--v244-accent',step?.target?.color||'#c7ff00');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(ts-lastTick<80)return;lastTick=ts;
    const step=currentStep();
    if(state.active&&step?.kind==='arrive'&&near(step.target)){state.arrivals++;advance('arrival:auto');return}
    setVisualTarget(step);
    const v=state.visuals;if(v){
      const t=ts/1000,pulse=1+Math.sin(t*3.1)*.08;
      v.ring.scale.setScalar(near(step?.target)?1.2:pulse);v.marker.rotation.y=t*1.7;v.marker.position.y=3.15+Math.sin(t*2.6)*.22;
      v.contacts.forEach((c,i)=>{c.diamond.rotation.y=t*1.4+i;c.diamond.position.y=4.55+Math.sin(t*2+i)*.13});
    }
    const btn=document.getElementById('interact3dBtn');
    if(btn&&state.active&&step?.kind==='talk'&&near(step.target)){
      btn.disabled=false;btn.textContent='TALK TO '+(step.contact==='manager'?'M':step.contact==='kane'?'KANE':'DIRECTOR K');btn.classList.add('nearby');
    }
    renderUI();
  }

  function bind(){
    if(!hasDOM()||bind.done)return;bind.done=true;
    window.addEventListener('tgg:rap-battle-complete',e=>handleEvent('tgg:rap-battle-complete',e.detail||{}));
    window.addEventListener('tgg:concert-complete',e=>handleEvent('tgg:concert-complete',e.detail||{}));
    document.addEventListener('click',e=>{
      const el=e.target?.closest?.('[data-studio],[data-media]');
      if(!el)return;
      if(el.dataset.studio==='record')setTimeout(()=>handleAction('record'),0);
      if(el.dataset.media==='video')setTimeout(()=>handleAction('video'),0);
    });
    document.getElementById('interact3dBtn')?.addEventListener('click',e=>{
      const step=currentStep();
      if(state.active&&step?.kind==='talk'&&near(step.target)){e.preventDefault();e.stopImmediatePropagation();interact()}
    },true);
    document.addEventListener('keydown',e=>{
      if(e.key==='F12'){e.preventDefault();panel?.classList.toggle('active')}
      if((e.key==='e'||e.key==='E')&&state.active&&currentStep()?.kind==='talk'&&near()){e.preventDefault();interact()}
    });
  }

  load();bind();
  const api={version:VERSION,layers:LAYERS,status,start,advance,complete,reset,setEnabled,follow,interact,handleAction,handleEvent,navigationTarget,near};
  globalThis.TGGV244=api;
  if(hasDOM()){window.TGGV244=api;ensureUI();requestAnimationFrame(tick)}
})();