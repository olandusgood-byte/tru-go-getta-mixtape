(() => {
  const DEAD=.22;
  let connected=false;
  const held={walkUp:false,walkDown:false,walkLeft:false,walkRight:false,sprint:false,gas:false,reverse:false,steerLeft:false,steerRight:false,drift:false,boost:false};
  const edge={interact:false,vehicle:false,camera:false,horn:false};

  const pad=()=>{
    const list=navigator.getGamepads?.()||[];
    for(const p of list)if(p&&p.connected)return p;
    return null;
  };
  const button=(p,i)=>!!p?.buttons?.[i]?.pressed||Number(p?.buttons?.[i]?.value||0)>.45;
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
    ['forward','reverse','left','right','handbrake','boost'].forEach(k=>g?.setDriveKey?.(k,false));
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
      change('steerLeft',x<-.25,v=>g.setDriveKey?.('left',v));
      change('steerRight',x>.25,v=>g.setDriveKey?.('right',v));
      change('gas',button(p,7)||y<-.4,v=>g.setDriveKey?.('forward',v));
      change('reverse',button(p,6)||y>.45,v=>g.setDriveKey?.('reverse',v));
      change('drift',button(p,4)||button(p,5),v=>g.setDriveKey?.('handbrake',v));
      change('boost',button(p,10)||button(p,11),v=>g.setDriveKey?.('boost',v));
      for(const [name,key] of [['walkUp','up'],['walkDown','down'],['walkLeft','left'],['walkRight','right'],['sprint','sprint']]){
        if(held[name]){held[name]=false;g.setWalkKey?.(key,false);}
      }
    }else{
      change('walkLeft',x<-.22,v=>g.setWalkKey?.('left',v));
      change('walkRight',x>.22,v=>g.setWalkKey?.('right',v));
      change('walkUp',y<-.22,v=>g.setWalkKey?.('up',v));
      change('walkDown',y>.22,v=>g.setWalkKey?.('down',v));
      change('sprint',button(p,7)||button(p,10),v=>g.setWalkKey?.('sprint',v));
      for(const [name,key] of [['gas','forward'],['reverse','reverse'],['steerLeft','left'],['steerRight','right'],['drift','handbrake'],['boost','boost']]){
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