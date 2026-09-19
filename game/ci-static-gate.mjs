import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve('game');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))){
  const r=spawnSync(process.execPath,['--check',path.join(root,name)],{encoding:'utf8'});
  assert(r.status===0,'JavaScript syntax failed: '+name+'\n'+(r.stderr||r.stdout||''));
}

for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.json'))){
  try{JSON.parse(read(name));}catch(e){throw new Error('Invalid JSON '+name+': '+e.message);}
}

const contract=spawnSync(process.execPath,[path.join(root,'static-contract.test.mjs')],{encoding:'utf8'});
assert(contract.status===0,'V1.13 static contract failed:\n'+(contract.stderr||contract.stdout||''));

const continuity=spawnSync(process.execPath,[path.join(root,'v149-v160-runtime.test.mjs')],{encoding:'utf8'});
assert(continuity.status===0,'V1.49-V2.xx dynamic runtime continuity failed:\n'+(continuity.stderr||continuity.stdout||''));

const html=read('index.html');
const v114=read('v114-live-city.js');
const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]);
for(const src of scripts){
  const scriptPath=path.join(root,src);assert(fs.existsSync(scriptPath)&&fs.statSync(scriptPath).isFile(),'Missing script referenced by index.html: '+src);
}

// Auto-discover additive V1.88+ and V2.xx gameplay layers so new builder checkpoints
// cannot load without exposing a verifiable, evidence-based local runtime contract.
const additiveLayers=scripts
  .map(src=>{
    const v1=/^v1(\d{2})-[^/]+\.js$/.exec(src);
    const v2=/^v2(\d{2})-[^/]+\.js$/.exec(src);
    if(v1&&Number(v1[1])>=88)return{src,major:1,minor:Number(v1[1]),runtimeNumber:100+Number(v1[1])};
    if(v2)return{src,major:2,minor:Number(v2[1]),runtimeNumber:200+Number(v2[1])};
    return null;
  })
  .filter(Boolean);
for(const layer of additiveLayers){
  const source=read(layer.src);
  const runtimeToken='window.TGGV'+layer.runtimeNumber;
  const legacyToken=layer.major===1?'window.TGGV'+layer.minor:null;
  const hasRuntime=source.includes(runtimeToken)||(legacyToken&&source.includes(legacyToken));
  const versionPattern=layer.major===1
    ? new RegExp("(?:VERSION|V)\\s*=\\s*['\"]1\\.(?:"+layer.minor+"|"+layer.runtimeNumber+")\\.\\d+['\"]")
    : new RegExp("(?:VERSION|V)\\s*=\\s*['\"]2\\."+layer.minor+"\\.\\d+['\"]");
  assert(hasRuntime,'Missing additive runtime export '+runtimeToken+' in '+layer.src);
  assert(versionPattern.test(source),'Missing matching semantic version in '+layer.src);
  assert(!/\bok\s*:\s*true\b/.test(source),'False-green audit/gate is forbidden in '+layer.src+'; derive ok from evidence');
  assert(/\.snapshot\b|getState\b|document\.|performance\b/.test(source),'Evidence-free runtime audit forbidden in '+layer.src);
  for(const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','sb_secret_','sk_live_']){
    assert(!source.includes(forbidden),'Forbidden secret marker in '+layer.src+': '+forbidden);
  }
}

const ids=[...html.matchAll(/id=["']([^"']+)["']/g)].map(m=>m[1]);
const required=[
  'menu','creator','avatar','game','career','contentBoard','expansionBoard','progressionBoard',
  'inventoryBoard','crewBoard','eventsBoard','bridge','pause','hud','newGame','continueGame',
  'startGame','avatarStart','characterBtn','avatarDone','avatarBack','rotateLeft','rotateRight',
  'missionBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn',
  'inventoryBtn','crewBtn','eventsBtn','bridgeBtn','worldSyncBtn','chainBtn','saveBtn','pauseBtn',
  'resumeBtn','menuBtn','businessBoard','businessBtn'
];
const missing=required.filter(id=>!ids.includes(id));
assert(!missing.length,'Missing required DOM IDs: '+missing.join(', '));
assert(ids.length===new Set(ids).size,'Duplicate DOM IDs detected');

const sync=read('world-sync.js');
const manifest=JSON.parse(read('release-manifest.json'));
assert(html.includes('<script src="world-sync.js"></script>'),'world-sync.js is not loaded');

