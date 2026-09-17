(() => {
  const VERSION='1.6.0';
  let transport=null;
  let last={status:'offline_ready',syncedAt:null,error:null};

  const clone=value=>value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value;
  const safeObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

  function snapshot(){
    const player=clone(window.TGGGame?.getState?.()||{});
    const avatar=clone(window.TGGAvatar?.get?.()||{});
    const career=clone(window.TGGCareer?.career||{});
    const inventory=clone(window.TGGInventory?.state||{});
    const crew=clone(window.TGGCrew?.state||{});
    const events=clone(window.TGGEvents?.state||{});
    return {
      schema:'tgg-world-sync-v1',
      version:VERSION,
      capturedAt:new Date().toISOString(),
      player:{
        display_name:String(player.name||'PLAYER').slice(0,80),
        level:Math.max(1,Number(player.level)||1),
        xp:Math.max(0,Number(player.xp)||0),
        local_cash:Math.max(0,Number(player.cash)||0),
        x:Number.isFinite(Number(player.x))?Number(player.x):50,
        y:Number.isFinite(Number(player.y))?Number(player.y):55,
        style:String(player.style||'Artist').slice(0,80)
      },
      avatar:safeObject(avatar),
      career:{
        reputation:Math.max(0,Number(career.reputation)||0),
        recordings:Math.max(0,Number(career.recordings)||0),
        mixtapes:Math.max(0,Number(career.mixtapes)||0),
        studioLevel:Math.max(1,Number(career.studioLevel)||1)
      },
      inventory:safeObject(inventory),
      crew:safeObject(crew),
      events:safeObject(events)
    };
  }

  function avatarProfile(){
    const snap=snapshot();
    return {
      ...snap.avatar,
      display_name:snap.player.display_name,
      style:snap.player.style,
      source:'tgg-game-v1.6',
      schema:'tgg-avatar-profile-v1'
    };
  }

  function setTransport(fn){
    if(fn!==null&&typeof fn!=='function')throw new TypeError('TGGWorldSync transport must be a function or null');
    transport=fn;
    last={status:fn?'transport_ready':'offline_ready',syncedAt:null,error:null};
    return status();
  }

  async function rpc(name,args={}){
    if(!transport)return {ok:false,status:'offline_ready',rpc:name};
    try{
      const result=await transport({type:'rpc',name,args:clone(args)});
      if(!result||result.ok===false)throw new Error(result?.error||('RPC failed: '+name));
      return {ok:true,status:'synced',rpc:name,data:result.data??result};
    }catch(error){
      const message=String(error?.message||error).slice(0,500);
      last={status:'error',syncedAt:last.syncedAt,error:message};
      return {ok:false,status:'error',rpc:name,error:message};
    }
  }

  async function bootstrap(){
    if(!transport)return {ok:false,status:'offline_ready',steps:[]};
    const steps=[];
    for(const name of ['tgg_world_mvp_v1_bootstrap_player','tgg_world_v11_6_presence_bootstrap','tgg_world_v4_phone_bootstrap']){
      const result=await rpc(name,{});
      steps.push(result);
      if(!result.ok)return {ok:false,status:'error',steps};
    }
    last={status:'bootstrapped',syncedAt:new Date().toISOString(),error:null};
    return {ok:true,status:'bootstrapped',steps};
  }

  async function syncAvatar(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const result=await rpc('tgg_world_v11_save_avatar',{p_profile:avatarProfile()});
    if(result.ok)last={status:'synced',syncedAt:new Date().toISOString(),error:null};
    return result;
  }

  async function sync(){
    if(!transport)return {ok:false,status:'offline_ready',snapshot:snapshot()};
    const boot=await bootstrap();
    if(!boot.ok)return {ok:false,status:'error',bootstrap:boot};
    const avatar=await syncAvatar();
    if(!avatar.ok)return {ok:false,status:'error',bootstrap:boot,avatar};
    last={status:'synced',syncedAt:new Date().toISOString(),error:null};
    return {ok:true,status:'synced',bootstrap:boot,avatar,snapshot:snapshot()};
  }

  function status(){
    return {...last,connected:typeof transport==='function',version:VERSION};
  }

  window.TGGWorldSync={version:VERSION,snapshot,avatarProfile,setTransport,bootstrap,syncAvatar,sync,status};
})();
