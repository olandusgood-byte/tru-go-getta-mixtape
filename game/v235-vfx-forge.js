(() => {
  const VERSION='V2.35 TGG VFX + PARTICLE FORGE 100';
  const LAYERS=[
    'vfx core bridge','vfx enabled state','vfx root group','vfx active pool','vfx budget bridge','vfx quality state','vfx reduced motion','vfx status API','vfx diagnostics','vfx rollback isolation',
    'impact profile','impact spark burst','impact debris spread','impact decay','impact event bridge','smoke profile','smoke plume','smoke expansion','smoke fade','smoke drift',
    'dust profile','dust road burst','dust expansion','dust fade','dust ground bias','boost profile','boost streak burst','boost rear origin','boost continuous emit','boost event bridge',
    'skid profile','skid smoke burst','skid rear wheel origin','skid continuous emit','skid handbrake bridge','rain splash profile','rain splash burst','rain weather gate','rain road contact','rain speed scaling',
    'mission profile','mission start burst','mission checkpoint burst','mission complete burst','mission color accent','rap profile','rap battle burst','rap round burst','rap energy ring','rap event bridge',
    'confetti profile','concert confetti','concert complete burst','confetti gravity','confetti spread','repair profile','repair glow burst','repair upward drift','repair event bridge','repair color accent',
    'particle position buffer','particle velocity buffer','particle age buffer','particle life buffer','particle gravity','particle opacity decay','particle size decay','particle update loop','particle dead cleanup','particle dispose',
    'quality high budget','quality balanced budget','quality performance budget','budget overflow trim','emit count scaling','strength scaling','mobile effect trim','reduced motion trim','frame delta clamp','pool metrics',
    'player origin helper','vehicle origin helper','rear vehicle origin','ground origin helper','world origin override','weather lightning reaction','camera pulse coexistence','lighting material coexistence','animation coexistence','interior coexistence',
    'VFX HUD','VFX panel','manual impact button','manual smoke button','manual confetti button','manual repair button','enabled toggle','Shift+V shortcut','100-layer manifest','release QA hooks'
  ];
  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={enabled:true,root:null,active:[],emits:0,spawned:0,disposed:0,ready:false,lastBoost:0,lastSkid:0,lastSplash:0};
  let panel=null,hud=null,lastTs=0;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const THREE=()=>hasDOM()?window.THREE:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const reduced=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-vfx-forge',layerCount:LAYERS.length,
      enabled:state.enabled,quality:quality(),active:state.active.length,emits:state.emits,
      spawned:state.spawned,disposed:state.disposed,budget:core()?.budget?.(quality())||90
    };
  }

  function ensureRoot(){
    if(!hasDOM())return null;
    if(state.root?.parent)return state.root;
    const T=THREE(),s=window.TGG3D?.scene;if(!T||!s)return null;
    state.root=new T.Group();state.root.name='tgg-vfx-forge';state.root.userData.v235=true;s.add(state.root);state.ready=true;return state.root;
  }

  function vec(origin){
    const T=THREE();
    if(origin?.isVector3)return origin.clone();
    if(origin&&Number.isFinite(origin.x)&&Number.isFinite(origin.z))return new T.Vector3(origin.x,Number(origin.y)||0,origin.z);
    return playerOrigin();
  }
  function playerOrigin(){
    const T=THREE(),p=window.TGG3D?.player?.position;
    return p?.clone?.()||new T.Vector3(0,1,0);
  }
  function vehicleOrigin(rear=false){
    const T=THREE(),c=window.TGG3D?.car;
    if(!c)return playerOrigin();
    const p=c.position.clone();
    p.y+=rear?.65:.9;
    if(rear){
      const back=new T.Vector3(-2.25,0,0).applyQuaternion(c.quaternion);
      p.add(back);
    }
    return p;
  }
  function groundOrigin(){
    const gs=window.TGGGame?.getState?.()||{};
    return gs.inVehicle?vehicleOrigin(false):playerOrigin().setY(.12);
  }

  function seeded(i,seed){
    let x=((i+1)*1664525+(seed||1)*1013904223)>>>0;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }

  function emit(type='impact',origin=null,strength=1){
    if(!state.enabled||!hasDOM())return false;
    const root=ensureRoot(),T=THREE(),profile=core()?.profile?.(type);if(!root||!T||!profile)return false;
    const qBudget=core()?.budget?.(quality())||90;
    const motionScale=reduced()?.35:1;
    const scale=clamp(Number(strength)||1,.15,2)*motionScale;
    let count=Math.max(2,Math.round(profile.count*scale*(quality()==='performance'?.45:quality()==='balanced'?.72:1)));
    const activeParticles=state.active.reduce((n,g)=>n+(g.count||0),0);
    count=Math.max(0,Math.min(count,qBudget-activeParticles));
    if(count<=0)return false;

    let o=origin?vec(origin):(type==='boost'||type==='skid'?vehicleOrigin(true):groundOrigin());
    if(type==='confetti')o.y+=3.4;
    if(type==='repair'||type==='rap'||type==='mission')o.y+=.8;

    const pos=new Float32Array(count*3),vel=new Float32Array(count*3);
    const seed=(state.emits+1)*97;
    for(let i=0;i<count;i++){
      const a=seeded(i*7,seed)*Math.PI*2;
      const radial=seeded(i*7+1,seed);
      const up=seeded(i*7+2,seed);
      pos[i*3]=o.x+(seeded(i*7+3,seed)-.5)*.18;
      pos[i*3+1]=o.y+(seeded(i*7+4,seed)-.5)*.14;
      pos[i*3+2]=o.z+(seeded(i*7+5,seed)-.5)*.18;
      let speed=profile.speed*(.35+radial*.65)*scale;
      if(type==='smoke'||type==='skid'||type==='dust')speed*=.55;
      vel[i*3]=Math.cos(a)*speed;
      vel[i*3+2]=Math.sin(a)*speed;
      vel[i*3+1]=(type==='confetti'?2.5:type==='smoke'||type==='repair'?1.4:up*speed*.8);
      if(type==='boost'){
        const c=window.TGG3D?.car;
        const back=new T.Vector3(-1,0,0).applyQuaternion(c?.quaternion||new T.Quaternion());
        vel[i*3]=back.x*speed+(seeded(i*7+3,seed)-.5)*1.2;
        vel[i*3+2]=back.z*speed+(seeded(i*7+4,seed)-.5)*1.2;
        vel[i*3+1]=(seeded(i*7+5,seed)-.5)*.6;
      }
      if(type==='rainSplash')vel[i*3+1]=2+up*3.5;
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.BufferAttribute(pos,3));
    const mat=new T.PointsMaterial({
      color:profile.color,size:profile.size*(quality()==='performance'?.8:1),transparent:true,
      opacity:profile.opacity,depthWrite:false,sizeAttenuation:true
    });
    const points=new T.Points(geo,mat);points.frustumCulled=false;root.add(points);
    state.active.push({
      points,count,vel,age:0,life:profile.life,gravity:profile.gravity,
      baseOpacity:profile.opacity,baseSize:mat.size,type
    });
    state.emits++;state.spawned+=count;renderUI();
    return true;
  }

  function disposeGroup(g){
    if(!g)return;
    g.points?.parent?.remove(g.points);g.points?.geometry?.dispose?.();g.points?.material?.dispose?.();state.disposed+=(g.count||0);
  }

  function updateParticles(dt){
    const next=[];
    for(const g of state.active){
      g.age+=dt;
      if(g.age>=g.life){disposeGroup(g);continue}
      const a=g.points.geometry.attributes.position.array;
      for(let i=0;i<g.count;i++){
        g.vel[i*3+1]-=g.gravity*dt;
        a[i*3]+=g.vel[i*3]*dt;
        a[i*3+1]+=g.vel[i*3+1]*dt;
        a[i*3+2]+=g.vel[i*3+2]*dt;
        if(g.type==='smoke'||g.type==='skid'||g.type==='dust'){
          g.vel[i*3]*=.985;g.vel[i*3+2]*=.985;g.vel[i*3+1]+=.35*dt;
        }
      }
      g.points.geometry.attributes.position.needsUpdate=true;
      const life=1-g.age/g.life;
      g.points.material.opacity=g.baseOpacity*clamp(life*1.25,0,1);
      g.points.material.size=g.baseSize*(g.type==='smoke'||g.type==='skid'?1+(1-life)*1.3:.7+life*.3);
      next.push(g);
    }
    state.active=next;
  }

  function continuous(ts){
    if(!state.enabled||!hasDOM())return;
    const vd=window.TGG3D?.getVehicleDynamics?.()||{},gs=window.TGGGame?.getState?.()||{};
    const speed=Math.abs(Number(vd.speed)||0);
    if(gs.inVehicle&&vd.boosting&&ts-state.lastBoost>70){state.lastBoost=ts;emit('boost',vehicleOrigin(true),.55)}
    if(gs.inVehicle&&vd.handbrake&&speed>2&&ts-state.lastSkid>120){state.lastSkid=ts;emit('skid',vehicleOrigin(true),.45)}
    const weather=window.TGGV233?.status?.()||{};
    if(weather.rain>.25&&speed>1.2&&ts-state.lastSplash>180){state.lastSplash=ts;emit('rainSplash',groundOrigin(),weather.rain*.45)}
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    ['tgg:traffic-impact','tgg:vehicle-impact'].forEach(ev=>window.addEventListener(ev,e=>{
      const s=Math.max(.35,Number(e.detail?.strength)||.6);emit('impact',vehicleOrigin(false),s);emit('smoke',vehicleOrigin(false),s*.6);
    }));
    window.addEventListener('tgg:mission-start',()=>emit('mission',playerOrigin(),.65));
    window.addEventListener('tgg:mission-checkpoint',()=>emit('mission',playerOrigin(),.55));
    window.addEventListener('tgg:mission-complete',()=>emit('mission',playerOrigin(),1));
    window.addEventListener('tgg:rap-battle-start',()=>emit('rap',playerOrigin(),1));
    window.addEventListener('tgg:rap-battle-round',()=>emit('rap',playerOrigin(),.7));
    window.addEventListener('tgg:concert-start',()=>emit('confetti',playerOrigin(),1.25));
    window.addEventListener('tgg:concert-complete',()=>emit('confetti',playerOrigin(),1));
    window.addEventListener('tgg:vehicle-repaired',()=>emit('repair',vehicleOrigin(false),1));
    window.addEventListener('tgg:weather-lightning',()=>emit('impact',playerOrigin().setY(6),.5));
  }

  function setEnabled(v){
    state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }
  function restore(){
    state.active.forEach(disposeGroup);state.active=[];state.enabled=false;
    if(state.root)state.root.visible=false;renderUI();return status();
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='VFX FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>VFX + PARTICLE FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-effects"><button data-v235-effect="impact">IMPACT</button><button data-v235-effect="smoke">SMOKE</button><button data-v235-effect="rap">RAP ENERGY</button><button data-v235-effect="confetti">CONFETTI</button><button data-v235-effect="repair">REPAIR GLOW</button></div><div class="v235-actions"><button id="v235Toggle" type="button">VFX: ON</button><button id="v235Restore" type="button">CLEAR + DISABLE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-effect]').forEach(b=>b.addEventListener('click',()=>emit(b.dataset.v235Effect,null,1)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG VFX FORGE</small><b id="v235HudMode">PARTICLES ON</b><span id="v235HudStats">0 ACTIVE</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='VFX: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.active.length+' GROUPS • '+state.spawned+' SPAWNED • '+quality().toUpperCase();
    if(q('v235HudMode'))q('v235HudMode').textContent=state.enabled?'PARTICLES ON':'PARTICLES OFF';
    if(q('v235HudStats'))q('v235HudStats').textContent=state.active.reduce((n,g)=>n+g.count,0)+' ACTIVE';
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='v'||e.key==='V')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();ensureRoot();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(state.enabled){updateParticles(dt);continuous(ts)}
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,effects:['impact','smoke','dust','boost','skid','rainSplash','mission','rap','confetti','repair'],status,emit,setEnabled,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();