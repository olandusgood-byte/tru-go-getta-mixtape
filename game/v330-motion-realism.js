(()=>{
  const VERSION='V3.30 MOTION VEHICLE CHARACTER';
  const wait=()=>new Promise(resolve=>{const t=()=>window.TGG3D?.isReady?.()?resolve(window.TGG3D):requestAnimationFrame(t);t()});
  const damp=(cur,target,lambda,dt)=>cur+(target-cur)*(1-Math.exp(-lambda*dt));
  wait().then(api=>{
    try{
      const {camera,player,car,pedestrians=[],traffic=[]}=api;
      let last=performance.now(),phase=0,camRoll=0,camBob=0;
      let lastCarY=car?.position?.y||0,lastPlayerY=player?.position?.y||0;
      const tick=now=>{
        requestAnimationFrame(tick);
        const dt=Math.min(.05,(now-last)/1000);last=now;phase+=dt;
        const pd=api.getPlayerDynamics?.()||{};
        const vd=api.getVehicleDynamics?.()||{};
        const inVehicle=!!window.TGGGame?.getState?.()?.inVehicle;
        const move=Math.min(1,Math.hypot(Number(pd.vx)||0,Number(pd.vy)||0)/8);
        const sprint=!!pd.sprinting;

        if(player?.userData?.parts&&!inVehicle){
          const p=player.userData.parts;
          const cadence=(sprint?10.5:7.2)*(0.55+move*.8);
          const cycle=Math.sin(phase*cadence);
          const weight=Math.cos(phase*cadence*.5);
          const targetPitch=move>0.04?(sprint?-.11:-.055):0;
          p.body.rotation.x=damp(p.body.rotation.x,targetPitch,8,dt);
          p.body.rotation.z=damp(p.body.rotation.z,(Number(pd.vx)||0)*-.004+cycle*.018*move,8,dt);
          p.head.rotation.x=damp(p.head.rotation.x,(sprint?.045:.02)*move,8,dt);
          p.head.rotation.y=damp(p.head.rotation.y,weight*.025*move,7,dt);
          if(p.leftArm&&p.rightArm){
            p.leftArm.rotation.z=damp(p.leftArm.rotation.z,-.08-(sprint?.08:0),9,dt);
            p.rightArm.rotation.z=damp(p.rightArm.rotation.z,.08+(sprint?.08:0),9,dt);
          }
        }

        if(car&&inVehicle){
          const speed=Math.abs(Number(vd.speed)||0);
          const ratio=Math.min(1,speed/10);
          const steer=Number(vd.steer)||0;
          const braking=vd.braking||vd.handbrake||false;
          const targetPitch=(braking?.035:-.018)*ratio;
          const targetRoll=-steer*ratio*(vd.handbrake?.12:.07);
          car.rotation.x=damp(car.rotation.x,targetPitch,7.5,dt);
          car.rotation.z=damp(car.rotation.z,targetRoll,9,dt);
          const suspension=Math.sin(now*.018+speed)*.014*ratio;
          car.position.y=damp(car.position.y,Math.max(0,lastCarY)+suspension,12,dt);
          car.userData.wheels?.forEach((w,i)=>{
            const front=w.userData?.front;
            const steerTarget=front?steer*.46:0;
            w.rotation.y=damp(w.rotation.y,steerTarget,18,dt);
            w.position.y=(w.userData.v330BaseY??=w.position.y)+Math.sin(now*.02+i)*.012*ratio;
          });
          lastCarY=car.position.y;
        }

        if(camera){
          const speed=Math.abs(Number(vd.speed)||0);
          const moveEnergy=inVehicle?Math.min(1,speed/11):Math.min(1,move+(sprint?.25:0));
          const rollTarget=inVehicle?-(Number(vd.steer)||0)*moveEnergy*.012:-(Number(pd.vx)||0)*.0009;
          camRoll=damp(camRoll,rollTarget,7,dt);
          camBob=damp(camBob,Math.sin(phase*(sprint?13:8))*moveEnergy*(inVehicle?.012:.02),9,dt);
          camera.rotation.z=damp(camera.rotation.z,camRoll,7,dt);
          if(!inVehicle)camera.position.y+=camBob;
        }

        pedestrians.forEach((h,i)=>{
          if(!h?.isGroup)return;
          const base=h.userData.v330BaseY??=h.position.y;
          const sway=Math.sin(phase*(1.6+(i%3)*.2)+i)*.012;
          h.position.y=damp(h.position.y,base+sway,6,dt);
          h.rotation.z=damp(h.rotation.z,Math.sin(phase*1.2+i)*.012,5,dt);
        });

        traffic.forEach((v,i)=>{
          if(!v?.isGroup)return;
          const base=v.userData.v330BaseY??=v.position.y;
          v.position.y=damp(v.position.y,base+Math.sin(phase*5+i)*.006,10,dt);
        });
      };
      requestAnimationFrame(tick);

      const status={version:VERSION,features:[
        'body-weight-transfer','sprint-posture','head-follow','arm-settle',
        'vehicle-pitch-roll','suspension-micro-motion','steering-wheel-response',
        'camera-roll-bob','crowd-idle-motion','traffic-micro-suspension'
      ]};
      document.documentElement.dataset.tggV330='on';
      window.TGGMotionRealism={...status,getStatus:()=>({...status})};
      window.dispatchEvent(new CustomEvent('tgg:v330-ready',{detail:status}));
    }catch(error){
      document.documentElement.dataset.tggV330='fallback';
      window.TGGMotionRealism={version:VERSION,error:String(error?.message||error),getStatus(){return {version:VERSION,mode:'safe-fallback'}}};
    }
  });
})();
