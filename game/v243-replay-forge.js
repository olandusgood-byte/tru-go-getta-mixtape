(() => {
  const VERSION='V2.43 TGG REPLAY + HIGHLIGHT FORGE 100';
  const PACKS=['capture','buffer','events','replay','ghost','trail','camera','audio','highlight','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV243Core||globalThis.window?.TGGV243Core;
  const state={
    enabled:true,autoHighlights:true,buffer:[],marks:[],maxSamples:100,captureMs:100,lastCapture:0,
    replaying:false,replayType:'manual',replaySamples:[],replayStartedAt:0,replayDuration:0,
    root:null,playerGhost:null,carGhost:null,trail:null,ready:false,replays:0,captures:0,lastMark:null
  };
  let panel=null,hud=null,overlay=null,progressEl=null,lastTs=0;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-replay-highlight-forge',layerCount:LAYERS.length,
      enabled:state.enabled,autoHighlights:state.autoHighlights,buffer:state.buffer.length,marks:state.marks.length,
      replaying:state.replaying,replayType:state.replayType,replaySamples:state.replaySamples.length,
      captures:state.captures,replays:state.replays,lastMark:state.lastMark
    };
  }
  function vec(o){return o?.position?{x:Number(o.position.x)||0,y:Number(o.position.y)||0,z:Number(o.position.z)||0}:null}
  function captureNow(at=Date.now()){
    if(!state.enabled||!hasDOM())return null;
    const g=window.TGGGame?.getState?.()||{},p=window.TGG3D?.player,c=window.TGG3D?.car,cam=window.TGG3D?.camera;
    const sample={
      at:Number(at)||Date.now(),screen:window.TGGGame?.getActiveScreen?.()||'',
      inVehicle:!!g.inVehicle,heading:Number(g.heading)||0,
      player:vec(p),car:vec(c),camera:vec(cam),
      speed:Number(window.TGG3D?.getVehicleDynamics?.()?.speed)||Number(window.TGG3D?.getPlayerDynamics?.()?.speed)||0
    };
    if(!sample.player&&!sample.car)return null;
    state.buffer.push(sample);while(state.buffer.length>state.maxSamples)state.buffer.shift();
    state.captures++;return sample;
  }
  function mark(type='manual',detail={}){
    const cfg=core()?.profile?.(type)||core()?.profile?.('manual'),now=Date.now();
    const item={id:'hl-'+now+'-'+Math.floor(Math.random()*9999),type:cfg.id,label:cfg.label,at:now,detail:{...detail}};
    state.marks.push(item);while(state.marks.length>24)state.marks.shift();state.lastMark=item;
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:highlight-mark',{detail:item}));
    renderUI();
    if(state.autoHighlights&&cfg.id!=='manual'&&!state.replaying&&window.TGGGame?.getActiveScreen?.()==='game'){
      setTimeout(()=>{if(!state.replaying)replay(cfg.id,{at:now})},180);
    }
    return item;
  }
  function buildVisuals(){
    if(!hasDOM()||state.root)return state.root;
    const THREE=T(),s=scene();if(!THREE||!s)return null;
    const root=new THREE.Group();root.name='tgg-replay-highlight';root.visible=false;
    const ghostMat=new THREE.MeshStandardMaterial({color:0x61d9ff,emissive:0x61d9ff,emissiveIntensity:1.5,transparent:true,opacity:.48,roughness:.3,metalness:.25,depthWrite:false});
    const player=new THREE.Group();
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.62,1.4,5,10),ghostMat.clone());torso.position.y=2.0;player.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.5,14,10),ghostMat.clone());head.position.y=3.4;player.add(head);
    const car=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(4.2,1.0,2.05),ghostMat.clone());body.position.y=.95;car.add(body);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.15,.82,1.65),ghostMat.clone());cabin.position.set(-.2,1.68,0);car.add(cabin);
    const trailMat=new THREE.LineBasicMaterial({color:0x61d9ff,transparent:true,opacity:.75,depthWrite:false});
    const trail=new THREE.Line(new THREE.BufferGeometry(),trailMat);trail.position.y=.12;
    root.add(player,car,trail);s.add(root);
    state.root=root;state.playerGhost=player;state.carGhost=car;state.trail=trail;return root;
  }
  function setAccent(hex){
    if(!state.root)return;const THREE=T(),color=new THREE.Color(hex||0x61d9ff);
    [state.playerGhost,state.carGhost].forEach(g=>g?.traverse?.(o=>{if(o.material){o.material.color?.copy?.(color);o.material.emissive?.copy?.(color)}}));
    if(state.trail?.material)state.trail.material.color.copy(color);
    if(overlay)overlay.style.setProperty('--v243-accent','#'+color.getHexString());
  }
  function trailFor(samples){
    if(!buildVisuals()||!state.trail)return;
    const THREE=T(),pts=samples.map(x=>{
      const v=x.inVehicle&&x.car?x.car:x.player||x.car;
      return new THREE.Vector3(v?.x||0,.08,v?.z||0);
    });
    state.trail.geometry.dispose?.();state.trail.geometry=new THREE.BufferGeometry().setFromPoints(pts);
  }
  function replay(type='manual',opts={}){
    if(!state.enabled||state.replaying)return false;
    const cfg=core()?.profile?.(type)||core()?.profile?.('manual'),at=Number(opts.at)||Date.now();
    const samples=core()?.windowed?.(state.buffer,at,cfg.windowMs)||[];
    if(samples.length<2)return false;
    buildVisuals();state.replayType=cfg.id;state.replaySamples=samples;state.replayStartedAt=Date.now();
    state.replayDuration=cfg.replayMs;state.replaying=true;state.replays++;
    state.root.visible=true;setAccent(cfg.accent);trailFor(samples);
    window.TGGV234?.applyPreset?.(cfg.camera);window.TGGV234?.pulse?.('highlight',.34,500);
    window.TGGV240?.play?.(cfg.audio);window.TGGV232?.play?.('perform',Math.min(3500,cfg.replayMs));
    ensureOverlay();overlay.classList.add('active');overlay.querySelector('b').textContent=cfg.label;
    renderUI();window.dispatchEvent(new CustomEvent('tgg:replay-start',{detail:{type:cfg.id,samples:samples.length,duration:cfg.replayMs}}));
    return status();
  }
  function stop(){
    const was=state.replaying;state.replaying=false;state.replaySamples=[];state.replayStartedAt=0;
    if(state.root)state.root.visible=false;if(overlay)overlay.classList.remove('active');
    window.TGGV234?.applyPreset?.('street');window.TGGV232?.clear?.();
    renderUI();if(was&&hasDOM())window.dispatchEvent(new CustomEvent('tgg:replay-stop',{detail:{type:state.replayType}}));return status();
  }
  function clearHistory(){state.buffer=[];state.marks=[];state.lastMark=null;stop();renderUI();return true}
  function setEnabled(v){state.enabled=!!v;if(!state.enabled)stop();renderUI();return state.enabled}
  function setAutoHighlights(v){state.autoHighlights=!!v;renderUI();return state.autoHighlights}
  function exportLast(){
    const cfg=core()?.profile?.(state.lastMark?.type||'manual')||{},at=state.lastMark?.at||Date.now();
    return {schema:'tgg-highlight-v1',version:VERSION,mark:state.lastMark?{...state.lastMark}:null,samples:core()?.windowed?.(state.buffer,at,cfg.windowMs||5000)||[]};
  }
  function ensureOverlay(){
    if(!hasDOM()||overlay)return overlay;const city=document.querySelector('.city');if(!city)return null;
    overlay=document.createElement('div');overlay.id='v243ReplayOverlay';overlay.className='v243-replay-overlay';
    overlay.innerHTML='<div class="v243-replay-tag"><small>● TGG REPLAY</small><b>INSTANT REPLAY</b></div><div class="v243-replay-progress"><i></i></div>';
    city.appendChild(overlay);progressEl=overlay.querySelector('.v243-replay-progress i');return overlay;
  }
  function bridge(){
    if(!hasDOM()||bridge.done)return;bridge.done=true;
    window.addEventListener('tgg:mission-complete',e=>mark('mission',e.detail||{}));
    window.addEventListener('tgg:rap-battle-complete',e=>mark('battle',e.detail||{}));
    window.addEventListener('tgg:concert-complete',e=>mark('concert',e.detail||{}));
    window.addEventListener('tgg:vehicle-impact',e=>{if((Number(e.detail?.strength)||0)>.55)mark('vehicle',e.detail||{})});
    window.addEventListener('tgg:director-cue',e=>{if(e.detail?.cue==='hero-shot'||e.detail?.cue==='reaction')mark(e.detail?.sequence==='battle'?'battle':'concert',e.detail)});
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v243');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v243ForgeBtn')){const b=document.createElement('button');b.id='v243ForgeBtn';b.className='v243-forge-btn';b.textContent='REPLAY';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){
      panel=document.createElement('aside');panel.id='v243ForgePanel';panel.className='v243-forge-panel';
      panel.innerHTML='<small>TGG CINEMATIC SYSTEM</small><b>REPLAY + HIGHLIGHT FORGE</b><div class="v243-forge-grid"><button data-replay="manual">REPLAY LAST 5S</button><button data-replay="vehicle">DRIVE REPLAY</button><button data-replay="battle">BATTLE REPLAY</button><button data-replay="concert">SHOW REPLAY</button></div><div class="v243-replay-card"><small>ROLLING BUFFER</small><b id="v243ReplayState">READY</b><span id="v243ReplayStats">0 samples</span></div><div class="v243-forge-grid"><button id="v243Mark">MARK HIGHLIGHT</button><button id="v243Auto">AUTO: ON</button><button id="v243Stop">STOP REPLAY</button><button id="v243Clear">CLEAR HISTORY</button></div>';
      document.body.appendChild(panel);panel.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>replay(b.dataset.replay));
      document.getElementById('v243Mark').onclick=()=>mark('manual');
      document.getElementById('v243Auto').onclick=()=>setAutoHighlights(!state.autoHighlights);
      document.getElementById('v243Stop').onclick=stop;document.getElementById('v243Clear').onclick=clearHistory;
    }
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v243ForgeHud';hud.className='v243-forge-hud';city.appendChild(hud)}
    ensureOverlay();bridge();buildVisuals();renderUI();state.ready=true;
  }
  function renderUI(){
    if(!hasDOM())return;const s=document.getElementById('v243ReplayState'),stats=document.getElementById('v243ReplayStats'),auto=document.getElementById('v243Auto');
    if(s)s.textContent=state.replaying?('PLAYING '+state.replayType.toUpperCase()):(state.lastMark?state.lastMark.label:'READY');
    if(stats)stats.textContent=state.buffer.length+' samples • '+state.marks.length+' highlights';
    if(auto)auto.textContent='AUTO: '+(state.autoHighlights?'ON':'OFF');
    if(hud)hud.innerHTML='<small>REPLAY BUFFER</small><b>'+(state.replaying?'REPLAYING '+state.replayType.toUpperCase():'READY')+'</b><span>'+state.buffer.length+' FRAMES • '+state.marks.length+' MARKS</span>';
  }
  function animateReplay(now){
    if(!state.replaying)return;const cfg=core()?.profile?.(state.replayType)||{},p=core()?.progress?.(state.replayStartedAt,now,state.replayDuration)||0;
    if(progressEl)progressEl.style.width=(p*100).toFixed(1)+'%';
    const idx=core()?.indexFor?.(state.replaySamples.length,p)||0,s=state.replaySamples[idx];if(!s)return;
    const pv=s.player||s.car,cv=s.car||s.player;
    if(state.playerGhost&&pv){state.playerGhost.position.set(pv.x||0,pv.y||0,pv.z||0);state.playerGhost.rotation.y=-(Number(s.heading)||0)*Math.PI/180;state.playerGhost.visible=!s.inVehicle}
    if(state.carGhost&&cv){state.carGhost.position.set(cv.x||0,cv.y||0,cv.z||0);state.carGhost.rotation.y=-(Number(s.heading)||0)*Math.PI/180;state.carGhost.visible=!!s.inVehicle}
    if(p>=1)stop();
  }
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const now=Date.now();if(state.enabled&&now-state.lastCapture>=state.captureMs){state.lastCapture=now;captureNow(now)}
    animateReplay(now);if(ts-lastTs>500){lastTs=ts;renderUI()}
  }
  function key(e){if(e.key==='F11'){e.preventDefault();panel?.classList.toggle('active')}}
  const api={version:VERSION,layers:LAYERS,status,captureNow,mark,replay,stop,clearHistory,setEnabled,setAutoHighlights,exportLast};
  globalThis.TGGV243=api;
  if(hasDOM()){window.TGGV243=api;document.addEventListener('keydown',key);ensureUI();requestAnimationFrame(tick)}
})();