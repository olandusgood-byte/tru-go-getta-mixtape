(() => {
  const VERSION='V2.35 TGG FACIAL + IK FORGE 100';
  const LAYERS=[
    'facial core bridge','facial enabled state','facial profile state','facial auto profile','facial manual profile','facial profile expiry','facial status API','facial native rig guard','facial baseline cache','facial restore path',
    'idle profile','talk profile','phone profile','rap profile','perform profile','animation bridge','profile transition','profile diagnostics','profile persistence guard','profile event',
    'head yaw look','head pitch look','head nod','head tilt','head clamp','head additive offset','head previous offset remove','head smoothing','head restore','head diagnostics',
    'left eye blink','right eye blink','blink cadence','blink duration','blink energy scale','eye scale baseline','eye scale restore','blink reduced motion','blink diagnostics','blink random phase',
    'left pupil aim','right pupil aim','pupil horizontal shift','pupil vertical shift','pupil gaze strength','pupil baseline x','pupil baseline y','pupil restore','pupil smoothing','pupil diagnostics',
    'mouth open scale','mouth talk pulse','mouth rap pulse','mouth perform pulse','mouth phone pulse','mouth baseline scale','mouth smoothing','mouth energy scale','mouth restore','mouth diagnostics',
    'left brow lift','right brow lift','brow talk motion','brow rap emphasis','brow performance emphasis','brow baseline rotation','brow smoothing','brow restore','brow energy scale','brow diagnostics',
    'left hand gesture','right hand gesture','hand additive offsets','hand previous offset remove','hand talk pose','hand rap pose','hand perform pose','hand phone pose','hand smoothing','hand restore',
    'stance width','stance energy scale','left foot stance','right foot stance','stance baseline positions','stance smoothing','stance restore','body micro lean','body additive guard','body restore',
    'camera gaze target','manual look target','look target clear','destination gaze fallback','vehicle facial guard','interior compatibility','V2.32 animation compatibility','V2.34 camera compatibility','no movement mutation','rollback isolation'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={
    enabled:true,profile:'idle',manual:null,manualUntil:0,lookTarget:null,ready:false,frames:0,
    face:null,baseline:null,lastOffsets:null,lastBlinkAt:0,nextBlinkMs:2600,blinkUntil:0
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const reducedMotion=()=>hasDOM()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-facial-ik-forge',layerCount:LAYERS.length,
      enabled:state.enabled,profile:state.profile,manual:state.manual,lookTarget:state.lookTarget?{...state.lookTarget}:null,
      frames:state.frames,faceReady:!!state.face
    };
  }

  function player(){return hasDOM()?window.TGG3D?.player||null:null}
  function rig(){return hasDOM()?window.TGG3D?.player?.userData?.parts||null:null}

  function faceParts(){
    const p=player();if(!p)return null;
    const f={
      head:rig()?.head||null,body:rig()?.body||null,leftArm:rig()?.leftArm||null,rightArm:rig()?.rightArm||null,
      leftLeg:rig()?.leftLeg||null,rightLeg:rig()?.rightLeg||null,
      eyeL:p.getObjectByName?.('eye-l')||null,eyeR:p.getObjectByName?.('eye-r')||null,
      pupilL:p.getObjectByName?.('pupil-l')||null,pupilR:p.getObjectByName?.('pupil-r')||null,
      browL:p.getObjectByName?.('brow-l')||null,browR:p.getObjectByName?.('brow-r')||null,
      mouth:p.getObjectByName?.('mouth')||null,leftHand:p.getObjectByName?.('left-hand')||null,rightHand:p.getObjectByName?.('right-hand')||null
    };
    return f.head&&f.body?f:null;
  }

  function vec3(o){return o?{x:o.x,y:o.y,z:o.z}:null}
  function rot3(o){return o?{x:o.x,y:o.y,z:o.z}:null}

  function captureBaseline(){
    const f=faceParts();if(!f)return false;
    state.face=f;
    state.baseline={
      eyeLScale:vec3(f.eyeL?.scale),eyeRScale:vec3(f.eyeR?.scale),
      pupilLPos:vec3(f.pupilL?.position),pupilRPos:vec3(f.pupilR?.position),
      mouthScale:vec3(f.mouth?.scale),
      browLRot:rot3(f.browL?.rotation),browRRot:rot3(f.browR?.rotation),
      leftLegPos:vec3(f.leftLeg?.position),rightLegPos:vec3(f.rightLeg?.position)
    };
    state.lastOffsets={
      head:{x:0,y:0,z:0},body:{x:0,y:0,z:0},
      leftArm:{x:0,y:0,z:0},rightArm:{x:0,y:0,z:0}
    };
    state.ready=true;return true;
  }

  function subtractOffset(obj,off){
    if(!obj||!off)return;
    obj.rotation.x-=off.x||0;obj.rotation.y-=off.y||0;obj.rotation.z-=off.z||0;
  }
  function applyOffset(obj,key,next,amount=.35){
    if(!obj)return;
    const prev=state.lastOffsets?.[key]||{x:0,y:0,z:0};
    subtractOffset(obj,prev);
    const off={
      x:lerp(prev.x||0,Number(next.x)||0,amount),
      y:lerp(prev.y||0,Number(next.y)||0,amount),
      z:lerp(prev.z||0,Number(next.z)||0,amount)
    };
    obj.rotation.x+=off.x;obj.rotation.y+=off.y;obj.rotation.z+=off.z;
    state.lastOffsets[key]=off;
  }

  function clearOffsets(){
    const f=state.face;if(!f||!state.lastOffsets)return;
    subtractOffset(f.head,state.lastOffsets.head);subtractOffset(f.body,state.lastOffsets.body);
    subtractOffset(f.leftArm,state.lastOffsets.leftArm);subtractOffset(f.rightArm,state.lastOffsets.rightArm);
    state.lastOffsets={head:{x:0,y:0,z:0},body:{x:0,y:0,z:0},leftArm:{x:0,y:0,z:0},rightArm:{x:0,y:0,z:0}};
  }

  function automaticProfile(){
    const a=hasDOM()?window.TGGV232?.status?.():null;
    const clip=String(a?.manual||a?.current||'idle');
    if(['talk','phone','rap','perform'].includes(clip))return clip;
    return'idle';
  }

  function activeProfile(now=Date.now()){
    if(state.manual&&now<state.manualUntil)return state.manual;
    if(state.manual&&now>=state.manualUntil){state.manual=null;state.manualUntil=0}
    return automaticProfile();
  }

  function applyProfile(name='idle',duration=0){
    if(!core()?.profiles?.includes(name))name='idle';
    state.profile=name;
    if(duration>0){state.manual=name;state.manualUntil=Date.now()+clamp(Number(duration)||2000,250,12000)}
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:facial-profile',{detail:{profile:name,duration}}));
    renderUI();return status();
  }

  function lookAt(target=null){
    if(target&&Number.isFinite(Number(target.x))&&Number.isFinite(Number(target.z))){
      state.lookTarget={x:Number(target.x),z:Number(target.z)};
    }else state.lookTarget=null;
    return state.lookTarget?{...state.lookTarget}:null;
  }

  function setEnabled(v){
    state.enabled=!!v;if(!state.enabled)restoreVisuals();renderUI();return state.enabled;
  }

  function defaultLookTarget(){
    const p=player();if(!p)return null;
    if(state.lookTarget)return state.lookTarget;
    const cam=window.TGG3D?.camera;
    if(cam&&state.profile==='idle')return{x:cam.position.x,z:cam.position.z};
    const d=window.TGG3D?.nearbyDestination?.(window.TGGGame?.getState?.());
    if(d)return{x:Number(d.x)||0,z:Number(d.z)||0};
    return null;
  }

  function headLook(profile){
    const p=player(),f=state.face;if(!p||!f?.head)return{x:0,y:0,z:0};
    const target=defaultLookTarget();if(!target)return{x:0,y:0,z:0};
    const origin={x:p.position.x,z:p.position.z};
    const calc=core()?.look?.(target,origin,p.rotation.y)||{yaw:0,pitch:0};
    const strength=Number(profile.gaze)||0;
    return{
      x:clamp((calc.pitch||0)*strength,-.32,.32),
      y:clamp((calc.yaw||0)*strength,-.45,.45),
      z:0
    };
  }

  function updateBlink(ts,profile){
    const f=state.face,b=state.baseline;if(!f||!b)return;
    if(ts-state.lastBlinkAt>state.nextBlinkMs){
      state.lastBlinkAt=ts;state.blinkUntil=ts+95;state.nextBlinkMs=2100+((Math.floor(ts)%1700));
    }
    const blinking=ts<state.blinkUntil;
    const factor=blinking?Math.max(.07,1-(Number(profile.blink)||.2)*4.2):1;
    const amt=reducedMotion()?.5:.58;
    for(const [obj,base] of [[f.eyeL,b.eyeLScale],[f.eyeR,b.eyeRScale]]){
      if(!obj||!base)continue;
      obj.scale.y=lerp(obj.scale.y,base.y*factor,amt);
      obj.scale.x=lerp(obj.scale.x,base.x,.35);obj.scale.z=lerp(obj.scale.z,base.z,.35);
    }
  }

  function updatePupils(profile,look){
    const f=state.face,b=state.baseline;if(!f||!b)return;
    const xShift=clamp((look?.y||0)*-.09,-.045,.045)*(Number(profile.gaze)||0);
    const yShift=clamp((look?.x||0)*.06,-.025,.025)*(Number(profile.gaze)||0);
    for(const [obj,base] of [[f.pupilL,b.pupilLPos],[f.pupilR,b.pupilRPos]]){
      if(!obj||!base)continue;
      obj.position.x=lerp(obj.position.x,base.x+xShift,.3);
      obj.position.y=lerp(obj.position.y,base.y+yShift,.3);
    }
  }

  function updateMouth(ts,profile){
    const f=state.face,b=state.baseline;if(!f?.mouth||!b?.mouthScale)return;
    const energy=Number(profile.mouth)||0;
    const rate=state.profile==='rap'?13:state.profile==='perform'?11:state.profile==='talk'?7:state.profile==='phone'?5:2;
    const pulse=.18+Math.abs(Math.sin(ts*.001*rate))*.82;
    const target=1+energy*pulse*2.3;
    f.mouth.scale.y=lerp(f.mouth.scale.y,b.mouthScale.y*target,reducedMotion()?.16:.42);
    f.mouth.scale.x=lerp(f.mouth.scale.x,b.mouthScale.x*(1+energy*.1),.25);
  }

  function updateBrows(ts,profile){
    const f=state.face,b=state.baseline;if(!f||!b)return;
    const e=Number(profile.energy)||0,w=Math.sin(ts*.006)*e*.08;
    if(f.browL&&b.browLRot)f.browL.rotation.z=lerp(f.browL.rotation.z,b.browLRot.z+.08*e+w,.28);
    if(f.browR&&b.browRRot)f.browR.rotation.z=lerp(f.browR.rotation.z,b.browRRot.z-.08*e-w,.28);
  }

  function updateHands(ts,profile){
    const e=Number(profile.handReach)||0,s=Math.sin(ts*.007);
    let l={x:0,y:0,z:0},r={x:0,y:0,z:0};
    if(state.profile==='phone')l={x:-.08,y:0,z:.14*e};
    else if(state.profile==='talk'){l={x:0,y:0,z:.05*e};r={x:-.06*s,y:0,z:-.08*e}}
    else if(state.profile==='rap'){l={x:-.1*s,y:.04*s,z:.12*e};r={x:.08*s,y:-.04*s,z:-.14*e}}
    else if(state.profile==='perform'){l={x:-.08*s,y:0,z:.16*e};r={x:.06*s,y:0,z:-.16*e}}
    applyOffset(state.face?.leftArm,'leftArm',l,.25);
    applyOffset(state.face?.rightArm,'rightArm',r,.25);
  }

  function updateStance(ts,profile){
    const f=state.face,b=state.baseline;if(!f||!b)return;
    const stance=(Number(profile.stance)||0)*.16;
    if(f.leftLeg&&b.leftLegPos)f.leftLeg.position.x=lerp(f.leftLeg.position.x,b.leftLegPos.x-stance,.22);
    if(f.rightLeg&&b.rightLegPos)f.rightLeg.position.x=lerp(f.rightLeg.position.x,b.rightLegPos.x+stance,.22);
    const micro={x:0,y:Math.sin(ts*.003)*(Number(profile.energy)||0)*.035,z:Math.sin(ts*.004)*(Number(profile.energy)||0)*.02};
    applyOffset(f.body,'body',micro,.18);
  }

  function restoreVisuals(){
    const f=state.face,b=state.baseline;if(!f||!b)return;
    clearOffsets();
    for(const [obj,base] of [[f.eyeL,b.eyeLScale],[f.eyeR,b.eyeRScale],[f.mouth,b.mouthScale]]){
      if(obj&&base)obj.scale.set(base.x,base.y,base.z);
    }
    for(const [obj,base] of [[f.pupilL,b.pupilLPos],[f.pupilR,b.pupilRPos]]){
      if(obj&&base)obj.position.set(base.x,base.y,base.z);
    }
    if(f.browL&&b.browLRot)f.browL.rotation.set(b.browLRot.x,b.browLRot.y,b.browLRot.z);
    if(f.browR&&b.browRRot)f.browR.rotation.set(b.browRRot.x,b.browRRot.y,b.browRRot.z);
    if(f.leftLeg&&b.leftLegPos)f.leftLeg.position.set(b.leftLegPos.x,b.leftLegPos.y,b.leftLegPos.z);
    if(f.rightLeg&&b.rightLegPos)f.rightLeg.position.set(b.rightLegPos.x,b.rightLegPos.y,b.rightLegPos.z);
  }

  function restore(){
    restoreVisuals();state.enabled=false;state.manual=null;state.manualUntil=0;state.profile='idle';state.lookTarget=null;renderUI();return status();
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:animation-play',e=>{
      const clip=String(e.detail?.clip||'idle');
      if(core()?.profiles?.includes(clip))applyProfile(clip,Number(e.detail?.duration)||1800);
    });
    window.addEventListener('tgg:rival-choice',()=>applyProfile('talk',1800));
    window.addEventListener('tgg:rap-battle-start',()=>applyProfile('rap',5200));
    window.addEventListener('tgg:concert-start',()=>applyProfile('perform',7200));
    window.addEventListener('tgg:crew-call',()=>applyProfile('phone',3200));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const btn=document.createElement('button');btn.id='v235ForgeBtn';btn.className='v235-forge-btn';btn.type='button';btn.textContent='FACE + IK';btn.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(btn);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>FACIAL + IK FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-profiles"><button data-v235-profile="idle">IDLE</button><button data-v235-profile="talk">TALK</button><button data-v235-profile="phone">PHONE</button><button data-v235-profile="rap">RAP</button><button data-v235-profile="perform">PERFORM</button></div><div class="v235-actions"><button id="v235Toggle" type="button">FACE + IK: ON</button><button id="v235Look" type="button">LOOK AT CAMERA</button><button id="v235Restore" type="button">RESTORE BASE</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v235-profile]').forEach(b=>b.addEventListener('click',()=>applyProfile(b.dataset.v235Profile,3000)));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Look')?.addEventListener('click',()=>{
        const c=window.TGG3D?.camera;if(c)lookAt({x:c.position.x,z:c.position.z});
      });
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG FACE + IK FORGE</small><b id="v235HudProfile">IDLE</b><span id="v235HudState">AUTO PROFILE</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='FACE + IK: '+(state.enabled?'ON':'OFF');
    if(q('v235Stats'))q('v235Stats').textContent=state.profile.toUpperCase()+' • '+(state.manual?'MANUAL':'AUTO')+' • '+state.frames+' FRAMES';
    if(q('v235HudProfile'))q('v235HudProfile').textContent=state.profile.toUpperCase();
    if(q('v235HudState'))q('v235HudState').textContent=state.manual?'MANUAL PROFILE':'AUTO PROFILE';
    panel?.querySelectorAll('[data-v235-profile]').forEach(b=>b.classList.toggle('active',b.dataset.v235Profile===state.profile));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='f'||e.key==='F')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const f=faceParts();
    if(f&&f!==state.face){restoreVisuals();state.face=null;state.baseline=null;captureBaseline()}
    if(!state.face&&f)captureBaseline();
    const gs=window.TGGGame?.getState?.()||{};
    const next=activeProfile(Date.now());
    if(!state.manual)state.profile=next;
    if(state.enabled&&!gs.inVehicle&&state.face){
      const profile=core()?.profile?.(state.profile)||core()?.profile?.('idle');
      const look=headLook(profile);
      applyOffset(state.face.head,'head',look,.22);
      updateBlink(ts,profile);updatePupils(profile,look);updateMouth(ts,profile);updateBrows(ts,profile);
      updateHands(ts,profile);updateStance(ts,profile);state.frames++;state.ready=true;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,profiles:['idle','talk','phone','rap','perform'],status,applyProfile,lookAt,setEnabled,restore};
  globalThis.TGGV235=api;
  if(hasDOM()){window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();