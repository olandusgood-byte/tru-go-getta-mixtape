(() => {
  const VERSION='V2.28 TGG VEHICLE FORGE 100';
  const LAYERS=[
    'vehicle core bridge','vehicle preset state','vehicle tuning state','vehicle rebuild state','vehicle legacy snapshot','vehicle legacy restore','vehicle car attach','vehicle car detach','vehicle wheel rig bridge','vehicle status API',
    'chassis floor','lower body','upper body','hood','trunk','roof','front bumper','rear bumper','front splitter','rear diffuser',
    'left side skirt','right side skirt','left door','right door','front grille','grille bars','left mirror','right mirror','windshield','rear glass',
    'left window','right window','left headlight','right headlight','left taillight','right taillight','front plate','rear plate','left exhaust','right exhaust',
    'spoiler deck','spoiler left mount','spoiler right mount','wheel front left','wheel front right','wheel rear left','wheel rear right','tire geometry','rim geometry','wheel hub',
    'wheel spokes','wheel lip','brake disc','brake caliper','paint material','glass material','tire material','rim material','chrome material','light material',
    'street preset','sport preset','luxury preset','length tuning','width tuning','height tuning','wheel size tuning','ride height tuning','spoiler tuning','paint tuning',
    'accent tuning','rim color tuning','runtime rebuild','wheel array swap','brake light bridge','headlight bridge','body material bridge','wheel material bridge','spoiler bridge','boost compatibility',
    'skid compatibility','underglow compatibility','garage compatibility','driving compatibility','collision compatibility','camera compatibility','save compatibility','V2.27 compatibility','legacy fallback','quality shadow trim',
    'performance mesh trim','forge button UI','forge panel UI','preset button UI','tuning slider UI','color input UI','mobile layout','landscape layout','rollback isolation','release QA hooks'
  ];
  const core=()=>globalThis.TGGV228Core||globalThis.window?.TGGV228Core;
  const state={
    preset:'street',config:null,root:null,car:null,built:false,meshCount:0,materialCount:0,lastBuildMs:0,rebuilds:0,
    legacy:null,legacyVisuals:[],mode:'native-vehicle-forge'
  };
  const materials={};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const car=()=>hasDOM()?window.TGG3D?.car||null:null;
  const now=()=>hasDOM()&&window.performance?window.performance.now():Date.now();

  function status(){
    return {
      version:VERSION,ready:!!state.built||!hasDOM(),mode:'native-vehicle-forge',preset:state.preset,
      layerCount:LAYERS.length,meshCount:state.meshCount,materialCount:state.materialCount,rebuilds:state.rebuilds,
      lastBuildMs:state.lastBuildMs,legacyAvailable:!!state.legacy
    };
  }

  function material(id,color,roughness=.5,metalness=.2,extra={}){
    const THREE=T();if(!THREE)return null;
    const key=[id,color,roughness,metalness,extra.transparent?'t':'o'].join(':');
    if(materials[key])return materials[key];
    const m=new THREE.MeshStandardMaterial({
      color,roughness,metalness,
      emissive:extra.emissive??0x000000,emissiveIntensity:extra.emissiveIntensity??0,
      transparent:!!extra.transparent,opacity:extra.opacity??1
    });
    materials[key]=m;state.materialCount=Object.keys(materials).length;return m;
  }

  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE||!parent)return null;
    const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);state.meshCount++;return m;
  }

  function buildWheel(root,x,z,front,cfg,mats){
    const THREE=T(),g=new THREE.Group();g.position.set(x,.46*cfg.rideHeight,z);g.userData.front=!!front;g.name='forge-wheel';
    const radius=.42*cfg.wheelSize;
    const tire=add(g,new THREE.CylinderGeometry(radius,radius,.36*cfg.width,20),mats.tire,[0,0,0],[1,1,1],[Math.PI/2,0,0],'tire');
    const rim=add(g,new THREE.CylinderGeometry(radius*.66,radius*.66,.38*cfg.width,20),mats.rim,[0,0,0],[1,1,1],[Math.PI/2,0,0],'rim');
    add(g,new THREE.CylinderGeometry(radius*.18,radius*.18,.4*cfg.width,16),mats.chrome,[0,0,0],[1,1,1],[Math.PI/2,0,0],'hub');
    add(g,new THREE.TorusGeometry(radius*.72,.035,8,22),mats.chrome,[0,0,.19*cfg.width],[1,1,1],[Math.PI/2,0,0],'wheel-lip');
    for(let i=0;i<6;i++){
      const spoke=add(g,new THREE.BoxGeometry(radius*.78,.055,.045),mats.rim,[0,0,.205*cfg.width],[1,1,1],[0,0,i*Math.PI/3],'spoke');
    }
    add(g,new THREE.CylinderGeometry(radius*.45,radius*.45,.025,20),mats.disc,[0,0,.215*cfg.width],[1,1,1],[Math.PI/2,0,0],'brake-disc');
    add(g,new THREE.BoxGeometry(.08,.24,.09),mats.caliper,[radius*.33,0,.235*cfg.width],[1,1,1],[0,0,0],'brake-caliper');
    root.add(g);return g;
  }

  function buildCar(configInput=state.config||core()?.preset?.('street')){
    const THREE=T();if(!THREE)return null;
    const cfg=core()?.normalize?.(configInput)||configInput;
    const L=cfg.length,W=cfg.width,H=cfg.height,R=cfg.rideHeight;
    const root=new THREE.Group();root.name='tgg-forge-car';root.userData.v228Forge=true;

    const paint=material('paint',cfg.paint,.24,.78);
    const dark=material('dark',0x080a0d,.4,.42);
    const glass=material('glass',0x557c93,.1,.22,{transparent:true,opacity:.7});
    const tire=material('tire',0x07080a,.88,.03);
    const rim=material('rim',cfg.rims,.18,.86);
    const chrome=material('chrome',0xd8dde7,.12,.94);
    const accent=material('accent',cfg.accent,.28,.52,{emissive:cfg.accent,emissiveIntensity:.18});
    const head=material('headlight',0xf5ffff,.14,.3,{emissive:0xdff8ff,emissiveIntensity:4});
    const tail=material('taillight',0xff2020,.22,.25,{emissive:0xff1010,emissiveIntensity:1});
    const plate=material('plate',0xe8edf4,.45,.08);
    const disc=material('disc',0x6b7280,.25,.8);
    const caliper=material('caliper',cfg.accent,.32,.55);
    const mats={paint,dark,glass,tire,rim,chrome,accent,head,tail,plate,disc,caliper};

    add(root,new THREE.BoxGeometry(4.1*L,.18,1.94*W),dark,[0,.48*R,0],[1,1,1],[0,0,0],'chassis-floor');
    add(root,new THREE.BoxGeometry(4.15*L,.72*H,2.0*W),paint,[0,.91*R,0],[1,1,1],[0,0,0],'lower-body');
    add(root,new THREE.BoxGeometry(2.45*L,.54*H,1.82*W),paint,[-.15,1.36*R,0],[1,1,1],[0,0,0],'upper-body');
    add(root,new THREE.BoxGeometry(1.28*L,.12,1.82*W),paint,[1.33*L,1.47*R,0],[1,1,1],[0,0,-.045],'hood');
    add(root,new THREE.BoxGeometry(.83*L,.11,1.78*W),paint,[-1.67*L,1.33*R,0],[1,1,1],[0,0,.03],'trunk');
    add(root,new THREE.BoxGeometry(1.55*L,.13,1.63*W),paint,[-.25,2.08*R,0],[1,1,1],[0,0,0],'roof');
    add(root,new THREE.BoxGeometry(.18,.38*H,2.08*W),dark,[2.12*L,.68*R,0],[1,1,1],[0,0,0],'front-bumper');
    add(root,new THREE.BoxGeometry(.18,.36*H,2.05*W),dark,[-2.12*L,.66*R,0],[1,1,1],[0,0,0],'rear-bumper');
    add(root,new THREE.BoxGeometry(.28,.08,2.18*W),dark,[2.15*L,.45*R,0],[1,1,1],[0,0,0],'front-splitter');
    add(root,new THREE.BoxGeometry(.26,.08,2.12*W),dark,[-2.14*L,.45*R,0],[1,1,1],[0,0,0],'rear-diffuser');
    [-1.05*W,1.05*W].forEach((z,i)=>add(root,new THREE.BoxGeometry(2.85*L,.13,.1),dark,[-.05,.47*R,z],[1,1,1],[0,0,0],i?'right-skirt':'left-skirt'));
    [-1.01*W,1.01*W].forEach((z,i)=>add(root,new THREE.BoxGeometry(1.55*L,.66*H,.055),paint,[-.28,1.16*R,z],[1,1,1],[0,0,0],i?'right-door':'left-door'));

    add(root,new THREE.BoxGeometry(.075,.42*H,1.34*W),dark,[2.18*L,.78*R,0],[1,1,1],[0,0,0],'grille');
    for(let i=-2;i<=2;i++)add(root,new THREE.BoxGeometry(.08,.34,.04),chrome,[2.225*L,.78*R,i*.23*W],[1,1,1],[0,0,0],'grille-bar');
    [-1.08*W,1.08*W].forEach((z,i)=>add(root,new THREE.BoxGeometry(.38,.2,.22),paint,[.28,1.74*R,z],[1,1,1],[0,0,0],i?'mirror-right':'mirror-left'));

    add(root,new THREE.BoxGeometry(.08,.9*H,1.64*W),glass,[.55*L,1.78*R,0],[1,1,1],[0,0,-.5],'windshield');
    add(root,new THREE.BoxGeometry(.08,.78*H,1.56*W),glass,[-1.0*L,1.72*R,0],[1,1,1],[0,0,.48],'rear-glass');
    [-.92*W,.92*W].forEach((z,i)=>add(root,new THREE.BoxGeometry(1.5*L,.54*H,.05),glass,[-.25,1.72*R,z],[1,1,1],[0,0,0],i?'right-window':'left-window'));

    const headlights=[],brakeLights=[];
    [-.68*W,.68*W].forEach((z,i)=>{
      headlights.push(add(root,new THREE.BoxGeometry(.07,.27,.38),head,[2.16*L,1.04*R,z],[1,1,1],[0,0,0],i?'headlight-right':'headlight-left'));
      brakeLights.push(add(root,new THREE.BoxGeometry(.07,.25,.36),tail,[-2.16*L,.98*R,z],[1,1,1],[0,0,0],i?'taillight-right':'taillight-left'));
    });
    add(root,new THREE.BoxGeometry(.055,.3,.64),plate,[2.195*L,.62*R,0],[1,1,1],[0,0,0],'front-plate');
    add(root,new THREE.BoxGeometry(.055,.34,.72),plate,[-2.195*L,.72*R,0],[1,1,1],[0,0,0],'rear-plate');
    [-.54*W,.54*W].forEach((z,i)=>add(root,new THREE.CylinderGeometry(.09,.09,.4,12),chrome,[-2.3*L,.5*R,z],[1,1,1],[0,0,Math.PI/2],i?'exhaust-right':'exhaust-left'));

    let spoiler=null;
    if(cfg.spoiler){
      spoiler=add(root,new THREE.BoxGeometry(.18,.14,2.16*W),paint,[-1.86*L,1.68*R,0],[1,1,1],[0,0,0],'spoiler-deck');
      [-.72*W,.72*W].forEach((z,i)=>add(root,new THREE.BoxGeometry(.15,.52,.11),dark,[-1.82*L,1.42*R,z],[1,1,1],[0,0,0],i?'spoiler-mount-right':'spoiler-mount-left'));
    }

    const wheels=[];
    const axleX=1.35*L;
    [[-axleX,-1.03*W,false],[-axleX,1.03*W,false],[axleX,-1.03*W,true],[axleX,1.03*W,true]]
      .forEach(([x,z,front])=>wheels.push(buildWheel(root,x,z,front,cfg,mats)));

    root.userData.wheels=wheels;root.userData.headlights=headlights;root.userData.brakeLights=brakeLights;
    root.userData.bodyMaterial=paint;root.userData.wheelMaterial=tire;root.userData.spoiler=spoiler;root.userData.config=cfg;
    return root;
  }

  function snapshot(c){
    if(state.legacy)return;
    const keep=new Set([
      ...(c.userData.skidMarks||[]),c.userData.underGlow,...(c.userData.boostFlames||[]),c.userData.headGlow,c.userData.boostGlow
    ].filter(Boolean));
    state.legacy={
      wheels:c.userData.wheels,
      headlights:c.userData.headlights,
      brakeLights:c.userData.brakeLights,
      bodyMaterial:c.userData.bodyMaterial,
      wheelMaterial:c.userData.wheelMaterial,
      spoiler:c.userData.spoiler
    };
    state.legacyVisuals=c.children.filter(x=>!keep.has(x)&&!x.userData?.v228Forge);
  }
  function hideLegacy(){state.legacyVisuals.forEach(x=>x.visible=false)}
  function showLegacy(){state.legacyVisuals.forEach(x=>x.visible=true)}

  function attach(root){
    const c=car();if(!c||!root)return false;snapshot(c);
    if(state.root?.parent===c)c.remove(state.root);
    state.root=root;c.add(root);hideLegacy();
    c.userData.wheels=root.userData.wheels;c.userData.headlights=root.userData.headlights;c.userData.brakeLights=root.userData.brakeLights;
    c.userData.bodyMaterial=root.userData.bodyMaterial;c.userData.wheelMaterial=root.userData.wheelMaterial;c.userData.spoiler=root.userData.spoiler;
    state.built=true;return true;
  }

  function rebuild(){
    const c=car();if(!c||!T())return status();
    const started=now();state.meshCount=0;
    const root=buildCar(state.config||core()?.preset?.(state.preset));attach(root);
    state.rebuilds++;state.lastBuildMs=Math.round((now()-started)*10)/10;renderUI();dispatch('tgg:vehicle-forge-rebuilt',{preset:state.preset,meshes:state.meshCount});
    return status();
  }

  function restoreLegacy(){
    const c=car();if(c&&state.root?.parent===c)c.remove(state.root);
    if(c&&state.legacy){
      c.userData.wheels=state.legacy.wheels;c.userData.headlights=state.legacy.headlights;c.userData.brakeLights=state.legacy.brakeLights;
      c.userData.bodyMaterial=state.legacy.bodyMaterial;c.userData.wheelMaterial=state.legacy.wheelMaterial;c.userData.spoiler=state.legacy.spoiler;
    }
    state.root=null;state.built=false;showLegacy();renderUI();dispatch('tgg:vehicle-forge-legacy-restored');return status();
  }

  function applyPreset(id='street'){
    state.preset=core()?.presets?.includes(id)?id:'street';state.config=core()?.preset?.(state.preset)||state.config;
    if(hasDOM())rebuild();return {...state.config};
  }
  function applyTuning(tuning={}){
    const base=state.config||core()?.preset?.(state.preset)||{};
    state.config=core()?.applyTuning?.(base,tuning)||{...base,...tuning};
    if(hasDOM())rebuild();return {...state.config};
  }
  function dispatch(type,detail={}){if(hasDOM())window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,...detail}}))}

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v228');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v228ForgeBtn')){
      const b=document.createElement('button');b.id='v228ForgeBtn';b.className='v228-forge-btn';b.type='button';b.textContent='CAR FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v228ForgePanel';panel.className='v228-forge-panel';
      panel.innerHTML='<div class="v228-head"><div><small>TGG NATIVE 3D</small><b>VEHICLE FORGE</b></div><button id="v228Close" type="button">×</button></div><div class="v228-presets"><button data-v228-preset="street">STREET</button><button data-v228-preset="sport">SPORT</button><button data-v228-preset="luxury">LUXURY</button></div><label>LENGTH <input id="v228Length" type="range" min=".88" max="1.2" step=".01"></label><label>WIDTH <input id="v228Width" type="range" min=".86" max="1.18" step=".01"></label><label>HEIGHT <input id="v228Height" type="range" min=".82" max="1.18" step=".01"></label><label>WHEELS <input id="v228Wheels" type="range" min=".82" max="1.3" step=".01"></label><label>STANCE <input id="v228Ride" type="range" min=".72" max="1.2" step=".01"></label><label>PAINT <input id="v228Paint" type="color"></label><label>RIMS <input id="v228Rims" type="color"></label><div class="v228-actions"><button id="v228Spoiler" type="button">TOGGLE SPOILER</button><button id="v228Rebuild" type="button">REBUILD CAR</button><button id="v228Legacy" type="button">LEGACY CAR</button></div><div id="v228Stats" class="v228-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v228Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v228-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.v228Preset)));
      const binds={v228Length:'length',v228Width:'width',v228Height:'height',v228Wheels:'wheelSize',v228Ride:'rideHeight'};
      Object.entries(binds).forEach(([id,key])=>document.getElementById(id)?.addEventListener('change',e=>applyTuning({[key]:Number(e.target.value)})));
      document.getElementById('v228Paint')?.addEventListener('change',e=>applyTuning({paint:parseInt(e.target.value.slice(1),16)}));
      document.getElementById('v228Rims')?.addEventListener('change',e=>applyTuning({rims:parseInt(e.target.value.slice(1),16)}));
      document.getElementById('v228Spoiler')?.addEventListener('click',()=>applyTuning({spoiler:!(state.config?.spoiler)}));
      document.getElementById('v228Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v228Legacy')?.addEventListener('click',restoreLegacy);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v228ForgeHud';hud.className='v228-forge-hud';
      hud.innerHTML='<small>TGG VEHICLE FORGE</small><b id="v228HudMode">NATIVE CAR</b><span id="v228HudPreset">STREET</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function hex(n){return '#'+Math.max(0,Math.min(0xffffff,Number(n)||0)).toString(16).padStart(6,'0')}
  function renderUI(){
    if(!hasDOM())return;
    const cfg=state.config||core()?.preset?.(state.preset)||{},q=id=>document.getElementById(id);
    if(q('v228Length'))q('v228Length').value=cfg.length??1;if(q('v228Width'))q('v228Width').value=cfg.width??1;
    if(q('v228Height'))q('v228Height').value=cfg.height??1;if(q('v228Wheels'))q('v228Wheels').value=cfg.wheelSize??1;if(q('v228Ride'))q('v228Ride').value=cfg.rideHeight??1;
    if(q('v228Paint'))q('v228Paint').value=hex(cfg.paint);if(q('v228Rims'))q('v228Rims').value=hex(cfg.rims);
    if(q('v228Stats'))q('v228Stats').textContent=state.meshCount+' meshes • '+state.materialCount+' materials • '+state.lastBuildMs+'ms';
    if(q('v228HudPreset'))q('v228HudPreset').textContent=String(state.preset).toUpperCase()+' • '+state.meshCount+' MESHES';
    panel?.querySelectorAll('[data-v228-preset]').forEach(b=>b.classList.toggle('active',b.dataset.v228Preset===state.preset));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F4'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastCar=null;
  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const c=car();if(c&&c!==lastCar){lastCar=c;snapshot(c);if(!state.config)state.config=core()?.preset?.('street');rebuild()}
  }

  const api={version:VERSION,layers:LAYERS,presets:['street','sport','luxury'],status,applyPreset,applyTuning,restoreLegacy,rebuild,buildCar};
  globalThis.TGGV228=api;
  if(hasDOM()){
    window.TGGV228=api;state.config=core()?.preset?.('street');document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();