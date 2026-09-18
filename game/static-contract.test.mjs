import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('./business.js',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const world=fs.readFileSync(new URL('./world-sync.js',import.meta.url),'utf8');
const events=fs.readFileSync(new URL('./events.js',import.meta.url),'utf8');
const progression=fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8');
const circuits=fs.readFileSync(new URL('./circuits.js',import.meta.url),'utf8');
const districtStory=fs.readFileSync(new URL('./district-story.js',import.meta.url),'utf8');
const routeMemory=fs.readFileSync(new URL('./route-memory.js',import.meta.url),'utf8');
const contactOps=fs.readFileSync(new URL('./contact-opportunities.js',import.meta.url),'utf8');
const world3d=fs.readFileSync(new URL('./world3d.js',import.meta.url),'utf8');
const qa=fs.readFileSync(new URL('./qa.js',import.meta.url),'utf8');
const releaseQa=fs.readFileSync(new URL('./release-qa.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('./release-manifest.json',import.meta.url),'utf8'));
const auto=JSON.parse(fs.readFileSync(new URL('./auto-builder-manifest.json',import.meta.url),'utf8'));
const qaManifest=JSON.parse(fs.readFileSync(new URL('./qa-manifest.json',import.meta.url),'utf8'));

assert.match(html,/Game V1\.25/);
assert.match(html,/GAME V1\.25 • STARTER CAR \+ DRIVE MODE/);
assert.match(html,/<script src="business\.js"><\/script>/);
assert.match(html,/<script src="circuits\.js"><\/script>/);
assert.match(html,/<script src="district-story\.js"><\/script>/);
assert.match(html,/<script src="route-memory\.js"><\/script>/);
assert.match(html,/<script src="contact-opportunities\.js"><\/script>/);
assert.match(html,/<script src="world3d\.js"><\/script>/);
assert.match(html,/id="world3dBadge"/);
assert.match(html,/id="worldDistrictBadge"/);
assert.match(html,/id="interactionPrompt"/);
assert.match(html,/id="businessBoard"/);
assert.match(html,/id="businessBtn"/);
assert.match(html,/id="cityAssetsBtn"/);


assert.match(world3d,/window\.TGGWorld3D/);
assert.match(world3d,/three@0\.186\.0/);
assert.match(world3d,/WebGLRenderer/);
assert.match(world3d,/PerspectiveCamera/);
assert.match(world3d,/stateToWorld/);
assert.match(world3d,/camera\.lookAt/);
assert.match(world3d,/webgl-ready/);
assert.match(world3d,/webgl-fallback/);
assert.match(world3d,/TGGGame\?\.getState/);
assert.equal(world3d.includes('localStorage.setItem'),false);
assert.equal(world3d.includes('TGGGame?.reward'),false);
assert.equal(world3d.includes('TGGCareer?.addRep'),false);
assert.match(world3d,/version:'1\.25\.0'/);
assert.match(world3d,/const BUILDINGS=/);
assert.match(world3d,/constrainPercent/);
assert.match(world3d,/isBlockedPercent/);
assert.match(world3d,/districtAtPercent/);
assert.match(world3d,/collisionBoxes/);
assert.match(world3d,/percentToWorld\(72,36\)/);
assert.match(game,/TGGWorld3D\?\.constrainPercent/);
assert.match(world3d,/version:'1\.25\.0'/);
assert.match(world3d,/userData\.rig/);
assert.match(world3d,/walkPhase/);
assert.match(world3d,/nearestInteraction/);
assert.match(world3d,/activateNearest/);
assert.match(world3d,/interactionPrompt/);
assert.match(world3d,/missionBtn/);

assert.match(world3d,/const HUBS=/);
for (const hub of ['studio-hub','park-hub','shops-hub','apartment-hub','media-hub']) assert.match(world3d,new RegExp(hub));
assert.match(world3d,/buildHubLandmarks/);
assert.match(world3d,/type:'hub'/);
assert.match(world3d,/status:'entered_hub'/);
assert.match(world3d,/ENTER '\+hub\.name/);
assert.match(world3d,/candidates\.sort/);

assert.match(world3d,/STARTER_CAR/);
assert.match(world3d,/createStarterCar/);
assert.match(world3d,/TGGStarterCar3D/);
assert.match(world3d,/distanceToCarPercent/);
assert.match(world3d,/type:'vehicle'/);
assert.match(world3d,/EXIT STARTER CAR/);
assert.match(world3d,/ENTER STARTER CAR/);
assert.match(world3d,/wheel/);
assert.match(game,/inVehicle:false/);
assert.match(game,/function toggleVehicle/);
assert.match(game,/state\.inVehicle\?1\.75:1/);
assert.match(game,/vehicleBtn/);
assert.match(game,/TGGWorld3D\?\.distanceToCarPercent/);
assert.equal(world3d.includes('TGGGame?.reward'),false);
assert.equal(world3d.includes('TGGCareer?.addRep'),false);



assert.match(business,/VERSION='1\.14\.0'/);
assert.match(business,/window\.TGGBusiness/);
assert.match(business,/worldAssetsBundle/);
assert.match(business,/tgg-business-v1/);
assert.match(business,/V1\.14 • LIVE CITY \+ READ-ONLY WORLD ASSETS/);
for (const api of ['loadAssets','renderAssets','activitySnapshot','inspectProperty','inspectVehicle']) {
  assert.match(business,new RegExp('function '+api+'\\b'));
}
assert.match(business,/readOnly:true/);
assert.match(business,/const esc=/);
assert.match(business,/esc\(assetName\(/);

for (const token of [
  "newGame')?.addEventListener",
  "continueGame')?.addEventListener",
  "startGame')?.addEventListener",
  "missionBtn')?.addEventListener",
  "saveBtn')?.addEventListener",
  "pauseBtn')?.addEventListener",
  "resumeBtn')?.addEventListener",
  "progressionBtn')?.addEventListener",
  "DOMContentLoaded"
]) {
  assert.ok(game.includes(token),'missing playable control binding: '+token);
}
assert.match(game,/if\(activeScreen!==['"]game['"]\)return false/);


for (const api of ['totalRuns','mastery','cityProfile','recordMomentum']) {
  assert.match(events,new RegExp('function '+api+'\\b'));
}
assert.match(events,/tgg-events-v1/);
assert.match(events,/streak:0/);
assert.match(events,/bestStreak:0/);
for (const reward of [
  /street-cypher[^\n]+cash:180,xp:35,rep:10/,
  /studio-pop-in[^\n]+cash:275,xp:55,rep:20/,
  /release-rush[^\n]+cash:450,xp:90,rep:35/
]) assert.match(events,reward);
for (const achievement of ['city-regular','city-known','city-headliner']) assert.match(progression,new RegExp(achievement));


assert.match(circuits,/tgg-circuits-v1/);
assert.match(circuits,/window\.TGGCircuits/);
for (const api of ['start','expected','status','onEventComplete','variant','render']) {
  assert.match(circuits,new RegExp('function '+api+'\\b'));
}
assert.match(circuits,/first-lap/);
assert.match(circuits,/city-run/);
assert.match(circuits,/rewardMultiplier:1/);
assert.match(circuits,/cosmeticOnly:true/);
assert.equal(circuits.includes('TGGGame?.reward'),false);
assert.equal(circuits.includes('TGGCareer?.addRep'),false);
assert.match(events,/TGGCircuits\?\.onEventComplete/);
assert.match(events,/TGGCircuits\?\.variant/);
assert.match(events,/TGGCircuits\?\.render/);
for (const achievement of ['first-circuit','city-circuit']) assert.match(progression,new RegExp(achievement));


assert.match(districtStory,/tgg-district-story-v1/);
assert.match(districtStory,/window\.TGGDistrictStory/);
assert.match(districtStory,/city-story-lap/);
assert.match(districtStory,/missionStoryBundle/);
for (const api of ['districtState','currentBeat','status','start','onCircuitResult','summarizeRemoteStory','refreshRemoteStory','render']) {
  assert.match(districtStory,new RegExp('function '+api+'\\b'));
}
assert.match(circuits,/TGGDistrictStory\?\.onCircuitResult/);
assert.equal(districtStory.includes('TGGGame?.reward'),false);
assert.equal(districtStory.includes('TGGCareer?.addRep'),false);
for (const forbiddenStoryWrite of [
  'tgg_world_mvp_v1_accept_mission',
  'tgg_world_mvp_v1_complete_mission',
  'tgg_world_start_story_arc',
  'tgg_world_claim_story_chapter',
  'tgg_world_join_location',
  'tgg_world_join_location_at',
  'tgg_world_v4_record_mission_evidence',
  'tgg_world_v4_verify_and_complete_mission'
]) assert.equal(districtStory.includes(forbiddenStoryWrite),false,'story router must remain read-only: '+forbiddenStoryWrite);
assert.match(progression,/district-story/);


assert.match(routeMemory,/tgg-route-memory-v1/);
assert.match(routeMemory,/window\.TGGRouteMemory/);
for (const npc of ['m','producer','dj']) assert.match(routeMemory,new RegExp(npc+':'));
for (const api of ['districtMemory','recordBeat','currentNpc','encounterCurrent','uniqueNpcIds','memorySnapshot','summarizeRemote','refreshRemoteMemory','render']) {
  assert.match(routeMemory,new RegExp('function '+api+'\\b'));
}
assert.match(routeMemory,/npcEncounters/);
assert.match(routeMemory,/memoryHistory/);
assert.match(events,/TGGDistrictStory\?\.render/);
assert.match(districtStory,/TGGRouteMemory\?\.recordBeat/);
assert.match(districtStory,/TGGRouteMemory\?\.render/);
assert.equal(routeMemory.includes('TGGGame?.reward'),false);
assert.equal(routeMemory.includes('TGGCareer?.addRep'),false);
assert.equal(routeMemory.includes('TGGEconomy?.apply'),false);
for (const forbiddenNpcWrite of [
  'tgg_world_mvp_v1_accept_mission',
  'tgg_world_mvp_v1_complete_mission',
  'tgg_world_start_story_arc',
  'tgg_world_claim_story_chapter',
  'tgg_world_join_location',
  'tgg_world_join_location_at',
  'tgg_world_v4_record_mission_evidence',
  'tgg_world_v4_verify_and_complete_mission',
  'tgg_world_social_post',
  'tgg_world_social_comment',
  'tgg_world_social_react'
]) assert.equal(routeMemory.includes(forbiddenNpcWrite),false,'route memory must remain read-only: '+forbiddenNpcWrite);
assert.match(progression,/know-the-city/);


assert.match(routeMemory,/relationships:\{\}/);
assert.match(routeMemory,/RELATION_EVENT/);
assert.match(routeMemory,/DIALOGUE/);
for (const api of ['relationship','dialogue','syncRelationships']) {
  assert.match(routeMemory,new RegExp('function '+api+'\\b'));
}
assert.match(events,/TGGRouteMemory\?\.syncRelationships/);
assert.match(progression,/trusted-contact/);
assert.equal(routeMemory.includes('tgg-relationship-v1'),false);
assert.equal(routeMemory.includes('TGGGame?.reward'),false);
assert.equal(routeMemory.includes('TGGCareer?.addRep'),false);
assert.equal(routeMemory.includes('TGGEconomy?.apply'),false);


assert.match(contactOps,/window\.TGGContactOps/);
assert.match(contactOps,/manager-intro/);
assert.match(contactOps,/producer-lockin/);
assert.match(contactOps,/dj-test-spin/);
assert.match(contactOps,/TIER_SCORE/);
assert.match(contactOps,/baseRun/);
for (const api of ['memory','available','list','start','onEventComplete','status','render']) {
  assert.match(contactOps,new RegExp('function '+api+'\\b'));
}
assert.match(events,/TGGContactOps\?\.onEventComplete/);
assert.match(routeMemory,/TGGContactOps\?\.render/);
assert.match(progression,/first-opportunity/);
assert.equal(contactOps.includes('localStorage'),false);
assert.equal(contactOps.includes('tgg-contact-opportunities-v1'),false);
assert.equal(contactOps.includes('TGGGame?.reward'),false);
assert.equal(contactOps.includes('TGGCareer?.addRep'),false);
assert.equal(contactOps.includes('TGGEconomy?.apply'),false);

for (const api of ['propertyMarket','propertyUpgrades','vehicleProgression','vehicleBundle','worldAssetsBundle']) {
  assert.match(world,new RegExp('function '+api+'\\b'));
}
for (const rpc of ['tgg_world_property_market','tgg_world_property_upgrades','tgg_world_vehicle_progression','tgg_world_vehicle_bundle']) {
  assert.match(world,new RegExp(rpc));
}

const forbidden=[
  'tgg_world_buy_property',
  'tgg_world_property_market_buy',
  'tgg_world_property_market_list',
  'tgg_world_property_market_cancel',
  'tgg_world_install_property_upgrade',
  'tgg_world_fast_travel',
  'tgg_world_v3_travel_to',
  'tgg_world_vehicle_spawn',
  'tgg_world_vehicle_join',
  'tgg_world_vehicle_drive_session',
  'tgg_world_vehicle_install_tune',
  'tgg_world_vehicle_music',
  'tgg_world_party_travel',
  'sb_secret_',
  'SUPABASE_SERVICE_ROLE_KEY',
  'sk_live_'
];
for (const token of forbidden) {
  assert.equal(world.includes(token),false,'world-sync must not contain '+token);
  assert.equal(business.includes(token),false,'business layer must not contain '+token);
}

for (const token of ['business-assets-loader','live-city-activity-snapshot','property-readonly-inspect','vehicle-readonly-inspect','city-assets-hotspot']) {
  assert.match(qa,new RegExp(token));
}
for (const token of ['business assets loader','live city activity snapshot','property readonly inspect','vehicle readonly inspect','city assets hotspot']) {
  assert.match(releaseQa,new RegExp(token));
}

assert.equal(release.release,'V1.25 Starter Car + Drive Mode');
assert.equal(release.base,'V1.24 Unified 3D Gameplay Slice');
assert.equal(auto.version,'1.25');
assert.equal(qaManifest.version,'1.25');
assert.ok(['candidate_pending_ci','automated_ci_pass','automated_webgl_ci_pass'].includes(release.browser_smoke));
assert.equal(auto.browserPolicy,'automated_ci_required');
assert.ok(['pending_ci','passed'].includes(auto.verification));
assert.equal(qaManifest.browserPolicy,'automated_ci_required');
assert.ok(['pending_ci','passed'].includes(qaManifest.verification));
assert.equal(release.production,'gated');
assert.ok(release.modules.includes('V1.14-LIVE-CITY-ACTIVITY-SURFACE'));
assert.ok(release.modules.includes('V1.14-WORLD-ASSET-READONLY-INSPECT'));
assert.ok(release.gates.includes('remote_label_escape'));
assert.ok(release.gates.includes('city_mastery_api'));
assert.ok(release.gates.includes('base_event_economy_unchanged'));
assert.ok(release.gates.includes('circuit_api'));
assert.ok(release.gates.includes('circuit_ordering'));
assert.ok(release.gates.includes('event_variants_cosmetic_only'));
assert.ok(release.gates.includes('district_story_api'));
assert.ok(release.gates.includes('remote_story_readonly'));
assert.ok(release.gates.includes('story_router_no_rewards'));
assert.ok(release.gates.includes('route_memory_api'));
assert.ok(release.gates.includes('remote_memory_readonly'));
assert.ok(release.gates.includes('route_memory_no_rewards'));
assert.ok(release.gates.includes('relationship_api'));
assert.ok(release.gates.includes('repeat_talk_no_progress'));
assert.ok(release.gates.includes('single_memory_store'));
assert.ok(release.gates.includes('contact_ops_api'));
assert.ok(release.gates.includes('contact_ops_no_bonus_rewards'));
assert.ok(release.gates.includes('opportunities_single_memory_store'));
assert.ok(release.gates.includes('world3d_api'));
assert.ok(release.gates.includes('third_person_camera'));
assert.ok(release.gates.includes('player_state_sync_3d'));
assert.ok(release.gates.includes('world3d_collision_api'));
assert.ok(release.gates.includes('authoritative_move_collision'));
assert.ok(release.gates.includes('mission_npc_alignment'));
assert.ok(release.gates.includes('walk_rig_animation'));
assert.ok(release.gates.includes('proximity_interaction_api'));
assert.ok(release.gates.includes('shared_mission_action'));

assert.ok(release.gates.includes('hub_catalog'));
assert.ok(release.gates.includes('five_hub_routes'));
assert.ok(release.gates.includes('unified_nearest_interaction'));
assert.ok(release.gates.includes('hub_enter_action'));
assert.ok(release.gates.includes('single_e_action'));

assert.ok(release.gates.includes('starter_car_mesh'));
assert.ok(release.gates.includes('vehicle_saved_state'));
assert.ok(release.gates.includes('vehicle_proximity_gate'));
assert.ok(release.gates.includes('drive_speed'));
assert.ok(release.gates.includes('vehicle_collision'));
assert.ok(release.gates.includes('car_follow_camera'));
assert.ok(release.gates.includes('wheel_animation'));
assert.ok(release.gates.includes('single_e_vehicle_action'));
assert.ok(release.gates.includes('vehicle_no_reward_path'));



console.log('GAME_V1_25_STATIC_CONTRACT_PASS');
