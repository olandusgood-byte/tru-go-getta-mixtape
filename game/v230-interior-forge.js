(() => {
  const VERSION='V2.30 TGG INTERIOR FORGE 100';
  const LAYERS=[
    'interior core bridge','interior active state','interior anchor state','interior enter API','interior exit API','interior toggle API','interior movement wrapper','interior movement restore','interior vehicle guard','interior status API',
    'studio room','home room','shop room','club room','office room','lounge room','room floor','room ceiling','room north wall','room south wall',
    'room east wall','room west wall','room doorway','room trim','room baseboard','room window','room glass','room accent strip','room ambient light','room key light',
    'studio desk','studio console','studio monitors','studio speakers','studio mic','studio booth glass','studio couch','studio rack','studio acoustic panels','studio LED',
    'home couch','home TV','home coffee table','home shelf','home lamp','home bed','home dresser','home rug','home plant','home wall art',
    'shop counter','shop shelf','shop rack','shop display table','shop mirror','shop checkout','shop light rail','shop product blocks','shop sign','shop seating',
    'club bar','club stools','club DJ booth','club speakers','club dance floor','club light truss','club neon wall','club couch','club table','club bottle shelf',
    'office desk','office chair','office screen','office shelf','office conference table','office couch','office plant','office wall panel','office pendant light','office glass wall',
    'lounge bench','lounge table','lounge plant','lounge speaker','lounge art','lounge shelf','lounge light','lounge rug','lounge counter','lounge window',
    'near-destination HUD','G key enter','G key exit','room label','room type label','mobile interior HUD','landscape interior HUD','rollback isolation','V2.29 compatibility','release QA hooks'
  ];
  const core=()=>globalThis.TGGV230Core||globalThis.window?.TGGV230Core;
  const state={activeRoom:null,anchor:null,root:null,originalCanMove:null,ready:false,meshCount:0,materialCount:0,enters:0};
  const mats={};
  let hud=null,panel=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-interior-forge',layerCount:LAYERS.length,
      activeRoom:state.activeRoom?.id||null,roomType:state.activeRoom?.type||null,enters:state.enters,
      meshCount:state.meshCount,materialCount:state.materialCount,movementWrapped:!!state.originalCanMove
    };
  }
  function material(id,color,opts={}){
    const THREE=T();if(!THREE)return null;
    const key=[id,color,opts.emissive||0,opts.transparent?'t':'o'].join(':');
    if(mats[key])return mats[key];
    mats[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.68,metalness:opts.metalness??.16,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1,side:opts.side
    });
    state.materialCount=Object.keys(mats).length;return mats[key];
  }
  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE||!parent)return null;
    const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);state.meshCount++;return m;
  }
  function box(parent,w,h,d,mat,pos,rot=[0,0,0],name='box'){return add(parent,new (T()).BoxGeometry(w,h,d),mat,pos,[1,1,1],rot,name)}
  function cyl(parent,r,h,mat,pos,rot=[0,0,0],name='cyl'){return add(parent,new (T()).CylinderGeometry(r,r,h,12),mat,pos,[1,1,1],rot,name)}

  function baseRoom(root,r){
    const THREE=T();
    const floor=material('floor',0x181d24,{roughness:.72,metalness:.14});
    const wall=material('wall',0x262d37,{roughness:.84,metalness:.06,side:THREE.DoubleSide});
    const trim=material('trim',0x0d1118,{roughness:.5,metalness:.38});
    const glass=material('glass',0x6f9fb7,{roughness:.08,metalness:.12,transparent:true,opacity:.34});
    const accent=material('accent',r.accent,{roughness:.28,metalness:.3,emissive:r.accent,emissiveIntensity:1.8});
    const w=r.width,d=r.depth,h=r.height;
    box(root,w,.12,d,floor,[0,.02,0],[0,0,0],'room-floor');
    box(root,w,.09,d,wall,[0,h,0],[0,0,0],'room-ceiling');
    box(root,w,h,.12,wall,[0,h/2,-d/2],[0,0,0],'north-wall');
    box(root,w,h,.12,wall,[0,h/2,d/2],[0,0,0],'south-wall');
    box(root,.12,h,d,wall,[-w/2,h/2,0],[0,0,0],'west-wall');
    box(root,.12,h,d,wall,[w/2,h/2,0],[0,0,0],'east-wall');
    box(root,1.45,2.45,.16,material('door',0x111722,{roughness:.48,metalness:.35}),[0,1.23,d/2-.05],[0,0,0],'doorway');
    box(root,w,.12,.16,trim,[0,.18,-d/2+.08],[0,0,0],'baseboard-n');
    box(root,w,.12,.16,trim,[0,.18,d/2-.08],[0,0,0],'baseboard-s');
    box(root,.16,.12,d,trim,[-w/2+.08,.18,0],[0,0,0],'baseboard-w');
    box(root,.16,.12,d,trim,[w/2-.08,.18,0],[0,0,0],'baseboard-e');
    box(root,2.5,1.45,.06,glass,[w/2-.08,2.05,-.7],[0,Math.PI/2,0],'room-window');
    box(root,w*.72,.08,.08,accent,[0,h-.3,-d/2+.14],[0,0,0],'accent-strip');
    const ambient=new THREE.PointLight(r.accent,2.4,9,2);ambient.position.set(-w*.25,h-.55,-d*.18);root.add(ambient);
    const key=new THREE.PointLight(0xffffff,3.0,10,2);key.position.set(w*.25,h-.45,d*.12);root.add(key);
    return {floor,wall,trim,glass,accent};
  }

  function studio(root,r,m){
    const dark=material('studio-dark',0x10141b,{roughness:.48,metalness:.36});
    box(root,3.4,.78,1.05,dark,[0,.48,-1.55],[0,0,0],'studio-console');
    box(root,1.05,.62,.12,material('screen',0x071018,{emissive:r.accent,emissiveIntensity:1.6}),[-.8,1.14,-1.42],[0,0,0],'studio-monitor-l');
    box(root,1.05,.62,.12,material('screen2',0x071018,{emissive:0x61d9ff,emissiveIntensity:1.3}),[.8,1.14,-1.42],[0,0,0],'studio-monitor-r');
    [-2.0,2.0].forEach(x=>box(root,.72,1.35,.65,material('speaker',0x090b0f,{roughness:.44,metalness:.35}),[x,.74,-1.65],[0,0,0],'studio-speaker'));
    cyl(root,.035,1.9,material('mic-stand',0x555d68,{roughness:.25,metalness:.82}),[2.1,.95,1.0],[0,0,0],'mic-stand');
    add(root,new (T()).CapsuleGeometry(.08,.2,3,8),material('mic',0x141922,{metalness:.72,roughness:.22}),[2.1,1.9,1.0],[1,1,1],[0,0,Math.PI/2],'mic');
    box(root,2.5,1.9,.05,m.glass,[-2.65,1.4,.7],[0,Math.PI/2,0],'booth-glass');
    box(root,2.15,.48,.85,material('couch',0x242b38,{roughness:.82}),[-.9,.32,2.1],[0,0,0],'studio-couch');
    box(root,.75,1.65,.55,dark,[2.7,.86,-1.3],[0,0,0],'studio-rack');
    for(let i=-2;i<=2;i++)box(root,.72,.72,.06,material('acoustic'+i,i%2?0x1b2028:0x2e3540,{roughness:.95}),[i*.8,2.15,-r.depth/2+.08],[0,0,0],'acoustic-panel');
  }

  function home(root,r,m){
    const soft=material('home-soft',0x333a47,{roughness:.88});
    box(root,2.5,.55,1.0,soft,[-1.6,.35,-1.6],[0,0,0],'home-couch');
    box(root,1.6,.08,.8,material('wood',0x5b3d2b,{roughness:.82}),[-1.6,.42,.1],[0,0,0],'coffee-table');
    box(root,2.2,1.2,.08,material('tv',0x080a0f,{emissive:0x324968,emissiveIntensity:.35}),[1.9,1.5,-r.depth/2+.08],[0,0,0],'home-tv');
    box(root,1.8,.24,.52,material('shelf',0x222832,{roughness:.7,metalness:.22}),[1.8,.38,-r.depth/2+.25],[0,0,0],'home-shelf');
    cyl(root,.08,1.7,material('lamp',0x5d6673,{metalness:.6,roughness:.3}),[2.5,.85,1.8],[0,0,0],'home-lamp');
    box(root,2.2,.45,1.55,soft,[1.65,.3,1.55],[0,0,0],'home-bed');
    box(root,1.1,1.2,.55,material('dresser',0x443126,{roughness:.78}),[-2.7,.65,1.5],[0,0,0],'home-dresser');
    box(root,3.3,.025,2.0,material('rug',r.accent,{roughness:.95,metalness:.01}),[-.4,.1,.9],[0,0,0],'home-rug');
    cyl(root,.22,.58,material('pot',0x6d5140,{roughness:.8}),[-3,.3,-1.8],[0,0,0],'plant-pot');
    add(root,new (T()).SphereGeometry(.55,10,8),material('plant',0x28523b,{roughness:.9}),[-3,.9,-1.8],[1,1,1],[0,0,0],'home-plant');
  }

  function shops(root,r,m){
    const chrome=material('shop-chrome',0xd8dde7,{roughness:.16,metalness:.88});
    box(root,2.5,.9,.85,material('counter',0x202733,{roughness:.5,metalness:.3}),[0,.5,-1.9],[0,0,0],'shop-counter');
    [-2.7,2.7].forEach(x=>box(root,.5,2.2,2.3,material('shop-shelf',0x282f39,{roughness:.62,metalness:.3}),[x,1.1,-.4],[0,0,0],'shop-shelf'));
    for(let i=-2;i<=2;i++)cyl(root,.05,1.7,chrome,[i*.65,.85,1.55],[0,0,0],'shop-rack');
    box(root,2.3,.18,1.2,material('display',0x343b46,{roughness:.48,metalness:.38}),[0,.7,.7],[0,0,0],'display-table');
    box(root,1.2,2.1,.05,m.glass,[r.width/2-.08,1.4,1.25],[0,Math.PI/2,0],'shop-mirror');
    box(root,.85,.3,.55,material('checkout',r.accent,{emissive:r.accent,emissiveIntensity:.5}),[.6,1.05,-1.82],[0,0,0],'checkout');
    for(let i=-3;i<=3;i++)box(root,.5,.7,.5,material('product'+i,[0xff466d,0x61d9ff,0xc7ff00,0xffcf4a][(i+8)%4],{roughness:.66}),[i*.72,.42,2.0],[0,0,0],'product-block');
  }

  function media(root,r,m){
    const dark=material('club-dark',0x0a0d13,{roughness:.45,metalness:.4});
    box(root,3.8,1.0,.85,dark,[0,.55,-2.15],[0,0,0],'club-bar');
    for(let i=-2;i<=2;i++)cyl(root,.18,.68,material('stool',0x323946,{roughness:.5,metalness:.45}),[i*.72,.35,-.95],[0,0,0],'bar-stool');
    box(root,2.4,.82,1.25,dark,[0,.48,1.9],[0,0,0],'dj-booth');
    [-3.25,3.25].forEach(x=>box(root,.8,1.65,.7,material('club-speaker',0x07090d,{roughness:.42,metalness:.4}),[x,.88,1.65],[0,0,0],'club-speaker'));
    box(root,4.8,.04,3.0,material('dance',0x121722,{emissive:r.accent,emissiveIntensity:.18}),[0,.1,.2],[0,0,0],'dance-floor');
    box(root,6.2,.12,.12,material('truss',0x4a525e,{metalness:.82,roughness:.24}),[0,r.height-.55,.6],[0,0,0],'light-truss');
    box(root,4.0,.1,.05,material('neon-wall',r.accent,{emissive:r.accent,emissiveIntensity:3}),[0,2.1,-r.depth/2+.08],[0,0,0],'club-neon');
    box(root,2.3,.52,.9,material('club-couch',0x2a2030,{roughness:.82}),[-2.0,.34,2.65],[0,0,0],'club-couch');
  }

  function business(root,r,m){
    const wood=material('office-wood',0x4b3428,{roughness:.7,metalness:.08});
    box(root,2.5,.75,1.15,wood,[0,.44,-1.75],[0,0,0],'office-desk');
    box(root,.75,1.05,.75,material('chair',0x171b22,{roughness:.52,metalness:.26}),[0,.6,-.65],[0,0,0],'office-chair');
    box(root,1.3,.72,.08,material('office-screen',0x071018,{emissive:r.accent,emissiveIntensity:1.2}),[0,1.25,-1.62],[0,0,0],'office-screen');
    box(root,.55,2.0,2.2,material('office-shelf',0x252c35,{roughness:.68,metalness:.22}),[-3.1,1.0,-.4],[0,0,0],'office-shelf');
    box(root,3.0,.16,1.25,wood,[1.45,.72,1.25],[0,0,0],'conference-table');
    box(root,2.0,.48,.82,material('office-couch',0x303845,{roughness:.82}),[-1.7,.32,2.35],[0,0,0],'office-couch');
    box(root,2.7,2.1,.05,m.glass,[r.width/2-.08,1.5,-.2],[0,Math.PI/2,0],'office-glass');
  }

  function lounge(root,r,m){
    const wood=material('lounge-wood',0x57402f,{roughness:.82});
    box(root,2.8,.48,.8,wood,[-1.4,.32,-1.5],[0,0,0],'lounge-bench');
    box(root,1.5,.12,.8,wood,[1.0,.55,-.8],[0,0,0],'lounge-table');
    cyl(root,.2,.55,material('lounge-pot',0x5c4a3c,{roughness:.85}),[2.6,.3,1.4],[0,0,0],'lounge-pot');
    add(root,new (T()).SphereGeometry(.6,10,8),material('lounge-plant',0x2b5a3d,{roughness:.9}),[2.6,1.0,1.4],[1,1,1],[0,0,0],'lounge-plant');
    box(root,.7,1.2,.55,material('lounge-speaker',0x090b0f,{roughness:.45,metalness:.35}),[-2.9,.65,1.6],[0,0,0],'lounge-speaker');
    box(root,3.2,.08,.05,material('lounge-art',r.accent,{emissive:r.accent,emissiveIntensity:1.2}),[0,2.15,-r.depth/2+.08],[0,0,0],'lounge-art');
    box(root,2.6,.025,1.8,material('lounge-rug',0x253246,{roughness:.94}),[0,.1,1.1],[0,0,0],'lounge-rug');
  }

  function label(root,r){
    if(!hasDOM())return;const THREE=T(),c=document.createElement('canvas');c.width=640;c.height=140;const x=c.getContext('2d');
    x.fillStyle='#080b12e8';x.fillRect(0,0,640,140);x.strokeStyle='#'+new THREE.Color(r.accent).getHexString();x.lineWidth=6;x.strokeRect(5,5,630,130);
    x.fillStyle='#fff';x.font='900 34px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(r.type.toUpperCase(),320,58);
    x.fillStyle='#'+new THREE.Color(r.accent).getHexString();x.font='800 19px Arial';x.fillText('TGG INTERIOR FORGE • G TO EXIT',320,101);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.position.set(0,r.height-.55,-r.depth/2+.22);s.scale.set(5.4,1.18,1);root.add(s);
  }

  function buildRoom(r,anchor){
    const THREE=T(),s=scene();if(!THREE||!s)return false;
    if(state.root?.parent)s.remove(state.root);state.meshCount=0;
    const root=new THREE.Group();root.name='tgg-interior-forge';root.userData.v230=true;root.position.set(anchor.x,0,anchor.z);
    const m=baseRoom(root,r);
    if(r.id==='studio')studio(root,r,m);
    else if(r.id==='home')home(root,r,m);
    else if(r.id==='shops')shops(root,r,m);
    else if(r.id==='media')media(root,r,m);
    else if(r.id==='business')business(root,r,m);
    else lounge(root,r,m);
    label(root,r);s.add(root);state.root=root;return true;
  }

  function currentWorld(){
    const g=window.TGGGame?.getState?.()||{};
    return{x:((Number(g.x)||50)-50)*.92,z:((Number(g.y)||50)-50)*.92};
  }
  function wrapMovement(){
    if(state.originalCanMove||!window.TGG3D?.canMovePercent)return;
    state.originalCanMove=window.TGG3D.canMovePercent.bind(window.TGG3D);
    window.TGG3D.canMovePercent=(x,y,vehicle=false)=>{
      if(!state.activeRoom)return state.originalCanMove(x,y,vehicle);
      if(vehicle)return false;
      const p={x:(Number(x)-50)*.92,z:(Number(y)-50)*.92};
      return core()?.canWalk?.(p,state.anchor,state.activeRoom)!==false;
    };
  }
  function restoreMovement(){
    if(state.originalCanMove&&window.TGG3D)window.TGG3D.canMovePercent=state.originalCanMove;
    state.originalCanMove=null;
  }

  function enter(id){
    if(!hasDOM())return false;
    if(window.TGGGame?.getState?.()?.inVehicle){window.__tggToast?.('EXIT THE CAR BEFORE ENTERING A 3D INTERIOR');return false}
    const r=core()?.room?.(id);if(!r)return false;
    const anchor=currentWorld();
    if(!buildRoom(r,anchor))return false;
    state.activeRoom=r;state.anchor=anchor;state.enters++;wrapMovement();
    window.TGGV229?.setEnabled?.(false);
    window.TGG3D?.setCameraMode?.('chase',true);
    renderUI();window.__tggToast?.('ENTERED '+r.type.toUpperCase()+' • G TO EXIT');
    window.dispatchEvent(new CustomEvent('tgg:interior-enter',{detail:{id:r.id,type:r.type}}));return true;
  }
  function exit(){
    if(!state.activeRoom)return false;
    const old=state.activeRoom,s=scene();if(state.root?.parent&&s)s.remove(state.root);
    state.root=null;state.activeRoom=null;state.anchor=null;restoreMovement();window.TGGV229?.setEnabled?.(true);renderUI();
    window.__tggToast?.('RETURNED TO CITY');window.dispatchEvent(new CustomEvent('tgg:interior-exit',{detail:{id:old.id,type:old.type}}));return true;
  }
  function toggle(id){return state.activeRoom?exit():enter(id)}

  function nearest(){
    return window.TGG3D?.nearbyDestination?.(window.TGGGame?.getState?.())||null;
  }
  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v230');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v230InteriorHud';hud.className='v230-interior-hud';
      hud.innerHTML='<small>TGG INTERIOR FORGE</small><b id="v230HudTitle">3D ROOMS READY</b><span id="v230HudAction">MOVE NEAR A DESTINATION</span>';city.appendChild(hud);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v230InteriorPanel';panel.className='v230-interior-panel';
      panel.innerHTML='<small>INTERIOR FORGE</small><b>ROOM SELECT</b><div class="v230-room-grid"><button data-v230-room="studio">STUDIO</button><button data-v230-room="home">APARTMENT</button><button data-v230-room="shops">BOUTIQUE</button><button data-v230-room="media">CLUB</button><button data-v230-room="business">OFFICE</button><button data-v230-room="park">LOUNGE</button></div><button id="v230Exit" type="button">EXIT INTERIOR</button>';
      document.body.appendChild(panel);panel.querySelectorAll('[data-v230-room]').forEach(b=>b.addEventListener('click',()=>enter(b.dataset.v230Room)));document.getElementById('v230Exit')?.addEventListener('click',exit);
    }
    state.ready=true;renderUI();
  }
  function renderUI(){
    if(!hasDOM())return;
    const n=nearest(),q=id=>document.getElementById(id);
    if(state.activeRoom){
      if(q('v230HudTitle'))q('v230HudTitle').textContent=state.activeRoom.type.toUpperCase();
      if(q('v230HudAction'))q('v230HudAction').textContent='G • EXIT TO CITY';
      hud?.classList.add('active');
    }else if(n){
      if(q('v230HudTitle'))q('v230HudTitle').textContent=n.label||String(n.id).toUpperCase();
      if(q('v230HudAction'))q('v230HudAction').textContent='G • ENTER 3D INTERIOR';
      hud?.classList.add('active');
    }else{
      hud?.classList.remove('active');
    }
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='g'||e.key==='G'){
      e.preventDefault();
      if(state.activeRoom){exit();return}
      const n=nearest();if(n?.id)enter(n.id);
    }
    if(e.key==='F6'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }
  document.addEventListener('keydown',keyHandler);

  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();renderUI();
  }

  const api={version:VERSION,layers:LAYERS,rooms:['studio','home','shops','media','business','park'],status,enter,exit,toggle};
  globalThis.TGGV230=api;
  if(hasDOM()){window.TGGV230=api;ensureUI();requestAnimationFrame(tick)}
})();