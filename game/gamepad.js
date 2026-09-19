(() => {
  const DEAD=.22;
  let connected=false;
  const held={walkUp:false,walkDown:false,walkLeft:false,walkRight:false,sprint:false,gas:false,reverse:false,steerLeft:false,steerRight:false,drift:false};
  const edge={interact:false,vehicle:false,camera:false,horn:false};

  const pad=()=>{
    const list=navigator.getGamepads?.()||[];
    for(const p of list)if(p&&p.connected)return p;
    return null;
  };
  const value=(p,i)=>Math.max(0,Math.min(1,Number(p?.buttons?.[i]?.value||0)));
  const button=(p,i)=>!!p?.buttons?.[i]?.pressed||value(p,i)>.45;
  const axis=(p,i)=>{
    const v=Number(p?.axes?.[i]||0);
    return Math.abs(v)<DEAD?0:v;
  };
  const change=(key,next,fn)=>{
    if(held[key]===next)return;
    held[key]=next;
    fn(next);
  };
  const pulse=(key,next,fn)=>{
    if(next&&!edge[key])fn();
    edge[key]=next;
  };
  function releaseAll(){
    const g=window.TGGGame;
    ['up','down','left','right','sprint'].forEach(k=>g?.setWalkKey?.(k,false));
    ['forward','reverse','left','right','handbrake'].forEach(k=>g?.setDriveKey?.(k,false));
    g?.setWalkAnalog?.({x:0,y:0,sprint:0});
    g?.setDriveAnalog?.({steer:0,throttle:0,handbrake:0});
    Object.keys(held).forEach(k=>held[k]=false);
  }

  function tick(){
    requestAnimationFrame(tick);
    const p=pad();
    if(!p){
      if(connected){connected=false;releaseAll();window.__tggToast?.('CONTROLLER DISCONNECTED');}
      return;
    }
    if(!connected){connected=true;window.__tggToast?.('CONTROLLER READY');}
    const g=window.TGGGame,s=g?.getState?.();
    if(!g||!s)return;

    const x=axis(p,0),y=axis(p,1);
    if(s.inVehicle){
      const rt=value(p,7),lt=value(p,6);
      let throttle=rt-lt;
      if(Math.abs(throttle)<.05&&Math.abs(y)>.35)throttle=-y;
      const hb=Math.max(value(p,4),value(p,5));
      g.setDriveAnalog?.({steer:x,throttle,handbrake:hb});
      change('steerLeft',false,v=>g.setDriveKey?.('left',v));
      change('steerRight',false,v=>g.setDriveKey?.('right',v));
      change('gas',false,v=>g.setDriveKey?.('forward',v));
      change('reverse',false,v=>g.setDriveKey?.('reverse',v));
      change('drift',false,v=>g.setDriveKey?.('handbrake',v));
      g.setWalkAnalog?.({x:0,y:0,sprint:0});
      for(const [name,key] of [['walkUp','up'],['walkDown','down'],['walkLeft','left'],['walkRight','right'],['sprint','sprint']]){
        if(held[name]){held[name]=false;g.setWalkKey?.(key,false);}
      }
    }else{
      const sprint=Math.max(value(p,7),button(p,10)?1:0);
      g.setWalkAnalog?.({x,y,sprint});
      change('walkLeft',false,v=>g.setWalkKey?.('left',v));
      change('walkRight',false,v=>g.setWalkKey?.('right',v));
      change('walkUp',false,v=>g.setWalkKey?.('up',v));
      change('walkDown',false,v=>g.setWalkKey?.('down',v));
      change('sprint',false,v=>g.setWalkKey?.('sprint',v));
      g.setDriveAnalog?.({steer:0,throttle:0,handbrake:0});
      for(const [name,key] of [['gas','forward'],['reverse','reverse'],['steerLeft','left'],['steerRight','right'],['drift','handbrake']]){
        if(held[name]){held[name]=false;g.setDriveKey?.(key,false);}
      }
    }

    pulse('interact',button(p,0),()=>window.TGG3D?.interactNearest?.());
    pulse('vehicle',button(p,1),()=>g.toggleVehicle?.());
    pulse('camera',button(p,3),()=>window.TGG3D?.cycleCamera?.());
    pulse('horn',button(p,2),()=>g.horn?.());
  }

  window.addEventListener('gamepadconnected',()=>{connected=false;});
  window.addEventListener('gamepaddisconnected',()=>{connected=false;releaseAll();});
  requestAnimationFrame(tick);
  window.TGGGamepad={isConnected:()=>connected,releaseAll};
})();