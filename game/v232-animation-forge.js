(() => {
  const VERSION='V2.32 TGG ANIMATION FORGE 100';
  const LAYERS=[
    'animation core bridge','animation enabled state','animation phase state','animation manual action','animation action expiry','animation auto clip','animation blend state','animation native rig guard','animation vehicle guard','animation status API',
    'idle clip','walk clip','run clip','talk clip','phone clip','rap clip','perform clip','idle breathing','idle head drift','idle shoulder settle',
    'walk arm swing','walk leg swing','walk torso twist','walk side lean','walk head settle','walk bob','walk stride rate','walk speed blend','walk stop blend','walk start blend',
    'run arm swing','run leg swing','run forward lean','run torso twist','run head settle','run bob','run rate scaling','run sprint bridge','run stop blend','run start blend',
    'talk right gesture','talk left settle','talk head nod','talk torso twist','talk weight shift','phone left arm','phone right relax','phone head tilt','phone torso settle','phone idle pulse',
    'rap alternating arms','rap torso bounce','rap torso twist','rap head nod','rap stance','rap accent beat','perform raised arms','perform body bounce','perform head motion','perform stage sway',
    'pose lerp x','pose lerp y','pose lerp z','body position lerp','head rotation lerp','arm rotation lerp','leg rotation lerp','phase continuity','action transition blend','locomotion transition blend',
    'crew call phone bridge','rival choice talk bridge','rap event bridge','concert event bridge','mission dialogue bridge','manual phone action','manual talk action','manual rap action','manual perform action','manual clear action',
    'action duration guard','action overlap replace','action expiry restore','base locomotion compatibility','V2.27 rig compatibility','V2.28 vehicle compatibility','V2.30 interior compatibility','V2.31 lighting compatibility','base animation coexistence','rollback isolation',
    'animation HUD','animation panel','clip buttons','enabled toggle','F8 shortcut','mobile panel','landscape panel','reduced motion scaling','100-layer manifest','release QA hooks'
  ];

  const core=()=>globalThis.TGGV232Core||globalThis.window?.TGGV232Core;
  const state={
    enabled:true,phase:0,current:'idle',previous:'idle',manual:null,manualUntil:0,
    blend:1,ready:false,lastTs:0,appliedFrames:0,lastAction:null
  };
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const lerp=(a,b,t)=>a+(b-a)*t;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-animation-forge',layerCount:LAYERS.length,
      enabled:state.enabled,current:state.current,previous:state.previous,manual:state.manual,
      blend:Number(state.blend.toFixed(3)),appliedFrames:state.appliedFrames
    };
  }

  function rig(){
    if(!hasDOM())return null;
    const p=window.TGG3D?.player?.userData?.parts;
    if(!p?.leftArm||!p?.rightArm||!p?.leftLeg||!p?.rightLeg||!p?.body||!p?.head)return null;
    return p;
  }

  function reducedMotion(){
    if(!hasDOM()||!window.matchMedia)return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function chooseAuto(){
    if(!hasDOM())return'idle';
    const gs=window.TGGGame?.getState?.()||{};
    if(gs.inVehicle)return'idle';
    const d=window.TGG3D?.getPlayerDynamics?.()||{};
    const speed=Math.max(0,Number(d.speed)||0);
    if(d.sprinting&&speed>.7)return'run';
    if(speed>.32)return'walk';
    return'idle';
  }

  function activeClip(now=Date.now()){
    if(state.manual&&now<state.manualUntil)return state.manual;
    if(state.manual&&now>=state.manualUntil){
      state.lastAction=state.manual;state.manual=null;state.manualUntil=0;
    }
    return chooseAuto();
  }

  function play(name,duration=2200){
    if(!core()?.clips?.includes(name))return false;
    state.manual=name;state.manualUntil=Date.now()+clamp(Number(duration)||2200,250,12000);
    state.lastAction=name;
    setCurrent(name);
    renderUI();
    if(hasDOM())window.dispatchEvent(new CustomEvent('tgg:animation-play',{detail:{clip:name,duration:state.manualUntil-Date.now()}}));
    return true;
  }

  function clear(){
    state.manual=null;state.manualUntil=0;setCurrent(chooseAuto());renderUI();return true;
  }

  function setCurrent(next){
    if(next===state.current)return;
    state.previous=state.current;state.current=next;state.blend=0;
  }

  function setEnabled(value){
    state.enabled=!!value;
    if(!state.enabled)clear();
    renderUI();return state.enabled;
  }

  function restore(){
    state.enabled=false;state.manual=null;state.manualUntil=0;state.current='idle';state.previous='idle';state.blend=1;
    const p=rig();
    if(p){
      [p.leftArm,p.rightArm,p.leftLeg,p.rightLeg,p.body,p.head].forEach(x=>{
        x.rotation.x=lerp(x.rotation.x,0,.65);x.rotation.y=lerp(x.rotation.y,0,.65);x.rotation.z=lerp(x.rotation.z,0,.65);
      });
    }
    renderUI();return status();
  }

  function clipPose(name,phase,speed=0){
    const c=core()?.clip?.(name)||core()?.clip?.('idle');
    const sin=Math.sin(phase),cos=Math.cos(phase),sin2=Math.sin(phase*2);
    const pose={
      leftArm:{x:0,y:0,z:0},rightArm:{x:0,y:0,z:0},
      leftLeg:{x:0,y:0,z:0},rightLeg:{x:0,y:0,z:0},
      body:{x:0,y:0,z:0,posY:2.05},head:{x:0,y:0,z:0}
    };

    if(name==='idle'){
      pose.body.posY=2.05+Math.sin(phase*.55)*c.bob;
      pose.body.z=Math.sin(phase*.42)*c.twist;
      pose.head.y=Math.sin(phase*.31)*c.head;
      pose.head.z=Math.sin(phase*.47)*c.head*.38;
      pose.leftArm.z=-.025;pose.rightArm.z=.025;
    }else if(name==='walk'||name==='run'){
      const amp=c.armSwing*Math.max(.28,Math.min(1,Number(speed)||1));
      const leg=c.legSwing*Math.max(.28,Math.min(1,Number(speed)||1));
      pose.leftArm.x=sin*amp;pose.rightArm.x=-sin*amp;
      pose.leftLeg.x=-sin*leg;pose.rightLeg.x=sin*leg;
      pose.leftArm.z=-Math.abs(sin)*.04;pose.rightArm.z=Math.abs(sin)*.04;
      pose.body.x=-(name==='run'?c.lean:.015);
      pose.body.z=cos*c.twist;
      pose.body.y=sin2*c.twist*.28;
      pose.body.posY=2.05+Math.abs(sin)*c.bob;
      pose.head.z=-pose.body.z*.4;pose.head.y=-pose.body.y*.35;
    }else if(name==='talk'){
      pose.rightArm.x=-.45+sin*.32;pose.rightArm.z=-.28+cos*.18;
      pose.leftArm.x=.08+cos*.09;pose.leftArm.z=.05;
      pose.body.z=sin*c.lean;pose.body.y=cos*c.twist;
      pose.body.posY=2.05+Math.abs(sin)*c.bob;
      pose.head.x=Math.sin(phase*.55)*c.head;pose.head.y=cos*c.head;
    }else if(name==='phone'){
      pose.leftArm.x=-.42+sin*.06;pose.leftArm.z=1.18;
      pose.rightArm.x=.06+sin*.08;pose.rightArm.z=-.04;
      pose.body.z=-.035+sin*.025;pose.body.y=Math.sin(phase*.45)*c.twist;
      pose.body.posY=2.05+Math.sin(phase*.6)*c.bob;
      pose.head.z=.11;pose.head.y=-.08+Math.sin(phase*.33)*c.head*.35;
    }else if(name==='rap'){
      pose.leftArm.x=-.65+sin*c.armSwing*.7;pose.leftArm.z=.34+cos*.18;
      pose.rightArm.x=.35-sin*c.armSwing;pose.rightArm.z=-.25+sin2*.2;
      pose.leftLeg.x=-sin*c.legSwing;pose.rightLeg.x=sin*c.legSwing;
      pose.body.x=-c.lean*.35;pose.body.z=sin*c.lean;pose.body.y=cos*c.twist;
      pose.body.posY=2.05+Math.abs(sin)*c.bob;
      pose.head.x=Math.abs(sin)*c.head;pose.head.y=-cos*c.head;
    }else if(name==='perform'){
      pose.leftArm.x=-.35+sin*.32;pose.leftArm.z=1.12+cos*.16;
      pose.rightArm.x=-.25-cos*.3;pose.rightArm.z=-1.08+sin*.16;
      pose.leftLeg.x=-sin*c.legSwing;pose.rightLeg.x=sin*c.legSwing;
      pose.body.x=-c.lean*.4;pose.body.z=sin*c.lean;pose.body.y=cos*c.twist;
      pose.body.posY=2.05+Math.abs(sin)*c.bob;
      pose.head.x=Math.abs(sin2)*c.head;pose.head.z=-sin*c.head*.55;
    }
    return pose;
  }

  function mixPose(a,b,t){
    const out={};
    for(const part of ['leftArm','rightArm','leftLeg','rightLeg','body','head']){
      out[part]={};
      for(const k of Object.keys(b[part])){
        out[part][k]=lerp(Number(a[part]?.[k])||0,Number(b[part]?.[k])||0,t);
      }
    }
    return out;
  }

  function applyPose(pose,amount=.28){
    const p=rig();if(!p)return false;
    const motionScale=reducedMotion()?.35:1;
    const rot=(obj,target)=>{
      obj.rotation.x=lerp(obj.rotation.x,(target.x||0)*motionScale,amount);
      obj.rotation.y=lerp(obj.rotation.y,(target.y||0)*motionScale,amount);
      obj.rotation.z=lerp(obj.rotation.z,(target.z||0)*motionScale,amount);
    };
    rot(p.leftArm,pose.leftArm);rot(p.rightArm,pose.rightArm);rot(p.leftLeg,pose.leftLeg);rot(p.rightLeg,pose.rightLeg);
    rot(p.body,pose.body);rot(p.head,pose.head);
    if(Number.isFinite(pose.body.posY))p.body.position.y=lerp(p.body.position.y,pose.body.posY,amount*.85);
    return true;
  }

  function bridgeEvents(){
    if(!hasDOM()||bridgeEvents.done)return;bridgeEvents.done=true;
    window.addEventListener('tgg:crew-call',()=>play('phone',3200));
    window.addEventListener('tgg:rival-choice',()=>play('talk',1800));
    window.addEventListener('tgg:rap-battle-start',()=>play('rap',5200));
    window.addEventListener('tgg:rap-battle-round',()=>play('rap',2600));
    window.addEventListener('tgg:concert-start',()=>play('perform',7200));
    window.addEventListener('tgg:concert-complete',()=>play('perform',2800));
    window.addEventListener('tgg:mission-dialogue',()=>play('talk',2200));
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v232');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v232ForgeBtn')){
      const b=document.createElement('button');b.id='v232ForgeBtn';b.className='v232-forge-btn';b.type='button';b.textContent='ANIM FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v232ForgePanel';panel.className='v232-forge-panel';
      panel.innerHTML='<div class="v232-head"><div><small>TGG NATIVE 3D</small><b>ANIMATION FORGE</b></div><button id="v232Close" type="button">×</button></div><div class="v232-clips"><button data-v232-clip="phone">PHONE</button><button data-v232-clip="talk">TALK</button><button data-v232-clip="rap">RAP</button><button data-v232-clip="perform">PERFORM</button></div><div class="v232-actions"><button id="v232Toggle" type="button">ANIMATION: ON</button><button id="v232Clear" type="button">CLEAR ACTION</button><button id="v232Restore" type="button">RESTORE BASE</button></div><div id="v232Stats" class="v232-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v232Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      panel.querySelectorAll('[data-v232-clip]').forEach(b=>b.addEventListener('click',()=>play(b.dataset.v232Clip,b.dataset.v232Clip==='perform'?6000:3000)));
      document.getElementById('v232Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v232Clear')?.addEventListener('click',clear);
      document.getElementById('v232Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v232ForgeHud';hud.className='v232-forge-hud';
      hud.innerHTML='<small>TGG ANIMATION FORGE</small><b id="v232HudClip">IDLE</b><span id="v232HudState">AUTO LOCOMOTION</span>';city.appendChild(hud);
    }
    bridgeEvents();renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v232Toggle'))q('v232Toggle').textContent='ANIMATION: '+(state.enabled?'ON':'OFF');
    if(q('v232Stats'))q('v232Stats').textContent=state.current.toUpperCase()+' • '+(state.manual?'MANUAL':'AUTO')+' • '+state.appliedFrames+' FRAMES';
    if(q('v232HudClip'))q('v232HudClip').textContent=state.current.toUpperCase();
    if(q('v232HudState'))q('v232HudState').textContent=state.manual?'MANUAL ACTION':'AUTO LOCOMOTION';
    panel?.querySelectorAll('[data-v232-clip]').forEach(b=>b.classList.toggle('active',b.dataset.v232Clip===state.manual));
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F8'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const now=Date.now(),next=activeClip(now);setCurrent(next);
    const dt=Math.min(.05,Math.max(.001,state.lastTs?(ts-state.lastTs)/1000:.016));state.lastTs=ts;
    const dyn=window.TGG3D?.getPlayerDynamics?.()||{},gs=window.TGGGame?.getState?.()||{};
    const from=core()?.clip?.(state.previous)||core()?.clip?.('idle'),to=core()?.clip?.(state.current)||from;
    const rate=to.rate*(reducedMotion()?.55:1);
    state.phase+=dt*rate;
    state.blend=Math.min(1,state.blend+dt*5.5);
    if(state.enabled&&!gs.inVehicle&&rig()){
      const speedNorm=clamp((Number(dyn.speed)||0)/9.8,0,1);
      const a=clipPose(state.previous,state.phase,speedNorm),b=clipPose(state.current,state.phase,speedNorm);
      const pose=mixPose(a,b,state.blend);
      const turnLean=clamp((Number(dyn.turnDelta)||0)/105,-1,1)*(state.current==='run'?.115:.09)*(reducedMotion()?.35:1);
      pose.body.z+=turnLean;
      pose.body.y+=turnLean*.32;
      pose.head.z-=turnLean*.48;
      pose.leftArm.z-=turnLean*.18;
      pose.rightArm.z-=turnLean*.18;
      const response=state.current==='run'?.36:state.current==='rap'||state.current==='perform'?.32:.26;
      if(applyPose(pose,response))state.appliedFrames++;
      state.ready=true;
    }
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,clips:['idle','walk','run','talk','phone','rap','perform'],status,play,clear,setEnabled,restore};
  globalThis.TGGV232=api;
  if(hasDOM()){
    window.TGGV232=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick);
  }
})();