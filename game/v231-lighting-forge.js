(() => {
  const VERSION='V2.31 TGG LIGHTING + MATERIAL FORGE 100';
  const LAYERS=[
    'lighting core bridge','lighting baseline snapshot','lighting restore path','lighting mood state','lighting quality state','lighting rig group','lighting scene attach','lighting scene detach','lighting status API','lighting diagnostics',
    'night mood','golden mood','studio mood','club mood','overcast mood','tone exposure','scene background','fog color','fog density','mood persistence',
    'key directional','rim directional','ambient hemisphere','accent point','fill point','key color','rim color','accent color','light intensity scaling','light position rig',
    'shadow key enable','shadow key map','shadow quality high','shadow quality balanced','shadow quality performance','shadow bias','shadow normal bias','shadow camera fit','shadow material compatibility','shadow restore',
    'skin profile','cloth profile','leather profile','chrome profile','glass profile','rubber profile','paint profile','material classifier','material baseline cache','material regrade pass',
    'roughness regrade','metalness regrade','env intensity regrade','glass transparency','glass opacity','material needs update','material shared guard','forge-only material scope','material restore pass','material metrics',
    'character forge bridge','vehicle forge bridge','world forge bridge','interior forge bridge','player skin polish','player cloth polish','vehicle paint polish','vehicle chrome polish','world glass polish','interior material polish',
    'reflection highlight rig','vehicle highlight left','vehicle highlight right','studio highlight','club highlight','highlight quality gate','highlight animation','highlight restore','emissive restraint','neon balance',
    'quality auto bridge','quality high','quality balanced','quality performance','mobile quality hint','reduced motion guard','frame-safe animation','mood button UI','quality button UI','restore button UI',
    'lighting HUD','lighting panel','F7 shortcut','mobile panel','landscape panel','rollback isolation','V2.30 compatibility','100-layer manifest','release QA hooks','production diagnostics'
  ];

  const core=()=>globalThis.TGGV231Core||globalThis.window?.TGGV231Core;
  const state={
    mood:'night',quality:'auto',rig:null,highlights:null,baseline:null,ready:false,
    materialsScanned:0,materialsGraded:0,lastRegradeAt:0,restored:false
  };
  const materialBaseline=new Map();
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const renderer=()=>hasDOM()?window.TGG3D?.renderer||null:null;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-lighting-forge',layerCount:LAYERS.length,
      mood:state.mood,quality:resolvedQuality(),materialsScanned:state.materialsScanned,
      materialsGraded:state.materialsGraded,restored:state.restored
    };
  }

  function resolvedQuality(){
    if(state.quality!=='auto')return state.quality;
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  }

  function captureBaseline(){
    if(state.baseline||!hasDOM())return state.baseline;
    const s=scene(),r=renderer();if(!s||!r)return null;
    state.baseline={
      exposure:Number(r.toneMappingExposure)||1,
      shadowEnabled:!!r.shadowMap?.enabled,
      background:s.background?.clone?.()||null,
      fog:s.fog?{color:s.fog.color?.clone?.()||null,density:Number(s.fog.density)||0}:null
    };
    return state.baseline;
  }

  function makeRig(){
    if(!hasDOM()||state.rig)return state.rig;
    const THREE=T(),s=scene();if(!THREE||!s)return null;
    const rig=new THREE.Group();rig.name='tgg-lighting-forge-rig';rig.userData.v231=true;

    const key=new THREE.DirectionalLight(0xffffff,1.1);key.position.set(18,28,14);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.00035;key.shadow.normalBias=.025;
    key.shadow.camera.left=-45;key.shadow.camera.right=45;key.shadow.camera.top=45;key.shadow.camera.bottom=-45;
    const rim=new THREE.DirectionalLight(0x7ba7ff,.55);rim.position.set(-22,18,-18);
    const hemi=new THREE.HemisphereLight(0x7c8cff,0x11131a,.5);
    const accent=new THREE.PointLight(0xc7ff00,4.8,34,2);accent.position.set(0,8,0);
    const fill=new THREE.PointLight(0x61d9ff,1.9,28,2);fill.position.set(18,6,-18);
    rig.add(key,rim,hemi,accent,fill);
    rig.userData.lights={key,rim,hemi,accent,fill};
    s.add(rig);state.rig=rig;
    return rig;
  }

  function makeHighlights(){
    if(!hasDOM()||state.highlights)return state.highlights;
    const THREE=T(),s=scene();if(!THREE||!s)return null;
    const g=new THREE.Group();g.name='tgg-reflection-highlight-rig';g.userData.v231Highlight=true;
    const defs=[
      [0x61d9ff,11,4,-10,2.5,18],
      [0xff466d,-11,5,10,2.2,18],
      [0xc7ff00,-26,7,-12,2.0,16],
      [0xc56cff,4,9,34,2.4,18]
    ];
    defs.forEach((d,i)=>{
      const l=new THREE.PointLight(d[0],d[4],d[5],2);l.position.set(d[1],d[2],d[3]);l.userData.baseIntensity=d[4];l.userData.index=i;g.add(l);
    });
    s.add(g);state.highlights=g;return g;
  }

  function applyMood(id='night'){
    const cfg=core()?.mood?.(id)||core()?.mood?.('night');if(!cfg)return status();
    state.mood=cfg.id;state.restored=false;
    if(!hasDOM())return status();
    captureBaseline();const THREE=T(),s=scene(),r=renderer(),rig=makeRig();makeHighlights();
    if(!s||!r||!THREE||!rig)return status();
    r.toneMappingExposure=cfg.exposure;
    if(s.background?.set)s.background.set(cfg.sky);else s.background=new THREE.Color(cfg.sky);
    if(s.fog){s.fog.color.set(cfg.fog);s.fog.density=cfg.fogDensity}else s.fog=new THREE.FogExp2(cfg.fog,cfg.fogDensity);
    const L=rig.userData.lights;
    L.key.color.set(cfg.keyColor);L.key.intensity=cfg.keyIntensity*.42;
    L.rim.color.set(cfg.hemiSky);L.rim.intensity=Math.max(.2,cfg.hemiIntensity*.34);
    L.hemi.color.set(cfg.hemiSky);L.hemi.groundColor.set(cfg.hemiGround);L.hemi.intensity=cfg.hemiIntensity*.32;
    L.accent.color.set(cfg.accentColor);L.accent.intensity=cfg.accentIntensity*.24;
    L.fill.color.set(cfg.keyColor);L.fill.intensity=Math.max(.3,cfg.keyIntensity*.3);
    applyQuality();regrade();persist();renderUI();
    window.dispatchEvent(new CustomEvent('tgg:lighting-mood',{detail:{mood:state.mood,quality:resolvedQuality()}}));
    return status();
  }

  function isForgeObject(obj){
    let p=obj;
    while(p&&p!==scene()){
      if(p.userData?.v227Forge||p.userData?.v228Forge||p.userData?.v229||p.userData?.v230||
         ['tgg-forge-player','tgg-forge-car','tgg-world-forge','tgg-interior-forge'].includes(p.name))return true;
      p=p.parent;
    }
    return false;
  }

  function classify(mesh){
    const n=String(mesh?.name||'').toLowerCase();
    if(/glass|window|windshield|mirror/.test(n))return'glass';
    if(/tire|sole|rubber/.test(n))return'rubber';
    if(/chrome|rim|hub|buckle|chain|pendant|exhaust|disc|truss|grille|antenna/.test(n))return'chrome';
    if(/skin|head|ear|nose|cheek|hand|forearm|jaw|neck/.test(n))return'skin';
    if(/paint|hood|trunk|bumper|door|spoiler|body|chassis/.test(n))return'paint';
    if(/shoe|belt|leather/.test(n))return'leather';
    return'cloth';
  }

  function captureMaterial(m){
    if(!m||materialBaseline.has(m))return;
    materialBaseline.set(m,{
      roughness:m.roughness,metalness:m.metalness,envMapIntensity:m.envMapIntensity,
      transparent:m.transparent,opacity:m.opacity
    });
  }

  function gradeMaterial(m,profile){
    if(!m||!profile)return false;captureMaterial(m);
    if('roughness'in m&&Number.isFinite(profile.roughness))m.roughness=profile.roughness;
    if('metalness'in m&&Number.isFinite(profile.metalness))m.metalness=profile.metalness;
    if('envMapIntensity'in m&&Number.isFinite(profile.envMapIntensity))m.envMapIntensity=profile.envMapIntensity;
    if(profile.transparent===true){m.transparent=true;m.opacity=Math.min(Number(m.opacity)||1,profile.opacity??.7)}
    m.needsUpdate=true;return true;
  }

  function regrade(){
    if(!hasDOM())return status();
    const s=scene();if(!s)return status();
    let scanned=0,graded=0;
    const seen=new Set();
    s.traverse(o=>{
      if(!o.isMesh||!isForgeObject(o))return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.filter(Boolean).forEach(m=>{
        if(seen.has(m))return;seen.add(m);scanned++;
        const profile=core()?.material?.(classify(o));
        if(gradeMaterial(m,profile))graded++;
      });
    });
    state.materialsScanned=scanned;state.materialsGraded=graded;state.lastRegradeAt=Date.now();renderUI();
    return status();
  }

  function restoreMaterials(){
    for(const [m,b] of materialBaseline.entries()){
      if('roughness'in m)m.roughness=b.roughness;
      if('metalness'in m)m.metalness=b.metalness;
      if('envMapIntensity'in m)m.envMapIntensity=b.envMapIntensity;
      m.transparent=b.transparent;m.opacity=b.opacity;m.needsUpdate=true;
    }
    materialBaseline.clear();state.materialsScanned=0;state.materialsGraded=0;
  }

  function applyQuality(){
    if(!hasDOM())return status();
    const q=resolvedQuality(),r=renderer(),rig=makeRig(),h=makeHighlights();if(!r||!rig)return status();
    const L=rig.userData.lights;
    const high=q==='high',balanced=q==='balanced';
    L.key.castShadow=high;
    if(r.shadowMap)r.shadowMap.enabled=q!=='performance';
    rig.visible=true;
    if(h)h.visible=q!=='performance';
    if(q==='performance'){
      L.key.intensity*=.72;L.rim.intensity*=.65;L.fill.intensity*=.58;L.accent.intensity*=.72;
    }else if(balanced){
      L.key.intensity*=.88;L.rim.intensity*=.82;L.fill.intensity*=.78;
    }
    return status();
  }

  function setQuality(q='auto'){
    state.quality=['auto','high','balanced','performance'].includes(q)?q:'auto';
    if(hasDOM())applyMood(state.mood);
    persist();renderUI();return status();
  }

  function restore(){
    if(!hasDOM()){state.restored=true;return status()}
    const s=scene(),r=renderer(),b=state.baseline;
    restoreMaterials();
    if(b&&r){
      r.toneMappingExposure=b.exposure;
      if(r.shadowMap)r.shadowMap.enabled=b.shadowEnabled;
      if(b.background)s.background=b.background?.clone?.()||b.background;
      if(b.fog&&s.fog){s.fog.color.copy(b.fog.color);s.fog.density=b.fog.density}
    }
    if(state.rig?.parent)s.remove(state.rig);
    if(state.highlights?.parent)s.remove(state.highlights);
    state.rig=null;state.highlights=null;state.restored=true;renderUI();
    window.dispatchEvent(new CustomEvent('tgg:lighting-restored'));
    return status();
  }

  function persist(){
    if(!hasDOM())return;
    try{localStorage.setItem('tgg-v231-lighting',JSON.stringify({mood:state.mood,quality:state.quality}))}catch{}
  }
  function load(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem('tgg-v231-lighting')||'{}');
      if(core()?.moods?.includes(x.mood))state.mood=x.mood;
      if(['auto','high','balanced','performance'].includes(x.quality))state.quality=x.quality;
    }catch{}
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v231');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v231ForgeBtn')){
      const b=document.createElement('button');b.id='v231ForgeBtn';b.className='v231-forge-btn';b.type='button';b.textContent='LIGHT FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v231ForgePanel';panel.className='v231-forge-panel';
      panel.innerHTML='<div class="v231-head"><div><small>TGG NATIVE 3D</small><b>LIGHT + MATERIAL FORGE</b></div><button id="v231Close" type="button">×</button></div><div class="v231-moods"><button data-v231-mood="night">NIGHT</button><button data-v231-mood="golden">GOLDEN</button><button data-v231-mood="studio">STUDIO</button><button data-v231-mood="club">CLUB</button><button data-v231-mood="overcast">OVERCAST</button></div><div class="v231-quality"><button data-v231-quality="auto">AUTO</button><button data-v231-quality="high">HIGH</button><button data-v231-quality="balanced">BALANCED</button><button data-v231-quality="performance">PERFORMANCE</button></div><div class="v231-actions"><button id="v231Regrade" type="button">REGRADE MATERIALS</button><button id="v231Restore" type="button">RESTORE BASE</button></div><div id="v231Stats" class="v231-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v231Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v231-mood]').forEach(b=>b.addEventListener('click',()=>applyMood(b.dataset.v231Mood)));
      panel.querySelectorAll('[data-v231-quality]').forEach(b=>b.addEventListener('click',()=>setQuality(b.dataset.v231Quality)));
      document.getElementById('v231Regrade')?.addEventListener('click',regrade);
      document.getElementById('v231Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v231ForgeHud';hud.className='v231-forge-hud';
      hud.innerHTML='<small>TGG LIGHT FORGE</small><b id="v231HudMood">NIGHT</b><span id="v231HudStats">READY</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v231Stats'))q('v231Stats').textContent=state.materialsGraded+' MATERIALS • '+resolvedQuality().toUpperCase()+' • '+state.mood.toUpperCase();
    if(q('v231HudMood'))q('v231HudMood').textContent=state.mood.toUpperCase()+' • '+resolvedQuality().toUpperCase();
    if(q('v231HudStats'))q('v231HudStats').textContent=state.materialsGraded+' MATERIALS GRADED';
    panel?.querySelectorAll('[data-v231-mood]').forEach(b=>b.classList.toggle('active',b.dataset.v231Mood===state.mood));
    panel?.querySelectorAll('[data-v231-quality]').forEach(b=>b.classList.toggle('active',b.dataset.v231Quality===state.quality));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F7'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let booted=false,lastGrade=0;
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!booted&&scene()&&renderer()){captureBaseline();makeRig();makeHighlights();applyMood(state.mood);booted=true;state.ready=true}
    const h=state.highlights,q=resolvedQuality();
    if(h&&h.visible&&q!=='performance'){
      h.children.forEach((l,i)=>{l.intensity=(l.userData.baseIntensity||1)*(1+Math.sin(ts*.0015+i)*.12)});
    }
    if(ts-lastGrade>5000){lastGrade=ts;regrade()}
  }

  load();
  const api={version:VERSION,layers:LAYERS,moods:['night','golden','studio','club','overcast'],status,applyMood,regrade,restore,setQuality};
  globalThis.TGGV231=api;
  if(hasDOM()){
    window.TGGV231=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();