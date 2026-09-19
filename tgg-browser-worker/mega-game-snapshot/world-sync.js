(() => {
  const VERSION='1.12.0';
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

  function positionPayload(){
    const player=window.TGGGame?.getState?.()||{};
    const screen=[...document.querySelectorAll('.screen')].find(el=>el.classList.contains('active'))?.id||'game';
    return {
      position:{
        x:Number.isFinite(Number(player.x))?Number(player.x):50,
        y:Number.isFinite(Number(player.y))?Number(player.y):55,
        space:'city_percent',
        location:'the-city'
      },
      rotation:{
        yaw:Number.isFinite(Number(player.heading))?Number(player.heading):0,
        pitch:0,
        roll:0
      },
      activity:{
        mode:'game',
        screen,
        level:Math.max(1,Number(player.level)||1),
        mission:player.mission||null,
        mission_active:!!player.accepted,
        source:'tgg-game-v1.7'
      }
    };
  }

  async function heartbeat(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const payload=positionPayload();
    const result=await rpc('tgg_world_presence_heartbeat_full',{
      p_position:payload.position,
      p_rotation:payload.rotation,
      p_activity:payload.activity
    });
    if(result.ok)last={status:'online',syncedAt:new Date().toISOString(),error:null};
    return result;
  }

  async function presenceBundle(){
    return rpc('tgg_world_v11_6_presence_bundle',{});
  }

  async function nextMoves(){
    return rpc('tgg_world_next_moves',{});
  }

  async function careerBundle(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const climb=await rpc('tgg_world_career_climb',{});
    if(!climb.ok)return {ok:false,status:'error',climb};
    const tracks=await rpc('tgg_world_career_tracks',{});
    if(!tracks.ok)return {ok:false,status:'error',climb,tracks};
    const industry=await rpc('tgg_world_v12_career_industry_bundle',{});
    if(!industry.ok)return {ok:false,status:'error',climb,tracks,industry};
    return {ok:true,status:'ready',climb:climb.data,tracks:tracks.data,industry:industry.data};
  }

  async function economyBundle(){
    return rpc('tgg_world_economy_bundle',{});
  }

  async function walletReconcile(){
    return rpc('tgg_world_wallet_reconcile',{});
  }

  async function readRemoteState(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const career=await careerBundle();
    if(!career.ok)return {ok:false,status:'error',career};
    const economy=await economyBundle();
    if(!economy.ok)return {ok:false,status:'error',career,economy};
    const next=await nextMoves();
    if(!next.ok)return {ok:false,status:'error',career,economy,next};
    return {
      ok:true,
      status:'ready',
      career,
      economy:economy.data,
      nextMoves:next.data,
      virtualCurrencyOnly:economy.data?.real_money===false
    };
  }

  async function remoteInventory(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const economy=await economyBundle();
    if(!economy.ok)return economy;
    const data=economy.data||{};
    return {
      ok:true,
      status:'ready',
      inventory:Array.isArray(data.inventory)?data.inventory:[],
      catalog:Array.isArray(data.catalog)?data.catalog:[],
      virtualCurrencyOnly:data.real_money===false
    };
  }

  async function equipRemoteItem(itemKey){
    const key=String(itemKey||'').trim();
    if(!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(key))return {ok:false,status:'invalid_item_key'};
    if(!transport)return {ok:false,status:'offline_ready'};
    return rpc('tgg_world_inventory_equip',{p_item_key:key});
  }

  async function socialBundle(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const hub=await rpc('tgg_world_social_hub',{});
    if(!hub.ok)return {ok:false,status:'error',hub};
    const lobby=await rpc('tgg_world_social_lobby_bundle',{});
    if(!lobby.ok)return {ok:false,status:'error',hub,lobby};
    const engagement=await rpc('tgg_world_social_engagement',{});
    if(!engagement.ok)return {ok:false,status:'error',hub,lobby,engagement};
    const events=await rpc('tgg_world_discover_events',{});
    if(!events.ok)return {ok:false,status:'error',hub,lobby,engagement,events};
    return {ok:true,status:'ready',hub:hub.data,lobby:lobby.data,engagement:engagement.data,events:events.data};
  }

  async function crewActivity(){
    return rpc('tgg_world_crew_activity',{});
  }

  async function crewRides(){
    return rpc('tgg_world_crew_rides',{});
  }

  async function crewBundle(crewId){
    const id=String(crewId||'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return {ok:false,status:'invalid_crew_id'};
    return rpc('tgg_world_crew_bundle',{p_crew_id:id});
  }

  async function contactOffers(){
    return rpc('tgg_world_v12_contact_offers_bundle',{});
  }

  async function creativeMissions(){
    return rpc('tgg_world_creative_missions',{});
  }

  async function npcEncounters(){
    return rpc('tgg_world_npc_encounters',{});
  }

  async function storyControl(){
    return rpc('tgg_world_story_control',{});
  }

  async function memoryHistory(){
    return rpc('tgg_world_memory_history',{});
  }

  async function locationBundle(locationKey){
    const key=String(locationKey||'').trim();
    if(!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(key))return {ok:false,status:'invalid_location_key'};
    return rpc('tgg_world_location_bundle',{p_location_key:key});
  }

  async function missionStoryBundle(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const missions=await creativeMissions();
    if(!missions.ok)return {ok:false,status:'error',missions};
    const encounters=await npcEncounters();
    if(!encounters.ok)return {ok:false,status:'error',missions,encounters};
    const story=await storyControl();
    if(!story.ok)return {ok:false,status:'error',missions,encounters,story};
    const memory=await memoryHistory();
    if(!memory.ok)return {ok:false,status:'error',missions,encounters,story,memory};
    return {ok:true,status:'ready',missions:missions.data,encounters:encounters.data,story:story.data,memory:memory.data};
  }

  async function propertyMarket(){
    return rpc('tgg_world_property_market',{});
  }

  async function propertyUpgrades(){
    return rpc('tgg_world_property_upgrades',{});
  }

  async function vehicleProgression(){
    return rpc('tgg_world_vehicle_progression',{});
  }

  async function vehicleBundle(vehicleId){
    const id=String(vehicleId||'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return {ok:false,status:'invalid_vehicle_id'};
    return rpc('tgg_world_vehicle_bundle',{p_vehicle_id:id});
  }

  async function worldAssetsBundle(){
    if(!transport)return {ok:false,status:'offline_ready'};
    const properties=await propertyMarket();
    if(!properties.ok)return {ok:false,status:'error',properties};
    const upgrades=await propertyUpgrades();
    if(!upgrades.ok)return {ok:false,status:'error',properties,upgrades};
    const vehicles=await vehicleProgression();
    if(!vehicles.ok)return {ok:false,status:'error',properties,upgrades,vehicles};
    return {ok:true,status:'ready',properties:properties.data,propertyUpgrades:upgrades.data,vehicles:vehicles.data};
  }

  async function sync(){
    if(!transport)return {ok:false,status:'offline_ready',snapshot:snapshot()};
    const boot=await bootstrap();
    if(!boot.ok)return {ok:false,status:'error',bootstrap:boot};
    const avatar=await syncAvatar();
    if(!avatar.ok)return {ok:false,status:'error',bootstrap:boot,avatar};
    const presence=await heartbeat();
    if(!presence.ok)return {ok:false,status:'error',bootstrap:boot,avatar,presence};
    last={status:'synced',syncedAt:new Date().toISOString(),error:null};
    return {ok:true,status:'synced',bootstrap:boot,avatar,presence,snapshot:snapshot()};
  }

  function status(){
    return {...last,connected:typeof transport==='function',version:VERSION};
  }

  window.TGGWorldSync={version:VERSION,snapshot,avatarProfile,positionPayload,setTransport,bootstrap,syncAvatar,heartbeat,presenceBundle,nextMoves,careerBundle,economyBundle,walletReconcile,readRemoteState,remoteInventory,equipRemoteItem,socialBundle,crewActivity,crewRides,crewBundle,contactOffers,creativeMissions,npcEncounters,storyControl,memoryHistory,locationBundle,missionStoryBundle,propertyMarket,propertyUpgrades,vehicleProgression,vehicleBundle,worldAssetsBundle,sync,status};
})();
