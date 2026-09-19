(() => {
  const VERSION='V2.41 TGG STAGE + PERFORMANCE FORGE 100';
  const PACKS=['core','stage','truss','audio','screen','light','crowd','show','event','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const core=()=>globalThis.TGGV241Core||globalThis.window?.TGGV241Core;
  const state={enabled:true,show:'showcase',active:false,root:null,lights:[],screens:[],crowd:[],ready:false,rebuilds:0,phase:0,qualityBuilt:null};
  let panel=null,hud=null,lastTs=0;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;return['high','balanced','performance'].includes(q)?q:'high'};
  const seeded=i=>{let x=(i*22695477+1)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000};

  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-stage-performance-forge',layerCount:LAYERS.length,enabled:state.enabled,active:state.active,show:state.show,lights:state.lights.length,crowd:state.crowd.length,rebuilds:state.rebuilds}}
  function mat(color,rough=.58,metal=.22,extra={}){const THREE=T();return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive:extra.emissive||0,emissiveIntensity:extra.emissiveIntensity||0,transparent:!!extra.transparent,opacity:extra.opacity??1,side:extra.side})}
  function add(parent,geo,m,pos=[0,0,0],rot=[0,0,0],name='mesh'){const THREE=T(),x=new THREE.Mesh(geo,m);x.position.set(...pos);x.rotation.set(...rot);x.name=name;x.castShadow=quality()==='high';x.receiveShadow=true;parent.add(x);return x}

  function buildCrowd(root,cfg){
    const THREE=T(),count=quality()==='performance'?10:quality()==='balanced'?18:28,colors=[0xff466d,0x61d9ff,0xc7ff00,0xc56cff,0xffcf4a,0xffffff];
    state.crowd=[];
    for(let i=0;i<count;i++){
      const row=Math.floor(i/7),col=i%7,x=(col-3)*1.0+(row%2*.45),z=4.4+row*1.25;
      const g=new THREE.Group();g.position.set(x,0,z);g.userData.phase=i*.7;g.userData.baseY=0;g.name='stage-crowd';
      const body=add(g,new THREE.CapsuleGeometry(.16,.55,3,6),mat(colors[i%colors.length],.76,.05),[0,1.05,0],[0,0,0],'crowd-body');
      const head=add(g,new THREE.SphereGeometry(.15,8,6),mat(i%3?0x9e6b4f:0x694338,.68,.02),[0,1.8,0],[0,0,0],'crowd-head');
      const la=new THREE.Group(),ra=new THREE.Group();la.position.set(-.22,1.35,0);ra.position.set(.22,1.35,0);g.add(la,ra);
      add(la,new THREE.CapsuleGeometry(.045,.38,2,5),body.material,[0,-.22,0],[0,0,.1],'crowd-arm-l');
      add(ra,new THREE.CapsuleGeometry(.045,.38,2,5),body.material,[0,-.22,0],[0,0,-.1],'crowd-arm-r');
      g.userData.parts={body,head,la,ra};root.add(g);state.crowd.push(g);
    }
  }

  function buildStage(){
    if(!hasDOM())return status();const THREE=T(),s=scene();if(!THREE||!s)return status();
    if(state.root?.parent)state.root.parent.remove(state.root);
    const cfg=core()?.show?.(state.show)||{},g=new THREE.Group();g.name='tgg-stage-performance';g.userData.v241=true;g.position.set(0,0,31);
    const dark=mat(0x090c11,.5,.45),deck=mat(0x181d24,.62,.28),metal=mat(0x727b88,.24,.86),accent=mat(cfg.accent,.24,.28,{emissive:cfg.accent,emissiveIntensity:2.2}),screen=mat(0x091018,.18,.2,{emissive:cfg.accent,emissiveIntensity:1.5}),speaker=mat(0x07090d,.52,.32);
    add(g,new THREE.BoxGeometry(9.4,.55,5.8),deck,[0,.35,0],[0,0,0],'stage-deck');
    add(g,new THREE.BoxGeometry(9.8,.18,6.2),dark,[0,.07,0],[0,0,0],'stage-base');
    add(g,new THREE.BoxGeometry(6.6,.18,.4),accent,[0,.62,2.7],[0,0,0],'stage-front-glow');
    [-4.4,4.4].forEach(x=>{add(g,new THREE.BoxGeometry(.16,4.8,.16),metal,[x,3.0,-2.15],[0,0,0],'truss-vert');add(g,new THREE.BoxGeometry(.16,4.8,.16),metal,[x,3.0,2.15],[0,0,0],'truss-vert')});
    add(g,new THREE.BoxGeometry(9.0,.16,.16),metal,[0,5.36,-2.15],[0,0,0],'truss-top-back');add(g,new THREE.BoxGeometry(9.0,.16,.16),metal,[0,5.36,2.15],[0,0,0],'truss-top-front');
    [-3.7,-2.2,2.2,3.7].forEach((x,i)=>add(g,new THREE.BoxGeometry(.9,1.7,.82),speaker,[x,1.2,-1.85],[0,0,0],'speaker-stack-'+i));
    add(g,new THREE.BoxGeometry(2.6,.92,1.25),dark,[0,1.05,-1.45],[0,0,0],'dj-booth');
    add(g,new THREE.BoxGeometry(2.2,.12,.08),accent,[0,1.35,-.79],[0,0,0],'dj-glow');
    const micStand=add(g,new THREE.CylinderGeometry(.025,.025,1.75,8),metal,[0,.95,.55],[0,0,0],'mic-stand');
    add(g,new THREE.CapsuleGeometry(.07,.16,3,6),dark,[0,1.82,.55],[0,0,Math.PI/2],'mic');
    state.screens=[];
    [-3.15,3.15].forEach((x,i)=>{const sc=add(g,new THREE.BoxGeometry(2.2,1.45,.09),screen,[x,3.35,-2.05],[0,0,0],'stage-screen-'+i);state.screens.push(sc)});
    add(g,new THREE.BoxGeometry(4.2,.12,.07),accent,[0,4.75,-2.08],[0,0,0],'stage-logo-strip');
    state.lights=[];const lightBudget=core()?.lightBudget?.(quality())||4;
    const lightColors=[cfg.accent,0xffffff,0x61d9ff,0xff466d,0xc7ff00,0xc56cff];
    for(let i=0;i<lightBudget;i++){
      const l=new THREE.SpotLight(lightColors[i%lightColors.length],cfg.lights*7.5,22,Math.PI/7,.42,1.6);
      l.position.set(-4+i*(8/Math.max(1,lightBudget-1)),5.1,(i%2?2:-2));l.target.position.set((i%3-1)*1.4,.7,.5);g.add(l,l.target);l.userData.baseIntensity=l.intensity;l.userData.phase=i*.8;state.lights.push(l);
    }
    buildCrowd(g,cfg);s.add(g);state.root=g;state.root.visible=state.enabled&&state.active;state.qualityBuilt=quality();state.rebuilds++;state.ready=true;renderUI();return status();
  }

  function start(id='showcase'){
    state.show=core()?.shows?.includes(id)?id:'showcase';state.active=true;
    if(hasDOM()){buildStage();state.root.visible=state.enabled;const cfg=core()?.show?.(state.show)||{};window.TGGV232?.play?.(cfg.cypher?'rap':'perform',cfg.cypher?5200:7200);window.TGGV234?.applyPreset?.(state.show==='concert'?'cinematic':'action');window.dispatchEvent(new CustomEvent('tgg:stage-start',{detail:{show:state.show}}));renderUI()}
    return status();
  }
  function stop(){
    state.active=false;if(state.root)state.root.visible=false;if(hasDOM()){window.TGGV232?.clear?.();window.TGGV234?.applyPreset?.('street');window.dispatchEvent(new CustomEvent('tgg:stage-stop',{detail:{show:state.show}}));renderUI()}return status();
  }
  function setEnabled(v){state.enabled=!!v;if(state.root)state.root.visible=state.enabled&&state.active;renderUI();return state.enabled}
  function rebuild(){return buildStage()}

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:concert-start',()=>start('concert'));
    window.addEventListener('tgg:concert-complete',()=>stop());
    window.addEventListener('tgg:rap-battle-start',()=>start('battle'));
    window.addEventListener('tgg:rap-battle-complete',()=>stop());
    window.addEventListener('tgg:live-room-start',()=>start('club'));
    window.addEventListener('tgg:live-room-stop',()=>stop());
  }

  function animate(dt,ts){
    if(!state.active||!state.enabled||!state.root)return;
    const cfg=core()?.show?.(state.show)||{};state.phase+=dt*(4+cfg.energy*5);
    state.lights.forEach((l,i)=>{l.intensity=l.userData.baseIntensity*(.72+Math.abs(Math.sin(state.phase*.45+l.userData.phase))*.55);l.target.position.x=Math.sin(state.phase*.22+i)*2.4});
    state.screens.forEach((s,i)=>{s.material.emissiveIntensity=1.0+Math.sin(state.phase*.7+i)*.65});
    state.crowd.forEach((c,i)=>{const ph=state.phase+c.userData.phase,parts=c.userData.parts;const bounce=Math.abs(Math.sin(ph))*cfg.energy*.09;c.position.y=c.userData.baseY+bounce;parts.la.rotation.z=-.25-Math.abs(Math.sin(ph*.7))*1.15*cfg.energy;parts.ra.rotation.z=.25+Math.abs(Math.cos(ph*.73))*1.15*cfg.energy;parts.body.rotation.z=Math.sin(ph*.45)*.06*cfg.energy});
  }

  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v241');const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');if(top&&!document.getElementById('v241ForgeBtn')){const b=document.createElement('button');b.id='v241ForgeBtn';b.className='v241-forge-btn';b.textContent='STAGE';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v241ForgePanel';panel.className='v241-forge-panel';panel.innerHTML='<small>TGG NATIVE 3D</small><b>STAGE + PERFORMANCE FORGE</b><div><button data-show="concert">CONCERT</button><button data-show="battle">RAP BATTLE</button><button data-show="club">CLUB</button><button data-show="showcase">SHOWCASE</button></div><button id="v241Stop">STOP SHOW</button><button id="v241Toggle">STAGE: ON</button><span id="v241Stats"></span>';document.body.appendChild(panel);panel.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>start(b.dataset.show));document.getElementById('v241Stop').onclick=stop;document.getElementById('v241Toggle').onclick=()=>setEnabled(!state.enabled)}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v241ForgeHud';hud.className='v241-forge-hud';city.appendChild(hud)}bridgeEvents();renderUI();
  }
  function renderUI(){if(!hasDOM())return;const q=id=>document.getElementById(id);if(q('v241Toggle'))q('v241Toggle').textContent='STAGE: '+(state.enabled?'ON':'OFF');if(q('v241Stats'))q('v241Stats').textContent=(state.active?state.show.toUpperCase():'IDLE')+' • '+quality().toUpperCase();if(hud)hud.textContent='STAGE • '+(state.active?state.show.toUpperCase():'READY');panel?.querySelectorAll('[data-show]').forEach(b=>b.classList.toggle('active',state.active&&b.dataset.show===state.show))}
  function tick(ts=0){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!state.root||state.qualityBuilt!==quality())buildStage();const dt=Math.min(.05,Math.max(.001,lastTs?(ts-lastTs)/1000:.016));lastTs=ts;animate(dt,ts)}
  const api={version:VERSION,layers:LAYERS,status,start,stop,rebuild,setEnabled};globalThis.TGGV241=api;if(hasDOM()){window.TGGV241=api;ensureUI();requestAnimationFrame(tick)}
})();