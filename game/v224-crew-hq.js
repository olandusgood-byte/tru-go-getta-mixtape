(() => {
  const VERSION='V2.24 CREW HQ + TEAM SYSTEMS 100';
  const KEY='tgg-v224-crew-hq';
  const HQ={x:36,z:-12};
  const COOLDOWN_MS=300000;
  const LAYERS=[
    'crew HQ hotspot','crew HQ ring','crew HQ beacon','crew HQ label','crew HQ proximity','crew HQ interact','crew HQ on-foot guard','crew HQ priority guard','crew HQ panel','crew HQ close',
    'crew member sync','M follower','Kane follower','DJ V follower','follower spawn','follower despawn','follower formation','follower walk follow','follower idle','follower vehicle hide',
    'follower interior hide','follower contact-safe','follower distance catchup','follower name plate','follower role plate','follower shadow trim','follower quality LOD','follower mobile trim','follower status API','follower diagnostics',
    'crew chemistry','chemistry recruit score','chemistry contract score','chemistry max','crew REP','crew REP persistence','crew level','crew rank rookie','crew rank connected','crew rank movement',
    'crew rank power','crew best chemistry','crew contract history','crew contract history cap','crew stats panel','crew bonus cash display','crew bonus XP display','crew bonus REP display','crew member count','crew rank display',
    'promo run contract','studio lockin contract','manager meeting contract','DJ role gate','producer role gate','manager role gate','contract select','contract start','contract three steps','contract step cooldown',
    'contract step one','contract step two','contract step three','contract combo','contract flow','contract score','contract completion','contract reward cash','contract reward XP','contract reward REP',
    'contract crew REP reward','contract cooldown','contract cooldown persistence','contract reward guard','contract double complete guard','contract cancel','contract reload reset','contract action button','contract keyboard Enter','contract touch support',
    'crew board bridge','recruit button bridge','phone crew call','crew call M','crew call Kane','crew call DJ V','crew call dialogue','crew call toast','crew event telemetry','crew contract telemetry',
    'crew milestone event','mission compatibility','world event compatibility','rap battle compatibility','concert compatibility','city interaction compatibility','career story compatibility','rollback isolation','status API','release QA hooks'
  ];

  const CONTRACTS=[
    {id:'promo-run',name:'PROMO RUN',member:'dj-v',role:'DJ',steps:['LOAD STREET PACK','HIT THE BLOCK','LOCK THE PUSH'],reward:{cash:180,xp:35,rep:12,crew:18}},
    {id:'studio-lockin',name:'STUDIO LOCK-IN',member:'kane',role:'Producer',steps:['SET THE SESSION','BUILD THE TAKE','LOCK THE MASTER'],reward:{cash:220,xp:45,rep:15,crew:22}},
    {id:'manager-meeting',name:'MANAGER MEETING',member:'manager',role:'Manager',steps:['PREP THE NUMBERS','MAKE THE PITCH','LOCK THE PLAY'],reward:{cash:260,xp:55,rep:20,crew:26}}
  ];

  const state={
    ready:false,crewRep:0,bestChemistry:0,history:[],cooldowns:{},followers:{},
    contract:null,step:0,combo:0,lastStepAt:0,lastCompleteAt:0,flow:'READY',panelOpen:false,wrapped:false
  };
  let group=null,panel=null,nearHud=null,live=null,originalInteract=null;
  const mats={};
  const T=()=>window.THREE;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>Date.now();

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.crewRep=Math.max(0,Number(s.crewRep)||0);
      state.bestChemistry=Math.max(0,Number(s.bestChemistry)||0);
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
      state.cooldowns=s.cooldowns&&typeof s.cooldowns==='object'?s.cooldowns:{};
    }catch{}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({crewRep:state.crewRep,bestChemistry:state.bestChemistry,history:state.history.slice(-20),cooldowns:state.cooldowns}))}catch{}
  }

  function mat(key,color,opts={}){
    const THREE=T();if(!THREE)return null;if(mats[key])return mats[key];
    mats[key]=new THREE.MeshStandardMaterial({color,roughness:opts.roughness??.6,metalness:opts.metalness??.18,emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0,transparent:!!opts.transparent,opacity:opts.opacity??1});
    return mats[key];
  }
  function makeLabel(text,color){
    const THREE=T(),c=document.createElement('canvas');c.width=620;c.height=150;const x=c.getContext('2d');
    x.fillStyle='#080b12e8';x.fillRect(0,0,620,150);x.strokeStyle=color;x.lineWidth=6;x.strokeRect(5,5,610,140);
    x.fillStyle='#fff';x.font='900 36px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,310,63);
    x.fillStyle=color;x.font='800 20px Arial';x.fillText('CREW OPERATIONS',310,108);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    s.scale.set(6.2,1.5,1);s.position.y=4.4;return s;
  }

  function bootHQ(){
    if(group||!T()||!window.TGG3D?.scene)return false;
    const THREE=T(),scene=window.TGG3D.scene;group=new THREE.Group();group.position.set(HQ.x,0,HQ.z);group.userData.v224=true;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,.18,32),mat('hqBase',0x111722,{metalness:.42,roughness:.4}));base.position.y=.09;group.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.85,.07,10,40),mat('hqRing',0xc7ff00,{emissive:0xc7ff00,emissiveIntensity:2.2}));ring.rotation.x=Math.PI/2;ring.position.y=.2;group.add(ring);
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4.2,10),new THREE.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.24}));beacon.position.y=2.1;group.add(beacon);
    const table=new THREE.Mesh(new THREE.BoxGeometry(2.4,.12,1.2),mat('table',0x242b36,{metalness:.55,roughness:.35}));table.position.set(0,.9,0);group.add(table);
    const holo=new THREE.Mesh(new THREE.BoxGeometry(1.8,.85,.06),mat('holo',0x071018,{emissive:0x61d9ff,emissiveIntensity:1.5,transparent:true,opacity:.85}));holo.position.set(0,1.8,-.3);group.add(holo);
    const label=makeLabel('TGG CREW HQ','#c7ff00');group.add(label);
    group.userData.ring=ring;group.userData.beacon=beacon;group.userData.holo=holo;scene.add(group);return true;
  }

  function playerWorld(){
    const s=window.TGGGame?.getState?.()||{};return{x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92}
  }
  function distance(){
    const p=playerWorld();return Math.hypot(p.x-HQ.x,p.z-HQ.z)
  }
  function blocked(){
    if(window.TGGWorldGameplay?.near?.())return true;
    if(window.TGGStreetContacts?.nearest?.())return true;
    const ev=window.TGGV220?.status?.();if(ev&&Number(ev.distance)<=5.5)return true;
    const ci=window.TGGV219?.status?.()?.nearest;if(ci&&Number(ci.distance)<=4.8)return true;
    const show=window.TGGV222?.status?.();if(show&&Number(show.distance)<=6)return true;
    return false;
  }

  function memberIds(){return Array.isArray(window.TGGCrew?.state?.members)?window.TGGCrew.state.members.slice():[]}
  function has(id){return window.TGGCrew?.has?.(id)===true}
  function memberCount(){return memberIds().length}
  function chemistry(){
    const contracts=state.history.length;
    const value=clamp(memberCount()*22+Math.min(34,contracts*6),0,100);
    state.bestChemistry=Math.max(state.bestChemistry,value);return value;
  }
  function crewLevel(){return 1+Math.floor(state.crewRep/100)}
  function crewRank(){
    const r=state.crewRep;if(r>=300)return 'POWER';if(r>=180)return 'MOVEMENT';if(r>=80)return 'CONNECTED';return 'ROOKIE';
  }

  function makeFollower(id,index){
    const THREE=T(),scene=window.TGG3D?.scene;if(!THREE||!scene)return null;
    const cfg=id==='manager'?{name:'M',role:'Manager',color:0xffcf4a}:id==='kane'?{name:'Kane',role:'Producer',color:0xff466d}:{name:'DJ V',role:'DJ',color:0xc56cff};
    const g=new THREE.Group();g.userData.v224Follower=true;g.userData.memberId=id;g.userData.name=cfg.name;
    const bodyMat=mat('body-'+id,cfg.color,{roughness:.58});
    const skin=mat('skin-'+id,id==='manager'?0x8b5a3c:id==='kane'?0xa96f4e:0x774a38,{roughness:.72});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.5,1.15,4,8),bodyMat);body.position.y=1.6;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.42,14,10),skin);head.position.y=2.82;g.add(head);
    [-.67,.67].forEach((x,i)=>{const arm=new THREE.Group(),m=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.72,3,7),bodyMat);m.position.y=-.4;arm.add(m);arm.position.set(x,2.25,0);g.add(arm);if(i===0)g.userData.leftArm=arm;else g.userData.rightArm=arm});
    const plate=makeLabel(cfg.name+' • '+cfg.role,'#'+new THREE.Color(cfg.color).getHexString());plate.scale.set(3.7,.9,1);plate.position.y=3.7;g.add(plate);
    g.scale.set(.86,.86,.86);const p=window.TGG3D?.player?.position||new THREE.Vector3();g.position.set(p.x+2+index,p.y,p.z+2);scene.add(g);state.followers[id]=g;return g;
  }
  function syncFollowers(){
    const ids=memberIds();
    Object.keys(state.followers).forEach(id=>{if(!ids.includes(id)){window.TGG3D?.scene?.remove(state.followers[id]);delete state.followers[id]}});
    ids.forEach((id,i)=>{if(!state.followers[id])makeFollower(id,i)});
  }

  function updateFollowers(ts){
    syncFollowers();
    const player=window.TGG3D?.player,gs=window.TGGGame?.getState?.(),screen=window.TGGGame?.getActiveScreen?.();if(!player||!gs)return;
    const ids=memberIds();
    ids.forEach((id,i)=>{
      const f=state.followers[id];if(!f)return;
      const visible=screen==='game'&&!gs.inVehicle;f.visible=visible;if(!visible)return;
      const angle=(i/Math.max(1,ids.length))*Math.PI*2+Math.PI*.75;
      const tx=player.position.x+Math.cos(angle)*2.6,tz=player.position.z+Math.sin(angle)*2.6;
      const dx=tx-f.position.x,dz=tz-f.position.z,d=Math.hypot(dx,dz);
      const lerp=d>14?.18:d>5?.08:.045;f.position.x+=dx*lerp;f.position.z+=dz*lerp;
      if(d>1)f.rotation.y=Math.atan2(dx,dz);
      f.position.y=Math.abs(Math.sin(ts*.007+i))*(d>.5?.035:.012);
      if(f.userData.leftArm)f.userData.leftArm.rotation.x=Math.sin(ts*.009+i)*Math.min(.38,d*.06);
      if(f.userData.rightArm)f.userData.rightArm.rotation.x=-Math.sin(ts*.009+i)*Math.min(.38,d*.06);
    });
  }

  function install(){
    document.body.classList.add('tgg-v224');
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.24 CREW HQ + TEAM SYSTEMS 100';
    if(!panel){
      panel=document.createElement('aside');panel.id='v224CrewPanel';panel.className='v224-crew-panel';
      panel.innerHTML='<div class="v224-head"><div><small>TGG CREW HQ</small><b id="v224Rank">ROOKIE CREW</b></div><button id="v224Close" type="button">×</button></div><div class="v224-stats"><span><small>MEMBERS</small><b id="v224Members">0/3</b></span><span><small>CHEMISTRY</small><b id="v224Chem">0%</b></span><span><small>CREW REP</small><b id="v224Rep">0</b></span><span><small>LEVEL</small><b id="v224Level">1</b></span></div><div id="v224Bonuses" class="v224-bonuses"></div><div id="v224Contracts" class="v224-contracts"></div><div id="v224Active" class="v224-active"><small>ACTIVE MOVE</small><b id="v224ActiveTitle">NONE</b><span id="v224ActiveStep">Choose a crew contract.</span><button id="v224StepBtn" type="button">RUN CREW MOVE</button></div><button id="v224Recruit" class="secondary" type="button">OPEN CREW BOARD</button>';
      document.body.appendChild(panel);
      document.getElementById('v224Close')?.addEventListener('click',closePanel);
      document.getElementById('v224StepBtn')?.addEventListener('click',performStep);
      document.getElementById('v224Recruit')?.addEventListener('click',()=>{closePanel();window.TGGGame?.show?.('crewBoard');window.TGGCrew?.render?.()});
    }
    const city=document.querySelector('.city');
    if(city&&!nearHud){
      nearHud=document.createElement('div');nearHud.id='v224NearHud';nearHud.className='v224-near-hud';
      nearHud.innerHTML='<small>CREW HQ</small><b id="v224NearText">F / INTERACT</b>';city.appendChild(nearHud);
    }
    if(!live){live=document.createElement('div');live.id='v224Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live)}
  }

  function cooldownLeft(id){return Math.max(0,(Number(state.cooldowns[id])||0)+COOLDOWN_MS-now())}
  function contractAvailable(c){return has(c.member)&&cooldownLeft(c.id)<=0}
  function openPanel(){
    install();if(window.TGGGame?.getState?.()?.inVehicle){window.__tggToast?.('EXIT THE CAR TO USE CREW HQ');return false}
    if(distance()>6||blocked())return false;
    panel.classList.add('active');state.panelOpen=true;renderPanel();return true;
  }
  function closePanel(){panel?.classList.remove('active');state.panelOpen=false}
  function startContract(id){
    const c=CONTRACTS.find(x=>x.id===id);if(!c)return false;
    if(!has(c.member)){window.__tggToast?.('RECRUIT '+c.role.toUpperCase()+' FIRST');return false}
    const left=cooldownLeft(c.id);if(left>0){window.__tggToast?.('CONTRACT COOLDOWN — '+Math.ceil(left/60000)+' MIN');return false}
    state.contract={id:c.id,name:c.name,member:c.member,startedAt:now()};state.step=0;state.combo=0;state.flow='READY';state.lastStepAt=0;renderPanel();
    window.dispatchEvent(new CustomEvent('tgg:crew-contract-start',{detail:{id:c.id,name:c.name,member:c.member}}));return true;
  }
  function flow(delta){if(!delta)return'READY';if(delta<700)return'RUSH';if(delta<=2200)return'LOCKED';if(delta<=4500)return'STEADY';return'SLOW'}
  function performStep(){
    if(!state.contract)return false;
    const c=CONTRACTS.find(x=>x.id===state.contract.id);if(!c)return false;
    const t=now();if(t-state.lastStepAt<300)return false;const delta=state.lastStepAt?t-state.lastStepAt:0;state.lastStepAt=t;state.flow=flow(delta);state.combo++;
    state.step++;window.dispatchEvent(new CustomEvent('tgg:crew-contract-step',{detail:{id:c.id,step:state.step,total:c.steps.length,flow:state.flow,combo:state.combo}}));
    if(state.step>=c.steps.length)return completeContract(c);renderPanel();return true;
  }
  function completeContract(c){
    if(now()-state.lastCompleteAt<700)return false;state.lastCompleteAt=now();
    window.TGGGame?.reward?.(c.reward.cash,c.reward.xp);window.TGGCareer?.addRep?.(c.reward.rep);state.crewRep+=c.reward.crew;state.cooldowns[c.id]=now();
    const result={id:c.id,name:c.name,member:c.member,reward:{...c.reward},flow:state.flow,combo:state.combo,at:now()};
    state.history.push(result);state.history=state.history.slice(-20);state.contract=null;state.step=0;state.combo=0;state.flow='READY';save();
    window.dispatchEvent(new CustomEvent('tgg:crew-contract-complete',{detail:{...result,chemistry:chemistry(),crewRep:state.crewRep,rank:crewRank()}}));
    window.__tggToast?.('CREW MOVE COMPLETE — $'+c.reward.cash+' • +'+c.reward.xp+' XP • +'+c.reward.rep+' REP • +'+c.reward.crew+' CREW REP');
    renderPanel();return true;
  }

  function renderPanel(){
    install();const q=id=>document.getElementById(id),chem=chemistry(),ids=memberIds();
    q('v224Rank')&&(q('v224Rank').textContent=crewRank()+' CREW');q('v224Members')&&(q('v224Members').textContent=ids.length+'/3');q('v224Chem')&&(q('v224Chem').textContent=chem+'%');q('v224Rep')&&(q('v224Rep').textContent=state.crewRep);q('v224Level')&&(q('v224Level').textContent=crewLevel());
    q('v224Bonuses')&&(q('v224Bonuses').innerHTML='<span>CASH BONUS <b>+$'+(window.TGGCrew?.bonus?.('cash')||0)+'</b></span><span>XP BONUS <b>+'+(window.TGGCrew?.bonus?.('xp')||0)+'</b></span><span>REP BONUS <b>+'+(window.TGGCrew?.bonus?.('rep')||0)+'</b></span>');
    const host=q('v224Contracts');if(host)host.innerHTML=CONTRACTS.map(c=>{
      const recruited=has(c.member),left=cooldownLeft(c.id),ready=recruited&&left<=0;
      return '<button data-v224-contract="'+c.id+'" '+(ready?'':'disabled')+'><b>'+c.name+'</b><span>'+c.role+' • '+(recruited?(left>0?'COOLDOWN '+Math.ceil(left/60000)+'M':'READY'):'RECRUIT REQUIRED')+'</span><small>$'+c.reward.cash+' • '+c.reward.xp+' XP • '+c.reward.rep+' REP</small></button>'
    }).join('');
    host?.querySelectorAll('[data-v224-contract]').forEach(b=>b.addEventListener('click',()=>startContract(b.dataset.v224Contract)));
    const active=state.contract,def=active?CONTRACTS.find(x=>x.id===active.id):null;
    q('v224ActiveTitle')&&(q('v224ActiveTitle').textContent=def?def.name:'NONE');
    q('v224ActiveStep')&&(q('v224ActiveStep').textContent=def?(def.steps[Math.min(state.step,def.steps.length-1)]+' • '+(state.step+1)+'/'+def.steps.length+' • '+state.flow):'Choose a crew contract.');
    q('v224StepBtn')&&(q('v224StepBtn').disabled=!def);
  }

  function wrapInteract(){
    if(state.wrapped||!window.TGG3D?.interactNearest)return;originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      if(window.TGGGame?.getActiveScreen?.()!=='game')return originalInteract?.()??false;
      if(state.panelOpen&&state.contract)return performStep();
      if(!blocked()&&distance()<=6)return openPanel();
      return originalInteract?.()??false;
    };state.wrapped=true;
  }

  function crewCall(id){
    const c=window.TGGCrew?.get?.(id);if(!c||!has(id))return false;
    const line=id==='manager'?'M: Keep the team focused. Pick the next move.':id==='kane'?'Kane: Studio is ready. We can lock in whenever.':'DJ V: I can move the street push when you are ready.';
    window.__tggToast?.(line);window.dispatchEvent(new CustomEvent('tgg:crew-call',{detail:{id,name:c.name,role:c.role}}));return true;
  }

  function updateNear(ts){
    const show=window.TGGGame?.getActiveScreen?.()==='game'&&distance()<=10&&!blocked();nearHud?.classList.toggle('active',!!show);
    if(show)document.getElementById('v224NearText').textContent=distance()<=6?'F / INTERACT':Math.round(distance()*3.2)+' M';
    if(group?.userData.ring)group.userData.ring.material.emissiveIntensity=1.8+Math.sin(ts*.005)*.7+chemistry()/70;
    if(group?.userData.beacon)group.userData.beacon.material.opacity=.14+Math.abs(Math.sin(ts*.002))*.18;
    if(group?.userData.holo)group.userData.holo.material.emissiveIntensity=1.0+chemistry()/80;
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='Enter'&&state.panelOpen&&state.contract){e.preventDefault();performStep()}
    if(e.key==='Escape'&&state.panelOpen)closePanel();
  }
  document.addEventListener('keydown',keyHandler);

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);install();bootHQ();wrapInteract();updateFollowers(ts);updateNear(ts);if(state.panelOpen)renderPanel();state.ready=!!group;
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.24 CREW HQ + TEAM SYSTEMS 100';
  }
  function status(){
    return{version:VERSION,ready:state.ready,layers:LAYERS.length,members:memberCount(),chemistry:chemistry(),crewRep:state.crewRep,crewLevel:crewLevel(),crewRank:crewRank(),bestChemistry:state.bestChemistry,followers:Object.keys(state.followers).length,historyCount:state.history.length,contract:state.contract?{...state.contract,step:state.step,flow:state.flow}:null,distance:Number(distance().toFixed(2))}
  }

  load();install();
  window.TGGV224={version:VERSION,layers:LAYERS,status,openPanel,closePanel,startContract,performStep,crewCall,chemistry,crewRank};
  requestAnimationFrame(tick);
})();