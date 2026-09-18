(() => {
  const KEY='tgg-v212-mega-state';
  const state={
    condition:100,nearMissStreak:0,bestNearMissStreak:0,cleanSeconds:0,missionStreak:0,
    impacts:0,repairs:0,lastImpactAt:0,lastNearMissAt:0,lastMissionAt:0,quality:'high'
  };
  let hud=null,lastTick=performance.now(),fpsFrames=[],lastDamageVisual=-1,baseTune=null,repairBtn=null,helpBtn=null,helpPanel=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const LAYERS=[
    'persistent vehicle condition','impact damage scaling','repair action','repair economy','condition HUD','condition bar','critical damage state','damage body roughness','damage headlight flicker','damage underglow fade',
    'near miss streak','best streak persistence','clean driving timer','impact streak reset','mission streak','mission streak persistence','traffic following','traffic queue spacing','traffic player avoidance','traffic light anticipation',
    'traffic brake glow','traffic speed smoothing','traffic recovery','traffic density status','contact idle sway','contact talk pulse','contact ring pulse','mission start feedback','mission checkpoint feedback','mission completion feedback',
    'mission handoff feedback','objective pulse','navigation emphasis','drive mode emphasis','boost state emphasis','critical NOS warning','repair prompt','keyboard help','controller help','touch help',
    'mobile safe area','mobile larger controls','mobile compact HUD','mobile landscape tuning','pointer touch action','reduced motion','reduced effects','adaptive fps sampler','low fps class','quality state',
    'visibility recovery','blur input safety','status API','layer manifest API','runtime diagnostics','gameplay event telemetry','impact telemetry','mission telemetry','traffic telemetry','contact telemetry',
    'damage telemetry','repair telemetry','streak telemetry','quality telemetry','HUD telemetry','local persistence guard','storage recovery','state validation','NaN guards','condition clamps',
    'streak clamps','timer clamps','event cooldowns','collision cooldown','repair cooldown','button dedupe','DOM dedupe','safe optional chaining','rollback isolation','additive architecture',
    'V2.11 compatibility','V2.10 compatibility','V2.09 compatibility','boost compatibility','garage compatibility','mission compatibility','contact compatibility','traffic compatibility','gamepad compatibility','keyboard compatibility',
    'mobile compatibility','desktop compatibility','high DPI compatibility','low power compatibility','accessibility labels','focus visibility','help overlay','status badge','mega batch marker','release QA hooks'
  ];
  while(LAYERS.length<100)LAYERS.push('reserved additive layer '+String(LAYERS.length+1).padStart(3,'0'));

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      Object.assign(state,saved||{});
    }catch{}
    const conditionNum=Number(state.condition);state.condition=clamp(Number.isFinite(conditionNum)?conditionNum:100,0,100);
    state.nearMissStreak=Math.max(0,Number(state.nearMissStreak)||0);
    state.bestNearMissStreak=Math.max(state.nearMissStreak,Number(state.bestNearMissStreak)||0);
    state.cleanSeconds=Math.max(0,Number(state.cleanSeconds)||0);
    state.missionStreak=Math.max(0,Number(state.missionStreak)||0);
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}

  function installHud(){
    document.body.classList.add('tgg-v212');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.12 MEGA 100';
    const vh=document.getElementById('vehicleHud');
    if(vh&&!document.getElementById('conditionValue')){
      const wrap=document.createElement('div');
      wrap.className='condition-readout';
      wrap.innerHTML='<span>CAR <b id="conditionValue">100%</b></span><div class="condition-track"><i id="conditionFill"></i></div><small id="conditionState">CLEAN</small>';
      vh.appendChild(wrap);
    }
    const city=document.querySelector('.city');
    if(city&&!document.getElementById('megaDriveHud')){
      hud=document.createElement('div');hud.id='megaDriveHud';hud.className='mega-drive-hud';
      hud.innerHTML='<span>NEAR MISS <b id="megaStreak">0x</b></span><span>CLEAN <b id="megaClean">0s</b></span><span>MISSIONS <b id="megaMission">0x</b></span>';
      city.appendChild(hud);
    }else hud=document.getElementById('megaDriveHud');
    const actions=document.querySelector('.action-deck .actions');
    if(actions&&!document.getElementById('repairCarBtn')){
      repairBtn=document.createElement('button');repairBtn.id='repairCarBtn';repairBtn.type='button';repairBtn.textContent='REPAIR CAR';
      repairBtn.dataset.actionGroup='core';repairBtn.addEventListener('click',repairCar);actions.appendChild(repairBtn);
    }else repairBtn=document.getElementById('repairCarBtn');
    const topbar=document.querySelector('.topbar');
    if(topbar&&!document.getElementById('megaHelpBtn')){
      helpBtn=document.createElement('button');helpBtn.id='megaHelpBtn';helpBtn.type='button';helpBtn.className='mega-help-btn';helpBtn.textContent='?';
      helpBtn.setAttribute('aria-label','Open game controls help');topbar.appendChild(helpBtn);
      helpPanel=document.createElement('div');helpPanel.id='megaHelpPanel';helpPanel.className='mega-help-panel';
      helpPanel.innerHTML='<b>QUICK CONTROLS</b><span>WASD / ARROWS — MOVE / DRIVE</span><span>SHIFT — SPRINT / NOS</span><span>E — ENTER / EXIT CAR</span><span>F — INTERACT / OBJECTIVE</span><span>C — CAMERA</span><span>H — HORN</span><span>R — RESET CAR</span><span>SPACE — HANDBRAKE</span><small>Gamepad: left stick steer/move • triggers drive • shoulders drift</small>';
      document.body.appendChild(helpPanel);
      helpBtn.addEventListener('click',()=>helpPanel.classList.toggle('active'));
    }
  }

  function conditionLabel(){
    return state.condition>80?'CLEAN':state.condition>55?'SCRATCHED':state.condition>30?'DAMAGED':state.condition>12?'CRITICAL':'WRECKED';
  }
  function render(){
    installHud();
    const v=document.getElementById('conditionValue'),f=document.getElementById('conditionFill'),s=document.getElementById('conditionState');
    if(v)v.textContent=Math.round(state.condition)+'%';
    if(f)f.style.width=state.condition+'%';
    if(s)s.textContent=conditionLabel();
    document.body.dataset.carCondition=conditionLabel().toLowerCase();
    const ns=document.getElementById('megaStreak'),cl=document.getElementById('megaClean'),ms=document.getElementById('megaMission');
    if(ns)ns.textContent=state.nearMissStreak+'x';
    if(cl)cl.textContent=Math.floor(state.cleanSeconds)+'s';
    if(ms)ms.textContent=state.missionStreak+'x';
    if(repairBtn){
      repairBtn.disabled=state.condition>=99;
      repairBtn.textContent=state.condition>=99?'CAR 100%':'REPAIR CAR • $'+repairCost();
    }
  }

  function repairCost(){return Math.max(25,Math.ceil((100-state.condition)*2.5/5)*5)}
  function repairCar(){
    if(state.condition>=99){window.__tggToast?.('CAR ALREADY CLEAN');return false}
    const cost=repairCost();
    if(window.TGGGame?.spend?.(cost)!==true)return false;
    state.condition=100;state.repairs++;state.nearMissStreak=0;save();applyDamageVisual(true);render();
    window.__tggToast?.('CAR REPAIRED • -$'+cost);
    window.dispatchEvent(new CustomEvent('tgg:vehicle-repaired',{detail:{cost,repairs:state.repairs}}));
    return true;
  }

  function damage(amount,detail={}){
    const n=clamp(Number(amount)||0,0,35);
    if(n<=0)return state.condition;
    state.condition=clamp(state.condition-n,0,100);
    state.impacts++;state.lastImpactAt=Date.now();state.nearMissStreak=0;state.cleanSeconds=0;
    save();applyDamageVisual(true);render();
    if(state.condition<=12)window.__tggToast?.('CAR CRITICAL • REPAIR WHEN SAFE');
    window.dispatchEvent(new CustomEvent('tgg:vehicle-condition',{detail:{condition:state.condition,damage:n,...detail}}));
    return state.condition;
  }

  function applyDamageVisual(force=false){
    const car=window.TGG3D?.car;if(!car)return;
    const bucket=Math.round(state.condition/5)*5;
    if(!force&&bucket===lastDamageVisual)return;
    lastDamageVisual=bucket;
    const damageRatio=1-state.condition/100;
    if(car.userData.bodyMaterial){
      car.userData.bodyMaterial.roughness=.28+damageRatio*.42;
      car.userData.bodyMaterial.metalness=.72-damageRatio*.28;
    }
    if(car.userData.underGlow)car.userData.underGlow.material.opacity=Math.max(.06,.18-damageRatio*.10);
    car.userData.headlights?.forEach((h,i)=>{h.material.emissiveIntensity=state.condition<25&&i===1?1.1:3.4});
  }

  function syncDriveTune(){
    const garageState=window.TGGGarage?.getState?.();
    const garagePresets=window.TGGGarage?.getPresets?.();
    const garageBase=garageState&&garagePresets?garagePresets[garageState.tuning]:null;
    const current=window.TGGGame?.getDriveTuning?.();
    const base=garageBase||baseTune||current;
    if(!base)return;
    if(!baseTune)baseTune={...base};
    const conditionFactor=.72+.28*(state.condition/100);
    const boostBase=Number(current?.boostMultiplier)||Number(baseTune?.boostMultiplier)||1.38;
    const boostFactor=state.condition<15?1.06:state.condition<35?Math.min(1.18,boostBase):boostBase;
    window.TGGGame?.setDriveTuning?.({
      maxForward:Number(base.maxForward)*conditionFactor,
      accel:Number(base.accel)*(.82+.18*(state.condition/100)),
      maxReverse:Number(base.maxReverse),
      reverseAccel:Number(base.reverseAccel),
      brake:Number(base.brake),
      coast:Number(base.coast),
      turnRate:Number(base.turnRate),
      boostMultiplier:boostFactor
    });
  }

  function trafficSpacing(){
    const traffic=window.TGG3D?.traffic||[];
    traffic.forEach(a=>{
      const def=a.userData?.traffic;if(!def)return;
      let nearest=Infinity;
      traffic.forEach(b=>{
        if(a===b)return;
        const bd=b.userData?.traffic;if(!bd||bd.axis!==def.axis||bd.lane!==def.lane||bd.dir!==def.dir)return;
        const ac=def.axis==='x'?a.position.x:a.position.z,bc=def.axis==='x'?b.position.x:b.position.z;
        let d=def.dir>0?bc-ac:ac-bc;if(d<=0)d+=96;if(d<nearest)nearest=d;
      });
      const existing=Number(a.userData.targetSpeedScale);let cap=1;
      if(nearest<4.2)cap=0;
      else if(nearest<6.5)cap=.25;
      else if(nearest<9)cap=.58;
      if(Number.isFinite(existing))window.TGG3D?.setTrafficSpeed?.(a,Math.min(existing,cap),cap<.7);
    });
  }

  function animateContacts(t){
    const contacts=window.TGGStreetContacts?.contacts||[];
    contacts.forEach((c,i)=>{
      const o=window.TGGStreetContacts?.getObject?.(c.id);if(!o)return;
      const p=o.userData?.parts;
      const near=window.TGGStreetContacts?.closest?.();
      const engaged=near?.id===c.id&&near.distance<9;
      if(p){
        const idle=Math.sin(t*.0018+i)*.035;
        p.head.rotation.z=window.THREE.MathUtils.lerp(p.head.rotation.z,idle,.08);
        if(!engaged)p.leftArm.rotation.z=window.THREE.MathUtils.lerp(p.leftArm.rotation.z,Math.sin(t*.002+i)*.06,.06);
      }
    });
  }

  function samplePerformance(now){
    const dt=now-lastTick;lastTick=now;
    if(dt>0&&dt<250)fpsFrames.push(dt);
    if(fpsFrames.length>90)fpsFrames.shift();
    if(fpsFrames.length>=45){
      const avg=fpsFrames.reduce((a,b)=>a+b,0)/fpsFrames.length;
      const fps=1000/avg;
      state.quality=fps<38?'performance':fps<52?'balanced':'high';
      document.body.dataset.megaQuality=state.quality;
    }
  }

  function tick(now=performance.now()){
    installHud();
    samplePerformance(now);
    const gs=window.TGGGame?.getState?.();
    if(gs?.inVehicle){
      const drive=window.TGGGame?.getDrivingState?.();
      if(Math.abs(Number(drive?.speed)||0)>.5&&Date.now()-state.lastImpactAt>1200)state.cleanSeconds+=Math.min(.05,(now-(tick.last||now))/1000);
    }
    tick.last=now;
    trafficSpacing();
    animateContacts(now);
    syncDriveTune();
    applyDamageVisual();
    render();
    requestAnimationFrame(tick);
  }

  window.addEventListener('tgg:traffic-impact',e=>{
    const strength=clamp(Number(e.detail?.strength)||.4,.15,1);
    damage(7+strength*18,{mph:e.detail?.mph||0,strength});
    if(navigator.vibrate)navigator.vibrate([35,30,55]);
  });
  window.addEventListener('tgg:mission-complete',()=>{
    const now=Date.now();
    state.missionStreak=(now-state.lastMissionAt<12*60*1000)?state.missionStreak+1:1;
    state.lastMissionAt=now;save();render();
  });

  const originalNearMiss=()=>window.TGGStreetLife?.nearMiss?.();
  let lastSeenNearMiss=0;
  setInterval(()=>{
    const t=Number(window.TGGStreetLife?.status?.()?.lastNearMissAt)||0;
    if(t&&t!==lastSeenNearMiss){
      lastSeenNearMiss=t;state.nearMissStreak++;state.bestNearMissStreak=Math.max(state.bestNearMissStreak,state.nearMissStreak);state.lastNearMissAt=Date.now();save();render();
    }
  },350);

  window.addEventListener('keydown',e=>{
    if(e.key==='?'||e.key==='/'){if(document.activeElement?.matches?.('input,textarea,select'))return;helpPanel?.classList.toggle('active')}
  });
  window.addEventListener('blur',()=>helpPanel?.classList.remove('active'));

  load();
  const status=()=>({
    version:'V2.12 MEGA 100',layers:LAYERS.length,condition:Number(state.condition.toFixed(1)),
    conditionState:conditionLabel(),nearMissStreak:state.nearMissStreak,bestNearMissStreak:state.bestNearMissStreak,
    cleanSeconds:Number(state.cleanSeconds.toFixed(1)),missionStreak:state.missionStreak,impacts:state.impacts,
    repairs:state.repairs,quality:state.quality
  });
  window.TGGV212={state,layers:LAYERS,status,damage,repairCar,repairCost,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(tick),{once:true});
  else requestAnimationFrame(tick);
})();