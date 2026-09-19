(() => {
  const VERSION='V2.25';
  const KEY='tgg-v225-rival-v1';
  const POS={x:50,y:76};
  const RADIUS=7.2;
  const TRACK_RADIUS=13;
  const COLORS={red:0xff466d,purple:0xc56cff,blue:0x61d9ff};
  let state={rival:null,tracked:false,panelOpen:false,lastEncounterAt:0};
  let group=null,panel=null,hud=null,wrapped=false,originalInteract=null,lastFrame=0;
  const T=()=>window.THREE;
  const core=()=>window.TGGV225Core;
  const now=()=>Date.now();

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.rival=core()?.createState(saved.rival||{})||null;
      state.tracked=!!saved.tracked;
      state.lastEncounterAt=Math.max(0,Number(saved.lastEncounterAt)||0);
    }catch{}
    if(!state.rival)state.rival=core()?.createState?.()||{rivalry:25,respect:10,alliance:0,encounters:0,wins:0,lastChoice:null,route:'UNDECIDED',history:[]};
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({rival:state.rival,tracked:state.tracked,lastEncounterAt:state.lastEncounterAt}))}catch{}
    return state;
  }
  function game(){return window.TGGGame?.getState?.()||{x:50,y:55,inVehicle:false}}
  function crewStrength(){
    const members=window.TGGCrew?.state?.members;
    const total=Math.max(1,Number(window.TGGCrew?.catalog?.length)||3);
    return Math.round((Array.isArray(members)?members.length:0)/total*100);
  }
  function worldPos(){return{x:(POS.x-50)*.92,z:(POS.y-50)*.92}}
  function playerWorld(){const s=game();return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92}}
  function distance(){
    const p=playerWorld(),w=worldPos();
    return Math.hypot(p.x-w.x,p.z-w.z);
  }
  function tier(){return core()?.tier?.(state.rival)||'WATCHING'}
  function blockedByPriority(){
    const sw=window.TGGStoryWorld3D?.getStatus?.();
    if(sw?.near&&sw?.target)return true;
    if(window.TGGSocialSchedule?.near?.())return true;
    return false;
  }
  function navigationTarget(){
    if(!state.tracked)return null;
    return {
      label:'RIVAL CREW • NIGHT SHIFT',x:POS.x,y:POS.y,radius:RADIUS,color:'#ff466d',
      rival:true,arrived:distance()<=RADIUS
    };
  }

  function mat(key,color,opts={}){
    const THREE=T();state._m=state._m||{};
    if(state._m[key])return state._m[key];
    return state._m[key]=new THREE.MeshStandardMaterial({
      color,roughness:opts.roughness??.58,metalness:opts.metalness??.18,
      emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,
      transparent:!!opts.transparent,opacity:opts.opacity??1
    });
  }
  function sprite(text,color='#ff466d'){
    const THREE=T(),c=document.createElement('canvas');c.width=640;c.height=150;const x=c.getContext('2d');
    x.fillStyle='#070a10ec';x.fillRect(0,0,640,150);x.strokeStyle=color;x.lineWidth=6;x.strokeRect(5,5,630,140);
    x.fillStyle='#fff';x.font='900 34px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,320,58);
    x.fillStyle=color;x.font='800 18px Arial';x.fillText('NIGHT SHIFT • RIVAL CREW',320,108);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));
    s.scale.set(7.2,1.7,1);return s;
  }
  function person(name,role,color,x,z,skin){
    const THREE=T(),g=new THREE.Group(),bodyMat=mat('body-'+name,color,{roughness:.52}),dark=mat('dark',0x090c12,{roughness:.72}),skinMat=mat('skin-'+name,skin,{roughness:.74});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.54,1.2,4,8),bodyMat);body.position.y=1.66;body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.44,14,10),skinMat);head.position.y=2.94;head.castShadow=true;g.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.46,12,8,0,Math.PI*2,0,Math.PI*.48),dark);hair.position.y=3.08;g.add(hair);
    [-.66,.66].forEach((ax,i)=>{const arm=new THREE.Group(),m=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.76,3,7),bodyMat);m.position.y=-.42;arm.add(m);arm.position.set(ax,2.3,0);g.add(arm);g.userData[i?'rightArm':'leftArm']=arm});
    [-.25,.25].forEach(ax=>{const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.86,3,7),dark);leg.position.set(ax,.62,0);g.add(leg)});
    const plate=sprite(name+' • '+role,'#'+new THREE.Color(color).getHexString());plate.scale.set(3.7,.88,1);plate.position.y=4.0;g.add(plate);
    g.position.set(x,0,z);g.userData.name=name;g.userData.role=role;return g;
  }
  function boot3d(){
    if(group||!T()||!window.TGG3D?.scene)return false;
    const THREE=T(),scene=window.TGG3D.scene,w=worldPos();
    group=new THREE.Group();group.position.set(w.x,0,w.z);group.userData.v225=true;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,.15,40),mat('base',0x12151d,{metalness:.4,roughness:.42}));base.position.y=.075;group.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.15,.085,10,48),mat('ring',COLORS.red,{emissive:COLORS.red,emissiveIntensity:2.3}));ring.rotation.x=Math.PI/2;ring.position.y=.18;group.add(ring);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,5.8,12),new THREE.MeshBasicMaterial({color:COLORS.red,transparent:true,opacity:.18}));beam.position.y=2.9;group.add(beam);
    const banner=sprite('ROOK • NYX • ACE','#ff466d');banner.position.y=5.35;group.add(banner);
    const rivals=[
      person('ROOK','LEADER',COLORS.red,-1.25,.28,0x82523a),
      person('NYX','PRODUCER',COLORS.purple,0,.62,0xa66f4c),
      person('ACE','HYPE',COLORS.blue,1.25,.28,0x6f4534)
    ];
    rivals.forEach(r=>group.add(r));
    const glow=new THREE.PointLight(COLORS.red,3.5,11,2);glow.position.y=2.8;group.add(glow);
    group.userData.ring=ring;group.userData.beam=beam;group.userData.rivals=rivals;group.userData.glow=glow;
    scene.add(group);return true;
  }

  function ensureUi(){
    document.body.classList.add('tgg-v225');
    let btn=document.getElementById('rivalCrewBtn');
    if(!btn){
      const anchor=document.getElementById('eventsBtn')||document.querySelector('.actions button:last-child');
      btn=document.createElement('button');btn.id='rivalCrewBtn';btn.className='action-primary';btn.textContent='RIVAL CREW';
      anchor?.parentNode?.insertBefore(btn,anchor.nextSibling);
      btn.addEventListener('click',()=>{state.tracked=true;save();window.__tggToast?.('RIVAL CREW TRACKED — NIGHT SHIFT');window.TGGGame?.show?.('game')});
    }
    if(!hud){
      const city=document.querySelector('#game .city');
      if(city){hud=document.createElement('div');hud.id='v225RivalHud';hud.className='v225-rival-hud';hud.innerHTML='<small>RIVAL CREW</small><b>NIGHT SHIFT</b><span id="v225HudInfo">WATCHING</span>';city.appendChild(hud)}
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v225RivalPanel';panel.className='v225-rival-panel';
      panel.innerHTML='<div class="v225-head"><div><small>V2.25 • NIGHT SHIFT</small><b id="v225Tier">WATCHING</b><span id="v225Route">UNDECIDED</span></div><button id="v225Close" type="button">×</button></div><div class="v225-dialogue"><span>R</span><p id="v225Dialogue"></p></div><div class="v225-meters"><label>RIVALRY <b id="v225RivalryText">25%</b><i><em id="v225RivalryFill"></em></i></label><label>RESPECT <b id="v225RespectText">10%</b><i><em id="v225RespectFill"></em></i></label><label>ALLIANCE <b id="v225AllianceText">0%</b><i><em id="v225AllianceFill"></em></i></label><label>YOUR CREW <b id="v225CrewText">0%</b><i><em id="v225CrewFill"></em></i></label></div><div class="v225-choices"><button data-v225-choice="respect"><b>RESPECT</b><span>De-escalate • build respect • +REP</span></button><button data-v225-choice="compete"><b>COMPETE</b><span>Raise the rivalry • cash + XP</span></button><button data-v225-choice="collab"><b>COLLAB</b><span>Requires 67% crew strength, 70 respect, or 50 alliance</span></button></div><div class="v225-foot"><span id="v225History">NO CHOICE YET</span><button id="v225Track" type="button">TRACK CREW</button></div>';
      document.body.appendChild(panel);
      document.getElementById('v225Close')?.addEventListener('click',close);
      document.getElementById('v225Track')?.addEventListener('click',()=>{state.tracked=true;save();close();window.__tggToast?.('NIGHT SHIFT TRACKED')});
      panel.querySelectorAll('[data-v225-choice]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.v225Choice)));
    }
  }
  const DIALOGUE={
    WATCHING:'Rook: We see you moving. The city still deciding what your name means.',
    RIVALS:'Rook: Every room is a scoreboard now. Bring your best every time.',
    RESPECTED:'Rook: You move clean. Competition can stay business.',
    ALLIES:'Rook: Different crews, same city. We can make money together.'
  };
  function render(){
    ensureUi();const r=state.rival,t=tier(),strength=crewStrength(),near=distance()<=TRACK_RADIUS;
    const q=id=>document.getElementById(id);
    q('v225Tier')&&(q('v225Tier').textContent=t);
    q('v225Route')&&(q('v225Route').textContent=r.route||'UNDECIDED');
    q('v225Dialogue')&&(q('v225Dialogue').textContent=DIALOGUE[t]||DIALOGUE.WATCHING);
    [['Rivalry',r.rivalry],['Respect',r.respect],['Alliance',r.alliance],['Crew',strength]].forEach(([name,val])=>{q('v225'+name+'Text')&&(q('v225'+name+'Text').textContent=Math.round(val)+'%');q('v225'+name+'Fill')&&(q('v225'+name+'Fill').style.width=Math.round(val)+'%')});
    const collab=panel?.querySelector('[data-v225-choice="collab"]');if(collab)collab.disabled=!core()?.canCollaborate?.(r,{crewStrength:strength});
    q('v225History')&&(q('v225History').textContent=r.lastChoice?('LAST MOVE • '+r.lastChoice.toUpperCase()+' • '+t):'NO CHOICE YET');
    panel&&(panel.dataset.tier=t.toLowerCase());
    const active=window.TGGGame?.getActiveScreen?.()==='game'&&near&&!blockedByPriority();
    hud?.classList.toggle('active',active);
    if(active&&q('v225HudInfo'))q('v225HudInfo').textContent=t+' • '+(distance()<=RADIUS?'INTERACT':Math.round(distance()*3.2)+' M');
  }
  function open(){
    ensureUi();
    if(window.TGGGame?.getActiveScreen?.()!=='game')return false;
    if(game().inVehicle){window.__tggToast?.('EXIT THE CAR TO FACE NIGHT SHIFT');return false}
    if(blockedByPriority())return false;
    if(distance()>RADIUS){state.tracked=true;save();window.__tggToast?.('FOLLOW NAV — NIGHT SHIFT');return false}
    state.panelOpen=true;panel.classList.add('active');render();return true;
  }
  function close(){state.panelOpen=false;panel?.classList.remove('active')}
  function choose(choice){
    if(!state.panelOpen)return false;
    const strength=crewStrength(),before=tier();
    const next=core()?.applyChoice?.(state.rival,choice,{crewStrength:strength});
    if(!next){window.__tggToast?.('COLLAB LOCKED — BUILD YOUR CREW OR THEIR RESPECT');return false}
    state.rival=core().createState(next);state.lastEncounterAt=now();state.tracked=false;
    window.TGGLifeOS?.advance?.(30,true);
    if(choice==='respect')window.TGGLifeOS?.adjustRelationship?.('friend',2,'Handled rival pressure with respect');
    if(choice==='collab')window.TGGLifeOS?.adjustRelationship?.('manager',2,'Turned rivalry into business');
    if(next.rewards?.cash||next.rewards?.xp)window.TGGGame?.reward?.(next.rewards.cash||0,next.rewards.xp||0);
    if(next.rewards?.rep)window.TGGCareer?.addRep?.(next.rewards.rep);
    save();render();
    const after=tier(),reward=[next.rewards.cash?'+$'+next.rewards.cash:'',next.rewards.xp?'+'+next.rewards.xp+' XP':'',next.rewards.rep?'+'+next.rewards.rep+' REP':''].filter(Boolean).join(' • ');
    window.__tggToast?.('NIGHT SHIFT • '+choice.toUpperCase()+(reward?' • '+reward:''));
    window.dispatchEvent(new CustomEvent('tgg:v225-choice',{detail:{choice,before,after,route:state.rival.route,rewards:next.rewards}}));
    close();return true;
  }
  function wrapInteract(){
    if(wrapped||!window.TGG3D?.interactNearest)return;
    originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(window.TGGGame?.getActiveScreen?.()==='game'&&!blockedByPriority()&&distance()<=RADIUS)return open();
      return originalInteract?.()??false;
    };
    wrapped=true;
  }
  function animate(ts){
    requestAnimationFrame(animate);
    ensureUi();boot3d();wrapInteract();render();
    if(!group)return;
    const t=tier(),near=distance()<=TRACK_RADIUS;
    group.userData.ring.material.emissiveIntensity=(t==='RIVALS'?3.4:t==='ALLIES'?2.8:2.2)+(near?Math.sin(ts*.008)*.45:0);
    group.userData.beam.material.opacity=.12+Math.abs(Math.sin(ts*.0024))*.16;
    group.userData.glow.intensity=near?5:2.8;
    group.userData.rivals.forEach((r,i)=>{
      r.rotation.y=Math.sin(ts*.0008+i)*.12;
      r.position.y=Math.abs(Math.sin(ts*.004+i))*.02;
      if(r.userData.leftArm)r.userData.leftArm.rotation.x=Math.sin(ts*.006+i)*.22;
      if(r.userData.rightArm)r.userData.rightArm.rotation.x=-Math.sin(ts*.006+i)*.22;
    });
    lastFrame=ts;
  }
  function status(){
    const r=state.rival||core()?.createState?.();
    return {
      version:VERSION,ready:!!group&&!!core(),crew:'NIGHT SHIFT',tier:tier(),route:r?.route||'UNDECIDED',
      rivalry:Number(r?.rivalry||0),respect:Number(r?.respect||0),alliance:Number(r?.alliance||0),
      encounters:Number(r?.encounters||0),wins:Number(r?.wins||0),lastChoice:r?.lastChoice||null,
      crewStrength:crewStrength(),distance:Number(distance().toFixed(2)),tracked:state.tracked,panelOpen:state.panelOpen,
      target:{...POS}
    };
  }

  load();ensureUi();
  window.TGGV225={version:VERSION,status,open,close,choose,navigationTarget,distance,crewStrength,tier};
  requestAnimationFrame(animate);
})();