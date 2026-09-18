(() => {
  const VERSION='V2.29 TGG WORLD FORGE 100';
  const LAYERS=[
    'world core bridge','world enabled state','world preset state','world rebuild state','world visual-only guard','world destination guard','world collision preserve','world mission preserve','world driving preserve','world status API',
    'downtown preset','studio row preset','shops preset','park preset','media preset','business preset','district accent','district density','district neon','district height',
    'sidewalk kit','curb kit','storefront shell','studio shell','club shell','office shell','tower shell','house shell','townhouse shell','warehouse shell',
    'media shell','boutique shell','cafe shell','garage shell','awning kit','billboard kit','roof unit kit','alley kit','window bank','glass door',
    'rollup door','neon strip','marquee sign','roof parapet','roof antenna','roof vent','fire escape','balcony','planter','street tree',
    'bollard','hydrant','dumpster','trash can','bus shelter','news box','parking meter','bike rack','street bench','light pole',
    'studio façade','club façade','store façade','house façade','media façade','business façade','downtown façade','interior showcase room','interior glass wall','interior floor',
    'interior ceiling','interior desk','interior couch','interior speaker','interior light','interior poster','interior shelf','interior counter','interior plant','interior door',
    'quality high detail','quality balanced detail','quality performance trim','shadow trim','emissive trim','distance trim','mobile trim','rebuild API','preset API','enabled API',
    'world HUD','world panel','district buttons','toggle button','rebuild button','mobile panel','landscape panel','reduced motion','rollback isolation','release QA hooks'
  ];
  const core=()=>globalThis.TGGV229Core||globalThis.window?.TGGV229Core;
  const state={enabled:true,preset:'downtown',root:null,meshCount:0,materialCount:0,rebuilds:0,lastBuildMs:0,ready:false};
  const mats={};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const now=()=>hasDOM()&&window.performance?window.performance.now():Date.now();

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-world-forge',layerCount:LAYERS.length,
      enabled:state.enabled,preset:state.preset,meshCount:state.meshCount,materialCount:state.materialCount,
      rebuilds:state.rebuilds,lastBuildMs:state.lastBuildMs
    };
  }

  function material(id,color,opts={}){
    const THREE=T();if(!THREE)return null;
    const key=[id,color,opts.emissive||0,opts.transparent?'t':'o'].join(':');
    if(mats[key])return mats[key];
    mats[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.65,metalness:opts.metalness??.18,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
    state.materialCount=Object.keys(mats).length;return mats[key];
  }
  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE||!parent)return null;
    const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);state.meshCount++;return m;
  }
  function box(parent,w,h,d,mat,pos,rot=[0,0,0],name='box'){return add(parent,new (T()).BoxGeometry(w,h,d),mat,pos,[1,1,1],rot,name)}
  function cyl(parent,r,h,mat,pos,name='cyl'){return add(parent,new (T()).CylinderGeometry(r,r,h,12),mat,pos,[1,1,1],[0,0,0],name)}

  function sign(parent,text,color,pos=[0,4.5,0],scale=[5.8,1.2,1]){
    if(!hasDOM())return null;const THREE=T();
    const c=document.createElement('canvas');c.width=640;c.height=132;const x=c.getContext('2d');
    x.fillStyle='#070a10e8';x.fillRect(0,0,640,132);x.strokeStyle=color;x.lineWidth=6;x.strokeRect(5,5,630,122);
    x.fillStyle='#fff';x.font='900 34px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,320,66);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.position.set(...pos);s.scale.set(...scale);parent.add(s);return s;
  }

  function storefront(parent,cfg,w=5.4,h=4.1,d=2.4){
    const THREE=T(),wall=material('wall-'+cfg.id,0x202734,{roughness:.72,metalness:.18});
    const dark=material('dark',0x0b0e14,{roughness:.6,metalness:.35});
    const glass=material('glass',0x5b8fa8,{roughness:.1,metalness:.15,transparent:true,opacity:.62});
    const neon=material('neon',cfg.accent,{roughness:.3,metalness:.25,emissive:cfg.accent,emissiveIntensity:1.2+cfg.neon*2.2});
    box(parent,w,h,d,wall,[0,h/2,0],[0,0,0],'store-shell');
    box(parent,w*.82,h*.45,.07,glass,[0,h*.5,d/2+.04],[0,0,0],'store-glass');
    box(parent,w*.18,h*.52,.08,dark,[0,h*.46,d/2+.06],[0,0,0],'glass-door');
    box(parent,w*.9,.12,.15,neon,[0,h*.82,d/2+.1],[0,0,0],'neon-strip');
    box(parent,w*.78,.26,.55,dark,[0,h*.72,d/2+.35],[0,0,0],'awning');
    return parent;
  }

  function tower(parent,cfg,w=6,h=13,d=5){
    const wall=material('tower-wall',0x1d2430,{roughness:.68,metalness:.28});
    const glass=material('tower-glass',0x70b5d8,{roughness:.12,metalness:.18,emissive:cfg.accent,emissiveIntensity:.18+cfg.neon*.35});
    box(parent,w,h,d,wall,[0,h/2,0],[0,0,0],'tower-shell');
    for(let y=2;y<h-1;y+=2.2)for(let x=-w*.3;x<=w*.3;x+=w*.3)box(parent,w*.18,.55,.06,glass,[x,y,d/2+.04],[0,0,0],'window');
    box(parent,w+.18,.34,d+.18,wall,[0,h+.17,0],[0,0,0],'parapet');
    cyl(parent,.14,2.1,material('antenna',0x6f7888,{metalness:.82,roughness:.25}),[0,h+1.2,0],'antenna');
  }

  function house(parent,cfg){
    const wall=material('house-wall',0x27303a,{roughness:.82,metalness:.08});
    const roof=material('roof',0x11151b,{roughness:.78,metalness:.14});
    const glass=material('house-glass',0x78b8d0,{emissive:cfg.accent,emissiveIntensity:.22});
    box(parent,5.4,3.0,4.6,wall,[0,1.5,0],[0,0,0],'house-shell');
    box(parent,5.8,.5,5.0,roof,[0,3.25,0],[0,0,0],'house-roof');
    [-1.45,1.45].forEach(x=>box(parent,1.0,.8,.06,glass,[x,1.75,2.33],[0,0,0],'house-window'));
    box(parent,1.0,2.0,.08,material('door',0x121820,{roughness:.55,metalness:.3}),[0,1.0,2.35],[0,0,0],'house-door');
    box(parent,2.6,.16,1.2,roof,[0,.15,2.85],[0,0,0],'porch');
  }

  function studio(parent,cfg){
    storefront(parent,cfg,6.2,4.8,3.3);
    const acc=material('studio-acc',cfg.accent,{emissive:cfg.accent,emissiveIntensity:1.8+cfg.neon*2});
    box(parent,4.8,.16,.08,acc,[0,4.15,1.7],[0,0,0],'studio-sign');
    box(parent,1.1,2.2,.16,material('rollup',0x2a3039,{metalness:.55,roughness:.42}),[-2.1,1.25,1.72],[0,0,0],'rollup-door');
  }

  function club(parent,cfg){
    storefront(parent,cfg,6.5,5.0,3.0);
    const acc=material('club-acc',cfg.accent,{emissive:cfg.accent,emissiveIntensity:2.4+cfg.neon*3});
    [-2.3,2.3].forEach(x=>cyl(parent,.08,3.4,acc,[x,2.3,1.58],'club-neon-pole'));
    box(parent,4.0,.34,.2,acc,[0,4.3,1.65],[0,0,0],'club-marquee');
  }

  function props(parent,cfg,kind='urban'){
    const metal=material('prop-metal',0x3a424e,{roughness:.42,metalness:.68});
    const green=material('leaf',0x254f36,{roughness:.9,metalness:.02});
    const wood=material('wood',0x5a3b28,{roughness:.86});
    if(kind==='park'){
      for(let i=0;i<3;i++){
        const x=-3+i*3;cyl(parent,.16,2.0,wood,[x,1,3.3],'tree-trunk');
        add(parent,new (T()).SphereGeometry(.85,12,8),green,[x,2.45,3.3],[1,1,1],[0,0,0],'tree-crown');
      }
      box(parent,2.4,.18,.62,wood,[0,.65,-3],[0,0,0],'bench-seat');
    }else{
      [-2.4,2.4].forEach(x=>cyl(parent,.09,1.0,metal,[x,.5,3.0],'bollard'));
      box(parent,.85,1.1,.72,material('dumpster',0x234139,{roughness:.7,metalness:.35}),[3.1,.55,-2.1],[0,0,0],'dumpster');
      cyl(parent,.18,.8,material('hydrant',0xb83e46,{roughness:.5,metalness:.4}),[-3,.4,-2.2],'hydrant');
    }
  }

  function interiorShowcase(parent,cfg){
    const floor=material('int-floor',0x161a20,{roughness:.5,metalness:.28});
    const glass=material('int-glass',0x6ba5be,{roughness:.08,metalness:.12,transparent:true,opacity:.38});
    const acc=material('int-acc',cfg.accent,{emissive:cfg.accent,emissiveIntensity:.8+cfg.neon});
    box(parent,4.4,.12,3.0,floor,[0,.08,-2.8],[0,0,0],'interior-floor');
    box(parent,4.4,2.7,.05,glass,[0,1.45,-1.28],[0,0,0],'interior-glass-wall');
    box(parent,1.3,.72,.7,material('desk',0x292f39,{roughness:.55,metalness:.35}),[-.9,.45,-2.8],[0,0,0],'desk');
    box(parent,1.7,.55,.8,material('couch',0x202838,{roughness:.82}),[1.0,.38,-3.2],[0,0,0],'couch');
    [-1.6,1.6].forEach(x=>box(parent,.58,1.1,.5,material('speaker',0x090b0f,{roughness:.45,metalness:.38}),[x,.65,-1.8],[0,0,0],'speaker'));
    box(parent,2.5,.08,.05,acc,[0,2.35,-1.3],[0,0,0],'interior-light');
  }

  const LOCATIONS=[
    {id:'studio-row',x:-34,z:-15,rot:Math.PI/2,type:'studio',label:'STUDIO ROW'},
    {id:'shops',x:-15,z:34,rot:0,type:'storefront',label:'SHOP DISTRICT'},
    {id:'park',x:15,z:-34,rot:Math.PI,type:'house',label:'TGG RESIDENCES'},
    {id:'media',x:8,z:42,rot:Math.PI,type:'club',label:'MEDIA + LIVE'},
    {id:'business',x:-42,z:8,rot:-Math.PI/2,type:'tower',label:'BUSINESS DISTRICT'},
    {id:'downtown',x:34,z:34,rot:Math.PI,type:'tower',label:'DOWNTOWN'}
  ];

  function buildLocation(def){
    const THREE=T(),cfg=core()?.preset?.(def.id)||core()?.preset?.('downtown');
    const g=new THREE.Group();g.position.set(def.x,0,def.z);g.rotation.y=def.rot;g.userData.v229=true;g.userData.district=def.id;
    if(def.type==='studio')studio(g,cfg);
    else if(def.type==='club')club(g,cfg);
    else if(def.type==='house')house(g,cfg);
    else if(def.type==='tower')tower(g,cfg,6,10.5*cfg.heightScale,5);
    else storefront(g,cfg);
    props(g,cfg,def.id==='park'?'park':'urban');
    if(def.id==='studio-row'||def.id==='media'||def.id==='business')interiorShowcase(g,cfg);
    sign(g,def.label,'#'+new THREE.Color(cfg.accent).getHexString(),[0,6.0,0],[5.6,1.1,1]);
    state.root.add(g);
  }

  function buildStreetDetail(){
    const THREE=T(),root=state.root;
    const sidewalk=material('sidewalk',0x2a3038,{roughness:.88,metalness:.08});
    const curb=material('curb',0x68707b,{roughness:.82,metalness:.08});
    [-29,-19,-5,5,19,29].forEach(x=>{
      box(root,3.1,.08,108,sidewalk,[x,.045,0],[0,0,0],'sidewalk-x');
      box(root,.13,.16,108,curb,[x+(x<0?1.55:-1.55),.08,0],[0,0,0],'curb-x');
    });
    [-29,-19,-5,5,19,29].forEach(z=>{
      box(root,108,.08,3.1,sidewalk,[0,.05,z],[0,0,0],'sidewalk-z');
      box(root,108,.16,.13,curb,[0,.08,z+(z<0?1.55:-1.55)],[0,0,0],'curb-z');
    });
  }

  function buildWorld(){
    const THREE=T(),s=scene();if(!THREE||!s)return false;
    if(state.root?.parent)s.remove(state.root);
    state.meshCount=0;state.root=new THREE.Group();state.root.name='tgg-world-forge';state.root.userData.v229=true;
    buildStreetDetail();LOCATIONS.forEach(buildLocation);s.add(state.root);state.root.visible=state.enabled;state.ready=true;return true;
  }

  function rebuild(){
    const started=now();const ok=buildWorld();if(ok){state.rebuilds++;state.lastBuildMs=Math.round((now()-started)*10)/10}
    renderUI();return status();
  }
  function setEnabled(value){
    state.enabled=!!value;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled;
  }
  function applyPreset(id='downtown'){
    if(core()?.presets?.includes(id))state.preset=id;renderUI();return core()?.preset?.(state.preset);
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v229');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v229ForgeBtn')){
      const b=document.createElement('button');b.id='v229ForgeBtn';b.className='v229-forge-btn';b.type='button';b.textContent='WORLD FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v229ForgePanel';panel.className='v229-forge-panel';
      panel.innerHTML='<div class="v229-head"><div><small>TGG NATIVE 3D</small><b>WORLD FORGE</b></div><button id="v229Close" type="button">×</button></div><div class="v229-presets"><button data-v229-preset="downtown">DOWNTOWN</button><button data-v229-preset="studio-row">STUDIO</button><button data-v229-preset="shops">SHOPS</button><button data-v229-preset="park">PARK</button><button data-v229-preset="media">MEDIA</button><button data-v229-preset="business">BUSINESS</button></div><div class="v229-actions"><button id="v229Toggle" type="button">WORLD FORGE: ON</button><button id="v229Rebuild" type="button">REBUILD WORLD</button></div><div id="v229Stats" class="v229-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v229Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v229-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.v229Preset)));
      document.getElementById('v229Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v229Rebuild')?.addEventListener('click',rebuild);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v229ForgeHud';hud.className='v229-forge-hud';
      hud.innerHTML='<small>TGG WORLD FORGE</small><b id="v229HudMode">NATIVE CITY</b><span id="v229HudStats">READY</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v229Toggle'))q('v229Toggle').textContent='WORLD FORGE: '+(state.enabled?'ON':'OFF');
    if(q('v229Stats'))q('v229Stats').textContent=state.meshCount+' meshes • '+state.materialCount+' materials • '+state.lastBuildMs+'ms • VISUAL ONLY';
    if(q('v229HudStats'))q('v229HudStats').textContent=(state.enabled?'ON':'OFF')+' • '+state.meshCount+' MESHES';
    panel?.querySelectorAll('[data-v229-preset]').forEach(b=>b.classList.toggle('active',b.dataset.v229Preset===state.preset));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F5'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let booted=false;
  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!booted&&scene()){booted=buildWorld();renderUI()}
    const quality=window.TGGV212?.status?.()?.quality||'high';
    if(state.root){
      state.root.traverse?.(o=>{if(o.isMesh)o.castShadow=quality==='high'});
    }
  }

  const api={version:VERSION,layers:LAYERS,presets:['downtown','studio-row','shops','park','media','business'],status,applyPreset,rebuild,setEnabled};
  globalThis.TGGV229=api;
  if(hasDOM()){window.TGGV229=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();