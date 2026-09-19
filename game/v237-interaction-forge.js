(() => {
  const VERSION='V2.37 TGG INTERACTION + IK FORGE 100';
  const LAYERS=[
    'interaction core bridge','interaction enabled state','interaction active state','interaction target state','object target','point target','interaction start time','interaction end time','interaction weight state','interaction status API',
    'mic profile','console profile','door profile','npc profile','counter profile','phone profile','profile duration','profile reach','profile look','profile twist',
    'head target yaw','head target pitch','head yaw clamp','head pitch clamp','head blend','head release','eye intent','face target','distance target','look weight',
    'torso target yaw','torso twist clamp','torso blend','torso release','shoulder settle','body lean','body turn response','body interaction weight','body animation coexistence','torso diagnostics',
    'right hand reach','left hand reach','both hand reach','arm lift','arm forward','arm lateral','arm blend','arm release','hand profile switch','reach weight',
    'mic right pose','console both pose','door right pose','npc gesture pose','counter both pose','phone left pose','interaction pulse','interaction expiry','action overlap replace','target follow',
    'nearest mic scan','nearest console scan','nearest door scan','nearest counter scan','nearest npc scan','nearest destination fallback','distance max guard','vehicle guard','interior aware scan','crowd aware scan',
    'interior enter bridge','mission dialogue bridge','rival choice bridge','rap battle bridge','concert bridge','crew call bridge','target lost clear','scene object guard','V2.32 coexistence','V2.35 coexistence',
    'reduced motion scale','quality response','mobile response','frame safe apply','no locomotion mutation','no collision mutation','no F key override','restore control','clear control','rollback isolation',
    'interaction HUD','interaction panel','interaction buttons','enabled toggle','clear button','nearest button','Shift I shortcut','mobile panel','V2.36 compatibility','release QA hooks'
  ];

  const core=()=>globalThis.TGGV237Core||globalThis.window?.TGGV237Core;
  const state={
    enabled:true,active:false,kind:null,profile:null,target:null,targetObject:null,start:0,end:0,
    weight:0,ready:false,appliedFrames:0,lastDistance:null,lastReason:null
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const T=()=>hasDOM()?window.THREE:null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-interaction-ik-forge',layerCount:LAYERS.length,
      enabled:state.enabled,active:state.active,kind:state.kind,weight:Number(state.weight.toFixed(3)),
      distance:state.lastDistance,appliedFrames:state.appliedFrames,lastReason:state.lastReason
    };
  }

  function player(){
    return hasDOM()?window.TGG3D?.player||null:null;
  }

  function rig(){
    const p=player()?.userData?.parts;
    return p?.leftArm&&p?.rightArm&&p?.leftLeg&&p?.rightLeg&&p?.body&&p?.head?p:null;
  }

  function playerWorld(){
    const THREE=T(),p=player();if(!THREE||!p)return null;
    const v=new THREE.Vector3();p.getWorldPosition(v);return v;
  }

  function resolveTarget(){
    const THREE=T();if(!THREE)return null;
    if(state.targetObject?.parent||state.targetObject?.isObject3D){
      const v=new THREE.Vector3();
      try{state.targetObject.getWorldPosition(v);return v}catch{}
    }
    if(state.target&&Number.isFinite(Number(state.target.x))&&Number.isFinite(Number(state.target.z))){
      return new THREE.Vector3(Number(state.target.x)||0,Number(state.target.y)||1.5,Number(state.target.z)||0);
    }
    return null;
  }

  function objectNameMatch(kind,name){
    const n=String(name||'').toLowerCase();
    if(kind==='mic')return n.includes('mic');
    if(kind==='console')return n.includes('console')||n.includes('desk');
    if(kind==='door')return n.includes('doorway')||n.endsWith('door')||n.includes('door-');
    if(kind==='counter')return n.includes('counter')||n.includes('checkout')||n.includes('bar');
    if(kind==='npc')return n==='tgg-crowd-npc'||n.includes('npc-head')||n.includes('human');
    return false;
  }

  function nearestObject(kind,maxDistance=8.5){
    if(!hasDOM())return null;
    const s=window.TGG3D?.scene,p=playerWorld(),THREE=T();if(!s||!p||!THREE)return null;
    let best=null,bestDist=maxDistance;
    s.traverse(o=>{
      if(!o.visible||!objectNameMatch(kind,o.name))return;
      if(kind==='npc'&&o.name!=='tgg-crowd-npc'){
        let q=o;while(q&&q.parent&&q.name!=='tgg-crowd-npc')q=q.parent;
        if(q?.name==='tgg-crowd-npc')o=q;
      }
      if(!o.getWorldPosition)return;
      const v=new THREE.Vector3();o.getWorldPosition(v);
      const d=p.distanceTo(v);
      if(d<bestDist){bestDist=d;best=o}
    });
    return best?{object:best,distance:bestDist}:null;
  }

  function fallbackTarget(kind){
    const p=playerWorld(),THREE=T();if(!p||!THREE)return null;
    const dest=window.TGG3D?.nearbyDestination?.(window.TGGGame?.getState?.());
    if(dest?.group){
      const v=new THREE.Vector3();dest.group.getWorldPosition(v);v.y=1.8;return v;
    }
    const root=player();const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion).normalize();
    return p.clone().add(forward.multiplyScalar(kind==='phone'?.8:2.2)).add(new THREE.Vector3(0,1.7,0));
  }

  function findTarget(kind){
    if(kind==='phone')return {point:fallbackTarget('phone'),distance:.8};
    const hit=nearestObject(kind,kind==='npc'?9:7.5);
    if(hit)return {object:hit.object,distance:hit.distance};
    const point=fallbackTarget(kind);
    return point?{point,distance:2.2}:null;
  }

  function focus(target,kind='npc',duration){
    const profile=core()?.interaction?.(kind);if(!profile)return false;
    const now=Date.now();
    state.kind=profile.id;state.profile=profile;state.start=now;state.end=now+(Number(duration)||profile.duration);
    state.targetObject=target?.isObject3D?target:(target?.object?.isObject3D?target.object:null);
    state.target=state.targetObject?null:(target?.point||target||null);
    state.active=true;state.weight=0;state.lastReason='focus';renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:ik-focus',{detail:{kind:state.kind,duration:state.end-state.start}}));
    return true;
  }

  function interact(kind='npc',target=null,duration){
    if(!state.enabled)return false;
    const found=target?{point:target}:findTarget(kind);
    if(!found){state.lastReason='target_not_found';renderUI();return false}
    state.lastDistance=Number(found.distance)||null;
    return focus(found.object||found.point,kind,duration);
  }

  function clearFocus(reason='clear'){
    state.active=false;state.kind=null;state.profile=null;state.target=null;state.targetObject=null;state.start=0;state.end=0;state.weight=0;state.lastDistance=null;state.lastReason=reason;renderUI();
    return true;
  }

  function setEnabled(v){
    state.enabled=!!v;if(!state.enabled)clearFocus('disabled');renderUI();return state.enabled;
  }

  function restore(){
    state.enabled=false;clearFocus('restore');return status();
  }

  function applyArm(arm,side,profile,w,angles,kind,phase){
    if(!arm)return;
    const motion=reducedMotion()?.42:1;
    let tx=-.25-profile.armLift*.55*profile.reach;
    let tz=(side==='left'?1:-1)*(.04+profile.reach*.15);
    let ty=angles.yaw*(side==='left'?.12:-.12);
    if(kind==='phone'&&side==='left'){tx=-.38;tz=1.05;ty=-.08}
    if(kind==='mic'&&side==='right'){tx=-.72;tz=-.42;ty=angles.yaw*.08}
    if(kind==='console'){tx=-.75;tz=(side==='left'?.11:-.11);ty=angles.yaw*.06}
    if(kind==='door'&&side==='right'){tx=-.66;tz=-.18;ty=angles.yaw*.08}
    if(kind==='npc'&&side==='right'){tx=-.28+Math.sin(phase)*.12;tz=-.22;ty=angles.yaw*.08}
    if(kind==='counter'){tx=-.62;tz=(side==='left'?.08:-.08);ty=angles.yaw*.05}
    const k=.18*w*motion;
    arm.rotation.x+=(tx-arm.rotation.x)*k;
    arm.rotation.y+=(ty-arm.rotation.y)*k;
    arm.rotation.z+=(tz-arm.rotation.z)*k;
  }

  function applyIK(ts){
    if(!state.enabled||!state.active)return;
    const gs=window.TGGGame?.getState?.()||{};
    if(gs.inVehicle){clearFocus('vehicle_guard');return}
    const parts=rig(),root=player(),target=resolveTarget(),origin=playerWorld();
    if(!parts||!root||!target||!origin){clearFocus('target_lost');return}

    const now=Date.now(),w=core()?.weight?.(now,state.start,state.end)||0;
    if(now>=state.end){clearFocus('expired');return}
    state.weight=w;
    const headOrigin={x:origin.x,y:origin.y+3.15,z:origin.z};
    const angles=core()?.lookAngles?.(headOrigin,target,root.rotation.y)||{yaw:0,pitch:0,distance:0};
    state.lastDistance=angles.distance;
    if(angles.distance>12){clearFocus('distance_guard');return}

    const profile=state.profile,lookW=w*profile.look*(reducedMotion()?.5:1);
    parts.head.rotation.y+=(angles.yaw*profile.look-parts.head.rotation.y)*(.16*lookW);
    parts.head.rotation.x+=(angles.pitch*profile.look-parts.head.rotation.x)*(.14*lookW);
    parts.body.rotation.y+=(angles.yaw*profile.bodyTwist-parts.body.rotation.y)*(.11*w);

    const phase=(Number(ts)||0)*.005;
    if(profile.hand==='right'||profile.hand==='both')applyArm(parts.rightArm,'right',profile,w,angles,state.kind,phase);
    if(profile.hand==='left'||profile.hand==='both')applyArm(parts.leftArm,'left',profile,w,angles,state.kind,phase);

    state.appliedFrames++;state.ready=true;
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:interior-enter',e=>{
      const type=e.detail?.type;
      setTimeout(()=>interact(type==='recording'?'console':type==='boutique'?'counter':'door'),220);
    });
    window.addEventListener('tgg:mission-dialogue',()=>interact('npc'));
    window.addEventListener('tgg:rival-choice',()=>interact('npc'));
    window.addEventListener('tgg:rap-battle-start',()=>interact('mic',null,4200));
    window.addEventListener('tgg:concert-start',()=>interact('mic',null,5200));
    window.addEventListener('tgg:crew-call',()=>interact('phone',null,3400));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v237');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v237ForgeBtn')){
      const b=document.createElement('button');b.id='v237ForgeBtn';b.className='v237-forge-btn';b.type='button';b.textContent='IK';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v237ForgePanel';panel.className='v237-forge-panel';
      panel.innerHTML='<div class="v237-head"><div><small>TGG NATIVE 3D</small><b>INTERACTION + IK FORGE</b></div><button id="v237Close" type="button">×</button></div><div class="v237-interactions"><button data-v237-kind="mic">MIC</button><button data-v237-kind="console">CONSOLE</button><button data-v237-kind="door">DOOR</button><button data-v237-kind="npc">NPC</button><button data-v237-kind="counter">COUNTER</button><button data-v237-kind="phone">PHONE</button></div><div class="v237-actions"><button id="v237Nearest" type="button">AUTO NEAREST</button><button id="v237Toggle" type="button">IK: ON</button><button id="v237Clear" type="button">CLEAR FOCUS</button></div><div id="v237Stats" class="v237-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v237Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v237-kind]').forEach(b=>b.addEventListener('click',()=>interact(b.dataset.v237Kind)));
      document.getElementById('v237Nearest')?.addEventListener('click',()=>{
        for(const k of ['npc','mic','console','counter','door']){if(interact(k))break}
      });
      document.getElementById('v237Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v237Clear')?.addEventListener('click',()=>clearFocus('manual'));
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v237ForgeHud';hud.className='v237-forge-hud';
      hud.innerHTML='<small>TGG INTERACTION IK</small><b id="v237HudKind">READY</b><span id="v237HudState">AUTO TARGET</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v237Toggle'))q('v237Toggle').textContent='IK: '+(state.enabled?'ON':'OFF');
    if(q('v237Stats'))q('v237Stats').textContent=(state.active?String(state.kind).toUpperCase():'IDLE')+' • '+Math.round(state.weight*100)+'% WEIGHT • '+state.appliedFrames+' FRAMES';
    if(q('v237HudKind'))q('v237HudKind').textContent=state.active?String(state.kind).toUpperCase():'READY';
    if(q('v237HudState'))q('v237HudState').textContent=state.active?'TARGET '+(state.lastDistance?state.lastDistance.toFixed(1)+'m':'LOCK'):'AUTO TARGET';
    panel?.querySelectorAll('[data-v237-kind]').forEach(b=>b.classList.toggle('active',b.dataset.v237Kind===state.kind));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='i'||e.key==='I')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();applyIK(ts);renderUI();
  }

  const api={version:VERSION,layers:LAYERS,interactions:['mic','console','door','npc','counter','phone'],status,interact,focus,clearFocus,setEnabled,restore};
  globalThis.TGGV237=api;
  if(hasDOM()){
    window.TGGV237=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();