const syncTokens=[
  'window.TGGWorldSync','snapshot','setTransport','syncAvatar','positionPayload','heartbeat',
  'presenceBundle','nextMoves','offline_ready','tgg_world_v11_save_avatar',
  'tgg_world_presence_heartbeat_full','careerBundle','economyBundle','walletReconcile',
  'readRemoteState','tgg_world_economy_bundle','tgg_world_wallet_reconcile','remoteInventory',
  'equipRemoteItem','tgg_world_inventory_equip','socialBundle','crewActivity','crewRides',
  'crewBundle','contactOffers','tgg_world_social_hub','tgg_world_crew_bundle',
  'creativeMissions','npcEncounters','storyControl','memoryHistory','locationBundle',
  'missionStoryBundle','tgg_world_creative_missions','tgg_world_location_bundle',
  'propertyMarket','propertyUpgrades','vehicleProgression','vehicleBundle','worldAssetsBundle',
  'tgg_world_property_market','tgg_world_property_upgrades','tgg_world_vehicle_progression',
  'tgg_world_vehicle_bundle'
];
for(const token of syncTokens)assert(sync.includes(token),'Missing world sync contract token: '+token);

for(const forbidden of ['sb_secret_','SUPABASE_SERVICE_ROLE_KEY','sk_live_']){
  assert(!sync.includes(forbidden),'Forbidden secret marker in game bundle: '+forbidden);
}
assert(String(manifest.release||'').startsWith('V1.14'),'Release manifest is not V1.14');
assert(html.includes('<script src="v114-live-city.js"></script>'),'v114-live-city.js is not loaded');
for(const token of ['window.TGGV114','LIVE CITY ACTIVITIES','propertyCheckIn','vehicleRun','mutationPolicy'])assert(v114.includes(token),'Missing V1.14 runtime token: '+token);
for(const forbidden of ['tgg_world_buy_property','tgg_world_property_market_buy','tgg_world_vehicle_spawn','tgg_world_vehicle_drive_session','SUPABASE_SERVICE_ROLE_KEY','sb_secret_','sk_live_'])assert(!v114.includes(forbidden),'V1.14 forbidden mutation/secret token: '+forbidden);
assert(!sync.includes("rpc('tgg_world_purchase'"),'tgg_world_purchase must remain excluded from the game adapter');

const forbiddenRpcs=[
  'tgg_world_buy_property','tgg_world_property_market_buy','tgg_world_property_market_list',
  'tgg_world_property_market_cancel','tgg_world_install_property_upgrade','tgg_world_fast_travel',
  'tgg_world_v3_travel_to','tgg_world_vehicle_spawn','tgg_world_vehicle_join',
  'tgg_world_vehicle_drive_session','tgg_world_vehicle_install_tune','tgg_world_vehicle_music',
  'tgg_world_party_travel','tgg_world_mvp_v1_accept_mission','tgg_world_mvp_v1_complete_mission',
  'tgg_world_start_story_arc','tgg_world_claim_story_chapter','tgg_world_join_location',
  'tgg_world_join_location_at','tgg_world_v4_record_mission_evidence',
  'tgg_world_v4_verify_and_complete_mission','tgg_world_crew_create','tgg_world_crew_join',
  'tgg_world_social_post','tgg_world_social_comment','tgg_world_social_react',
  'tgg_world_party_create','tgg_world_party_invite'
];
for(const rpc of forbiddenRpcs)assert(!sync.includes("rpc('"+rpc+"'"),'Mutation RPC must remain excluded: '+rpc);

const business=read('business.js');
for(const token of ['window.TGGBusiness','businessBoard','businessBtn','worldAssetsBundle']){
  assert(business.includes(token)||html.includes(token),'Missing V1.13 business contract token: '+token);
}
for(const forbidden of ['tgg_world_buy_property','tgg_world_property_market_buy','tgg_world_vehicle_spawn','tgg_world_vehicle_drive_session']){
  assert(!business.includes(forbidden),'V1.13 business layer must remain discovery-only: '+forbidden);
}

console.log(JSON.stringify({
  v114:'LIVE_CITY_VEHICLE_PROPERTY_GAMEPLAY',
  ok:true,
  release:manifest.release,
  jsFiles:fs.readdirSync(root).filter(n=>n.endsWith('.js')).length,
  jsonFiles:fs.readdirSync(root).filter(n=>n.endsWith('.json')).length,
  scriptRefs:scripts.length,
  domIds:ids.length
}));
