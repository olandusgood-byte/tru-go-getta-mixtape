(() => {
  const VERSION='V2.37 TGG AVATAR CUSTOMIZATION FORGE 100';
  const PACKS=['core','style','top','pants','shoes','head','accessory','morph','compat','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV237Core||globalThis.window?.TGGV237Core;
  const state={style:'street',config:null,root:null,ready:false,updates:0};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const player=()=>hasDOM()?window.TGG3D?.player||null:null;
  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-avatar-customization-forge',layerCount:LAYERS.length,style:state.style,config:{...(state.config||core()?.normalize?.({})||{})},updates:state.updates}}
  function findForge(){return player()?.children?.find(x=>x.name==='tgg-forge-player')||null}
  function removeAccessories(){if(state.root?.parent)state.root.parent.remove(state.root);state.root=null}
  function makeAccessories(){
    if(!hasDOM())return null;const THREE=T(),p=player();if(!THREE||!p)return null;
    removeAccessories();const cfg=state.config||core()?.normalize?.({})||{},sty=core()?.style?.(state.style)||{};
    const g=new THREE.Group();g.name='tgg-avatar-customization';g.userData.v237=true;
    const chrome=new THREE.MeshStandardMaterial({color:sty.chain||0xd8dde7,metalness:.92,roughness:.12});
    const dark=new THREE.MeshStandardMaterial({color:0x080a0e,roughness:.42,metalness:.28});
    const glass=new THREE.MeshStandardMaterial({color:0x18202b,roughness:.08,metalness:.12,transparent:true,opacity:.72});
    const cloth=new THREE.MeshStandardMaterial({color:sty.top||0x111827,roughness:.82,metalness:.04});
    if(cfg.glasses){
      const frame=new THREE.Group();frame.position.set(0,3.18,.31);frame.userData.v237=true;
      [-.13,.13].forEach(x=>{const lens=new THREE.Mesh(new THREE.BoxGeometry(.19,.09,.025),glass);lens.position.x=x;frame.add(lens)});
      const bridge=new THREE.Mesh(new THREE.BoxGeometry(.09,.022,.025),chrome);frame.add(bridge);g.add(frame);
    }
    if(cfg.cap){
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.34,.38,.17,18),cloth);cap.position.set(0,3.48,0);cap.userData.v237=true;g.add(cap);
      const brim=new THREE.Mesh(new THREE.BoxGeometry(.48,.05,.34),cloth);brim.position.set(0,3.43,.25);g.add(brim);
    }
    if(cfg.backpack){
      const pack=new THREE.Mesh(new THREE.BoxGeometry(.72,.92,.32),dark);pack.position.set(0,2.15,-.4);pack.userData.v237=true;g.add(pack);
      [-.26,.26].forEach(x=>{const strap=new THREE.Mesh(new THREE.CapsuleGeometry(.035,.72,3,6),chrome);strap.position.set(x,2.25,-.16);g.add(strap)});
    }
    const watch=new THREE.Mesh(new THREE.TorusGeometry(.105,.025,6,14),chrome);watch.rotation.y=Math.PI/2;watch.position.set(.49,1.28,0);g.add(watch);
    p.add(g);state.root=g;return g;
  }
  function tweakForgeGeometry(){
    const f=findForge(),cfg=state.config;if(!f||!cfg)return;
    f.traverse(o=>{
      const n=String(o.name||'').toLowerCase();
      if(/chain|pendant/.test(n))o.scale.setScalar(cfg.chainSize);
      if(/shoe/.test(n)){o.scale.x=cfg.shoeScale;o.scale.z=cfg.shoeScale}
      if(/hair-cap|hair-edge|hair-fade/.test(n))o.scale.y=cfg.hairHeight;
      if(/jacket-shell|chest/.test(n)){o.scale.x=Math.max(o.scale.x,cfg.jacketBulk);o.scale.z=Math.max(o.scale.z,cfg.jacketBulk*.85)}
    });
  }
  function syncBaseStyle(){
    if(!hasDOM())return;
    const sty=core()?.style?.(state.style)||{};
    window.TGGV227?.applyMorph?.({outfit:{top:sty.top,pants:sty.pants,shoes:sty.shoes,accent:sty.accent,hair:sty.hair}});
  }
  function applyStyle(id='street'){
    state.style=core()?.styles?.includes(id)?id:'street';if(!state.config)state.config=core()?.normalize?.({});
    if(hasDOM()){syncBaseStyle();requestAnimationFrame(()=>{tweakForgeGeometry();makeAccessories();renderUI()})}
    return status();
  }
  function update(next={}){
    state.config=core()?.normalize?.({...state.config,...next})||{...state.config,...next};state.updates++;
    if(hasDOM()){tweakForgeGeometry();makeAccessories();renderUI();try{localStorage.setItem('tgg-v237-avatar',JSON.stringify({style:state.style,config:state.config}))}catch{}}
    return status();
  }
  function restore(){
    removeAccessories();state.style='street';state.config=core()?.normalize?.({})||{};if(hasDOM()){syncBaseStyle();renderUI()}return status();
  }
  function load(){
    state.config=core()?.normalize?.({})||{};
    if(!hasDOM())return;
    try{const x=JSON.parse(localStorage.getItem('tgg-v237-avatar')||'{}');if(core()?.styles?.includes(x.style))state.style=x.style;state.config=core()?.normalize?.(x.config||{})||state.config}catch{}
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v237');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v237ForgeBtn')){const b=document.createElement('button');b.id='v237ForgeBtn';b.className='v237-forge-btn';b.type='button';b.textContent='AVATAR';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v237ForgePanel';panel.className='v237-forge-panel';panel.innerHTML='<small>TGG NATIVE 3D</small><b>AVATAR CUSTOMIZATION</b><div class="v237-styles"><button data-style="street">STREET</button><button data-style="luxury">LUXURY</button><button data-style="stage">STAGE</button><button data-style="sport">SPORT</button></div><label>CHAIN <input id="v237Chain" type="range" min=".65" max="1.5" step=".05"></label><label>SHOES <input id="v237Shoes" type="range" min=".8" max="1.25" step=".05"></label><label>HAIR <input id="v237Hair" type="range" min=".7" max="1.4" step=".05"></label><label>JACKET <input id="v237Jacket" type="range" min=".8" max="1.3" step=".05"></label><div class="v237-toggles"><button data-toggle="glasses">GLASSES</button><button data-toggle="cap">CAP</button><button data-toggle="backpack">BACKPACK</button></div><button id="v237Restore">RESTORE</button><span id="v237Stats"></span>';document.body.appendChild(panel);
      panel.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>applyStyle(b.dataset.style));
      const binds={v237Chain:'chainSize',v237Shoes:'shoeScale',v237Hair:'hairHeight',v237Jacket:'jacketBulk'};Object.entries(binds).forEach(([id,key])=>document.getElementById(id).onchange=e=>update({[key]:Number(e.target.value)}));
      panel.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>update({[b.dataset.toggle]:!state.config?.[b.dataset.toggle]}));document.getElementById('v237Restore').onclick=restore;
    }
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v237ForgeHud';hud.className='v237-forge-hud';city.appendChild(hud)}renderUI();
  }
  function renderUI(){if(!hasDOM())return;const q=id=>document.getElementById(id),c=state.config||{};if(q('v237Chain'))q('v237Chain').value=c.chainSize??1;if(q('v237Shoes'))q('v237Shoes').value=c.shoeScale??1;if(q('v237Hair'))q('v237Hair').value=c.hairHeight??1;if(q('v237Jacket'))q('v237Jacket').value=c.jacketBulk??1;if(q('v237Stats'))q('v237Stats').textContent=state.style.toUpperCase()+' • '+state.updates+' UPDATES';if(hud)hud.textContent='AVATAR • '+state.style.toUpperCase();panel?.querySelectorAll('[data-style]').forEach(b=>b.classList.toggle('active',b.dataset.style===state.style));panel?.querySelectorAll('[data-toggle]').forEach(b=>b.classList.toggle('active',!!c[b.dataset.toggle]))}
  let synced=false;function tick(){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!synced&&findForge()){syncBaseStyle();requestAnimationFrame(()=>{tweakForgeGeometry();makeAccessories()});synced=true;state.ready=true}}
  load();const api={version:VERSION,layers:LAYERS,status,applyStyle,update,restore};globalThis.TGGV237=api;if(hasDOM()){window.TGGV237=api;ensureUI();requestAnimationFrame(tick)}
})();