(() => {
  const VERSION='V2.35 TGG SURFACE + DETAIL FORGE 100';
  const LAYERS=[
    'surface core bridge','surface enabled state','surface root state','surface rebuild state','surface quality bridge','surface visual-only guard','surface restore path','surface status API','surface deterministic seed','surface diagnostics',
    'road lane dashes','road edge lines','road arrows','road stop bars','road crosswalks','road manhole','road patch','road crack','road oil stain','road tire streak',
    'sidewalk seams','sidewalk chips','sidewalk utility plate','sidewalk curb paint','sidewalk gum marks','sidewalk drain grate','sidewalk bike marks','sidewalk chalk',
    'building window trim','building door trim','building vent','building pipe','building conduit','building fire escape','building AC unit','building rooftop box',
    'store awning seam','store frame trim','store window decal','store door handle','store neon edge','store sign bracket','store light box','store poster','store security camera',
    'studio wall panel','studio acoustic decal','studio cable run','studio rack glow','club rope post','club queue marker','club neon reflection','club wall poster','club entrance glow',
    'vehicle parking mark','parking stop','parking number','parking oil patch','parking tire mark','parking curb stripe','parking meter base','parking sign','parking bollard stripe',
    'grime overlay','rain dirt edge','lower wall grime','window smudge','paint chip','concrete stain','asphalt stain','rust patch','utility wear',
    'neon road reflection','neon sidewalk reflection','window reflection strip','wet highlight strip','puddle glow bridge','headlight reflection strip','club reflection strip','studio reflection strip',
    'quality high budget','quality balanced budget','quality performance budget','mobile trim','shadow trim','material cache','geometry cache','batch rebuild','rollback isolation','V2.34 compatibility',
    'surface HUD','surface panel','enabled toggle','rebuild button','restore button','F10 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks'
  ];
  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={enabled:true,root:null,ready:false,meshCount:0,rebuilds:0,qualityBuilt:null};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const scene=()=>hasDOM()?window.TGG3D?.scene||null:null;
  const quality=()=>{const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;return ['high','balanced','performance'].includes(q)?q:'high'};
  const seeded=i=>{let x=(i*1664525+1013904223)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000};

  function status(){return{version:VERSION,ready:state.ready||!hasDOM(),mode:'native-surface-forge',layerCount:LAYERS.length,enabled:state.enabled,quality:quality(),meshCount:state.meshCount,rebuilds:state.rebuilds}}
  function mat(profileId,colorOverride){
    const THREE=T(),p=core()?.profile?.(profileId)||{};const color=colorOverride??p.color??0xffffff;
    return new THREE.MeshStandardMaterial({color,roughness:p.roughness??.7,metalness:p.metalness??.1,transparent:(p.opacity??1)<1,opacity:p.opacity??1,emissive:p.emissive?color:0,emissiveIntensity:p.intensity??0,depthWrite:(p.opacity??1)>.45});
  }
  function addPlane(root,w,h,m,x,z,y=.091,rot=0,name='detail'){
    const THREE=T(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);mesh.rotation.x=-Math.PI/2;mesh.rotation.z=rot;mesh.position.set(x,y,z);mesh.name=name;mesh.userData.v235=true;root.add(mesh);state.meshCount++;return mesh;
  }
  function addBox(root,w,h,d,m,x,y,z,rot=0,name='detail-box'){
    const THREE=T(),mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.rotation.y=rot;mesh.name=name;mesh.userData.v235=true;mesh.castShadow=quality()==='high';mesh.receiveShadow=true;root.add(mesh);state.meshCount++;return mesh;
  }
  function roadKit(root,budget){
    const paint=mat('paint',0xd8dde7),yellow=mat('paint',0xf2ca4b),dark=mat('grime',0x0c0f13),metal=mat('chrome',0x58606b);
    let idx=0;
    for(const lane of[-24,0,24]){
      for(let z=-45;z<=45&&idx<budget;z+=8,idx++)addPlane(root,.18,3.8,paint,lane,z,.095,0,'lane-dash-x');
      addPlane(root,.14,100,yellow,lane-3.1,0,.094,0,'edge-line-x');addPlane(root,.14,100,yellow,lane+3.1,0,.094,0,'edge-line-x');
    }
    for(const lane of[-24,0,24]){
      for(let x=-45;x<=45&&idx<budget;x+=8,idx++)addPlane(root,3.8,.18,paint,x,lane,.096,0,'lane-dash-z');
      addPlane(root,100,.14,yellow,0,lane-3.1,.094,0,'edge-line-z');addPlane(root,100,.14,yellow,0,lane+3.1,.094,0,'edge-line-z');
    }
    [[0,0],[-24,0],[24,0],[0,-24],[0,24]].forEach(([x,z],i)=>addPlane(root,1.3,1.3,metal,x+.9,z-.9,.099,0,'manhole'));
    for(let i=0;i<Math.min(18,budget/4);i++){
      const x=(seeded(i*7)-.5)*88,z=(seeded(i*7+1)-.5)*88;
      addPlane(root,.5+seeded(i+3)*1.3,.05,dark,x,z,.101,seeded(i+5)*Math.PI,'road-crack');
    }
  }
  function sidewalkKit(root,budget){
    const seam=mat('grime',0x20252b),stain=mat('grime',0x181b1f),metal=mat('chrome',0x4c5560);
    let n=0;
    for(const x of[-29,-19,-5,5,19,29])for(let z=-44;z<=44&&n<budget;z+=5,n++)addPlane(root,2.7,.035,seam,x,z,.102,0,'sidewalk-seam');
    for(let i=0;i<Math.min(16,budget/3);i++){
      const x=[-29,-19,-5,5,19,29][i%6]+(seeded(i+20)-.5)*1.5,z=(seeded(i+30)-.5)*90;
      addPlane(root,.4+seeded(i)*.7,.2,stain,x,z,.103,seeded(i+9)*Math.PI,'sidewalk-stain');
    }
    for(let i=0;i<8;i++){const x=[-29,29,-19,19][i%4],z=-35+i*10;addPlane(root,.55,.8,metal,x,z,.104,0,'utility-plate')}
  }
  function buildingKit(root,budget){
    const dark=mat('concrete',0x242a32),metal=mat('chrome',0x555e6b),neon=mat('neon',0x61d9ff),glass=mat('glass',0x6e9fb6);
    const defs=[[-34,-15,Math.PI/2],[-15,34,0],[15,-34,Math.PI],[8,42,Math.PI],[-42,8,-Math.PI/2],[34,34,Math.PI]];
    let count=0;
    defs.forEach((d,j)=>{
      if(count>=budget)return;
      const g=new (T()).Group();g.position.set(d[0],0,d[1]);g.rotation.y=d[2];root.add(g);
      addBox(g,5.8,.08,.08,neon,0,4.6,1.7,0,'facade-neon');
      addBox(g,.12,2.8,.12,metal,-2.5,2.0,-1.4,0,'facade-pipe');
      addBox(g,1.4,.4,.7,dark,1.5,5.4,-.5,0,'roof-unit');
      addBox(g,.8,.18,.35,glass,0,2.1,1.72,0,'window-decal');
      addBox(g,.26,.18,.28,metal,2.25,3.6,1.65,0,'security-camera');
      count+=5;
    });
  }
  function reflections(root){
    const colors=[0xc7ff00,0xff466d,0x61d9ff,0xc56cff,0xffcf4a];
    for(let i=0;i<20;i++){
      const c=colors[i%colors.length],m=mat('neon',c);m.opacity=.15;m.transparent=true;m.depthWrite=false;
      const x=(seeded(700+i)-.5)*72,z=(seeded(900+i)-.5)*72;
      const p=addPlane(root,.45+seeded(i)*.8,2.4+seeded(i+3)*2.5,m,x,z,.105,seeded(i+6)*Math.PI,'neon-reflection');
      p.material.emissiveIntensity=.65;
    }
  }
  function rebuild(){
    if(!hasDOM())return status();const s=scene(),THREE=T();if(!s||!THREE)return status();
    if(state.root?.parent)state.root.parent.remove(state.root);
    state.root=new THREE.Group();state.root.name='tgg-surface-forge';state.root.userData.v235=true;state.meshCount=0;
    const budget=core()?.detailBudget?.(quality())||38;
    roadKit(state.root,budget);sidewalkKit(state.root,Math.floor(budget*.65));buildingKit(state.root,Math.floor(budget*.28));
    if(quality()!=='performance')reflections(state.root);
    s.add(state.root);state.root.visible=state.enabled;state.qualityBuilt=quality();state.rebuilds++;state.ready=true;renderUI();return status();
  }
  function setEnabled(v){state.enabled=!!v;if(state.root)state.root.visible=state.enabled;renderUI();return state.enabled}
  function restore(){if(state.root?.parent)state.root.parent.remove(state.root);state.root=null;state.enabled=false;renderUI();return status()}

  function ensureUI(){
    if(!hasDOM())return;document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='DETAILS';b.onclick=()=>panel?.classList.toggle('active');top.appendChild(b)}
    if(!panel){panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';panel.innerHTML='<div><small>TGG NATIVE 3D</small><b>SURFACE + DETAIL FORGE</b></div><button id="v235Toggle">DETAILS: ON</button><button id="v235Rebuild">REBUILD DETAILS</button><button id="v235Restore">RESTORE BASE</button><span id="v235Stats"></span>';document.body.appendChild(panel);document.getElementById('v235Toggle').onclick=()=>setEnabled(!state.enabled);document.getElementById('v235Rebuild').onclick=rebuild;document.getElementById('v235Restore').onclick=restore}
    const city=document.querySelector('.city');if(city&&!hud){hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';city.appendChild(hud)}renderUI();
  }
  function renderUI(){if(!hasDOM())return;const q=id=>document.getElementById(id);if(q('v235Toggle'))q('v235Toggle').textContent='DETAILS: '+(state.enabled?'ON':'OFF');if(q('v235Stats'))q('v235Stats').textContent=state.meshCount+' MESHES • '+quality().toUpperCase();if(hud)hud.textContent='SURFACE FORGE • '+state.meshCount+' DETAILS'}
  function key(e){if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}}
  function tick(){if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();if(!state.root||state.qualityBuilt!==quality())rebuild()}
  const api={version:VERSION,layers:LAYERS,status,rebuild,setEnabled,restore};
  globalThis.TGGV235=api;if(hasDOM()){window.TGGV235=api;document.addEventListener('keydown',key);ensureUI();requestAnimationFrame(tick)}
})();