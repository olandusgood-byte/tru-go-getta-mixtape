(() => {
  const dead=.22;
  let connected=false;
  let last={up:false,down:false,left:false,right:false,forward:false,reverse:false,steerLeft:false,steerRight:false,sprint:false,drift:false};
  let edge={interact:false,vehicle:false,camera:false,horn:false};

  function activeGamepad(){
    const pads=navigator.getGamepads?.()||[];
    for(const p of pads)if(p&&p.connected)return p;
    return null;
  }
  function btn(p,i){return !!p?.buttons?.[i]?.pressed || Number(p?.buttons?.[i]?.value||0)>.45;}
  function axis(p,i){const v=Number(p?.axes?.[i]||0);return Math.abs(v)<dead?0:v;}

  function setChanged(key,value,fn){
    if(last[key]===value)return;
    last[key]=value;
    fn(value);
  }
  function pulse(key,value,fn){
    if(value&&!edge[key])fn();
    edge[key]=value;
  }
  function releaseAll(){
    ['up','down','left','right','sprint'].forEach(k=>window.TGGGame?.setPlayerKey?.(k,false));
    ['forward','reverse','left','right','handbrake'].forEach(k=>window.TGGGame?.setDriveKey?.(k,false));
    Object.keys(last).forEach(k=>last[k]=false);
  }

  function tick(){
    requestAnimationFrame(tick);
    const p=activeGamepad();
    if(!p){
      if(connected){connected=false;releaseAll();window.__tggToast?.('CONTROLLER DISCONNECTED');}
      return;
    }
    if(!connected){connected=true;window.__tggToast?.('CONTROLLER READY');}

    const game=window.TGGGame;
    const s=game?.getState?.();
    if(!game||!s)return;

    const x=axis(p,0),y=axis(p,1);
    if(s.inVehicle){
      const left=x<-.25,right=x>.25;
      const forward=btn(p,7)||y<-.35;
      const reverse=btn(p,6)||y>.45;
      const drift=btn(p,4)||btn(p,5);
      setChanged('steerLeft',left,v=>game.setDriveKey?.('left',v));
      setChanged('steerRight',right,v=>game.setDriveKey?.('right',v));
      setChanged('forward',forward,v=>game.setDriveKey?.('forward',v));
      setChanged('reverse',reverse,v=>game.setDriveKey?.('reverse',v));
      setChanged('drift',drift,v=>game.setDriveKey?.('handbrake',v));
      ['up','down','left','right','sprint'].forEach(k=>{
        if(last[k]){last[k]=false;game.setPlayerKey?.(k,false);}
      });
    }else{
      const left=x<-.22,right=x>.22,up=y<-.22,down=y>.22;
      const sprint=btn(p,7)||btn(p,10);
      setChanged('left',left,v=>game.setPlayerKey?.('left',v));
      setChanged('right',right,v=>game.setPlayerKey?.('right',v));
      setChanged('up',up,v=>game.setPlayerKey?.('up',v));
      setChanged('down',down,v=>game.setPlayerKey?.('down',v));
      setChanged('sprint',sprint,v=>game.setPlayerKey?.('sprint',v));
      ['forward','reverse','steerLeft','steerRight','drift'].forEach(k=>{
        if(last[k]){
          last[k]=false;
          const ctl=k==='steerLeft'?'left':k==='steerRight'?'right':k==='drift'?'handbrake':k;
          game.setDriveKey?.(ctl,false);
        }
      });
    }

    pulse('interact',btn(p,0),()=>window.TGG3D?.interactNearest?.());
    pulse('vehicle',btn(p,1),()=>game.toggleVehicle?.());
    pulse('camera',btn(p,3),()=>window.TGG3D?.cycleCamera?.());
    pulse('horn',btn(p,2),()=>game.horn?.());
  }

  window.addEventListener('gamepadconnected',()=>{connected=false;});
  window.addEventListener('gamepaddisconnected',()=>{connected=false;releaseAll();});
  requestAnimationFrame(tick);
  window.TGGGamepad={isConnected:()=>connected,releaseAll};
})();