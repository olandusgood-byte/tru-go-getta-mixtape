(()=>{
  'use strict';
  const VERSION='5.41.0';
  const POLICY='local_only';
  const KEY='tgg-v541-physical-interiors-crowd';
  const HOTSPOTS=[
    {id:'reset',label:'REST ZONE',x:4.0,z:3.2},
    {id:'plan',label:'CAREER DESK',x:1.0,z:-2.7},
    {id:'wardrobe',label:'WARDROBE',x:-4.2,z:3.6}
  ];
  const defaults={room:{x:0,z:1.2,interactions:0,lastHotspot:null},crowd:{mode:'normal',syncs:0,lastAnchor:null},history:[]};
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...raw,room:{...defaults.room,...(raw.room||{})},crowd:{...defaults.crowd,...(raw.crowd||{})},history:Array.isArray(raw.history)?raw.history.slice(-60):[]};
    }catch{return clone(defaults)}
  }
  const state=load();
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state};
  const systems=()=>window.TGGWorldSystems?.getStatus?.()||{};
  const city=()=>window.TGGLivingCity?.getStatus?.()||{};
  const world=()=>window.TGGWorldDepth?.getStatus?.()||{};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  let roomRuntime=null,roomAvatar=null,hotspotMeshes=new Map(),upgradeMeshes=[],boundKeys=false;

  function homeRuntime(){
    window.TGGInteriors3D?.ensure?.();
    const list=window.TGGInteriors3D?.runtimes||[];
    return list.find(rt=>rt?.screen?.id==='home')||null;
  }
  function makeMarker(THREE,color=0xc7ff00){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.36,.9,4,8),new THREE.MeshStandardMaterial({color,roughness:.5}));
    body.position.y=1.15;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),new THREE.MeshStandardMaterial({color:0xa97250,roughness:.7}));
    head.position.y=2.15;g.add(head);
    return g;
  }
  function addHotspot(scene,THREE,h){
    const g=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.58,.07,10,30),new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x76aa00,emissiveIntensity:2}));
    ring.rotation.x=Math.PI/2;ring.position.y=.12;g.add(ring);
    const beacon=new THREE.PointLight(0xc7ff00,3.2,5,2);beacon.position.y=1.1;g.add(beacon);
    g.position.set(h.x,0,h.z);g.userData.v541Hotspot=h.id;scene.add(g);return g;
  }
  function syncUpgradeVisuals(){
    if(!roomRuntime)return 0;
    const THREE=window.THREE,scene=roomRuntime.scene;
    upgradeMeshes.forEach(m=>scene.remove(m));upgradeMeshes=[];
    const level=Math.max(1,Number(systems().properties?.apartment)||1);
    for(let i=1;i<level;i++){
      const mesh=new THREE.Mesh(
        new THREE.BoxGeometry(1.1,.12,1.1),
        new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x416600,emissiveIntensity:1.1,metalness:.45,roughness:.35})
      );
      mesh.position.set(-6+i*1.35,.12,-5.6);
      scene.add(mesh);upgradeMeshes.push(mesh);
    }
    return upgradeMeshes.length;
  }
  function ensureRoom(){
    if(roomRuntime&&roomAvatar)return true;
    const rt=homeRuntime();if(!rt||!window.THREE)return false;
    roomRuntime=rt;
    const THREE=window.THREE;
    roomAvatar=makeMarker(THREE);
    roomAvatar.position.set(state.room.x,0,state.room.z);
    roomAvatar.userData.v541Avatar=true;
    rt.scene.add(roomAvatar);
    HOTSPOTS.forEach(h=>hotspotMeshes.set(h.id,addHotspot(rt.scene,THREE,h)));
    syncUpgradeVisuals();
    return true;
  }
  function nearestHotspot(){
    if(!ensureRoom())return null;
    let best=null;
    for(const h of HOTSPOTS){
      const d=Math.hypot(state.room.x-h.x,state.room.z-h.z);
      if(!best||d<best.distance)best={...h,distance:d};
    }
    return best;
  }
  function moveRoom(dx=0,dz=0){
    if(!ensureRoom())return {ok:false,status:'room_unavailable'};
    state.room.x=clamp(state.room.x+Number(dx||0),-7.6,7.6);
    state.room.z=clamp(state.room.z+Number(dz||0),-5.7,5.7);
    roomAvatar.position.set(state.room.x,0,state.room.z);
    const near=nearestHotspot();
    state.room.near=near&&near.distance<=1.6?near.id:null;
    save();
    return {ok:true,x:state.room.x,z:state.room.z,near:near?{id:near.id,label:near.label,distance:near.distance}:null};
  }
  function teleportNear(id){
    const h=HOTSPOTS.find(x=>x.id===id);if(!h)return {ok:false,status:'unknown_hotspot'};
    if(!ensureRoom())return {ok:false,status:'room_unavailable'};
    state.room.x=h.x+.45;state.room.z=h.z+.35;
    roomAvatar.position.set(state.room.x,0,state.room.z);save();
    return moveRoom(0,0);
  }
  function interactNearest(){
    const near=nearestHotspot();
    if(!near||near.distance>1.6)return {ok:false,status:'no_hotspot_in_range',nearest:near};
    const result=window.TGGV510?.performHotspot?.('apartment',near.id)||{ok:false,status:'v510_unavailable'};
    if(result?.ok){
      state.room.interactions=(Number(state.room.interactions)||0)+1;
      state.room.lastHotspot={id:near.id,label:near.label,at:Date.now(),result:clone(result)};
      state.history.push({type:'room-hotspot',id:near.id,at:Date.now()});
      state.history=state.history.slice(-60);save();syncUpgradeVisuals();
    }
    return {ok:!!result?.ok,hotspot:near,result};
  }
  function bindKeyboard(){
    if(boundKeys)return;boundKeys=true;
    window.addEventListener('keydown',e=>{
      if(window.TGGGame?.getActiveScreen?.()!=='home')return;
      const k=String(e.key||'').toLowerCase();
      if(k==='w'||k==='arrowup'){e.preventDefault();moveRoom(0,-.55)}
      else if(k==='s'||k==='arrowdown'){e.preventDefault();moveRoom(0,.55)}
      else if(k==='a'||k==='arrowleft'){e.preventDefault();moveRoom(-.55,0)}
      else if(k==='d'||k==='arrowright'){e.preventDefault();moveRoom(.55,0)}
      else if(k==='e'){e.preventDefault();interactNearest()}
    },true);
  }
  function crowdAnchor(){
    const beat=window.TGGWorldDepth?.beatNavigation?.();
    if(beat&&Number.isFinite(Number(beat.x))&&Number.isFinite(Number(beat.y))){
      return {x:((Number(beat.x)||50)-50)*.92,z:((Number(beat.y)||50)-50)*.92,source:'world-beat'};
    }
    const event=city().cityEvent;
    return event?{x:0,z:0,source:'city-event'}:{x:0,z:0,source:'city-center'};
  }
  function syncCrowdBehavior(){
    const list=window.TGG3D?.pedestrians||[];if(!list.length)return {ok:false,status:'no_crowd'};
    const c=city(),heat=Math.max(0,Number(c.heat)||0),event=!!c.cityEvent,anchor=crowdAnchor();
    const mode=event||heat>=60?'cluster':String(c.crowdMood||'').toLowerCase().includes('tense')?'disperse':'normal';
    list.forEach((p,i)=>{
      if(!p?.userData)return;
      if(!p.userData.v541OriginalRoute&&Array.isArray(p.userData.route))p.userData.v541OriginalRoute=clone(p.userData.route);
      if(mode==='normal'){
        if(p.userData.v541OriginalRoute)p.userData.route=clone(p.userData.v541OriginalRoute);
      }else if(mode==='cluster'){
        const a=(i/list.length)*Math.PI*2,r=3.5+(i%5)*.75;
        p.userData.route=[
          [anchor.x+Math.cos(a)*r,anchor.z+Math.sin(a)*r],
          [anchor.x+Math.cos(a+.7)*(r+1.3),anchor.z+Math.sin(a+.7)*(r+1.3)]
        ];
        p.userData.routeIndex=0;
      }else{
        const sx=(i%2?1:-1)*(18+(i%6)*3),sz=(i%3?1:-1)*(16+(i%5)*3);
        p.userData.route=[[sx,sz],[sx*.82,sz*.86]];p.userData.routeIndex=0;
      }
      p.userData.v541CrowdMode=mode;
    });
    state.crowd.mode=mode;state.crowd.syncs=(Number(state.crowd.syncs)||0)+1;state.crowd.lastAnchor=anchor;save();
    return {ok:true,mode,count:list.length,anchor};
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,
      ...clone(state),
      roomReady:!!roomAvatar,
      hotspotCount:hotspotMeshes.size,
      upgradeVisuals:upgradeMeshes.length,
      nearest:nearestHotspot(),
      pedestrianModes:(window.TGG3D?.pedestrians||[]).map(p=>p?.userData?.v541CrowdMode||'unset'),
      features:['physical-interior-avatar','3d-proximity-hotspots','keyboard-room-movement','persistent-room-position','visible-property-upgrades','crowd-route-clustering','crowd-route-dispersion']
    };
  }
  function run(){
    const room=ensureRoom();bindKeyboard();const crowd=syncCrowdBehavior();const snap=snapshot();
    const checks={
      room,
      apartment3D:!!homeRuntime(),
      hotspots:snap.hotspotCount===3,
      worldSystems:!!window.TGGWorldSystems,
      propertyActions:!!window.TGGV510,
      crowd:crowd.ok===true,
      crowdCount:(window.TGG3D?.pedestrians||[]).length>=12,
      features:snap.features.length===7,
      policy:POLICY==='local_only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snap,at:new Date().toISOString()};
  }
  function boot(){
    bindKeyboard();
    const tryReady=()=>{ensureRoom();syncCrowdBehavior()};
    window.addEventListener('tgg:v509-ready',tryReady);
    window.addEventListener('tgg:v510-ready',tryReady);
    window.addEventListener('tgg:world-beat-complete',()=>setTimeout(syncCrowdBehavior,0));
    window.addEventListener('tgg:district-reaction',()=>setTimeout(syncCrowdBehavior,0));
    setInterval(()=>{if(window.TGGGame?.getActiveScreen?.()==='home')ensureRoom();syncCrowdBehavior()},1600);
    tryReady();
    window.TGGPhysicalWorld={version:VERSION,mutationPolicy:POLICY,ensureRoom,moveRoom,teleportNear,nearestHotspot,interactNearest,syncCrowdBehavior,snapshot,run};
    window.TGGV541={version:VERSION,mutationPolicy:POLICY,run,snapshot,moveRoom,teleportNear,interactNearest,syncCrowdBehavior};
    document.documentElement.dataset.tggV541='on';
    window.dispatchEvent(new CustomEvent('tgg:v541-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();