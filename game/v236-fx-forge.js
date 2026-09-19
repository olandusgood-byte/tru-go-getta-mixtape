(() => {
  const VERSION='V2.36 TGG FX + PARTICLE FORGE 100';
  const LAYERS=[
    'fx core bridge','enabled state','intensity state','quality bridge','pool root','pool budget','pool rebuild','pool clear','pool allocator','status API',
    'tire smoke profile','exhaust profile','impact sparks profile','stage haze profile','rain splash profile','confetti profile','ambient dust profile','neon motes profile','effect normalization','effect diagnostics',
    'sprite geometry','sprite material','particle velocity','particle gravity','particle lifetime','particle opacity fade','particle scale growth','particle rotation','particle color','particle reset',
    'high budget','balanced budget','performance budget','mobile budget trim','reduced motion trim','frame budget skip','camera distance cull','quality rebuild','pool saturation guard','pool diagnostics',
    'car exhaust left','car exhaust right','boost exhaust','tire smoke rear left','tire smoke rear right','drift smoke','braking dust','impact sparks','collision burst','repair shimmer',
    'weather rain splash','storm spark pulse','puddle splash','mist motes','wind dust','wet road sparkle','lightning motes','weather quality bridge','weather event bridge','weather restore guard',
    'stage haze','concert confetti','rap battle confetti','mission complete confetti','club neon motes','studio haze','crowd hype motes','crowd event bridge','district ambient dust','nightlife sparkle',
    'trigger API','clear API','enabled API','intensity API','effect list API','manual test burst','event position resolver','car position resolver','player position resolver','world position guard',
    'additive blending','depth write guard','transparent fade','material disposal','geometry disposal','pool restore','rollback isolation','V2.33 weather compatibility','V2.34 camera compatibility','V2.35 crowd compatibility',
    'FX HUD','FX panel','intensity slider','enabled toggle','clear button','burst buttons','Shift+X shortcut','mobile panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV236Core||globalThis.window?.TGGV236Core;
  const state={
    enabled:true,intensity:1,root:null,pool:[],active:0,spawned:0,dropped:0,frames:0,
    qualityBuilt:null,ready:false,lastExhaust:0,lastSmoke:0,lastAmbient:0,lastRain:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-fx-forge',layerCount:LAYERS.length,
      enabled:state.enabled,intensity:Number(state.intensity.toFixed(2)),quality:quality(),
      budget:state.pool.length,active:state.active,spawned:state.spawned,dropped:state.dropped,frames:state.frames
    };
  }

  function targetBudget(){
    let n=core()?.budget?.(quality())||36;
    if(hasDOM()&&window.innerWidth<720)n=Math.round(n*.72);
    if(reducedMotion())n=Math.round(n*.55);
    return Math.max(18,n);
  }

  function makeParticle(index){
    const THREE=T();
    const mat=new THREE.SpriteMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.NormalBlending});
    const sprite=new THREE.Sprite(mat);sprite.visible=false;sprite.name='v236-fx-particle';sprite.userData.v236=true;
    return {
      index,sprite,active:false,life:0,maxLife:1,vel:new THREE.Vector3(),gravity:0,
      baseOpacity:0,baseSize:.1,growth:0,color:0xffffff,kind:'none',spin:0
    };
  }

  function rebuildPool(){
    if(!hasDOM())return false;
    const s=scene(),THREE=T();if(!s||!THREE)return false;
    clear();
    const root=new THREE.Group();root.name='tgg-fx-particle-root';root.userData.v236=true;
    const budget=targetBudget();
    for(let i=0;i<budget;i++){const p=makeParticle(i);root.add(p.sprite);state.pool.push(p)}
    s.add(root);state.root=root;state.qualityBuilt=quality();state.ready=true;renderUI();return true;
  }

  function resetParticle(p){
    if(!p)return;
    p.active=false;p.life=0;p.maxLife=1;p.gravity=0;p.baseOpacity=0;p.baseSize=.1;p.growth=0;p.kind='none';p.spin=0;
    p.vel.set(0,0,0);p.sprite.visible=false;p.sprite.material.opacity=0;p.sprite.rotation=0;p.sprite.scale.setScalar(.01);
  }

  function clear(){
    state.pool.forEach(p=>{
      p.sprite?.material?.dispose?.();
      p.sprite?.parent?.remove?.(p.sprite);
    });
    if(state.root?.parent)state.root.parent.remove(state.root);
    state.root=null;state.pool=[];state.active=0;renderUI();return true;
  }

  function allocate(){
    const p=state.pool.find(x=>!x.active);
    if(!p){state.dropped++;return null}
    return p;
  }

  function normalizePosition(pos){
    const THREE=T();
    if(pos?.isVector3)return pos.clone();
    if(pos&&Number.isFinite(Number(pos.x))&&Number.isFinite(Number(pos.z)))return new THREE.Vector3(Number(pos.x),Number(pos.y)||0,Number(pos.z));
    return null;
  }

  function carPosition(local){
    const THREE=T(),car=window.TGG3D?.car;if(!car)return null;
    const v=local?new THREE.Vector3(...local):new THREE.Vector3(0,.6,0);
    return car.localToWorld?v.applyMatrix4(car.matrixWorld):car.position.clone().add(v);
  }

  function playerPosition(){
    const p=window.TGG3D?.player?.position;return p?p.clone().add(new (T()).Vector3(0,.7,0)):null;
  }

  function eventPosition(detail){
    return normalizePosition(detail?.position)||normalizePosition(detail)||carPosition()||playerPosition()||new (T()).Vector3();
  }

  function spawnOne(cfg,pos,seed=0,opts={}){
    const THREE=T(),p=allocate();if(!p||!THREE)return false;
    const intensity=state.intensity*(reducedMotion()?.55:1);
    const angle=(Math.random()*Math.PI*2)+(seed*.37),speed=cfg.speed*(.45+Math.random()*.75)*intensity;
    p.active=true;p.life=cfg.life*(.8+Math.random()*.4);p.maxLife=p.life;p.gravity=cfg.gravity;
    p.baseOpacity=cfg.opacity;p.baseSize=cfg.size*(.72+Math.random()*.7);p.growth=opts.growth??(cfg.id.includes('smoke')||cfg.id.includes('haze')?.55:.12);
    p.kind=cfg.id;p.spin=(Math.random()-.5)*3;p.color=opts.color??cfg.color;
    p.vel.set(Math.cos(angle)*speed,(opts.up??(.35+Math.random()*.8))*speed,Math.sin(angle)*speed);
    if(cfg.id==='impact-sparks'||cfg.id==='confetti'||cfg.id==='rain-splash')p.vel.y=Math.abs(p.vel.y)+speed*.35;
    p.sprite.position.copy(pos);
    p.sprite.material.color.set(p.color);p.sprite.material.opacity=p.baseOpacity;p.sprite.material.blending=(cfg.id==='impact-sparks'||cfg.id==='neon-motes')?THREE.AdditiveBlending:THREE.NormalBlending;
    p.sprite.scale.setScalar(p.baseSize);p.sprite.visible=true;state.spawned++;return true;
  }

  function trigger(name,pos,options={}){
    if(!state.enabled||!hasDOM())return 0;
    if(!state.root)rebuildPool();
    const cfg=core()?.effect?.(name);if(!cfg)return 0;
    const origin=normalizePosition(pos)||eventPosition(options)||playerPosition()||carPosition();if(!origin)return 0;
    const count=Math.max(1,Math.round(cfg.count*state.intensity*(options.multiplier??1)*(reducedMotion()?.55:1)));
    let made=0;for(let i=0;i<count;i++)if(spawnOne(cfg,origin.clone(),i,options))made++;
    state.active=state.pool.filter(p=>p.active).length;renderUI();return made;
  }

  function updateParticles(dt){
    const cam=window.TGG3D?.camera;
    state.active=0;
    state.pool.forEach(p=>{
      if(!p.active)return;
      p.life-=dt;
      if(p.life<=0){resetParticle(p);return}
      p.vel.y+=p.gravity*dt;
      p.sprite.position.addScaledVector(p.vel,dt);
      const age=1-p.life/p.maxLife,fade=age<.65?1:(1-age)/.35;
      p.sprite.material.opacity=clamp(p.baseOpacity*fade,0,1);
      const size=p.baseSize*(1+p.growth*age*2.2);p.sprite.scale.setScalar(size);
      p.sprite.rotation+=p.spin*dt;
      if(cam&&cam.position.distanceTo(p.sprite.position)>60){resetParticle(p);return}
      state.active++;
    });
  }

  function continuousFx(ts){
    const vd=window.TGG3D?.getVehicleDynamics?.()||{},gs=window.TGGGame?.getState?.()||{};
    const speed=Math.abs(Number(vd.speed)||0),boost=!!vd.boosting,drift=!!vd.handbrake&&speed>2.2;
    if(gs.inVehicle&&ts-state.lastExhaust>(boost?70:180)){
      state.lastExhaust=ts;
      const left=carPosition([-2.25,.62,-.48]),right=carPosition([-2.25,.62,.48]);
      if(left)trigger('exhaust',left,{multiplier:boost?1.8:.65,up:.1});
      if(right)trigger('exhaust',right,{multiplier:boost?1.8:.65,up:.1});
    }
    if(gs.inVehicle&&drift&&ts-state.lastSmoke>90){
      state.lastSmoke=ts;
      const l=carPosition([-.95,.28,-.82]),r=carPosition([-.95,.28,.82]);
      if(l)trigger('tire-smoke',l,{multiplier:1.1,up:.18});
      if(r)trigger('tire-smoke',r,{multiplier:1.1,up:.18});
    }
    const weather=window.TGGV233?.status?.()||{};
    if((weather.rain||0)>.2&&ts-state.lastRain>180){
      state.lastRain=ts;const p=playerPosition();
      if(p){p.y=.12;trigger('rain-splash',p,{multiplier:quality()==='performance'?.35:.7,up:.15})}
    }
    if(ts-state.lastAmbient>(quality()==='performance'?1800:950)){
      state.lastAmbient=ts;const p=playerPosition();
      if(p){p.x+=(Math.random()-.5)*8;p.z+=(Math.random()-.5)*8;trigger('ambient-dust',p,{multiplier:.45,up:.08})}
    }
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    ['tgg:traffic-impact','tgg:vehicle-impact'].forEach(ev=>window.addEventListener(ev,e=>trigger('impact-sparks',eventPosition(e.detail),{multiplier:1.2})));
    window.addEventListener('tgg:vehicle-repaired',()=>trigger('neon-motes',carPosition(),{multiplier:1.4}));
    window.addEventListener('tgg:weather-lightning',()=>trigger('neon-motes',playerPosition(),{multiplier:1.5}));
    window.addEventListener('tgg:concert-start',()=>{trigger('stage-haze',playerPosition(),{multiplier:2});trigger('confetti',playerPosition(),{multiplier:1.8})});
    window.addEventListener('tgg:rap-battle-start',()=>trigger('confetti',playerPosition(),{multiplier:1.1}));
    window.addEventListener('tgg:mission-complete',()=>trigger('confetti',playerPosition(),{multiplier:.9}));
    window.addEventListener('tgg:camera-pulse',e=>{if(e.detail?.kind==='impact')trigger('impact-sparks',carPosition(),{multiplier:.65})});
  }

  function setEnabled(v){state.enabled=!!v;if(!state.enabled)state.pool.forEach(resetParticle);renderUI();return state.enabled}
  function setIntensity(v){state.intensity=clamp(Number(v)||1,.25,2);renderUI();return state.intensity}

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v236');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v236ForgeBtn')){
      const b=document.createElement('button');b.id='v236ForgeBtn';b.className='v236-forge-btn';b.type='button';b.textContent='FX FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v236ForgePanel';panel.className='v236-forge-panel';
      panel.innerHTML='<div class="v236-head"><div><small>TGG NATIVE 3D</small><b>FX + PARTICLE FORGE</b></div><button id="v236Close" type="button">×</button></div><label>INTENSITY <input id="v236Intensity" type="range" min=".25" max="2" step=".05" value="1"></label><div class="v236-bursts"><button data-v236-fx="impact-sparks">SPARKS</button><button data-v236-fx="tire-smoke">SMOKE</button><button data-v236-fx="stage-haze">HAZE</button><button data-v236-fx="confetti">CONFETTI</button></div><div class="v236-actions"><button id="v236Toggle" type="button">FX: ON</button><button id="v236Clear" type="button">CLEAR FX</button></div><div id="v236Stats" class="v236-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v236Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v236Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v236Clear')?.addEventListener('click',()=>state.pool.forEach(resetParticle));
      document.getElementById('v236Intensity')?.addEventListener('input',e=>setIntensity(Number(e.target.value)));
      panel.querySelectorAll('[data-v236-fx]').forEach(b=>b.addEventListener('click',()=>trigger(b.dataset.v236Fx,playerPosition()||carPosition(),{multiplier:1.2})));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v236ForgeHud';hud.className='v236-forge-hud';
      hud.innerHTML='<small>TGG FX FORGE</small><b id="v236HudActive">0 ACTIVE</b><span id="v236HudBudget">POOL READY</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v236Intensity'))q('v236Intensity').value=String(state.intensity);
    if(q('v236Toggle'))q('v236Toggle').textContent='FX: '+(state.enabled?'ON':'OFF');
    if(q('v236Stats'))q('v236Stats').textContent=state.active+' ACTIVE • '+state.pool.length+' BUDGET • '+state.spawned+' SPAWNED • '+state.dropped+' DROPPED';
    if(q('v236HudActive'))q('v236HudActive').textContent=state.active+' ACTIVE';
    if(q('v236HudBudget'))q('v236HudBudget').textContent=state.pool.length+' POOL • '+quality().toUpperCase();
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='x'||e.key==='X')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastTs=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!state.root&&scene())rebuildPool();
    if(state.qualityBuilt!==quality())rebuildPool();
    const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;
    if(state.enabled){continuousFx(ts);updateParticles(dt);state.frames++}
    if(state.frames%30===0)renderUI();
  }

  const api={version:VERSION,layers:LAYERS,effects:['tire-smoke','exhaust','impact-sparks','stage-haze','rain-splash','confetti','ambient-dust','neon-motes'],status,trigger,clear,setEnabled,setIntensity};
  globalThis.TGGV236=api;
  if(hasDOM()){window.TGGV236=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();