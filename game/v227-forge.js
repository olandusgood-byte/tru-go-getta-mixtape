(() => {
  const VERSION='V2.27 TGG 3D FORGE 100';
  const LAYERS=[
    'forge core bridge','forge preset state','forge morph state','forge rebuild state','forge legacy snapshot','forge legacy restore','forge real-model coexistence','forge player attach','forge player detach','forge status API',
    'torso core','chest taper','waist taper','pelvis block','neck cylinder','left upper arm','right upper arm','left forearm','right forearm',
    'left hand','right hand','left upper leg','right upper leg','left calf','right calf','left shoe','right shoe',
    'left sole','right sole','head sphere','jaw block','left ear','right ear','left eye','right eye','left pupil','right pupil',
    'left brow','right brow','nose bridge','nose tip','mouth line','left cheek','right cheek','hair cap','hair edge','hair fade',
    'jacket shell','jacket left panel','jacket right panel','jacket collar left','jacket collar right','left sleeve cuff','right sleeve cuff','shirt panel','pants waist','belt',
    'belt buckle','left pant cuff','right pant cuff','chain torus','chain pendant','left lace bar','right lace bar','accent seam',
    'skin material','cloth material','leather material','chrome material','rubber material','eye material','hair material','accent material','material cache',
    'street preset','stage preset','luxury preset','height morph','shoulder morph','build morph','leg length morph','arm length morph','head scale morph',
    'shoe color morph','accent color morph','runtime rebuild','preset button UI','morph slider UI','forge HUD','forge panel',
    'forge keyboard shortcut','mobile forge layout','landscape forge layout','reduced motion safety','quality shadow trim','performance mesh trim','rollback isolation','V2.26 compatibility','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV227Core||globalThis.window?.TGGV227Core;
  const state={
    preset:'street',
    config:null,
    root:null,
    player:null,
    legacyParts:null,
    legacyChildren:[],
    built:false,
    meshCount:0,
    materialCount:0,
    lastBuildMs:0,
    rebuilds:0,
    mode:'native-forge'
  };
  const materials={};
  let panel=null,hud=null;

  function hasDOM(){return typeof window!=='undefined'&&typeof document!=='undefined'}
  function T(){return hasDOM()?window.THREE:null}
  function player(){return hasDOM()?window.TGG3D?.player||null:null}
  function now(){return hasDOM()&&window.performance?window.performance.now():Date.now()}

  function status(){
    return {
      version:VERSION,
      ready:!!state.built||!hasDOM(),
      mode:'native-forge',
      preset:state.preset,
      layerCount:LAYERS.length,
      meshCount:state.meshCount,
      materialCount:state.materialCount,
      rebuilds:state.rebuilds,
      lastBuildMs:state.lastBuildMs,
      legacyAvailable:!!state.legacyParts,
      realAssetActive:hasDOM()&&window.TGGV226?.status?.()?.usingFallback===false
    };
  }

  function material(id,color,profile='cloth',extra={}){
    const THREE=T();if(!THREE)return null;
    const key=[id,color,profile,extra.transparent?'t':'o'].join(':');
    if(materials[key])return materials[key];
    const p=core()?.materialProfile?.(profile)||{roughness:.7,metalness:.05};
    const m=new THREE.MeshStandardMaterial({
      color,
      roughness:extra.roughness??p.roughness,
      metalness:extra.metalness??p.metalness,
      emissive:extra.emissive??0x000000,
      emissiveIntensity:extra.emissiveIntensity??0,
      transparent:!!extra.transparent,
      opacity:extra.opacity??1
    });
    materials[key]=m;state.materialCount=Object.keys(materials).length;return m;
  }

  function add(parent,geo,mat,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],name='mesh'){
    const THREE=T();if(!THREE||!parent)return null;
    const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);state.meshCount++;return m;
  }

  function buildRig(configInput=state.config||core()?.preset?.('street')){
    const THREE=T();if(!THREE)return null;
    const cfg=core()?.normalizePreset?.(configInput)||configInput;
    const root=new THREE.Group();root.name='tgg-forge-player';root.userData.v227Forge=true;

    const skin=material('skin',cfg.skin,'skin');
    const top=material('top',cfg.outfit.top,'cloth');
    const pants=material('pants',cfg.outfit.pants,'cloth');
    const shoes=material('shoes',cfg.outfit.shoes,'leather');
    const rubber=material('rubber',0x08090d,'rubber');
    const chrome=material('chrome',cfg.outfit.accent,'chrome');
    const hair=material('hair',cfg.outfit.hair,'cloth',{roughness:.82});
    const eye=material('eye',0xf4f7fb,'glass',{roughness:.25});
    const dark=material('dark',0x050609,'rubber');
    const accent=material('accent',cfg.outfit.accent,'cloth',{emissive:cfg.outfit.accent,emissiveIntensity:.16});

    const H=cfg.height,B=cfg.build,S=cfg.shoulders,LL=cfg.legLength,AL=cfg.armLength,HS=cfg.headScale;

    const body=new THREE.Group();body.name='forge-body';body.position.y=2.05*H;root.add(body);
    add(body,new THREE.CapsuleGeometry(.59*B,.9*H,6,12),top,[0,.03,0],[1.02*S,1,1],'','torso');
    const chest=add(body,new THREE.SphereGeometry(.61*B,16,12),top,[0,.38,0],[1.08*S,.62,.76],[0,0,0],'chest');
    add(body,new THREE.CylinderGeometry(.38*B,.48*B,.42,14),top,[0,-.72,0],[1,1,1],[0,0,0],'waist');
    add(body,new THREE.BoxGeometry(.78*B,.34,.48),pants,[0,-.98,0],[1,1,1],[0,0,0],'pelvis');
    add(body,new THREE.CylinderGeometry(.16,.18,.33,12),skin,[0,.96,0],[1,1,1],[0,0,0],'neck');

    const head=new THREE.Group();head.name='forge-head';head.position.y=3.58*H;head.scale.setScalar(HS);root.add(head);
    add(head,new THREE.SphereGeometry(.52,20,14),skin,[0,0,0],[.96,1.02,.94],[0,0,0],'head');
    add(head,new THREE.BoxGeometry(.55,.28,.48),skin,[0,-.38,.03],[1,.9,1],[0,0,0],'jaw');
    [-.5,.5].forEach((x,i)=>add(head,new THREE.SphereGeometry(.085,9,7),skin,[x,-.01,0],[.48,1,.72],[0,0,0],i?'ear-r':'ear-l'));

    [-.18,.18].forEach((x,i)=>{
      add(head,new THREE.SphereGeometry(.07,9,7),eye,[x,.05,.45],[1,.72,.42],[0,0,0],i?'eye-r':'eye-l');
      add(head,new THREE.SphereGeometry(.032,8,6),dark,[x,.05,.49],[1,1,.5],[0,0,0],i?'pupil-r':'pupil-l');
      add(head,new THREE.BoxGeometry(.18,.025,.025),hair,[x,.22,.47],[1,1,1],[0,0,i?-.08:.08],i?'brow-r':'brow-l');
    });
    add(head,new THREE.BoxGeometry(.075,.22,.08),skin,[0,-.05,.5],[1,1,1],[0,0,0],'nose-bridge');
    add(head,new THREE.SphereGeometry(.065,8,6),skin,[0,-.18,.52],[1,.7,.7],[0,0,0],'nose-tip');
    add(head,new THREE.BoxGeometry(.24,.025,.025),material('mouth',0x55252b,'skin'),[0,-.38,.46],[1,1,1],[0,0,0],'mouth');
    [-.28,.28].forEach((x,i)=>add(head,new THREE.SphereGeometry(.15,10,7),skin,[x,-.19,.37],[1,.55,.35],[0,0,0],i?'cheek-r':'cheek-l'));
    add(head,new THREE.SphereGeometry(.535,20,12,0,Math.PI*2,0,Math.PI*.5),hair,[0,.1,0],[1.01,.72,1.01],[0,0,0],'hair-cap');
    add(head,new THREE.BoxGeometry(.72,.09,.08),hair,[0,.12,.49],[1,1,1],[0,0,0],'hair-edge');
    add(head,new THREE.BoxGeometry(1.0,.24,.5),hair,[0,.28,-.18],[1,.55,.8],[0,0,0],'hair-fade');

    const leftArm=new THREE.Group(),rightArm=new THREE.Group();
    const armY=2.7*H,shoulderX=.78*S*B;
    leftArm.name='forge-left-arm';rightArm.name='forge-right-arm';
    leftArm.position.set(-shoulderX,armY,0);rightArm.position.set(shoulderX,armY,0);
    const upperArmGeo=new THREE.CapsuleGeometry(.17*B,.62*AL,5,9);
    const foreArmGeo=new THREE.CapsuleGeometry(.145*B,.53*AL,5,9);
    const la=add(leftArm,upperArmGeo,top,[0,-.42*AL,0],[1,1,1],[0,0,0],'left-upper-arm');
    const ra=add(rightArm,upperArmGeo,top,[0,-.42*AL,0],[1,1,1],[0,0,0],'right-upper-arm');
    add(leftArm,foreArmGeo,skin,[0,-1.02*AL,0],[1,1,1],[0,0,0],'left-forearm');
    add(rightArm,foreArmGeo,skin,[0,-1.02*AL,0],[1,1,1],[0,0,0],'right-forearm');
    add(leftArm,new THREE.SphereGeometry(.16,10,8),skin,[0,-1.42*AL,.03],[1,.9,.7],[0,0,0],'left-hand');
    add(rightArm,new THREE.SphereGeometry(.16,10,8),skin,[0,-1.42*AL,.03],[1,.9,.7],[0,0,0],'right-hand');
    add(leftArm,new THREE.CapsuleGeometry(.045,.14,3,6),skin,[-.11,-1.44*AL,.08],[1,1,1],[0,0,.35],'left-thumb');
    add(rightArm,new THREE.CapsuleGeometry(.045,.14,3,6),skin,[.11,-1.44*AL,.08],[1,1,1],[0,0,-.35],'right-thumb');
    add(leftArm,new THREE.CylinderGeometry(.19,.19,.12,10),accent,[0,-.72*AL,0],[1,1,1],[0,0,0],'left-cuff');
    add(rightArm,new THREE.CylinderGeometry(.19,.19,.12,10),accent,[0,-.72*AL,0],[1,1,1],[0,0,0],'right-cuff');
    root.add(leftArm,rightArm);

    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
    leftLeg.name='forge-left-leg';rightLeg.name='forge-right-leg';
    leftLeg.position.set(-.28*B,1.36*H,0);rightLeg.position.set(.28*B,1.36*H,0);
    const thighGeo=new THREE.CapsuleGeometry(.215*B,.68*LL,5,9);
    const calfGeo=new THREE.CapsuleGeometry(.18*B,.54*LL,5,9);
    add(leftLeg,thighGeo,pants,[0,-.48*LL,0],[1,1,1],[0,0,0],'left-thigh');
    add(rightLeg,thighGeo,pants,[0,-.48*LL,0],[1,1,1],[0,0,0],'right-thigh');
    add(leftLeg,calfGeo,pants,[0,-1.1*LL,0],[1,1,1],[0,0,0],'left-calf');
    add(rightLeg,calfGeo,pants,[0,-1.1*LL,0],[1,1,1],[0,0,0],'right-calf');
    add(leftLeg,new THREE.BoxGeometry(.42,.23,.7),shoes,[0,-1.47*LL,.15],[1,1,1],[0,0,0],'left-shoe');
    add(rightLeg,new THREE.BoxGeometry(.42,.23,.7),shoes,[0,-1.47*LL,.15],[1,1,1],[0,0,0],'right-shoe');
    add(leftLeg,new THREE.BoxGeometry(.44,.055,.72),rubber,[0,-1.59*LL,.16],[1,1,1],[0,0,0],'left-sole');
    add(rightLeg,new THREE.BoxGeometry(.44,.055,.72),rubber,[0,-1.59*LL,.16],[1,1,1],[0,0,0],'right-sole');
    add(leftLeg,new THREE.BoxGeometry(.28,.03,.025),accent,[0,-1.43*LL,.48],[1,1,1],[0,0,0],'left-lace');
    add(rightLeg,new THREE.BoxGeometry(.28,.03,.025),accent,[0,-1.43*LL,.48],[1,1,1],[0,0,0],'right-lace');
    add(leftLeg,new THREE.CylinderGeometry(.22,.22,.11,10),pants,[0,-.82*LL,0],[1,1,1],[0,0,0],'left-pant-cuff');
    add(rightLeg,new THREE.CylinderGeometry(.22,.22,.11,10),pants,[0,-.82*LL,0],[1,1,1],[0,0,0],'right-pant-cuff');
    root.add(leftLeg,rightLeg);

    add(body,new THREE.SphereGeometry(.66*B,16,10),top,[0,.17,.03],[1.02*S,.85,.72],[0,0,0],'jacket-shell');
    add(body,new THREE.BoxGeometry(.07,1.16,.05),accent,[-.24,.1,.6],[1,1,1],[0,0,-.08],'jacket-left');
    add(body,new THREE.BoxGeometry(.07,1.16,.05),accent,[.24,.1,.6],[1,1,1],[0,0,.08],'jacket-right');
    add(body,new THREE.BoxGeometry(.25,.38,.06),top,[-.18,.65,.55],[1,1,1],[0,0,-.48],'collar-left');
    add(body,new THREE.BoxGeometry(.25,.38,.06),top,[.18,.65,.55],[1,1,1],[0,0,.48],'collar-right');
    add(body,new THREE.BoxGeometry(.46,.8,.045),material('shirt',0x090c12,'cloth'),[0,.1,.61],[1,1,1],[0,0,0],'shirt');
    add(body,new THREE.BoxGeometry(.78,.09,.5),material('belt',0x16191f,'leather'),[0,-.87,.02],[1,1,1],[0,0,0],'belt');
    add(body,new THREE.BoxGeometry(.16,.13,.055),chrome,[0,-.87,.3],[1,1,1],[0,0,0],'buckle');

    const chain=add(body,new THREE.TorusGeometry(.34,.032,8,28),chrome,[0,.35,.64],[1,.78,1],[0,0,0],'chain');
    add(body,new THREE.BoxGeometry(.13,.17,.055),chrome,[0,.06,.66],[1,1,1],[0,0,0],'pendant');
    add(body,new THREE.BoxGeometry(.92,.025,.03),accent,[0,-.12,.64],[1,1,1],[0,0,0],'accent-seam');

    root.userData.parts={leftArm,rightArm,leftLeg,rightLeg,body,head};
    root.userData.preset=cfg.id;
    root.userData.config=cfg;
    return root;
  }

  function snapshotLegacy(p){
    if(state.legacyParts)return;
    state.legacyParts=p.userData.parts||null;
    state.legacyChildren=p.children.filter(c=>!c.userData?.v227Forge);
  }

  function hideLegacy(){
    state.legacyChildren.forEach(c=>{c.visible=false});
  }
  function showLegacy(){
    state.legacyChildren.forEach(c=>{c.visible=true});
  }

  function attach(root){
    const p=player();if(!p||!root)return false;
    snapshotLegacy(p);
    if(state.root&&state.root.parent===p)p.remove(state.root);
    state.root=root;p.add(root);p.userData.parts=root.userData.parts;hideLegacy();state.built=true;return true;
  }

  function rebuild(){
    const p=player();if(!p||!T())return status();
    const started=now();state.meshCount=0;
    const root=buildRig(state.config||core()?.preset?.(state.preset));
    attach(root);state.rebuilds++;state.lastBuildMs=Math.round((now()-started)*10)/10;
    syncMode();renderUI();dispatch('tgg:forge-rebuilt',{preset:state.preset,meshes:state.meshCount});
    return status();
  }

  function restoreLegacy(){
    const p=player();
    if(p&&state.root?.parent===p)p.remove(state.root);
    if(p&&state.legacyParts)p.userData.parts=state.legacyParts;
    state.root=null;state.built=false;showLegacy();renderUI();dispatch('tgg:forge-legacy-restored');
    return status();
  }

  function applyPreset(id='street'){
    state.preset=core()?.presets?.includes(id)?id:'street';
    state.config=core()?.preset?.(state.preset)||state.config;
    if(hasDOM())rebuild();
    return {...state.config};
  }

  function applyMorph(morph={}){
    const base=state.config||core()?.preset?.(state.preset)||{};
    state.config=core()?.applyMorph?.(base,morph)||{...base,...morph};
    if(hasDOM())rebuild();
    return {...state.config};
  }

  function syncMode(){
    if(!state.root)return;
    const real=window.TGGV226?.status?.();
    const realActive=real?.usingFallback===false&&real?.assetStatus==='ready';
    state.root.visible=!realActive;
    if(realActive)showLegacy();else hideLegacy();
  }

  function dispatch(type,detail={}){
    if(hasDOM())window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,...detail}}));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v227');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v227ForgeBtn')){
      const b=document.createElement('button');b.id='v227ForgeBtn';b.className='v227-forge-btn';b.type='button';b.textContent='3D FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v227ForgePanel';panel.className='v227-forge-panel';
      panel.innerHTML='<div class="v227-head"><div><small>TGG NATIVE 3D</small><b>CHARACTER FORGE</b></div><button id="v227Close" type="button">×</button></div><div class="v227-presets"><button data-forge-preset="street">STREET</button><button data-forge-preset="stage">STAGE</button><button data-forge-preset="luxury">LUXURY</button></div><label>HEIGHT <input id="v227Height" type="range" min=".85" max="1.3" step=".01"></label><label>SHOULDERS <input id="v227Shoulders" type="range" min=".75" max="1.3" step=".01"></label><label>BUILD <input id="v227Build" type="range" min=".75" max="1.35" step=".01"></label><label>LEGS <input id="v227Legs" type="range" min=".8" max="1.25" step=".01"></label><label>HEAD <input id="v227Head" type="range" min=".82" max="1.18" step=".01"></label><div class="v227-actions"><button id="v227Rebuild" type="button">REBUILD PLAYER</button><button id="v227Legacy" type="button">LEGACY BODY</button></div><div id="v227Stats" class="v227-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v227Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-forge-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.forgePreset)));
      document.getElementById('v227Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v227Legacy')?.addEventListener('click',restoreLegacy);
      const bindings={v227Height:'height',v227Shoulders:'shoulders',v227Build:'build',v227Legs:'legLength',v227Head:'headScale'};
      Object.entries(bindings).forEach(([id,key])=>document.getElementById(id)?.addEventListener('change',e=>applyMorph({[key]:Number(e.target.value)})));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v227ForgeHud';hud.className='v227-forge-hud';
      hud.innerHTML='<small>TGG 3D FORGE</small><b id="v227HudMode">NATIVE</b><span id="v227HudPreset">STREET</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const cfg=state.config||core()?.preset?.(state.preset)||{};
    const q=id=>document.getElementById(id);
    if(q('v227Height'))q('v227Height').value=cfg.height??1;
    if(q('v227Shoulders'))q('v227Shoulders').value=cfg.shoulders??1;
    if(q('v227Build'))q('v227Build').value=cfg.build??1;
    if(q('v227Legs'))q('v227Legs').value=cfg.legLength??1;
    if(q('v227Head'))q('v227Head').value=cfg.headScale??1;
    if(q('v227Stats'))q('v227Stats').textContent=state.meshCount+' meshes • '+state.materialCount+' materials • '+state.lastBuildMs+'ms';
    if(q('v227HudMode'))q('v227HudMode').textContent=status().realAssetActive?'REAL GLB':'NATIVE FORGE';
    if(q('v227HudPreset'))q('v227HudPreset').textContent=String(state.preset).toUpperCase()+' • '+state.meshCount+' MESHES';
    panel?.querySelectorAll('[data-forge-preset]').forEach(b=>b.classList.toggle('active',b.dataset.forgePreset===state.preset));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
    if(typing)return;
    if(e.key==='F3'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let lastPlayer=null;
  function tick(){
    if(!hasDOM())return;
    requestAnimationFrame(tick);ensureUI();
    const p=player();
    if(p&&p!==lastPlayer){
      lastPlayer=p;snapshotLegacy(p);
      if(!state.config)state.config=core()?.preset?.('street');
      rebuild();
    }
    syncMode();
  }

  const api={version:VERSION,layers:LAYERS,presets:['street','stage','luxury'],status,applyPreset,applyMorph,restoreLegacy,rebuild,buildRig};
  globalThis.TGGV227=api;
  if(hasDOM()){
    window.TGGV227=api;
    state.config=core()?.preset?.('street');
    document.addEventListener('keydown',keyHandler);
    ensureUI();
    requestAnimationFrame(tick);
  }
})();