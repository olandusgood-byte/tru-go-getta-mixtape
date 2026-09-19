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

const browserWorkflowPath=path.resolve('.github/workflows/game-browser-smoke.yml');
const browserWorkflow=fs.readFileSync(browserWorkflowPath,'utf8');
assert((browserWorkflow.match(/- name: Stop local game server/g)||[]).length===1,'Browser workflow duplicate tail detected');
assert((browserWorkflow.match(/^name: Game Browser Smoke$/gm)||[]).length===1,'Browser workflow header duplicated or missing');
assert(browserWorkflow.includes('run: node game/browser-smoke.mjs'),'Browser workflow must execute checked-in smoke runner');
const browserScriptPath=path.join(root,'browser-smoke.mjs');
assert(fs.existsSync(browserScriptPath),'Checked-in browser smoke runner missing');
const browserScript=fs.readFileSync(browserScriptPath,'utf8');
assert(browserScript.includes("Object.keys(window)")&&browserScript.includes("TGGV(\\d{3})"),'Browser smoke runner missing runtime-global discovery');
const browserSyntax=spawnSync(process.execPath,['--check',browserScriptPath],{encoding:'utf8'});
assert(browserSyntax.status===0,'Browser smoke JavaScript syntax failed:\n'+(browserSyntax.stderr||browserSyntax.stdout||''));

const liveViewerPath=path.resolve('tgg-core/public/live-viewer/index.html');
const liveViewerHtml=fs.readFileSync(liveViewerPath,'utf8');
const liveViewerInline=[...liveViewerHtml.matchAll(new RegExp('<script>([\\s\\S]*?)</script>','gi'))].map(m=>m[1]).filter(Boolean);
assert(liveViewerInline.length>0,'LiveViewer inline runtime missing');
for(const [i,source] of liveViewerInline.entries()){
  try{new Function(source)}catch(e){throw new Error('LiveViewer inline JavaScript syntax failed #'+(i+1)+': '+e.message);}
}
assert(liveViewerHtml.includes('window.TGGLiveViewerLaunch'),'LiveViewer deterministic launch runtime missing');

const contract=spawnSync(process.execPath,[path.join(root,'static-contract.test.mjs')],{encoding:'utf8'});
assert(contract.status===0,'V1.13 static contract failed:\n'+(contract.stderr||contract.stdout||''));

const continuity=spawnSync(process.execPath,[path.join(root,'v149-v160-runtime.test.mjs')],{encoding:'utf8'});
assert(continuity.status===0,'V1.49-V2.xx dynamic runtime continuity failed:\n'+(continuity.stderr||continuity.stdout||''));

const americaWorldgenTest=path.join(root,'v1901-v3000-america-worldgen.test.mjs');
if(fs.existsSync(americaWorldgenTest)){
  const americaWorldgen=spawnSync(process.execPath,[americaWorldgenTest],{encoding:'utf8'});
  assert(americaWorldgen.status===0,'V19.01-V30.00 America worldgen static checks failed:\n'+(americaWorldgen.stderr||americaWorldgen.stdout||''));
}

const html=read('index.html');
const v114=read('v114-live-city.js');
const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]);
for(const src of scripts){
  const scriptPath=path.join(root,src);assert(fs.existsSync(scriptPath)&&fs.statSync(scriptPath).isFile(),'Missing script referenced by index.html: '+src);
}

// Auto-discover additive runtime files. Single-version and bulk-range files use
// different discovery rules; both remain fail-closed for secrets and false-green evidence.
const additiveFiles=scripts.filter(src=>{
  const single=/^v(\d)(\d{2})-(?!v\d{3}-)[^/]+\.js$/.exec(src);
  const bulk=/^v(\d{3})-v(\d{3})-bulk-[^/]+\.js$/.exec(src);
  if(bulk)return Number(bulk[2])>=188;
  if(single){
    const n=Number(single[1])*100+Number(single[2]);
    return n>=188;
  }
  return false;
});
for(const src of additiveFiles){
  const source=read(src);
  const bulk=/^v(\d{3})-v(\d{3})-bulk-[^/]+\.js$/.exec(src);
  const runtimeExports=[...source.matchAll(/window\.TGGV(\d{2,3})\b/g)].map(m=>Number(m[1]));
  if(runtimeExports.length===0)continue;
  if(!bulk){
    const m=/^v(\d)(\d{2})-/.exec(src);
    const physical=Number(m[1])*100+Number(m[2]);
    const legacy=Number(m[2]);
    assert(runtimeExports.includes(physical)||(Number(m[1])===1&&runtimeExports.includes(legacy)),'Missing expected runtime export TGGV'+physical+' in '+src);
    const semantic=new RegExp("(?:VERSION|V)\\s*=\\s*['\"]"+Number(m[1])+"\\."+Number(m[2])+"\\.\\d+['\"]");
    const physicalSemantic=new RegExp("(?:VERSION|V)\\s*=\\s*['\"]"+Number(m[1])+"\\."+physical+"\\.\\d+['\"]");
    const legacyVersion=new RegExp("version\\s*:\\s*['\"]V"+physical+"['\"]");
    assert(semantic.test(source)||(Number(m[1])===1&&physicalSemantic.test(source))||legacyVersion.test(source),'Missing matching version identity in '+src);
  }else{
    const lo=Number(bulk[1]),hi=Number(bulk[2]);
    assert(runtimeExports.some(n=>n>=lo&&n<=hi),'Bulk runtime range has no matching exports in '+src);
    assert(/(?:VERSION|version)\s*[:=]\s*['\"](?:\d+\.\d+\.\d+|V\d+)['\"]/.test(source),'Bulk runtime file has no version identity in '+src);
  }
  assert(!/\bok\s*:\s*true\b/.test(source),'False-green audit/gate is forbidden in '+src+'; derive ok from evidence');
  const directEvidence=/\.snapshot\b|getState\b|document\.|performance\b/.test(source);
  const dependencyEvidence=/(?:window\.TGGGame|window\.TGGV\d{2,3})/.test(source)&&/const\s+checks\s*=\s*\{/.test(source)&&/failed\s*=\s*Object\.keys\(checks\)\.filter/.test(source)&&/ok\s*:\s*!failed\.length/.test(source);
  assert(directEvidence||dependencyEvidence,'Evidence-free runtime audit forbidden in '+src);
  assert(/mutationPolicy\s*:\s*['\"]local(?:_|-)/.test(source)||/POLICY\s*=\s*['\"]local(?:_|-)/.test(source),'Non-local mutation policy in '+src);
  for(const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','sb_secret_','sk_live_']){
    assert(!source.includes(forbidden),'Forbidden secret marker in '+src+': '+forbidden);
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
