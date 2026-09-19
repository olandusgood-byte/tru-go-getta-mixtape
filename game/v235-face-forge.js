(() => {
  const VERSION='V2.35 TGG FACE + EXPRESSION FORGE 100';
  const LAYERS=[
    'face core bridge','face enabled state','face expression state','face manual state','face manual expiry','face native rig guard','face node discovery','face baseline cache','face restore path','face status API',
    'neutral expression','focus expression','happy expression','angry expression','rap expression','expression blend','expression transition','expression persistence','expression event','expression diagnostics',
    'left eye node','right eye node','left pupil node','right pupil node','left brow node','right brow node','jaw node','mouth node','head node','face node refresh',
    'blink timer','blink phase','blink close','blink open','blink rate','blink randomization','blink reduced motion','blink vehicle guard','blink interior compatibility','blink diagnostics',
    'eye squint','left eye squint','right eye squint','pupil horizontal focus','pupil vertical focus','camera focus target','eye focus clamp','eye focus smoothing','eye reset','eye diagnostics',
    'brow lift','brow furrow','left brow mirror','right brow mirror','brow rotation','brow height','brow blend','brow reset','brow emotion bridge','brow diagnostics',
    'jaw open','jaw talk pulse','jaw rap pulse','jaw performance pulse','jaw clamp','jaw smoothing','jaw reset','mouth curve','mouth width','mouth vertical motion',
    'mouth talk pulse','mouth rap pulse','mouth happy curve','mouth angry curve','mouth neutral reset','head camera follow','head follow clamp','head follow smoothing','head nod bridge','head reset',
    'animation forge bridge','talk clip bridge','phone clip bridge','rap clip bridge','perform clip bridge','rival emotion bridge','mission dialogue bridge','concert emotion bridge','manual expression UI','manual expression duration',
    'face HUD','face panel','expression buttons','enabled toggle','restore button','F10 shortcut','mobile panel','landscape panel','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,expression:'neutral',manual:null,manualUntil:0,nodes:null,rootHead:null,
    baseline:new Map(),blinkPhase:0,nextBlinkAt:0,blinkAmount:0,ready:false,frames:0,lastTs:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-face-forge',layerCount:LAYERS.length,
      enabled:state.enabled,expression:state.expression,manual:state.manual,blink:Number(state.blinkAmount.toFixed(3)),
      nodesReady:!!state.nodes,frames:state.frames
    };
  }

  function player(){
    return hasDOM()?window.TGG3D?.player||null:null;
  }

  function captureNode(node){
    if(!node||state.baseline.has(node))return;
    state.baseline.set(node,{
      position:node.position?.clone?.()||null,
      rotation:node.rotation?{x:node.rotation.x,y:node.rotation.y,z:node.rotation.z}:null,
      scale:node.scale?.clone?.()||null
    });
  }

  function findNodes(){
    if(!hasDOM())return null;
    const parts=player()?.userData?.parts;
    const head=parts?.head;
    if(!head)return null;
    if(state.rootHead===head&&state.nodes)return state.nodes;
    const get=n=>head.getObjectByName?.(n)||null;
    state.rootHead=head;
    state.nodes={
      head,
      jaw:get('jaw'),
      mouth:get('mouth'),
      eyeL:get('eye-l'),eyeR:get('eye-r'),
      pupilL:get('pupil-l'),pupilR:get('pupil-r'),
      browL:get('brow-l'),browR:get('brow-r')
    };
    Object.values(state.nodes).forEach(captureNode);
    state.ready=!!(state.nodes.jaw&&state.nodes.mouth&&state.nodes.eyeL&&state.nodes.eyeR);
    return state.nodes;
  }

  function restoreNode(node){
    const b=state.baseline.get(node);if(!node||!b)return;
    if(b.position&&node.position?.copy)node.position.copy(b.position);
    if(b.scale&&node.scale?.copy)node.scale.copy(b.scale);
    if(b.rotation&&node.rotation){
      node.rotation.x=b.rotation.x;node.rotation.y=b.rotation.y;node.rotation.z=b.rotation.z;
    }
  }

  function restore(){
    for(const node of state.baseline.keys())restoreNode(node);
    state.enabled=false;state.manual=null;state.manualUntil=0;state.expression='neutral';
    state.blinkAmount=0;renderUI();return status();
  }

  function setEnabled(v){
    state.enabled=!!v;
    if(!state.enabled){
      for(const node of state.baseline.keys())restoreNode(node);
      state.blinkAmount=0;
    }
    renderUI();return state.enabled;
  }

  function applyExpression(name='neutral',duration=0){
    const valid=core()?.expressions?.includes(name)?name:'neutral';
    state.expression=valid;
    if(duration>0){
      state.manual=valid;
      state.manualUntil=Date.now()+clamp(Number(duration)||1800,250,12000);
    }else{
      state.manual=null;state.manualUntil=0;
    }
    if(hasDOM()){
      renderUI();
      window.dispatchEvent(new CustomEvent('tgg:face-expression',{detail:{expression:valid,duration:Number(duration)||0}}));
    }
    return status();
  }

  function automaticExpression(){
    if(state.manual&&Date.now()<state.manualUntil)return state.manual;
    if(state.manual&&Date.now()>=state.manualUntil){state.manual=null;state.manualUntil=0}
    const anim=hasDOM()?window.TGGV232?.status?.():null;
    const clip=anim?.current;
    if(clip==='rap')return'rap';
    if(clip==='perform')return'happy';
    if(clip==='talk'||clip==='phone')return'focus';
    return state.expression||'neutral';
  }

  function scheduleBlink(now){
    const e=core()?.expression?.(automaticExpression())||core()?.expression?.('neutral');
    if(!state.nextBlinkAt)state.nextBlinkAt=now+1800/e.blinkRate+Math.random()*1700;
    if(now>=state.nextBlinkAt&&state.blinkPhase===0){
      state.blinkPhase=1;
      state.nextBlinkAt=now+1900/e.blinkRate+Math.random()*2200;
    }
  }

  function updateBlink(dt){
    if(state.blinkPhase===1){
      state.blinkAmount=Math.min(1,state.blinkAmount+dt*15);
      if(state.blinkAmount>=.98)state.blinkPhase=2;
    }else if(state.blinkPhase===2){
      state.blinkAmount=Math.max(0,state.blinkAmount-dt*12);
      if(state.blinkAmount<=.02){state.blinkAmount=0;state.blinkPhase=0}
    }
  }

  function cameraFocus(){
    if(!hasDOM())return{x:0,y:0};
    const cam=window.TGG3D?.camera,p=player();
    if(!cam||!p)return{x:0,y:0};
    const dx=cam.position.x-p.position.x,dz=cam.position.z-p.position.z;
    const angle=Math.atan2(dx,dz)-p.rotation.y;
    return{x:clamp(Math.sin(angle),-1,1),y:clamp((cam.position.y-2.5)/18,-.45,.45)};
  }

  function animateFace(ts,dt){
    if(!state.enabled)return;
    const n=findNodes();if(!n)return;
    const exprName=automaticExpression();
    if(!state.manual&&exprName!==state.expression&&['rap','happy','focus'].includes(exprName))state.expression=exprName;
    const e=core()?.expression?.(exprName)||core()?.expression?.('neutral');
    const motion=reducedMotion()?.45:1;
    scheduleBlink(Date.now());updateBlink(dt);

    const blink=clamp(state.blinkAmount+e.eyeSquint*(1-state.blinkAmount),0,.96);
    const eyeY=Math.max(.08,1-blink*.88);
    [n.eyeL,n.eyeR].filter(Boolean).forEach(eye=>{
      const b=state.baseline.get(eye);
      if(b?.scale)eye.scale.y=lerp(eye.scale.y,b.scale.y*eyeY,.48);
    });
    [n.pupilL,n.pupilR].filter(Boolean).forEach(pupil=>{
      const b=state.baseline.get(pupil);if(!b?.position)return;
      const f=cameraFocus();
      pupil.position.x=lerp(pupil.position.x,b.position.x+f.x*.018*e.headFollow,.28);
      pupil.position.y=lerp(pupil.position.y,b.position.y+f.y*.014*e.headFollow,.28);
      if(b.scale)pupil.scale.y=lerp(pupil.scale.y,b.scale.y*eyeY,.5);
    });

    if(n.browL&&n.browR){
      const bl=state.baseline.get(n.browL),br=state.baseline.get(n.browR);
      if(bl?.position)n.browL.position.y=lerp(n.browL.position.y,bl.position.y+e.brow*.035,.24);
      if(br?.position)n.browR.position.y=lerp(n.browR.position.y,br.position.y+e.brow*.035,.24);
      if(bl?.rotation)n.browL.rotation.z=lerp(n.browL.rotation.z,bl.rotation.z-e.brow*.18,.25);
      if(br?.rotation)n.browR.rotation.z=lerp(n.browR.rotation.z,br.rotation.z+e.brow*.18,.25);
    }

    const anim=hasDOM()?window.TGGV232?.status?.():null;
    const vocal=anim?.current==='rap'||anim?.current==='talk'||anim?.current==='perform';
    const pulse=vocal?(Math.sin(ts*.014)+1)*.5:0;
    const jawAmount=clamp(e.jawOpen+(vocal?pulse*.38:0),0,1);
    if(n.jaw){
      const b=state.baseline.get(n.jaw);
      if(b?.position)n.jaw.position.y=lerp(n.jaw.position.y,b.position.y-jawAmount*.085*motion,.38);
      if(b?.rotation)n.jaw.rotation.x=lerp(n.jaw.rotation.x,b.rotation.x+jawAmount*.14*motion,.38);
    }

    if(n.mouth){
      const b=state.baseline.get(n.mouth);
      if(b?.scale){
        n.mouth.scale.x=lerp(n.mouth.scale.x,b.scale.x*(1+Math.abs(e.mouthCurve)*.18+pulse*.06),.3);
        n.mouth.scale.y=lerp(n.mouth.scale.y,b.scale.y*(1+jawAmount*.55),.35);
      }
      if(b?.position)n.mouth.position.y=lerp(n.mouth.position.y,b.position.y+e.mouthCurve*.028-jawAmount*.012,.28);
      if(b?.rotation)n.mouth.rotation.z=lerp(n.mouth.rotation.z,b.rotation.z-e.mouthCurve*.08,.26);
    }

    if(n.head){
      const f=cameraFocus();
      const targetY=f.x*e.headFollow*.18*motion;
      const targetX=-f.y*e.headFollow*.1*motion+(vocal?Math.sin(ts*.01)*.035:0);
      n.head.rotation.y=lerp(n.head.rotation.y,targetY,.08);
      n.head.rotation.x=lerp(n.head.rotation.x,targetX,.08);
    }
    state.frames++;
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:rival-choice',e=>{
      const choice=String(e.detail?.choice||'').toLowerCase();
      applyExpression(choice==='compete'?'angry':choice==='collab'?'happy':'focus',2200);
    });
    window.addEventListener('tgg:mission-dialogue',()=>applyExpression('focus',2200));
    window.addEventListener('tgg:rap-battle-start',()=>applyExpression('rap',5200));
    window.addEventListener('tgg:concert-start',()=>applyExpression('happy',6500));
    window.addEventListener('tgg:mission-complete',()=>applyExpression('happy',2600));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='FACE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>FACE + EXPRESSION</b></div><button id="v235Close" type="button">×</button></div><div class="v235-expressions"><button data-v235-exp="neutral">NEUTRAL</button><button data-v235-exp="focus">FOCUS</button><button data-v235-exp="happy">HAPPY</button><button data-v235-exp="angry">ANGRY</button><button data-v235-exp="rap">RAP</button></div><div class="v235-actions"><button id="v235Toggle" type="button">FACE FORGE: ON</button><button id="v235Restore" type="button">RESTORE BASE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-exp]').forEach(b=>b.addEventListener('click',()=>applyExpression(b.dataset.v235Exp,2600)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG FACE FORGE</small><b id="v235HudExpression">NEUTRAL</b><span id="v235HudState">AUTO EXPRESSION</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='FACE FORGE: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=automaticExpression().toUpperCase()+' • '+(state.nodes?'FACE NODES READY':'WAITING FOR NATIVE FACE');
    if(q('v235HudExpression'))q('v235HudExpression').textContent=automaticExpression().toUpperCase();
    if(q('v235HudState'))q('v235HudState').textContent=state.manual?'MANUAL EXPRESSION':'AUTO EXPRESSION';
    panel?.querySelectorAll('[data-v235-exp]').forEach(b=>b.classList.toggle('active',b.dataset.v235Exp===automaticExpression()));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const dt=Math.min(.05,Math.max(.001,state.lastTs?(ts-state.lastTs)/1000:.016));state.lastTs=ts;
    if(window.TGGGame?.getState?.()?.inVehicle){renderUI();return}
    animateFace(ts,dt);renderUI();
  }

  const api={version:VERSION,layers:LAYERS,expressions:['neutral','focus','happy','angry','rap'],status,applyExpression,setEnabled,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){
    window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();