(() => {
  const VERSION='V2.19 CITY INTERACTIONS 100';
  const KEY='tgg-v219-city-interactions';
  const LAYERS=[
    'payphone prop','payphone proximity','payphone interact','phone menu','M call','Kane call','DJ V call','call dialogue','call counter','call persistence',
    'transit kiosk prop','transit proximity','transit menu','studio row fast travel','downtown fast travel','media district fast travel','park fast travel','fast travel mission guard','fast travel vehicle guard','fast travel save',
    'ATM prop','ATM proximity','ATM wallet display','ATM level display','ATM xp display','ATM car condition display','ATM active mission display','ATM diagnostics','ATM close action','ATM safe refresh',
    'vending prop','vending proximity','vending purchase','vending spend guard','vending focus reward','vending cooldown','vending persistence','vending feedback','vending telemetry','vending animation',
    'street radio prop','street radio proximity','radio toggle','radio station cycle','radio station persistence','radio HUD','radio animation','radio glow','radio telemetry','radio mute state',
    'photo spot prop','photo spot proximity','photo pose action','photo emote bridge','photo flash FX','photo cooldown','photo persistence','photo feedback','photo telemetry','photo accessibility',
    'sample crate prop','sample crate proximity','sample dig action','sample reward','sample cooldown','sample persistence','sample feedback','sample telemetry','sample glow','sample interaction guard',
    'park bench prop','park bench proximity','bench rest action','bench city tip','bench cooldown','bench feedback','bench telemetry','bench sit-style pose','bench proximity ring','bench accessibility',
    'street board prop','street board proximity','active mission summary','mission chain summary','next contact summary','board HUD','board close action','board telemetry','board glow','board diagnostics',
    'interaction priority','mission priority','contact priority','nearest interaction','F interact bridge','interact button bridge','proximity HUD','world labels','cooldown validation','release QA hooks'
  ];
  const state={
    ready:false,radioOn:false,station:0,calls:0,cooldowns:{},history:[],lastInteraction:null,
    props:[],nearest:null,menu:null,wrapped:false
  };
  const mats={};
  let originalInteract=null,panel=null,nearHud=null,live=null,flash=null,lastTick=performance.now();
  const $=id=>document.getElementById(id);
  const T=()=>window.THREE;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>Date.now();
  const STATIONS=['TGG RADIO','STREET MIX','LATE NIGHT','BEAT LAB'];
  const CONTACT_LINES={
    m:['Keep moving. Finish the move in front of you.','Your next play is already marked.','Handle the business, then call me back.'],
    kane:['Studio is ready when you are.','Do not rush the take. Lock it in clean.','Bring the record back sounding expensive.'],
    'dj-v':['The city has to hear it. Push the release.','Keep the promo moving block to block.','When the park hears it, the run is complete.']
  };

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.radioOn=!!s.radioOn;state.station=Math.max(0,Math.floor(Number(s.station)||0))%STATIONS.length;
      state.calls=Math.max(0,Math.floor(Number(s.calls)||0));
      state.cooldowns=s.cooldowns&&typeof s.cooldowns==='object'?s.cooldowns:{};
      state.history=Array.isArray(s.history)?s.history.slice(-30):[];
    }catch{}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({radioOn:state.radioOn,station:state.station,calls:state.calls,cooldowns:state.cooldowns,history:state.history.slice(-30)}))}catch{}
  }

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;if(mats[key])return mats[key];
    mats[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.58,metalness:opts.metalness??.28,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });return mats[key];
  }
  function add(group,obj){if(obj){group.add(obj)}return obj}
  function box(group,w,h,d,color,x,y,z,opts={}){
    const THREE=T(),m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat('b'+color+(opts.emissive||0),color,opts));
    m.position.set(x,y,z);m.castShadow=opts.shadow!==false;m.receiveShadow=opts.shadow!==false;return add(group,m);
  }
  function ring(group,color,r=1.2){
    const THREE=T(),m=new THREE.Mesh(new THREE.RingGeometry(r,r+.12,26),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));
    m.rotation.x=-Math.PI/2;m.position.y=.05;group.add(m);group.userData.ring=m;return m;
  }
  function labelSprite(text,color='#ffffff'){
    const THREE=T();if(!THREE)return null;
    const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');
    x.fillStyle='#070a10dd';x.fillRect(0,0,c.width,c.height);x.strokeStyle=color;x.lineWidth=5;x.strokeRect(4,4,c.width-8,c.height-8);
    x.fillStyle='#fff';x.font='900 30px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,56);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(5.2,1.15,1);s.position.y=3.5;return s;
  }
  function register(id,name,x,z,color,build,interact){
    const THREE=T(),scene=window.TGG3D?.scene;if(!THREE||!scene)return null;
    if(state.props.some(p=>p.id===id))return state.props.find(p=>p.id===id);
    const g=new THREE.Group();g.position.set(x,0,z);g.userData.v219=true;g.userData.id=id;
    build?.(g);ring(g,color);const label=labelSprite(name,'#'+new THREE.Color(color).getHexString());if(label)g.add(label);
    scene.add(g);const p={id,name,x,z,color,group:g,interact};state.props.push(p);return p;
  }

  function bootProps(){
    if(state.props.length||!window.TGG3D?.scene||!T())return false;
    const THREE=T();
    register('phone','TGG PAYPHONE',-30,-8,0x61d9ff,g=>{
      box(g,.85,2.3,.55,0x1d2733,0,1.15,0,{metalness:.72,roughness:.32});
      box(g,.58,.72,.12,0x071018,0,1.55,.34,{emissive:0x61d9ff,emissiveIntensity:1.5});
      const handset=box(g,.14,.72,.12,0x090b0f,-.33,1.45,.36,{metalness:.5});handset.rotation.z=-.15;
    },()=>openPhone());

    register('transit','CITY TRANSIT',-9,6,0xc7ff00,g=>{
      box(g,1.25,2.05,.62,0x222a35,0,1.02,0,{metalness:.68,roughness:.34});
      box(g,.9,.8,.08,0x071018,0,1.45,.36,{emissive:0xc7ff00,emissiveIntensity:1.9});
      box(g,.82,.22,.08,0xc7ff00,0,.62,.36,{emissive:0x75a300,emissiveIntensity:1});
    },()=>openTransit());

    register('atm','CITY ATM',13,6,0x4cff88,g=>{
      box(g,1.1,1.9,.72,0x1f2830,0,.95,0,{metalness:.56,roughness:.38});
      box(g,.72,.5,.08,0x071018,0,1.33,.42,{emissive:0x4cff88,emissiveIntensity:1.5});
      box(g,.58,.08,.06,0xb8c4cf,0,.83,.43,{metalness:.8});
    },()=>openATM());

    register('vending','VENDING',28,9,0xff466d,g=>{
      box(g,1.4,2.5,.82,0x242832,0,1.25,0,{metalness:.48,roughness:.42});
      box(g,1.02,1.45,.08,0x151a24,0,1.48,.46,{emissive:0xff466d,emissiveIntensity:.8});
      for(let y=.95;y<=1.8;y+=.42)for(let x=-.34;x<=.34;x+=.34)box(g,.18,.18,.05,0xc7ff00,x,y,.52,{emissive:0x6e9900,emissiveIntensity:.8,shadow:false});
    },()=>useVending());

    register('radio','STREET RADIO',21,17,0xc56cff,g=>{
      box(g,1.55,.68,.48,0x10141c,0,.55,0,{metalness:.45,roughness:.38});
      [-.47,.47].forEach(x=>{const sp=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.07,18),mat('radio-sp',0x313747,{metalness:.5,roughness:.35}));sp.rotation.x=Math.PI/2;sp.position.set(x,.56,.28);g.add(sp)});
      box(g,.44,.17,.05,0x071018,0,.62,.29,{emissive:0xc56cff,emissiveIntensity:1.5});
    },()=>toggleRadio());

    register('photo','PHOTO WALL',-2,30,0x48d7ff,g=>{
      box(g,4.2,2.8,.18,0x111827,0,1.4,0,{emissive:0x183a66,emissiveIntensity:.65});
      const neon=box(g,3.3,.13,.06,0x48d7ff,0,2.3,.14,{emissive:0x48d7ff,emissiveIntensity:3,shadow:false});neon.rotation.z=.05;
    },()=>photoPose());

    register('crate','SAMPLE CRATE',-19,-16,0xffcf4a,g=>{
      box(g,1.3,.68,1.0,0x4d3726,0,.34,0,{roughness:.86});
      for(let i=-1;i<=1;i++)box(g,.08,.6,1.02,0x251a12,i*.42,.35,0,{roughness:.9});
    },()=>digCrate());

    register('bench','PARK BENCH',29,17,0x39dd79,g=>{
      box(g,2.8,.18,.72,0x5a3c29,0,.78,0,{roughness:.82});
      box(g,2.8,.18,.62,0x5a3c29,0,1.35,-.28,{roughness:.82});
      [-1.05,1.05].forEach(x=>box(g,.16,.8,.16,0x252c34,x,.42,0,{metalness:.55,roughness:.45}));
    },()=>restBench());

    register('board','STREET BOARD',-34,7,0xffcf4a,g=>{
      box(g,3.2,2.0,.18,0x37291f,0,1.65,0,{roughness:.82});
      box(g,2.75,1.55,.05,0x11151d,0,1.7,.13,{emissive:0xffcf4a,emissiveIntensity:.5});
      [-1.15,1.15].forEach(x=>box(g,.12,1.5,.12,0x292f38,x,.75,-.05,{metalness:.5}));
    },()=>openBoard());
    return true;
  }

  function playerWorld(){
    const s=window.TGGGame?.getState?.();return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92};
  }
  function nearestInteraction(){
    const p=playerWorld();let best=null,bestD=Infinity;
    for(const item of state.props){
      const d=Math.hypot(item.x-p.x,item.z-p.z);if(d<bestD){bestD=d;best=item}
    }
    state.nearest=best?{...best,distance:bestD}:null;return state.nearest;
  }
  function priorityBlocked(){
    if(window.TGGWorldGameplay?.near?.())return true;
    if(window.TGGStreetContacts?.nearest?.())return true;
    return false;
  }
  function interactNearest(){
    if(window.TGGGame?.getActiveScreen?.()!=='game')return originalInteract?.()??false;
    if(priorityBlocked())return originalInteract?.()??false;
    const n=nearestInteraction();if(n&&n.distance<=4.8){n.interact?.();return true}
    return originalInteract?.()??false;
  }
  function wrapInteract(){
    if(state.wrapped||!window.TGG3D?.interactNearest)return;
    originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=interactNearest;state.wrapped=true;
  }

  function installUI(){
    document.body.classList.add('tgg-v219');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.19 CITY INTERACTIONS 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v219Panel';panel.className='v219-panel';
      panel.innerHTML='<div class="v219-head"><small id="v219Kicker">CITY INTERACTION</small><button id="v219Close" type="button">×</button></div><b id="v219Title">READY</b><span id="v219Body">Walk up to a city object and press F.</span><div id="v219Actions" class="v219-actions"></div>';
      document.body.appendChild(panel);$('v219Close')?.addEventListener('click',closePanel);
    }
    if(!nearHud){
      nearHud=document.createElement('div');nearHud.id='v219NearHud';nearHud.className='v219-near-hud';
      nearHud.innerHTML='<small>NEARBY</small><b id="v219NearName">CITY OBJECT</b><span id="v219NearDistance">—</span>';
      document.querySelector('.city')?.appendChild(nearHud);
    }
    if(!flash){
      flash=document.createElement('div');flash.id='v219PhotoFlash';flash.className='v219-photo-flash';document.body.appendChild(flash);
    }
    if(!live){
      live=document.createElement('div');live.id='v219Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }
  }

  function openPanel(kicker,title,body,actions=[]){
    installUI();state.menu=title;
    $('v219Kicker').textContent=String(kicker).toUpperCase();$('v219Title').textContent=title;$('v219Body').textContent=body;
    const a=$('v219Actions');a.innerHTML='';
    actions.forEach(x=>{const b=document.createElement('button');b.type='button';b.textContent=x.label;b.addEventListener('click',x.run);a.appendChild(b)});
    panel.classList.add('active');if(live)live.textContent=title+'. '+body;
  }
  function closePanel(){panel?.classList.remove('active');state.menu=null}

  function log(type,detail={}){
    state.lastInteraction={type,at:now(),...detail};state.history.push(state.lastInteraction);state.history=state.history.slice(-30);save();
    window.dispatchEvent(new CustomEvent('tgg:city-interaction',{detail:{...state.lastInteraction}}));
  }
  function cooldownReady(id,ms){
    const last=Number(state.cooldowns[id])||0;if(now()-last<ms){window.__tggToast?.('COME BACK LATER');return false}
    state.cooldowns[id]=now();save();return true;
  }

  function openPhone(){
    const mission=activeMissionName();
    const actions=['m','kane','dj-v'].map(id=>({label:id==='m'?'CALL M':id==='kane'?'CALL KANE':'CALL DJ V',run:()=>callContact(id)}));
    actions.push({label:'CLOSE',run:closePanel});
    openPanel('TGG PAYPHONE','CONTACTS',mission?'Active move: '+mission:'No active move. Check in with the city contacts.',actions);
  }
  function callContact(id){
    const lines=CONTACT_LINES[id]||['Stay on the move.'];const line=lines[state.calls%lines.length];
    state.calls++;save();log('phone-call',{contact:id});
    const name=id==='m'?'M':id==='kane'?'KANE':'DJ V';
    openPanel('LIVE CALL',name,line,[{label:'HANG UP',run:closePanel}]);
    window.__tggToast?.(name+' — '+line);
  }

  function openTransit(){
    const actions=[
      ['STUDIO ROW','studio'],['DOWNTOWN','business'],['MEDIA DISTRICT','media'],['TGG PARK','park']
    ].map(([label,id])=>({label,run:()=>fastTravel(id,label)}));
    actions.push({label:'CLOSE',run:closePanel});
    openPanel('CITY TRANSIT','FAST TRAVEL','Available only on foot with no active mission.',actions);
  }
  function fastTravel(id,label){
    const gs=window.TGGGame?.getState?.();if(!gs)return false;
    if(gs.inVehicle){window.__tggToast?.('EXIT THE CAR BEFORE FAST TRAVEL');return false}
    if(window.TGGContent?.current?.()){window.__tggToast?.('FAST TRAVEL LOCKED DURING ACTIVE MISSION');return false}
    const d=(window.TGG3D?.destinations||[]).find(x=>x.id===id);if(!d)return false;
    gs.x=clamp(50+d.x/.92,3,94);gs.y=clamp(50+d.z/.92,8,88);gs.heading=0;
    window.TGGGame?.refresh?.();window.TGGGame?.save?.(true);closePanel();log('fast-travel',{destination:id});
    window.__tggToast?.('CITY TRANSIT — '+label);return true;
  }

  function openATM(){
    const gs=window.TGGGame?.getState?.()||{},condition=window.TGGV212?.status?.()?.condition??100,mission=activeMissionName()||'NONE';
    openPanel('CITY ATM','PLAYER STATUS','$'+Math.round(Number(gs.cash)||0)+' cash • Level '+Math.round(Number(gs.level)||1)+' • '+Math.round(Number(gs.xp)||0)+' XP • Car '+Math.round(Number(condition)||100)+'% • Mission '+mission,[{label:'CLOSE',run:closePanel}]);
    log('atm',{cash:Number(gs.cash)||0,level:Number(gs.level)||1});
  }

  function useVending(){
    if(!cooldownReady('vending',60000))return false;
    if(window.TGGGame?.spend?.(5)!==true){state.cooldowns.vending=0;save();return false}
    window.TGGGame?.reward?.(0,3);log('vending',{cost:5,xp:3});window.__tggToast?.('VENDING — -$5 • +3 XP FOCUS');return true;
  }

  function toggleRadio(){
    state.radioOn=!state.radioOn;if(state.radioOn)state.station=(state.station+1)%STATIONS.length;save();log('radio',{on:state.radioOn,station:STATIONS[state.station]});
    window.__tggToast?.(state.radioOn?'RADIO ON — '+STATIONS[state.station]:'RADIO OFF');return true;
  }

  function photoPose(){
    if(!cooldownReady('photo',20000))return false;
    window.TGGV215?.setEmote?.('flex',2200);flash?.classList.add('active');setTimeout(()=>flash?.classList.remove('active'),260);
    log('photo',{pose:'flex'});window.__tggToast?.('PHOTO SPOT — POSE LOCKED');return true;
  }

  function digCrate(){
    if(!cooldownReady('crate',300000))return false;
    window.TGGGame?.reward?.(15,5);log('sample-crate',{cash:15,xp:5});window.__tggToast?.('SAMPLE FOUND — +$15 • +5 XP');return true;
  }

  const TIPS=['Check contacts for the next move.','NOS recharges when you are not boosting.','Garage tuning changes how the car handles.','Clean mission runs score higher.'];
  function restBench(){
    if(!cooldownReady('bench',15000))return false;
    const idx=state.history.length%TIPS.length;window.TGGV215?.setEmote?.('nod',1600);log('bench',{tip:TIPS[idx]});window.__tggToast?.('PARK BENCH — '+TIPS[idx]);return true;
  }

  function activeMissionName(){return window.TGGContent?.current?.()?.name||null}
  function openBoard(){
    const mission=window.TGGContent?.current?.(),chain=window.TGGChains?.current?.(),contact=window.TGGStreetContacts?.closest?.();
    const body=mission?'ACTIVE: '+mission.name+' • '+(window.TGGContent?.state?.progress||0)+'/'+mission.goal:
      chain?'CHAIN: '+chain.name:'NO ACTIVE JOB • FIND M, KANE OR DJ V';
    const extra=contact&&contact.distance<20?' • NEAR '+contact.name:'';
    openPanel('STREET BOARD','CITY MOVES',body+extra,[{label:'CLOSE',run:closePanel}]);log('street-board',{mission:mission?.id||null,chain:chain?.id||null});
  }

  function updateNearHud(nowMs){
    const n=nearestInteraction(),screen=window.TGGGame?.getActiveScreen?.();
    const show=screen==='game'&&n&&n.distance<=10&&!priorityBlocked();
    nearHud?.classList.toggle('active',!!show);
    if(show){
      $('v219NearName').textContent=n.name;$('v219NearDistance').textContent=n.distance<=4.8?'F / INTERACT':Math.round(n.distance*3.2)+' M';
      if(n.group?.userData.ring){
        n.group.userData.ring.material.opacity=.22+Math.sin(nowMs*.006)*.12;
        n.group.userData.ring.scale.setScalar(n.distance<=4.8?1.12:1);
      }
    }
    for(const p of state.props){
      if(p!==n&&p.group?.userData.ring){p.group.userData.ring.material.opacity=.18;p.group.userData.ring.scale.setScalar(1)}
      if(p.id==='radio'){
        const screenMesh=p.group.children.find(x=>x.material?.emissive?.getHex?.()===0xc56cff);
        if(screenMesh)screenMesh.material.emissiveIntensity=state.radioOn?2.6+Math.sin(nowMs*.01)*.6:1.0;
      }
    }
  }

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);installUI();bootProps();wrapInteract();updateNearHud(ts);state.ready=state.props.length>=9;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.19 CITY INTERACTIONS 100';lastTick=ts;
  }

  function status(){
    const n=nearestInteraction();
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,props:state.props.length,
      radioOn:state.radioOn,station:STATIONS[state.station],calls:state.calls,historyCount:state.history.length,
      nearest:n?{id:n.id,name:n.name,distance:Number(n.distance.toFixed(2))}:null,menu:state.menu
    };
  }

  load();installUI();
  window.TGGV219={version:VERSION,layers:LAYERS,status,nearestInteraction,interactNearest,openPhone,openTransit,fastTravel,toggleRadio};
  requestAnimationFrame(tick);
})();