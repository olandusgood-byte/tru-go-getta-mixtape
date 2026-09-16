(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.TGGWorldAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SUPABASE_URL='https://xsofowzvwetamhyuvlpj.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_mJQg4LjW-9KsW5B1zzJH8Q_e-kA-bbv';
  const SDK_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const AVATAR={tone:['gold','bronze','deep'],outfit:['street','studio','stage'],accessory:['none','chain','shades']};
  const DEFAULT_AVATAR=Object.freeze({tone:'gold',outfit:'street',accessory:'none'});
  const PHONE_ACTIONS=Object.freeze({
    events:{kind:'screen',target:'eventsBoard'},
    crew:{kind:'screen',target:'crewBoard'},
    map:{kind:'screen',target:'game'},
    creator_os:{kind:'external',target:'creator'},
    messages:{kind:'external',target:'creator'},
    friends:{kind:'external',target:'creator'},
    music:{kind:'external',target:'creator'}
  });
  let browserClient=null;

  function choose(value,allowed,fallback){return allowed.includes(value)?value:fallback}
  function normalizeAvatar(input={}){return {
    tone:choose(input.tone,AVATAR.tone,DEFAULT_AVATAR.tone),
    outfit:choose(input.outfit,AVATAR.outfit,DEFAULT_AVATAR.outfit),
    accessory:choose(input.accessory,AVATAR.accessory,DEFAULT_AVATAR.accessory)
  }}
  function defaultBridgeState(){return {connected:false,user:null,player:null,apartment:null,life:null,phone:null,avatar:{...DEFAULT_AVATAR}}}
  function phoneAction(moduleKey){const action=PHONE_ACTIONS[moduleKey];return action?{...action}:null}

  async function bootstrapWorld(rpc){
    const player=await rpc('tgg_world_mvp_v1_bootstrap_player');
    await rpc('tgg_world_v4_phone_bootstrap');
    const apartment=await rpc('tgg_world_apartment_phone_bundle');
    const life=await rpc('tgg_world_life_phone');
    const phone=await rpc('tgg_world_phone_bundle');
    return {connected:true,player,apartment,life,phone,avatar:normalizeAvatar(apartment?.character?.avatar_config||player?.avatar||{})};
  }

  async function saveCharacterProfile(rpc,{stageName=null,avatar=null,activeCareer=null}={}){
    return rpc('tgg_world_update_character_profile',{
      p_stage_name:stageName==null?null:String(stageName).trim(),
      p_avatar_config:avatar==null?null:normalizeAvatar(avatar),
      p_active_career:activeCareer==null?null:String(activeCareer).trim().toLowerCase()
    });
  }

  function sdkReady(win){return !!win?.supabase?.createClient}
  function loadSdk(win){
    if(sdkReady(win))return Promise.resolve(win.supabase);
    return new Promise((resolve,reject)=>{
      const existing=win.document.querySelector('script[data-tgg-supabase-sdk]');
      if(existing){existing.addEventListener('load',()=>resolve(win.supabase),{once:true});existing.addEventListener('error',()=>reject(new Error('SUPABASE_SDK_LOAD_FAILED')),{once:true});return;}
      const script=win.document.createElement('script');script.src=SDK_URL;script.async=true;script.dataset.tggSupabaseSdk='1';script.onload=()=>sdkReady(win)?resolve(win.supabase):reject(new Error('SUPABASE_SDK_UNAVAILABLE'));script.onerror=()=>reject(new Error('SUPABASE_SDK_LOAD_FAILED'));win.document.head.appendChild(script);
    });
  }
  async function getClient(win=globalThis){
    if(browserClient)return browserClient;
    const sdk=await loadSdk(win);
    browserClient=sdk.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'tgg-world-auth-v1'}});
    return browserClient;
  }
  async function rpc(name,args={},win=globalThis){
    const client=await getClient(win);const {data,error}=await client.rpc(name,args);if(error)throw error;return data;
  }
  async function session(win=globalThis){const client=await getClient(win);const {data,error}=await client.auth.getSession();if(error)throw error;return data?.session||null}
  async function signIn(email,password,win=globalThis){const client=await getClient(win);const {data,error}=await client.auth.signInWithPassword({email:String(email||'').trim(),password:String(password||'')});if(error)throw error;return data}
  async function signOut(win=globalThis){const client=await getClient(win);const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;return true}
  async function connect(win=globalThis){const current=await session(win);if(!current)return defaultBridgeState();const client=await getClient(win);const {data,error}=await client.auth.getUser();if(error||!data?.user)return defaultBridgeState();const state=await bootstrapWorld((name,args)=>rpc(name,args,win));return {...state,user:{id:data.user.id,email:data.user.email||''}}}
  async function saveProfile(input,win=globalThis){return saveCharacterProfile((name,args)=>rpc(name,args,win),input)}
  async function savePhone(activeModule,pinnedModules=null,preferences=null,win=globalThis){return rpc('tgg_world_phone_save_state',{p_active_module:activeModule,p_pinned_modules:pinnedModules,p_preferences:preferences},win)}
  async function buyProperty(propertyKey,idempotencyKey,win=globalThis){return rpc('tgg_world_buy_property',{p_property_key:propertyKey,p_idempotency_key:idempotencyKey},win)}
  async function installPropertyUpgrade(propertyId,upgradeKey,win=globalThis){return rpc('tgg_world_install_property_upgrade',{p_property_id:propertyId,p_upgrade_key:upgradeKey},win)}

  return {SUPABASE_URL,PUBLISHABLE_KEY,SDK_URL,AVATAR,DEFAULT_AVATAR,PHONE_ACTIONS,normalizeAvatar,defaultBridgeState,phoneAction,bootstrapWorld,saveCharacterProfile,getClient,rpc,session,signIn,signOut,connect,saveProfile,savePhone,buyProperty,installPropertyUpgrade};
});
