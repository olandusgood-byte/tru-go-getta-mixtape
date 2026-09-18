(() => {
  const KEY='tgg-game-v1';
  const $=id=>document.getElementById(id);
  let state={name:'PLAYER',style:'Artist',x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false,autoMode:true,heading:0,inVehicle:false};
  let activeScreen='menu';
  const driveKeys={forward:false,reverse:false,left:false,right:false,handbrake:false};
  const driveRuntime={speed:0,steer:0,lastTime:performance.now(),braking:false,handbrake:false};
  const DRIVE={maxForward:10,maxReverse:-4.5,accel:7.5,reverseAccel:5.5,brake:12,coast:3.4,turnRate:112};
  function setDriveTuning(next={}){
    ['maxForward','maxReverse','accel','reverseAccel','brake','coast','turnRate'].forEach(k=>{
      if(Number.isFinite(Number(next[k])))DRIVE[k]=Number(next[k]);
    });
    return {...DRIVE};
  }
  function getDriveTuning(){return {...DRIVE};}
  const screens=['menu','creator','game','pause','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','avatar','park','studio','shops','home','media','garage','businessBoard'];

  function show(id){
    activeScreen=id;
    screens.forEach(s=>$(s)?.classList.toggle('active',s===id));
    $('hud')?.classList.toggle('hidden',!['game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','businessBoard'].includes(id));
    window.TGGCareer?.render?.();
    window.TGGBridge?.render?.();
    window.TGGProgression?.render?.();
    window.TGGInventory?.render?.();
    window.TGGCrew?.render?.();
    window.TGGEvents?.render?.();
  }

  function toast(t){
    const el=$('toast');
    if(!el)return;
    el.textContent=t;
    el.classList.add('show');
    clearTimeout(window.__tggToastTimer);
    window.__tggToastTimer=setTimeout(()=>el.classList.remove('show'),1800);
  }

  function load(){
    let found=false;
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const x=JSON.parse(raw);
        if(x&&typeof x==='object'){
          state={...state,...x};
          found=true;
        }
      }
    }catch(e){}
    update();
    window.TGGProgression?.sync?.();
    return found;
  }

  function save(quiet=false){
    localStorage.setItem(KEY,JSON.stringify(state));
    if(!quiet)toast('GAME SAVED');
    window.TGGProgression?.sync?.();
    return state;
  }

  function spend(amount){
    amount=Math.max(0,Number(amount)||0);
    if(state.cash<amount){toast('NOT ENOUGH CASH');return false}
    state.cash-=amount;
    update();
    save();
    return true;
  }

  function activityReward(kind){
    const rewards={video:[120,35],photos:[80,25],premiere:[180,50],record:[100,30],mix:[90,28],release:[160,45],court:[60,20],fitness:[70,24],lobby:[40,12]};
    const r=rewards[kind]||[50,15];
    reward(r[0],r[1]);
    toast(kind.toUpperCase()+' COMPLETE • +$'+r[0]+' / +'+r[1]+' XP');
    window.TGGProgression?.sync?.();
    window.TGGCareer?.sync?.();
    window.TGGWorldSync?.sync?.();
  }

  function update(){
    $('hudName') && ($('hudName').textContent=state.name);
    $('hudLevel') && ($('hudLevel').textContent=state.level);
    $('hudCash') && ($('hudCash').textContent=state.cash);
    $('hudXp') && ($('hudXp').textContent=state.xp);
    $('hudNext') && ($('hudNext').textContent=state.level*100);
    if($('player')){$('player').style.left=state.x+'%';$('player').style.top=state.y+'%';$('player').style.setProperty('--player-turn',Math.max(-18,Math.min(18,Math.cos((Number(state.heading)||0)*Math.PI/180)*18))+'deg')}
    window.TGGAvatar?.renderMini?.();
    $('missionStatus') && ($('missionStatus').textContent=state.accepted?'Mission active — finish the job.':'Find M and start a mission.');
    $('missionBtn') && ($('missionBtn').textContent=state.mission?(state.accepted?'COMPLETE MISSION':'TAKE MISSION'):'TALK TO M');
    $('vehicleBtn') && ($('vehicleBtn').textContent=state.inVehicle?'EXIT CAR':'ENTER CAR');
    const speedMph=Math.round(Math.abs(driveRuntime.speed)*7.2);
    $('speedValue') && ($('speedValue').textContent=String(speedMph));
    $('gearValue') && ($('gearValue').textContent=state.inVehicle?(driveRuntime.speed<-.2?'R':driveRuntime.speed>.2?'D':'N'):'P');
    $('vehicleHud')?.classList.toggle('active',!!state.inVehicle);
    const md=Math.hypot((Number(state.x)||0)-72,(Number(state.y)||0)-36);
    const npcDialogue=$('npcDialogue');
    if(npcDialogue){
      const line=!state.mission?'M: You ready to make some noise?'
        :!state.accepted?'M: Take the job when you are ready.'
        :'M: Finish the move and come back with results.';
      npcDialogue.textContent=line;
      npcDialogue.classList.toggle('show',activeScreen==='game'&&md<16);
    }
    const driveState=driveRuntime.handbrake&&Math.abs(driveRuntime.speed)>2?'DRIFT':driveRuntime.braking?'BRAKE':Math.abs(driveRuntime.speed)>.3?'CRUISE':'IDLE';
    $('driveStateValue') && ($('driveStateValue').textContent=state.inVehicle?driveState:'PARK');
  }

  function addXp(n){
    state.xp+=Math.max(0,Number(n)||0);
    while(state.xp>=state.level*100){
      state.xp-=state.level*100;
      state.level++;
      toast('LEVEL UP — LEVEL '+state.level);
    }
    update();
    window.TGGProgression?.sync?.();
  }

  function reward(cash,xp){
    state.cash+=Math.max(0,Number(cash)||0);
    addXp(xp);
    save(true);
    return {cash:state.cash,xp:state.xp,level:state.level};
  }

  function setDriveKey(control,on){
    if(!(control in driveKeys))return false;
    driveKeys[control]=!!on;
    return true;
  }

  function driveVehicle(control){
    if(activeScreen!=='game'||!state.inVehicle)return false;
    if(control==='left'||control==='right'){
      const delta=control==='left'?-8:8;
      state.heading=(Number(state.heading||0)+delta+360)%360;
      driveRuntime.steer=control==='left'?-1:1;
      update();
      return true;
    }
    if(control==='forward'||control==='reverse'){
      const impulse=control==='forward'?1.8:-1.25;
      driveRuntime.speed=Math.max(DRIVE.maxReverse,Math.min(DRIVE.maxForward,driveRuntime.speed+impulse));
      return true;
    }
    return false;
  }

  function approach(value,target,amount){
    if(value<target)return Math.min(target,value+amount);
    if(value>target)return Math.max(target,value-amount);
    return target;
  }

  function updateVehiclePhysics(now){
    const dt=Math.min(.05,Math.max(.001,(now-driveRuntime.lastTime)/1000));
    driveRuntime.lastTime=now;

    if(activeScreen!=='game'||!state.inVehicle){
      driveRuntime.speed=approach(driveRuntime.speed,0,DRIVE.brake*dt);
      driveRuntime.steer=approach(driveRuntime.steer,0,6*dt);
      driveRuntime.braking=false;
      driveRuntime.handbrake=false;
      window.TGG3D?.setVehicleDynamics?.({speed:driveRuntime.speed,steer:driveRuntime.steer,braking:false,handbrake:false});
      requestAnimationFrame(updateVehiclePhysics);
      return;
    }

    const wantsForward=driveKeys.forward&&!driveKeys.reverse;
    const wantsReverse=driveKeys.reverse&&!driveKeys.forward;
    const movingForward=driveRuntime.speed>.15;
    const movingReverse=driveRuntime.speed<-.15;
    driveRuntime.braking=(wantsReverse&&movingForward)||(wantsForward&&movingReverse);
    driveRuntime.handbrake=!!driveKeys.handbrake;

    if(wantsForward){
      const rate=movingReverse?DRIVE.brake:DRIVE.accel;
      driveRuntime.speed=approach(driveRuntime.speed,DRIVE.maxForward,rate*dt);
    }else if(wantsReverse){
      const rate=movingForward?DRIVE.brake:DRIVE.reverseAccel;
      driveRuntime.speed=approach(driveRuntime.speed,DRIVE.maxReverse,rate*dt);
    }else{
      driveRuntime.speed=approach(driveRuntime.speed,0,DRIVE.coast*dt);
    }
    if(driveRuntime.handbrake){
      driveRuntime.speed=approach(driveRuntime.speed,0,5.8*dt);
    }

    const steerTarget=(driveKeys.left?-1:0)+(driveKeys.right?1:0);
    driveRuntime.steer=approach(driveRuntime.steer,Math.max(-1,Math.min(1,steerTarget)),5.5*dt);

    const speedRatio=Math.min(1,Math.abs(driveRuntime.speed)/DRIVE.maxForward);
    if(Math.abs(driveRuntime.steer)>.01&&Math.abs(driveRuntime.speed)>.08){
      const reverseSign=driveRuntime.speed<0?-1:1;
      const turnFactor=.25+speedRatio*.75;
      const driftBoost=driveRuntime.handbrake?1.65:1;
      state.heading=(Number(state.heading||0)+driveRuntime.steer*DRIVE.turnRate*turnFactor*reverseSign*driftBoost*dt+360)%360;
    }

    if(Math.abs(driveRuntime.speed)>.02){
      const rad=(Number(state.heading)||0)*Math.PI/180;
      const nx=Math.max(3,Math.min(94,state.x+Math.cos(rad)*driveRuntime.speed*dt));
      const ny=Math.max(8,Math.min(88,state.y+Math.sin(rad)*driveRuntime.speed*dt));
      if(window.TGG3D?.canMovePercent && !window.TGG3D.canMovePercent(nx,ny,true)){
        driveRuntime.speed*=.18;
      }else{
        state.x=nx;
        state.y=ny;
      }
    }

    window.TGG3D?.setVehicleDynamics?.({speed:driveRuntime.speed,steer:driveRuntime.steer,braking:driveRuntime.braking,handbrake:driveRuntime.handbrake});
    update();
    requestAnimationFrame(updateVehiclePhysics);
  }

  function move(dx,dy){
    if(activeScreen!=='game')return false;
    if(state.inVehicle){
      if(Math.abs(dx)>Math.abs(dy))return driveVehicle(dx<0?'left':'right');
      if(Math.abs(dy)>0)return driveVehicle(dy<0?'forward':'reverse');
      return false;
    }
    if(dx||dy)state.heading=Math.atan2(dy,dx)*180/Math.PI;
    const nx=Math.max(3,Math.min(94,state.x+dx));
    const ny=Math.max(8,Math.min(88,state.y+dy));
    if(window.TGG3D?.canMovePercent && !window.TGG3D.canMovePercent(nx,ny)){
      toast('CAN’T WALK THROUGH THAT');
      return false;
    }
    state.x=nx;state.y=ny;
    update();
    if(state.accepted&&Math.abs(state.x-72)<5&&Math.abs(state.y-36)<6)toast('You found the mission spot — hit COMPLETE MISSION');
    return true;
  }

  function toggleVehicle(){
    if(activeScreen!=='game')return false;
    if(state.inVehicle){
      state.inVehicle=false;
      driveRuntime.speed=0;
      Object.keys(driveKeys).forEach(k=>driveKeys[k]=false);
      window.TGG3D?.setVehicleDynamics?.({speed:0,steer:0,braking:false,handbrake:false});
      window.TGG3D?.setCameraMode?.('orbit',true);
      update();save(true);toast('EXITED STARTER CAR');
      return true;
    }
    const d=window.TGG3D?.distanceToCarPercent?.(state);
    if(Number.isFinite(d) && d>8){
      toast('MOVE CLOSER TO THE STARTER CAR');
      return false;
    }
    const carHeading=window.TGG3D?.getCarHeading?.();
    if(Number.isFinite(carHeading))state.heading=carHeading;
    state.inVehicle=true;
    driveRuntime.speed=0;
    driveRuntime.steer=0;
    driveRuntime.lastTime=performance.now();
    window.TGG3D?.setCameraMode?.('chase',true);
    window.TGG3D?.setVehicleDynamics?.({speed:0,steer:0,braking:false,handbrake:false});
    update();save(true);toast('STARTER CAR — HOLD GAS • SMOOTH STEERING ON');
    return true;
  }

  function horn(){
    if(activeScreen!=='game'||!state.inVehicle)return false;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx){toast('HONK!');return true;}
      window.__tggHornCtx=window.__tggHornCtx||new AudioCtx();
      const ctx=window.__tggHornCtx;
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='square';
      osc.frequency.setValueAtTime(155,ctx.currentTime);
      gain.gain.setValueAtTime(.055,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime+.19);
    }catch{}
    toast('HONK!');
    return true;
  }

  function mission(){
    if(activeScreen!=='game')return false;
    if(!state.mission){
      state.mission='studio-run';
      state.accepted=false;
      toast('M has a job for you.');
    }else if(!state.accepted){
      state.accepted=true;
      toast('MISSION ACCEPTED — get to the marked spot');
    }else if(Math.abs(state.x-72)<10&&Math.abs(state.y-36)<10){
      reward(250,50);
      state.mission=null;
      state.accepted=false;
      save(true);
      toast('MISSION COMPLETE +$250 +50 XP');
    }else{
      toast('Move closer to M to finish the mission');
    }
    update();
    return true;
  }

  function resetForNewGame(){
    state={
      name:($('stageName')?.value.trim()||'PLAYER'),
      style:$('styleChoice')?.value||'Artist',
      x:50,y:55,cash:0,xp:0,level:1,mission:null,accepted:false,autoMode:true,heading:0,inVehicle:false
    };
    update();
    save(true);
    return state;
  }

  function bindControls(){
    $('newGame')?.addEventListener('click',()=>show('creator'));
    $('continueGame')?.addEventListener('click',()=>{
      if(!load()){
        show('menu');
        toast('NO SAVE FOUND — CREATE A PLAYER');
        return;
      }
      show('game');
      toast('WELCOME BACK');
    });
    $('startGame')?.addEventListener('click',()=>{
      resetForNewGame();
      show('game');
      toast("CITY LOADED — LET'S GET IT");
    });
    $('avatarStart')?.addEventListener('click',()=>{
      resetForNewGame();
      window.TGGAvatar?.open?.();
    });
    $('missionBtn')?.addEventListener('click',mission);
    $('vehicleBtn')?.addEventListener('click',toggleVehicle);
    $('interact3dBtn')?.addEventListener('click',()=>window.TGG3D?.interactNearest?.());
    $('camera3dBtn')?.addEventListener('click',()=>window.TGG3D?.cycleCamera?.());
    $('hornBtn')?.addEventListener('click',horn);
    const driftBtn=$('driftBtn');
    if(driftBtn){
      driftBtn.addEventListener('pointerdown',e=>{if(state.inVehicle){e.preventDefault();setDriveKey('handbrake',true);driftBtn.setPointerCapture?.(e.pointerId)}});
      const releaseDrift=()=>setDriveKey('handbrake',false);
      driftBtn.addEventListener('pointerup',releaseDrift);
      driftBtn.addEventListener('pointercancel',releaseDrift);
      driftBtn.addEventListener('pointerleave',releaseDrift);
    }
    $('saveBtn')?.addEventListener('click',()=>save(false));
    $('pauseBtn')?.addEventListener('click',()=>show('pause'));
    $('resumeBtn')?.addEventListener('click',()=>show('game'));
    $('menuBtn')?.addEventListener('click',()=>show('menu'));
    $('progressionBtn')?.addEventListener('click',()=>{window.TGGProgression?.sync?.();show('progressionBoard')});
    $('progressionBack')?.addEventListener('click',()=>show('game'));

    $('characterBtn')?.addEventListener('click',()=>window.TGGAvatar?.open?.());
    $('parkBtn')?.addEventListener('click',()=>show('park'));
    $('studioBtn')?.addEventListener('click',()=>show('studio'));
    $('shopsBtn')?.addEventListener('click',()=>show('shops'));
    $('homeBtn')?.addEventListener('click',()=>show('home'));
    $('mediaBtn')?.addEventListener('click',()=>show('media'));
    $('businessBtn')?.addEventListener('click',()=>window.TGGBusiness?.open?.());
    $('garageBtn')?.addEventListener('click',()=>show('garage'));
    $('cityAssetsBtn')?.addEventListener('click',()=>{window.TGGBusiness?.open?.();window.TGGBusiness?.loadAssets?.()});

    $('mediaBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-media]').forEach(b=>b.addEventListener('click',()=>activityReward(b.dataset.media)));
    $('homeBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.home;
      if(a==='wardrobe'){window.TGGAvatar?.open?.();return}
      if(a==='save'){save();return}
      if(a==='career'){show('career')}
    }));
    $('shopsBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-shop]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.shop;
      if(a==='clothes'){window.TGGAvatar?.open?.();return}
      if(a==='shoes'){window.TGGAvatar?.open?.();toast('SOLE HOUSE — SHOES READY');return}
      if(a==='barber'){window.TGGAvatar?.open?.();toast('THE BARBER — HAIR CUSTOMIZATION');return}
      if(a==='jewelry'){window.TGGAvatar?.open?.();toast('ICE BOX — CHAIN CUSTOMIZATION')}
    }));
    $('studioBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-studio]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.studio;
      if(a==='record')activityReward('record');
      if(a==='mix')activityReward('mix');
      if(a==='release')activityReward('release');
    }));
    $('parkBack')?.addEventListener('click',()=>show('game'));
    document.querySelectorAll('[data-park]').forEach(b=>b.addEventListener('click',()=>activityReward(b.dataset.park)));

    document.addEventListener('keydown',e=>{
      if(activeScreen!=='game')return;
      const t=e.target;
      const typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;
      if(typing)return;
      const k=e.key.length===1?e.key.toLowerCase():e.key;
      if(k==='e'){e.preventDefault();toggleVehicle();return;}
      if(k==='f'){e.preventDefault();window.TGG3D?.interactNearest?.();return;}
      if(k==='c'){e.preventDefault();window.TGG3D?.cycleCamera?.();return;}
      if(k==='h'){e.preventDefault();horn();return;}
      if(k===' '||k==='Spacebar'){
        if(state.inVehicle){e.preventDefault();setDriveKey('handbrake',true);}
        return;
      }
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){
        e.preventDefault();
        if(state.inVehicle){
          const control=(k==='w'||k==='ArrowUp')?'forward':(k==='s'||k==='ArrowDown')?'reverse':(k==='a'||k==='ArrowLeft')?'left':'right';
          setDriveKey(control,true);
        }else{
          move(k==='a'||k==='ArrowLeft'?-2:k==='d'||k==='ArrowRight'?2:0,k==='w'||k==='ArrowUp'?-2:k==='s'||k==='ArrowDown'?2:0);
        }
      }
    });
    document.addEventListener('keyup',e=>{
      const k=e.key.length===1?e.key.toLowerCase():e.key;
      if(k===' '||k==='Spacebar'){setDriveKey('handbrake',false);return;}
      const control=(k==='w'||k==='ArrowUp')?'forward':(k==='s'||k==='ArrowDown')?'reverse':(k==='a'||k==='ArrowLeft')?'left':(k==='d'||k==='ArrowRight')?'right':null;
      if(control)setDriveKey(control,false);
    });
    document.querySelectorAll('[data-key]').forEach(b=>{
      const control=b.dataset.key==='ArrowUp'?'forward':b.dataset.key==='ArrowDown'?'reverse':b.dataset.key==='ArrowLeft'?'left':'right';
      b.addEventListener('pointerdown',e=>{
        if(activeScreen!=='game'||!state.inVehicle)return;
        e.preventDefault();
        setDriveKey(control,true);
        b.setPointerCapture?.(e.pointerId);
      });
      const release=()=>setDriveKey(control,false);
      b.addEventListener('pointerup',release);
      b.addEventListener('pointercancel',release);
      b.addEventListener('pointerleave',release);
      b.addEventListener('click',()=>{
        if(activeScreen!=='game'||state.inVehicle)return;
        const k=b.dataset.key;
        move(k==='ArrowLeft'?-2:k==='ArrowRight'?2:0,k==='ArrowUp'?-2:k==='ArrowDown'?2:0);
      });
    });
  }

  window.__tggToast=toast;
  window.TGGAutoMode={enabled:()=>true,toggle:()=>true};
  window.TGGGame={getState:()=>state,getActiveScreen:()=>activeScreen,show,refresh:update,reward,spend,save,load,move,driveVehicle,setDriveKey,getDrivingState:()=>({...driveRuntime}),setDriveTuning,getDriveTuning,horn,mission,toggleVehicle,resetForNewGame};

  load();
  requestAnimationFrame(updateVehiclePhysics);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindControls,{once:true});
  else bindControls();
})();