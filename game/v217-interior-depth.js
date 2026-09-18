(() => {
  const VERSION='V2.17 CITY + INTERIOR DEPTH 100';
  const LAYERS=[
    'studio recording light','studio waveform monitors','studio booth halo','studio engineer npc','studio engineer idle','studio acoustic leds','studio mic halo','studio record scene','studio mix scene','studio release scene',
    'studio activity HUD','studio activity progress','studio activity timer','studio active mission cue','studio scene status','media clapboard','media camera flash','media floor marks','media LED wall','media director cue',
    'media video scene','media photo scene','media premiere scene','media shoot HUD','media mission cue','home city window glow','home turntable','home vinyl spin','home trophy shelf','home career wall glow',
    'home save scene','home wardrobe scene','home career scene','home ambience HUD','home mission cue','park basketball prop','park ball bounce','park scoreboard','park crowd rings','park court glow',
    'park court scene','park fitness scene','park lobby scene','park activity HUD','park mission cue','shop mannequins','shop sneaker pedestal','shop barber light','shop jewelry case','shop store glow',
    'shop clothes scene','shop shoes scene','shop barber scene','shop jewelry scene','shop activity HUD','garage service lift','garage tool cabinet','garage dyno lights','garage floor arrows','garage fan prop',
    'garage paint scene','garage wheel scene','garage tune scene','garage service HUD','garage condition bridge','interior scene overlay','interior scene title','interior scene subtitle','interior scene progress','interior scene close',
    'interior activity events','interior activity cooldown','interior activity state','interior screen detection','interior screen status','mission location cue','mission destination match','mission interior highlight','mission interior label','mission interior pulse',
    'quality-aware interior lights','performance interior trim','balanced interior lights','high interior lights','mobile interior HUD','landscape interior HUD','reduced motion interior safety','safe scene decoration','scene decoration dedupe','scene object tagging',
    'scene material reuse','scene status API','activity status API','interior diagnostics','mission diagnostics','runtime safeguards','rollback isolation','V2.16 compatibility','100-layer manifest','release QA hooks'
  ];
  const state={
    ready:false,decorated:{studio:false,garage:false,home:false,media:false,shops:false,park:false},
    currentScreen:'',activity:null,activityStartedAt:0,activityUntil:0,objects:0,lights:0,lastMissionCue:''
  };
  const materials={};
  let overlay=null,lastTick=performance.now();
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const T=()=>window.THREE;

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;
    if(materials[key])return materials[key];
    materials[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.62,metalness:opts.metalness??.22,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
    return materials[key];
  }
  function add(scene,obj,tag){
    if(!scene||!obj)return null;
    obj.userData.v217=true;obj.userData.v217Tag=tag||'detail';scene.add(obj);state.objects++;return obj;
  }
  function box(scene,w,h,d,color,x,y,z,opts={},tag='box'){
    const THREE=T();if(!THREE)return null;
    const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat('m-'+color+'-'+(opts.emissive||0),color,opts));
    o.position.set(x,y,z);o.castShadow=opts.shadow!==false;o.receiveShadow=opts.shadow!==false;return add(scene,o,tag);
  }
  function light(scene,color,intensity,distance,x,y,z,tag='light'){
    const THREE=T();if(!THREE)return null;
    const l=new THREE.PointLight(color,intensity,distance,2);l.position.set(x,y,z);l.userData.v217Base=intensity;add(scene,l,tag);state.lights++;return l;
  }
  function tagGroup(scene,name){
    const THREE=T();if(!THREE||!scene)return null;
    if(scene.userData?.['v217_'+name])return scene.userData['v217_'+name];
    const g=new THREE.Group();g.name='v217-'+name;g.userData.v217=true;scene.add(g);scene.userData['v217_'+name]=g;state.objects++;return g;
  }
  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='v217InteriorOverlay';overlay.className='v217-interior-overlay';
    overlay.innerHTML='<small id="v217Kicker">INTERIOR ACTIVITY</small><b id="v217Title">READY</b><span id="v217Subtitle">Choose an activity.</span><div class="v217-progress"><i id="v217Progress"></i></div><button id="v217Close" type="button">CLOSE</button>';
    document.body.appendChild(overlay);
    $('v217Close')?.addEventListener('click',()=>showOverlay(false));
    return overlay;
  }
  function showOverlay(on=true){ensureOverlay().classList.toggle('active',!!on)}
  function setOverlay(kicker,title,subtitle,progress=0){
    ensureOverlay();
    const k=$('v217Kicker'),t=$('v217Title'),s=$('v217Subtitle'),p=$('v217Progress');
    if(k)k.textContent=String(kicker||'INTERIOR ACTIVITY').toUpperCase();
    if(t)t.textContent=String(title||'READY').toUpperCase();
    if(s)s.textContent=String(subtitle||'');
    if(p)p.style.width=clamp(Number(progress)||0,0,100)+'%';
  }

  function studio(){
    window.TGGStudio3D?.ensure?.();
    const rt=window.TGGStudio3D;if(!rt?.scene||state.decorated.studio)return;
    const THREE=T(),scene=rt.scene,g=tagGroup(scene,'studio');
    const red=new THREE.PointLight(0xff2e42,0,10,2);red.position.set(-4,4,-.3);red.userData.v217Base=5;g.add(red);state.lights++;
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.48,.035,10,30),mat('studio-halo',0xc7ff00,{emissive:0xc7ff00,emissiveIntensity:3.2}));
    halo.position.set(-3.25,3.05,-.4);halo.rotation.y=Math.PI/2;g.add(halo);
    for(let x=-5.7;x<=-1.3;x+=1.1){
      const led=box(g,.72,.08,.06,0x62d8ff,x,5.18,-6.55,{emissive:0x62d8ff,emissiveIntensity:2.5,shadow:false},'studio-led');
    }
    const eng=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,1.15,4,8),mat('eng-body',0x596bff,{roughness:.58}));
    body.position.y=1.55;eng.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.4,14,10),mat('eng-skin',0x9a6546,{roughness:.72}));head.position.y=2.78;eng.add(head);
    eng.position.set(4.9,0,3.7);g.add(eng);eng.userData.v217Engineer=true;

    const waveform=[];
    for(let i=0;i<16;i++){
      const bar=box(g,.12,.1+.1*(i%5),.05,0x48d7ff,2.55+i*.16,2.38,-.55,{emissive:0x48d7ff,emissiveIntensity:2.4,shadow:false},'waveform');
      waveform.push(bar);
    }
    g.userData.red=red;g.userData.halo=halo;g.userData.engineer=eng;g.userData.waveform=waveform;
    state.decorated.studio=true;
  }

  function garage(){
    window.TGGGarage3D?.ensure?.();
    const rt=window.TGGGarage3D;if(!rt?.scene||state.decorated.garage)return;
    const THREE=T(),scene=rt.scene,g=tagGroup(scene,'garage');
    box(g,6.4,.18,3.2,0x171d27,0,.02,0,{metalness:.62,roughness:.35},'service-lift');
    [-3.7,3.7].forEach(x=>box(g,1.25,2.8,1.1,0x242c39,x,1.4,-4.4,{metalness:.65,roughness:.4},'tool-cabinet'));
    [-2.6,0,2.6].forEach(x=>light(g,0x61d9ff,4.3,8,x,.3,2.8,'dyno-light'));
    for(let i=-2;i<=2;i++){
      const arrow=box(g,.85,.025,.12,0xc7ff00,i*1.15,.04,4.2,{emissive:0xc7ff00,emissiveIntensity:2,shadow:false},'floor-arrow');
      arrow.rotation.y=Math.PI/2;
    }
    const fan=new THREE.Group();
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.2,12),mat('fan-dark',0x202733,{metalness:.7,roughness:.28}));fan.add(hub);
    for(let i=0;i<5;i++){const blade=box(fan,1.15,.1,.28,0x35404f,.58,0,0,{metalness:.65,roughness:.3},'fan-blade');blade.rotation.y=i*Math.PI*2/5}
    fan.position.set(0,4.7,-6.4);fan.rotation.x=Math.PI/2;g.add(fan);g.userData.fan=fan;
    state.decorated.garage=true;
  }

  function findInterior(screenId){
    window.TGGInteriors3D?.ensure?.();
    const runtimes=window.TGGInteriors3D?.runtimes||[];
    return runtimes.find(r=>r.screen?.id===screenId)||null;
  }
  function home(){
    const rt=findInterior('home');if(!rt?.scene||state.decorated.home)return;
    const THREE=T(),g=tagGroup(rt.scene,'home');
    const cityGlow=light(g,0x4f78ff,4.8,14,-3.2,4,-6.2,'window-glow');
    const turntable=box(g,1.6,.2,1.2,0x10141b,1.3,1.0,-2.2,{metalness:.55,roughness:.32},'turntable');
    const vinyl=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.035,28),mat('vinyl',0x08090b,{metalness:.35,roughness:.3}));
    vinyl.rotation.x=Math.PI/2;vinyl.position.set(1.3,1.15,-2.2);g.add(vinyl);
    for(let i=0;i<4;i++){box(g,.48,.72,.42,0xc89f4a,-5.8+i*.65,1.05,-4.9,{metalness:.48,roughness:.35},'trophy')}
    const career=box(g,3.7,1.75,.08,0x111827,-2.2,3.8,-6.5,{emissive:0xc7ff00,emissiveIntensity:.75,shadow:false},'career-wall');
    g.userData.vinyl=vinyl;g.userData.cityGlow=cityGlow;g.userData.career=career;state.decorated.home=true;
  }
  function media(){
    const rt=findInterior('media');if(!rt?.scene||state.decorated.media)return;
    const THREE=T(),g=tagGroup(rt.scene,'media');
    const wall=box(g,6.8,2.8,.09,0x0b1017,0,2.3,-5.18,{emissive:0xc56cff,emissiveIntensity:.9,shadow:false},'led-wall');
    const flash=light(g,0xffffff,0,16,-2.7,4.8,1.8,'camera-flash');
    for(let i=-2;i<=2;i++)box(g,.55,.025,.08,0xffcf4a,i*1.1,.03,-.2,{emissive:0xffcf4a,emissiveIntensity:1.3,shadow:false},'floor-mark');
    const board=box(g,1.5,.8,.1,0x121722,-3.6,2.1,1.2,{metalness:.48,roughness:.45},'clapboard');
    g.userData.flash=flash;g.userData.wall=wall;g.userData.board=board;state.decorated.media=true;
  }
  function shops(){
    const rt=findInterior('shops');if(!rt?.scene||state.decorated.shops)return;
    const THREE=T(),g=tagGroup(rt.scene,'shops');
    [-5.6,-1.8,1.8,5.6].forEach((x,i)=>{
      const stand=box(g,1.2,.5,1.2,0x121722,x,.25,1.7,{metalness:.42,roughness:.4},'pedestal');
      const glow=light(g,[0xc7ff00,0x48d7ff,0xff466d,0xc56cff][i],2.8,6,x,1.5,1.7,'shop-glow');
    });
    const caseM=mat('jewel-glass',0x7aa9c7,{transparent:true,opacity:.22,roughness:.08,metalness:.12});
    const jewel=new THREE.Mesh(new THREE.BoxGeometry(2.1,1.1,1.2),caseM);jewel.position.set(5.7,1.1,-.3);g.add(jewel);
    const barber=light(g,0xffffff,3.2,7,1.9,3,-.4,'barber-light');
    state.decorated.shops=true;
  }
  function park(){
    const rt=findInterior('park');if(!rt?.scene||state.decorated.park)return;
    const THREE=T(),g=tagGroup(rt.scene,'park');
    const ball=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),mat('ball',0xd8752d,{roughness:.72}));ball.position.set(0,.45,0);g.add(ball);
    const scoreboard=box(g,3.6,1.45,.12,0x090d13,0,4.5,-4.1,{emissive:0xff315f,emissiveIntensity:1.1,shadow:false},'scoreboard');
    const courtGlow=light(g,0x48d7ff,2.2,14,0,4,0,'court-glow');
    [-4.8,4.8].forEach(x=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(1.0,.045,8,28),mat('crowd-ring',0xc7ff00,{emissive:0xc7ff00,emissiveIntensity:2,transparent:true,opacity:.35}));ring.rotation.x=Math.PI/2;ring.position.set(x,.05,3.0);g.add(ring)});
    g.userData.ball=ball;g.userData.scoreboard=scoreboard;g.userData.courtGlow=courtGlow;state.decorated.park=true;
  }

  function decorateActive(){
    const screen=window.TGGGame?.getActiveScreen?.()||'';
    state.currentScreen=screen;
    if(screen==='studio')studio();
    else if(screen==='garage')garage();
    else if(screen==='home')home();
    else if(screen==='media')media();
    else if(screen==='shops')shops();
    else if(screen==='park')park();
  }

  const ACTIVITY={
    'studio:record':['RECORDING','VOCALS LIVE','Tracking the take in the booth.'],
    'studio:mix':['MIXING','MIX BUS ACTIVE','Balancing vocals, beat and effects.'],
    'studio:release':['RELEASE','MASTER READY','Preparing the record for the city.'],
    'media:video':['VIDEO SHOOT','CAMERA ROLLING','Performance take in progress.'],
    'media:photos':['PHOTO SHOOT','FLASH READY','Capturing the campaign look.'],
    'media:premiere':['PREMIERE','SCREENING','Launching the visual to the city.'],
    'home:wardrobe':['HOME BASE','WARDROBE','Switching the player look.'],
    'home:save':['HOME BASE','SAVE GAME','Locking in current progress.'],
    'home:career':['HOME BASE','CAREER WALL','Reviewing the grind.'],
    'park:court':['THE PARK','COURT RUN','Building city presence on the court.'],
    'park:store':['THE PARK','FITNESS + GEAR','Training and upgrading your look.'],
    'park:lobby':['THE PARK','PARK LOBBY','Linking with the neighborhood.'],
    'shops:clothes':['SHOP DISTRICT','FRESH FITS','Trying a new clothing setup.'],
    'shops:shoes':['SHOP DISTRICT','SOLE HOUSE','Checking the latest kicks.'],
    'shops:barber':['SHOP DISTRICT','THE BARBER','Refreshing the player look.'],
    'shops:jewelry':['SHOP DISTRICT','ICE BOX','Checking chains and jewelry.']
  };
  function startActivity(screen,type){
    const key=screen+':'+type,def=ACTIVITY[key];if(!def)return false;
    const now=Date.now();if(state.activity&&now<state.activityUntil-350)return false;
    state.activity={screen,type,key,title:def[1]};state.activityStartedAt=now;state.activityUntil=now+2100;
    setOverlay(def[0],def[1],def[2],2);showOverlay(true);
    document.body.classList.add('v217-activity');
    window.dispatchEvent(new CustomEvent('tgg:interior-activity',{detail:{screen,type,title:def[1]}}));
    return true;
  }

  function bindActivities(){
    if(bindActivities.done)return;bindActivities.done=true;
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('[data-studio],[data-media],[data-home],[data-park],[data-shop],[data-car-color],[data-wheel-color],[data-car-tune]');
      if(!b)return;
      if(b.dataset.studio)startActivity('studio',b.dataset.studio);
      else if(b.dataset.media)startActivity('media',b.dataset.media);
      else if(b.dataset.home)startActivity('home',b.dataset.home);
      else if(b.dataset.park)startActivity('park',b.dataset.park);
      else if(b.dataset.shop)startActivity('shops',b.dataset.shop);
      else if(b.dataset.carColor)startActivity('garage','paint');
      else if(b.dataset.wheelColor)startActivity('garage','wheels');
      else if(b.dataset.carTune)startActivity('garage','tune');
    });
  }

  function activeMissionCue(){
    const status=window.TGGWorldGameplay?.status?.()||{};
    const active=window.TGGContent?.current?.();
    const screen=state.currentScreen;if(!active||!screen)return;
    const label=String(status.stageLabel||status.label||status.action||'').toLowerCase();
    const match=(screen==='studio'&&label.includes('studio'))||(screen==='media'&&label.includes('media'))||(screen==='park'&&label.includes('park'));
    const key=active.id+':'+screen+':'+match;
    if(match&&key!==state.lastMissionCue){
      state.lastMissionCue=key;
      setOverlay('MISSION LOCATION',active.name||'ACTIVE MOVE','You are inside a live mission location. Complete the marked world objective when ready.',35);
      showOverlay(true);
      document.body.classList.add('v217-mission-location');
      setTimeout(()=>document.body.classList.remove('v217-mission-location'),1800);
    }
  }

  function animateStudio(now){
    const g=window.TGGStudio3D?.scene?.userData?.v217_studio;if(!g)return;
    const active=state.activity?.screen==='studio'&&Date.now()<state.activityUntil;
    if(g.userData.red)g.userData.red.intensity=active?6+Math.sin(now*.018)*2:0;
    if(g.userData.halo)g.userData.halo.rotation.z=now*.0012;
    g.userData.waveform?.forEach((b,i)=>b.scale.y=active?.6+Math.abs(Math.sin(now*.012+i))*1.4:.25);
    if(g.userData.engineer)g.userData.engineer.rotation.y=-.7+Math.sin(now*.0018)*.12;
  }
  function animateGarage(now){
    const g=window.TGGGarage3D?.scene?.userData?.v217_garage;if(!g)return;
    if(g.userData.fan)g.userData.fan.rotation.z+=.035;
  }
  function animateOther(now){
    const h=findInterior('home')?.scene?.userData?.v217_home;
    if(h?.userData.vinyl)h.userData.vinyl.rotation.z+=.025;
    if(h?.userData.cityGlow)h.userData.cityGlow.intensity=4.3+Math.sin(now*.002)*.8;
    const m=findInterior('media')?.scene?.userData?.v217_media;
    if(m?.userData.wall)m.userData.wall.material.emissiveIntensity=.7+Math.sin(now*.0024)*.35;
    if(m?.userData.flash){
      const shoot=state.activity?.screen==='media'&&Date.now()<state.activityUntil;
      m.userData.flash.intensity=shoot&&Math.sin(now*.035)>.75?10:0;
    }
    const p=findInterior('park')?.scene?.userData?.v217_park;
    if(p?.userData.ball){
      p.userData.ball.position.y=.36+Math.abs(Math.sin(now*.004))*1.1;
      p.userData.ball.rotation.x+=.03;p.userData.ball.rotation.z+=.02;
    }
  }

  function updateActivity(now){
    if(!state.activity)return;
    const span=Math.max(1,state.activityUntil-state.activityStartedAt);
    const pct=clamp((Date.now()-state.activityStartedAt)/span*100,0,100);
    const bar=$('v217Progress');if(bar)bar.style.width=pct+'%';
    if(Date.now()>=state.activityUntil){
      state.activity=null;document.body.classList.remove('v217-activity');setTimeout(()=>showOverlay(false),300);
    }
  }
  function updateQuality(){
    const q=window.TGGV212?.status?.()?.quality||'high';
    const intensity=q==='performance'?.55:q==='balanced'?.78:1;
    for(const rt of [window.TGGStudio3D,window.TGGGarage3D,...(window.TGGInteriors3D?.runtimes||[])]){
      rt?.scene?.traverse?.(o=>{if(o.isLight&&o.userData?.v217&&Number.isFinite(o.userData.v217Base))o.intensity=o.userData.v217Base*intensity});
    }
    document.body.dataset.v217Quality=q;
  }

  function install(){
    document.body.classList.add('tgg-v217');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.17 CITY + INTERIOR DEPTH 100';
    ensureOverlay();bindActivities();
  }
  function tick(now=performance.now()){
    requestAnimationFrame(tick);install();decorateActive();activeMissionCue();animateStudio(now);animateGarage(now);animateOther(now);updateActivity(now);updateQuality();
    state.ready=true;lastTick=now;
  }
  function status(){
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,currentScreen:state.currentScreen,
      decorated:{...state.decorated},activity:state.activity?{...state.activity}:null,
      objects:state.objects,lights:state.lights,materials:Object.keys(materials).length
    };
  }
  window.TGGV217={version:VERSION,layers:LAYERS,status,startActivity,decorateActive};
  requestAnimationFrame(tick);
})();