(() => {
  const VERSION='V2.38 TGG VEHICLE DAMAGE + INTERIOR FORGE 100';
  const PACKS=['core','interior','dashboard','seat','controls','damage','panel','lighting','compat','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV238Core||globalThis.window?.TGGV238Core;
  const state={interior:'street',root:null,damageRoot:null,condition:100,tier:'clean',ready:false,refreshes:0};
  const snapshots=new Map();
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const car=()=>hasDOM()?window.TGG3D?.car||null:null;

  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-vehicle-damage-interior-forge',layerCount:LAYERS.length,interior:state.interior,condition:state.condition,tier:state.tier,refreshes:state.refreshes}}
  function mat(color,rough=.55,metal=.18,extra={}){const THREE=T();return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive:extra.emissive||0,emissiveIntensity:extra.emissiveIntensity||0,transparent:!!extra.transparent,opacity:extra.opacity??1})}
  function add(parent,geo,m,pos=[0,0,0],rot=[0,0,0],name='mesh'){const THREE=T(),x=new THREE.Mesh(geo,m);x.position.set(...pos);x.rotation.set(...rot);x.name=name;x.castShadow=true;x.receiveShadow=true;parent.add(x);return x}
  function removeRoot(key){const r=state[key];if(r?.parent)r.parent.remove(r);state[key]=null}
  function buildInterior(){
    if(!hasDOM())return null;const THREE=T(),c=car();if(!THREE||!c)return null;
    removeRoot('root');const cfg=core()?.interior?.(state.interior)||{},g=new THREE.Group();g.name='tgg-vehicle-interior';g.userData.v238=true;
    const seat=mat(cfg.seat||0x1c222b,.82,.08),dash=mat(cfg.dash||0x11161d,.48,.34),accent=mat(cfg.accent||0xc7ff00,.25,.35,{emissive:cfg.accent||0xc7ff00,emissiveIntensity:1.2}),trim=mat(cfg.trim||0x5e6876,.24,.78),glass=mat(0x5b8097,.08,.1,{transparent:true,opacity:.45}),dark=mat(0x080a0e,.8,.04);
    add(g,new THREE.BoxGeometry(1.65,.34,1.64),dash,[.62,1.02,0],[0,0,0],'dashboard');
    add(g,new THREE.BoxGeometry(.18,.56,1.4),dash,[1.32,1.3,0],[0,0,-.25],'dashboard-cowl');
    add(g,new THREE.TorusGeometry(.34,.045,8,22),trim,[.66,1.36,-.45],[Math.PI/2,0,0],'steering-wheel');
    add(g,new THREE.CylinderGeometry(.04,.04,.48,10),trim,[.72,1.2,-.45],[0,0,Math.PI/2],'steering-column');
    [-.55,.55].forEach((z,i)=>{
      add(g,new THREE.BoxGeometry(.8,.82,.68),seat,[-.45,.72,z],[0,0,0],i?'front-seat-r':'front-seat-l');
      add(g,new THREE.BoxGeometry(.76,.88,.18),seat,[-.78,1.12,z],[0,.08,0],i?'seat-back-r':'seat-back-l');
    });
    add(g,new THREE.BoxGeometry(.9,.62,1.65),seat,[-1.48,.68,0],[0,0,0],'rear-seat');
    add(g,new THREE.BoxGeometry(1.32,.25,.34),dash,[-.25,.72,0],[0,0,0],'center-console');
    add(g,new THREE.BoxGeometry(.36,.22,.12),accent,[.28,1.08,0],[0,0,0],'gauge-cluster');
    add(g,new THREE.BoxGeometry(.3,.17,.07),glass,[.7,1.34,-.42],[0,0,0],'gauge-glass');
    add(g,new THREE.BoxGeometry(.42,.06,.18),accent,[-.02,.89,0],[0,0,0],'console-glow');
    add(g,new THREE.BoxGeometry(.5,.08,.12),trim,[.1,1.02,.52],[0,0,0],'door-trim-r');
    add(g,new THREE.BoxGeometry(.5,.08,.12),trim,[.1,1.02,-.52],[0,0,0],'door-trim-l');
    add(g,new THREE.BoxGeometry(.3,.16,.035),glass,[-.35,1.34,0],[0,0,0],'rear-mirror');
    [-.4,.4].forEach((z,i)=>add(g,new THREE.BoxGeometry(.16,.09,.08),dark,[1.35,1.13,z],[0,0,0],i?'vent-r':'vent-l'));
    c.add(g);state.root=g;state.ready=true;return g;
  }
  function snapshotMesh(m){if(!m||snapshots.has(m))return;snapshots.set(m,{px:m.position.x,py:m.position.y,pz:m.position.z,rx:m.rotation.x,ry:m.rotation.y,rz:m.rotation.z,sx:m.scale.x,sy:m.scale.y,sz:m.scale.z})}
  function restoreMesh(m,s){m.position.set(s.px,s.py,s.pz);m.rotation.set(s.rx,s.ry,s.rz);m.scale.set(s.sx,s.sy,s.sz)}
  function relevantPanels(){
    const c=car(),out=[];if(!c)return out;
    c.traverse(o=>{if(!o.isMesh)return;const n=String(o.name||'').toLowerCase();if(/hood|front-bumper|rear-bumper|left-door|right-door|spoiler-deck|headlight|taillight/.test(n))out.push(o)});
    return out;
  }
  function buildDamageVisuals(condition){
    if(!hasDOM())return;const THREE=T(),c=car();if(!THREE||!c)return;
    removeRoot('damageRoot');const d=1-condition/100,g=new THREE.Group();g.name='tgg-car-damage-visuals';g.userData.v238=true;
    const scratch=mat(0x191919,.9,.02,{transparent:true,opacity:Math.min(.72,d*.9)}),rust=mat(0x6a3324,.86,.08,{transparent:true,opacity:Math.min(.55,d*.7)});
    const defs=[[1.45,1.55,-.72,.3],[-.2,1.42,.98,-.15],[-1.55,1.2,-.82,.18],[1.9,.82,.55,-.22],[-1.95,.78,-.52,.26]];
    defs.slice(0,Math.max(1,Math.ceil(d*defs.length))).forEach((v,i)=>{
      const p=add(g,new THREE.PlaneGeometry(.62+i*.08,.055),i%2?scratch:rust,[v[0],v[1],v[2]],[0,v[3],0],'damage-scratch');p.material.depthWrite=false;
    });
    if(d>.45){const dent=add(g,new THREE.SphereGeometry(.26,10,7),mat(0x11151a,.72,.18,{transparent:true,opacity:.32}),[1.86,1.08,-.55],[0,0,0],'dent-shadow');dent.scale.set(1,.35,1.7)}
    c.add(g);state.damageRoot=g;
  }
  function refreshDamage(force){
    const raw=Number(force);
    const external=window.TGGV212?.status?.()?.condition;
    const condition=core()?.normalizeDamage?.(Number.isFinite(raw)?raw:(Number.isFinite(Number(external))?Number(external):100))??100;
    state.condition=condition;state.tier=core()?.damageTier?.(condition)||'clean';const c=car();if(!c)return status();
    for(const m of relevantPanels()){
      snapshotMesh(m);const base=snapshots.get(m);restoreMesh(m,base);
      const n=String(m.name||'').toLowerCase(),type=/hood/.test(n)?'hood':/bumper/.test(n)?'bumper':/door/.test(n)?'door':'body',p=core()?.panelState?.(condition,type)||{};
      const side=n.includes('left')?-1:1;
      if(/hood/.test(n))m.rotation.z+=side*(p.rotation||0);
      if(/bumper/.test(n))m.position.y-=(p.sag||0);
      if(/door/.test(n))m.rotation.x+=(p.rotation||0)*.35*side;
      if(/headlight|taillight/.test(n)&&m.material&&'emissiveIntensity'in m.material)m.material.emissiveIntensity*=p.light??1;
    }
    buildDamageVisuals(condition);state.refreshes++;renderUI();return status();
  }
  function applyInterior(id='street'){state.interior=core()?.interiors?.includes(id)?id:'street';if(hasDOM()){buildInterior();renderUI()}return status()}
  function restore(){
    removeRoot('root');removeRoot('damageRoot');for(const [m,s] of snapshots.entries())if(m?.parent)restoreMesh(m,s);snapshots.clear();state.condition=100;state.tier='clean';renderUI();return status();
  }
  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v238');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v238ForgeBtn')){const b=document.createElement('button');b.id='v238ForgeBtn';b.className='v238-forge-btn';b.textContent='CAR INT';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v238ForgePanel';panel.className='v238-forge-panel';panel.innerHTML='<small>TGG NATIVE 3D</small><b>VEHICLE DAMAGE + INTERIOR</b><div><button data-int="street">STREET</button><button data-int="sport">SPORT</button><button data-int="luxury">LUXURY</button></div><button id="v238Refresh">REFRESH DAMAGE</button><button id="v238Restore">RESTORE VEHICLE</button><span id="v238Stats"></span>';document.body.appendChild(panel);panel.querySelectorAll('[data-int]').forEach(b=>b.onclick=()=>applyInterior(b.dataset.int));document.getElementById('v238Refresh').onclick=()=>refreshDamage();document.getElementById('v238Restore').onclick=restore}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v238ForgeHud';hud.className='v238-forge-hud';city.appendChild(hud)}renderUI();
  }
  function renderUI(){if(!hasDOM())return;const q=id=>document.getElementById(id);if(q('v238Stats'))q('v238Stats').textContent=state.interior.toUpperCase()+' • '+state.tier.toUpperCase()+' • '+Math.round(state.condition)+'%';if(hud)hud.textContent='CAR • '+state.tier.toUpperCase()+' • '+Math.round(state.condition)+'%';panel?.querySelectorAll('[data-int]').forEach(b=>b.classList.toggle('active',b.dataset.int===state.interior))}
  let boot=false,lastCondition=null;function tick(){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!boot&&car()){buildInterior();refreshDamage();boot=true}const ext=window.TGGV212?.status?.()?.condition;if(Number.isFinite(Number(ext))&&Number(ext)!==lastCondition){lastCondition=Number(ext);refreshDamage(lastCondition)}}
  const api={version:VERSION,layers:LAYERS,status,applyInterior,refreshDamage,restore};globalThis.TGGV238=api;if(hasDOM()){window.TGGV238=api;ensureUI();requestAnimationFrame(tick)}
})();