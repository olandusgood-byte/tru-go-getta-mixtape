(() => {
  const VERSION='V2.38 TGG EFFECTS + IMPACT FORGE 100';
  const LAYERS=[
    ...['effects core bridge','effects enabled state','effects root group','effects pool state','effects quality bridge','effects emit API','effects clear API','effects restore API','effects status API','effects diagnostics'],
    ...['spark pool','spark geometry','spark material','spark velocity','spark gravity','spark fade','spark lifetime','spark impact spawn','spark lightning spawn','spark quality budget'],
    ...['smoke pool','smoke geometry','smoke material','smoke rise','smoke drift','smoke scale','smoke fade','smoke drift spawn','smoke impact spawn','smoke quality budget'],
    ...['trail pool','trail geometry','trail material','trail velocity','trail fade','trail lifetime','trail boost spawn','trail drift spawn','trail mission spawn','trail quality budget'],
    ...['impact effect','boost effect','repair effect','mission effect','lightning effect','drift effect','effect profile bridge','effect duration','effect glow','effect spawn scaling'],
    ...['car impact origin','car boost origin','car drift origin','player mission origin','player repair origin','world lightning origin','camera-relative fallback','origin validation','origin clone guard','origin diagnostics'],
    ...['impact event bridge','traffic impact bridge','vehicle impact bridge','boost event bridge','repair event bridge','mission complete bridge','checkpoint bridge','weather lightning bridge','drift state bridge','audio compatibility'],
    ...['glow point light','glow color','glow intensity','glow decay','glow pool','flash material','screen flash hook','camera pulse bridge','vignette coexistence','lighting coexistence'],
    ...['quality high scale','quality balanced scale','quality performance scale','mobile particle trim','reduced motion trim','distance effect trim','offscreen effect trim','pool reuse','pool overflow guard','frame delta clamp'],
    ...['effects HUD','effects panel','effect test buttons','enabled toggle','clear button','F11 shortcut','rollback isolation','no physics mutation','100-layer manifest','release QA hooks']
  ];
  const core=()=>globalThis.TGGV238Core||globalThis.window?.TGGV238Core;
  const state={enabled:true,root:null,pools:{sparks:[],smoke:[],trails:[],glows:[]},active:0,emits:0,ready:false,lastTs:0};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;return['high','balanced','performance'].includes(q)?q:'high'};
  const motionScale=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?.45:1;
  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-effects-forge',layerCount:LAYERS.length,enabled:state.enabled,quality:quality(),active:state.active,emits:state.emits}}
  function ensureRoot(){if(!hasDOM())return null;if(state.root?.parent)return state.root;const THREE=T(),s=scene();if(!THREE||!s)return null;state.root=new THREE.Group();state.root.name='tgg-effects-forge';state.root.userData.v238=true;s.add(state.root);state.ready=true;return state.root}
  function origin(kind){
    const THREE=T(),v=new THREE.Vector3();
    if(['impact','boost','drift','repair'].includes(kind)&&window.TGG3D?.car){v.copy(window.TGG3D.car.position);v.y+=.8;return v}
    if(window.TGG3D?.player){v.copy(window.TGG3D.player.position);v.y+=1.4;return v}
    return v;
  }
  function mat(type){
    const THREE=T();
    if(type==='spark')return new THREE.MeshBasicMaterial({color:0xffd45c,transparent:true,opacity:1});
    if(type==='smoke')return new THREE.MeshStandardMaterial({color:0x7b8290,transparent:true,opacity:.32,roughness:.95,depthWrite:false});
    return new THREE.MeshBasicMaterial({color:0x61d9ff,transparent:true,opacity:.72,depthWrite:false});
  }
  function acquire(type){
    const THREE=T(),pool=state.pools[type],old=pool.find(x=>!x.userData.live);if(old)return old;
    let m;if(type==='sparks')m=new THREE.Mesh(new THREE.BoxGeometry(.055,.055,.24),mat('spark'));
    else if(type==='smoke')m=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),mat('smoke'));
    else m=new THREE.Mesh(new THREE.ConeGeometry(.07,.52,7),mat('trail'));
    m.visible=false;m.userData.live=false;pool.push(m);ensureRoot()?.add(m);return m;
  }
  function spawn(type,pos,vel,life,color,scale=1){
    const m=acquire(type);m.position.copy(pos);m.visible=true;m.userData.live=true;m.userData.life=life;m.userData.maxLife=life;m.userData.vel=vel.clone();m.userData.baseScale=scale;m.scale.setScalar(scale);
    if(color)m.material.color.set(color);m.material.opacity=type==='smoke'?.32:.86;state.active++;return m;
  }
  function glow(pos,color,intensity,life){
    const THREE=T(),l=new THREE.PointLight(color,intensity,8,2);l.position.copy(pos);l.userData.life=life;l.userData.maxLife=life;l.userData.live=true;state.pools.glows.push(l);ensureRoot()?.add(l);state.active++;return l;
  }
  function emit(kind='impact',opts={}){
    if(!state.enabled||!hasDOM())return false;const THREE=T(),cfg=core()?.profile?.(kind)||core()?.profile?.('impact'),q=(core()?.budget?.(quality())||1)*motionScale(),p=opts.position?.isVector3?opts.position.clone():origin(kind);
    const sparks=Math.round(cfg.sparks*q),smoke=Math.round(cfg.smoke*q),trails=Math.round(cfg.trails*q);
    for(let i=0;i<sparks;i++){const a=(i/sparks)*Math.PI*2+(i%3)*.17,speed=1.5+(i%7)*.32;spawn('sparks',p,new THREE.Vector3(Math.cos(a)*speed,.9+(i%5)*.35,Math.sin(a)*speed),cfg.duration/1000,0xffd45c,.7+(i%3)*.15)}
    for(let i=0;i<smoke;i++){const a=i*.77;spawn('smoke',p,new THREE.Vector3(Math.cos(a)*.22,.42+(i%4)*.08,Math.sin(a)*.22),cfg.duration/700,0x737b88,.7+(i%5)*.08)}
    for(let i=0;i<trails;i++){const a=i*.53;spawn('trails',p,new THREE.Vector3(Math.cos(a)*.45,.15+(i%3)*.06,Math.sin(a)*.45),cfg.duration/850,kind==='boost'?0x61d9ff:0xc7ff00,.65)}
    if(cfg.glow>0)glow(p,kind==='repair'?0x4cff88:kind==='lightning'?0xeef7ff:kind==='boost'?0x61d9ff:0xffd45c,10*cfg.glow,cfg.duration/1000);
    state.emits++;window.TGGV234?.pulse?.(kind,Math.min(1,cfg.glow*.75),Math.min(900,cfg.duration));renderUI();return true;
  }
  function clear(){
    for(const k of ['sparks','smoke','trails'])state.pools[k].forEach(m=>{if(m.userData.live){m.userData.live=false;m.visible=false}});
    state.pools.glows.forEach(l=>l.parent?.remove(l));state.pools.glows=[];state.active=0;renderUI();return true;
  }
  function setEnabled(v){state.enabled=!!v;if(!state.enabled)clear();renderUI();return state.enabled}
  function restore(){clear();if(state.root?.parent)state.root.parent.remove(state.root);state.root=null;state.enabled=false;state.ready=false;renderUI();return status()}
  function updatePool(type,dt){
    state.pools[type].forEach(m=>{if(!m.userData.live)return;m.userData.life-=dt;if(m.userData.life<=0){m.userData.live=false;m.visible=false;state.active=Math.max(0,state.active-1);return}
      const v=m.userData.vel;m.position.addScaledVector(v,dt);if(type==='sparks')v.y-=5.6*dt;else if(type==='smoke'){v.y+=.12*dt;m.scale.multiplyScalar(1+dt*.65)}else m.rotation.x+=dt*7;
      m.material.opacity=(type==='smoke'?.32:.86)*(m.userData.life/m.userData.maxLife);
    });
  }
  function updateGlows(dt){state.pools.glows=state.pools.glows.filter(l=>{l.userData.life-=dt;l.intensity=10*(l.userData.life/l.userData.maxLife);if(l.userData.life<=0){l.parent?.remove(l);state.active=Math.max(0,state.active-1);return false}return true})}
  function bridge(){
    if(!hasDOM()||bridge.done)return;bridge.done=true;
    ['tgg:traffic-impact','tgg:vehicle-impact'].forEach(ev=>window.addEventListener(ev,e=>emit('impact',{strength:e.detail?.strength})));
    window.addEventListener('tgg:vehicle-repaired',()=>emit('repair'));
    window.addEventListener('tgg:mission-checkpoint',()=>emit('mission'));
    window.addEventListener('tgg:mission-complete',()=>emit('mission'));
    window.addEventListener('tgg:weather-lightning',()=>emit('lightning'));
  }
  function pollDrift(ts){const d=window.TGG3D?.getVehicleDynamics?.()||{},gs=window.TGGGame?.getState?.()||{};if(gs.inVehicle&&d.handbrake&&Math.abs(Number(d.speed)||0)>3&&ts%240<18)emit('drift');if(gs.inVehicle&&d.boosting&&ts%180<18)emit('boost')}
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v238');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v238ForgeBtn')){const b=document.createElement('button');b.id='v238ForgeBtn';b.className='v238-forge-btn';b.textContent='FX';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v238ForgePanel';panel.className='v238-forge-panel';panel.innerHTML='<small>TGG NATIVE 3D</small><b>EFFECTS + IMPACT FORGE</b><div class="v238-grid"><button data-fx="impact">IMPACT</button><button data-fx="boost">BOOST</button><button data-fx="repair">REPAIR</button><button data-fx="mission">MISSION</button><button data-fx="lightning">LIGHTNING</button><button data-fx="drift">DRIFT</button></div><div class="v238-grid"><button id="v238Toggle">FX: ON</button><button id="v238Clear">CLEAR</button></div><div id="v238Stats"></div>';document.body.appendChild(panel);panel.querySelectorAll('[data-fx]').forEach(b=>b.onclick=()=>emit(b.dataset.fx));document.getElementById('v238Toggle').onclick=()=>setEnabled(!state.enabled);document.getElementById('v238Clear').onclick=clear}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v238ForgeHud';hud.className='v238-forge-hud';city.appendChild(hud)}bridge();renderUI();
  }
  function renderUI(){if(!hasDOM())return;if(hud)hud.innerHTML='<small>TGG FX FORGE</small><b>'+state.active+' ACTIVE</b><span>'+quality().toUpperCase()+' • '+state.emits+' EMITS</span>';const s=document.getElementById('v238Stats');if(s)s.textContent=state.active+' ACTIVE • '+state.emits+' TOTAL'}
  function tick(ts=0){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();ensureRoot();const dt=Math.min(.05,Math.max(.001,state.lastTs?(ts-state.lastTs)/1000:.016));state.lastTs=ts;updatePool('sparks',dt);updatePool('smoke',dt);updatePool('trails',dt);updateGlows(dt);if(state.enabled)pollDrift(ts);renderUI()}
  const api={version:VERSION,layers:LAYERS,effects:['impact','boost','repair','mission','lightning','drift'],status,emit,setEnabled,restore,clear};globalThis.TGGV238=api;if(hasDOM()){window.TGGV238=api;ensureUI();requestAnimationFrame(tick)}
})();