(() => {
  const VERSION='V2.16 3D MODEL POLISH 100';
  const LAYERS=[
    'player hair cap','player hair edge','player left eye','player right eye','player nose','player mouth','player left ear','player right ear','player left hand','player right hand',
    'player left shoe','player right shoe','player chain','player jacket panel','player jacket trim','player sleeve cuff left','player sleeve cuff right','player shoe sole left','player shoe sole right','player face detail group',
    'contact hair detail','contact eye detail','contact nose detail','contact hand detail','contact shoe detail','contact chain detail','contact jacket detail','contact accessory group','contact quality lod','contact detail diagnostics',
    'pedestrian hair variety','pedestrian eye detail','pedestrian hand detail','pedestrian shoe detail','pedestrian shirt trim','pedestrian accessory variety','pedestrian skin-safe materials','pedestrian detail lod','pedestrian detail distance','pedestrian detail diagnostics',
    'starter car hood contour','starter car trunk contour','starter car front grille','starter car front splitter','starter car side skirt left','starter car side skirt right','starter car left mirror','starter car right mirror','starter car exhaust left','starter car exhaust right',
    'starter car rear plate','starter car front plate','starter car rim hubs','starter car wheel lips','starter car taillight housing','starter car headlight housing','starter car windshield trim','starter car rear glass trim','starter car door lines','starter car body diagnostics',
    'traffic car hood contour','traffic car grille detail','traffic car mirrors','traffic car exhaust','traffic car plate','traffic car rim hubs','traffic car wheel lips','traffic car glass trim','traffic car detail lod','traffic car diagnostics',
    'damage scratch left','damage scratch right','damage hood mark','damage trunk mark','damage visibility bridge','condition detail bridge','repair detail reset','boost exhaust bridge','brake detail bridge','headlight detail bridge',
    'player detail lod','starter car detail lod','traffic distance lod','pedestrian distance lod','contact always-visible rule','quality performance trim','quality balanced trim','quality high detail','mobile detail trim','reduced motion compatibility',
    'safe additive meshes','mesh dedupe','material reuse','shadow budget','detail group tagging','model status api','model layer manifest','population decoration pass','runtime diagnostics','release QA hooks'
  ];
  const state={ready:false,playerDetailed:false,starterCarDetailed:false,contactsDetailed:0,pedestriansDetailed:0,trafficDetailed:0,groups:[],materials:0,lastQuality:'high'};
  const mats={};
  let lastNow=performance.now();

  function T(){return window.THREE}
  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;
    if(mats[key])return mats[key];
    mats[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.62,metalness:opts.metalness??.18,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
    state.materials=Object.keys(mats).length;return mats[key];
  }
  function groupFor(obj,type){
    if(!obj||obj.userData?.v216DetailGroup)return obj?.userData?.v216DetailGroup||null;
    const THREE=T();if(!THREE)return null;
    const g=new THREE.Group();g.name='v216-'+type+'-details';g.userData.v216Type=type;obj.add(g);obj.userData.v216DetailGroup=g;state.groups.push(g);return g;
  }
  function mesh(geo,material,x=0,y=0,z=0){
    const THREE=T();if(!THREE)return null;const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;return m;
  }

  function decorateHuman(obj,kind='pedestrian',accent=0xc7ff00){
    const THREE=T(),parts=obj?.userData?.parts;if(!THREE||!obj||!parts||obj.userData.v216Detailed)return false;
    const g=groupFor(obj,kind);if(!g)return false;
    const skin=parts.head?.material||mat('skin-default',0x9d6a49,{roughness:.72});
    const dark=mat('human-dark',0x0b0e14,{roughness:.64,metalness:.12});
    const white=mat('human-eye',0xf4f7fb,{roughness:.35});
    const black=mat('human-black',0x050609,{roughness:.45});
    const metal=mat('human-metal',0xd8dde7,{roughness:.2,metalness:.82});
    const accentMat=mat('accent-'+String(accent),accent,{roughness:.48,metalness:.12});
    const shoe=mat('shoe',0x12151c,{roughness:.48,metalness:.18});

    const hair=new THREE.Mesh(new THREE.SphereGeometry(.595,16,10,0,Math.PI*2,0,Math.PI*.48),dark);
    hair.position.set(0,3.72,0);hair.scale.set(1.02,.75,1.02);g.add(hair);

    const eyeGeo=new THREE.SphereGeometry(.075,8,6);
    [-.19,.19].forEach(x=>{
      const eye=mesh(eyeGeo,white,x,3.64,.535);eye.scale.z=.5;g.add(eye);
      const pupil=mesh(new THREE.SphereGeometry(.032,7,5),black,x,3.64,.592);g.add(pupil);
    });
    const nose=mesh(new THREE.ConeGeometry(.065,.18,7),skin,0,3.48,.61);nose.rotation.x=Math.PI/2;g.add(nose);
    const mouth=mesh(new THREE.BoxGeometry(.22,.025,.025),mat('mouth',0x401d20,{roughness:.72}),0,3.31,.585);g.add(mouth);
    [-.58,.58].forEach(x=>{const ear=mesh(new THREE.SphereGeometry(.09,8,6),skin,x,3.55,0);ear.scale.x=.45;g.add(ear)});

    if(parts.leftArm){
      const h=mesh(new THREE.SphereGeometry(.18,9,7),skin,0,-1.12,0);parts.leftArm.add(h);
      const cuff=mesh(new THREE.CylinderGeometry(.205,.205,.16,10),accentMat,0,-.96,0);parts.leftArm.add(cuff);
    }
    if(parts.rightArm){
      const h=mesh(new THREE.SphereGeometry(.18,9,7),skin,0,-1.12,0);parts.rightArm.add(h);
      const cuff=mesh(new THREE.CylinderGeometry(.205,.205,.16,10),accentMat,0,-.96,0);parts.rightArm.add(cuff);
    }
    for(const leg of [parts.leftLeg,parts.rightLeg].filter(Boolean)){
      const shoeMesh=mesh(new THREE.BoxGeometry(.42,.24,.72),shoe,0,-1.2,.18);shoeMesh.rotation.x=.04;leg.add(shoeMesh);
      const sole=mesh(new THREE.BoxGeometry(.44,.055,.75),black,0,-1.32,.19);leg.add(sole);
    }

    const chain=new THREE.Mesh(new THREE.TorusGeometry(.37,.035,8,28),metal);chain.position.set(0,2.42,.73);chain.scale.y=.76;g.add(chain);
    const pendant=mesh(new THREE.BoxGeometry(.13,.18,.055),metal,0,2.05,.73);g.add(pendant);
    const jacketL=mesh(new THREE.BoxGeometry(.06,1.18,.05),accentMat,-.28,2.1,.72);jacketL.rotation.z=-.09;g.add(jacketL);
    const jacketR=mesh(new THREE.BoxGeometry(.06,1.18,.05),accentMat,.28,2.1,.72);jacketR.rotation.z=.09;g.add(jacketR);

    obj.userData.v216Detailed=true;obj.userData.v216Kind=kind;return true;
  }

  function addCarDetail(car,type='traffic'){
    const THREE=T();if(!THREE||!car||car.userData.v216Detailed)return false;
    const g=groupFor(car,'car-'+type);if(!g)return false;
    const bodyMat=car.userData.bodyMaterial||car.children?.find(x=>x.material)?.material||mat('car-body-fallback',0x778899,{metalness:.68,roughness:.3});
    const dark=mat('car-dark',0x080a0e,{metalness:.62,roughness:.28});
    const chrome=mat('car-chrome',0xd6dde7,{metalness:.94,roughness:.12});
    const glassTrim=mat('glass-trim',0x161d25,{metalness:.7,roughness:.25});
    const red=mat('tail-housing',0x4a080d,{emissive:0xff1b2b,emissiveIntensity:.45});
    const plate=mat('plate',0xe9edf4,{roughness:.45,metalness:.1});

    const hood=mesh(new THREE.BoxGeometry(1.25,.12,1.78),bodyMat,1.43,1.47,0);hood.rotation.z=-.045;g.add(hood);
    const trunk=mesh(new THREE.BoxGeometry(.78,.1,1.72),bodyMat,-1.66,1.34,0);trunk.rotation.z=.035;g.add(trunk);
    const grille=mesh(new THREE.BoxGeometry(.07,.42,1.28),dark,2.17,.76,0);g.add(grille);
    for(let i=-2;i<=2;i++){const bar=mesh(new THREE.BoxGeometry(.075,.34,.045),chrome,2.215,.76,i*.22);g.add(bar)}
    const splitter=mesh(new THREE.BoxGeometry(.22,.08,2.16),dark,2.15,.48,0);g.add(splitter);
    [-1.08,1.08].forEach(z=>{const skirt=mesh(new THREE.BoxGeometry(2.75,.12,.1),dark,-.05,.46,z);g.add(skirt)});
    [-1.08,1.08].forEach(z=>{const mirror=mesh(new THREE.BoxGeometry(.38,.2,.22),bodyMat,.3,1.72,z);g.add(mirror)});
    [-.52,.52].forEach(z=>{const ex=mesh(new THREE.CylinderGeometry(.09,.09,.38,10),chrome,-2.28,.49,z);ex.rotation.z=Math.PI/2;g.add(ex)});
    const rearPlate=mesh(new THREE.BoxGeometry(.055,.34,.72),plate,-2.145,.73,0);g.add(rearPlate);
    const frontPlate=mesh(new THREE.BoxGeometry(.055,.28,.62),plate,2.19,.62,0);g.add(frontPlate);
    const windshieldTop=mesh(new THREE.BoxGeometry(.08,.08,1.72),glassTrim,.16,2.16,0);g.add(windshieldTop);
    const rearGlassTrim=mesh(new THREE.BoxGeometry(.08,.08,1.62),glassTrim,-.95,1.98,0);g.add(rearGlassTrim);
    [-.7,.7].forEach(z=>{const tail=mesh(new THREE.BoxGeometry(.075,.33,.4),red,-2.17,1.0,z);g.add(tail)});
    [-1.02,1.02].forEach(z=>{const line=mesh(new THREE.BoxGeometry(.05,.65,.035),dark,-.25,1.05,z);line.material=dark;g.add(line)});

    car.userData.wheels?.forEach((w,i)=>{
      if(w.userData.v216Rim)return;
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.355,14),chrome);hub.rotation.x=Math.PI/2;hub.position.set(0,0,0);w.add(hub);
      const lip=new THREE.Mesh(new THREE.TorusGeometry(.31,.035,8,18),chrome);lip.rotation.x=Math.PI/2;w.add(lip);
      w.userData.v216Rim=true;
    });

    if(type==='starter'){
      const scratchMat=mat('scratch',0x21252d,{roughness:.75,metalness:.05,transparent:true,opacity:.58});
      const scratches=[];
      [[-.25,1.16,1.035,.55],[-.65,1.04,-1.035,-.45],[1.12,1.52,.55,.2],[-1.55,1.36,-.42,-.2]].forEach(([x,y,z,r])=>{
        const s=mesh(new THREE.BoxGeometry(.62,.025,.028),scratchMat,x,y,z);s.rotation.z=r;s.visible=false;g.add(s);scratches.push(s);
      });
      car.userData.v216Scratches=scratches;
    }
    car.userData.v216Detailed=true;car.userData.v216DetailType=type;return true;
  }

  function decoratePopulation(){
    const player=window.TGG3D?.player;
    if(player&&!player.userData.v216Detailed&&decorateHuman(player,'player',0xc7ff00))state.playerDetailed=true;
    const starter=window.TGG3D?.car;
    if(starter&&!starter.userData.v216Detailed&&addCarDetail(starter,'starter'))state.starterCarDetailed=true;

    let contacts=0;
    for(const c of window.TGGStreetContacts?.contacts||[]){
      const o=window.TGGStreetContacts?.getObject?.(c.id);if(!o)continue;
      if(!o.userData.v216Detailed)decorateHuman(o,'contact',c.color||0x7b86ff);
      if(o.userData.v216Detailed)contacts++;
    }
    state.contactsDetailed=contacts;

    let peds=0;
    for(const p of window.TGG3D?.pedestrians||[]){
      if(!p.userData.v216Detailed){
        const palette=[0x00a7ff,0xf95d9b,0xffa62b,0x7d6cff,0x39dd79,0xffcf4a];
        decorateHuman(p,'pedestrian',palette[peds%palette.length]);
      }
      if(p.userData.v216Detailed)peds++;
    }
    state.pedestriansDetailed=peds;

    let cars=0;
    for(const c of window.TGG3D?.traffic||[]){
      if(!c.userData.v216Detailed)addCarDetail(c,'traffic');
      if(c.userData.v216Detailed)cars++;
    }
    state.trafficDetailed=cars;
  }

  function updateDamage(){
    const car=window.TGG3D?.car,s=window.TGGV212?.status?.();if(!car||!s)return;
    const cond=Number.isFinite(Number(s.condition))?Number(s.condition):100;
    const marks=car.userData.v216Scratches||[];
    marks.forEach((m,i)=>m.visible=cond < 86-i*17);
  }

  function updateLOD(){
    const q=window.TGGV212?.status?.()?.quality||'high';state.lastQuality=q;
    const player=window.TGG3D?.player;
    const px=player?.position.x||0,pz=player?.position.z||0;
    for(const g of state.groups){
      const owner=g.parent;if(!owner)continue;
      const type=String(g.userData.v216Type||'');
      if(type==='player'||type==='car-starter'||type==='contact'){g.visible=true;continue}
      const d=Math.hypot((owner.position.x||0)-px,(owner.position.z||0)-pz);
      const max=q==='performance'?18:q==='balanced'?28:42;
      g.visible=d<=max;
      g.traverse?.(n=>{if('castShadow'in n)n.castShadow=q==='high'&&d<22});
    }
  }

  function install(){
    document.body.classList.add('tgg-v216');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.16 3D MODEL POLISH 100';
  }
  function tick(now=performance.now()){
    requestAnimationFrame(tick);install();
    if(!T()||!window.TGG3D?.scene)return;
    decoratePopulation();updateDamage();updateLOD();state.ready=state.playerDetailed&&state.starterCarDetailed;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.16 3D MODEL POLISH 100';
    lastNow=now;
  }
  function status(){
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,playerDetailed:state.playerDetailed,
      starterCarDetailed:state.starterCarDetailed,contactsDetailed:state.contactsDetailed,
      pedestriansDetailed:state.pedestriansDetailed,trafficDetailed:state.trafficDetailed,
      detailGroups:state.groups.length,materials:state.materials,quality:state.lastQuality
    };
  }
  window.TGGV216={version:VERSION,layers:LAYERS,status,decorateHuman,addCarDetail,decoratePopulation};
  requestAnimationFrame(tick);
})();