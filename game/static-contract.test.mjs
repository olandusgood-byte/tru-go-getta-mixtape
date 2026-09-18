import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const game3d=fs.readFileSync(new URL('./game-3d.js',import.meta.url),'utf8');
const garage=fs.readFileSync(new URL('./garage.js',import.meta.url),'utf8');
const studio3d=fs.readFileSync(new URL('./studio-3d.js',import.meta.url),'utf8');
const interiors3d=fs.readFileSync(new URL('./interiors-3d.js',import.meta.url),'utf8');
const garage3d=fs.readFileSync(new URL('./garage-3d.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('./navigation.js',import.meta.url),'utf8');
const streetLife=fs.readFileSync(new URL('./street-life.js',import.meta.url),'utf8');
const streetEvents=fs.readFileSync(new URL('./street-events.js',import.meta.url),'utf8');
const streetSets=fs.readFileSync(new URL('./street-sets.js',import.meta.url),'utf8');
const streetAudience=fs.readFileSync(new URL('./street-audience.js',import.meta.url),'utf8');
const world=fs.readFileSync(new URL('./world-sync.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('./release-manifest.json',import.meta.url),'utf8'));
const auto=JSON.parse(fs.readFileSync(new URL('./auto-builder-manifest.json',import.meta.url),'utf8'));
const qa=JSON.parse(fs.readFileSync(new URL('./qa-manifest.json',import.meta.url),'utf8'));

assert.match(html,/Game V1\.35 3D/);
assert.match(html,/GAME V1\.35 • STREET CREWS \+ AUDIENCE MEMORY/);
assert.match(html,/vendor\/three-r152\.min\.js/);
assert.match(html,/id="garage"/);
assert.match(html,/id="garageBtn"/);
assert.match(html,/id="studio3d"/);
assert.match(html,/id="npcDialogue"/);
assert.match(html,/id="driftBtn"/);
assert.match(html,/id="hornBtn"/);
for(const id of ['home3d','media3d','shops3d','park3d','garage3d','navHud']) assert.match(html,new RegExp('id="'+id+'"'));
assert.match(html,/<script src="interiors-3d\.js"><\/script>/);
assert.match(html,/<script src="garage-3d\.js"><\/script>/);
assert.match(html,/<script src="navigation\.js"><\/script>/);
assert.match(html,/<script src="street-life\.js"><\/script>/);
assert.match(html,/<script src="street-events\.js"><\/script>/);
assert.match(html,/<script src="street-sets\.js"><\/script>/);
assert.match(html,/<script src="street-audience\.js"><\/script>/);
assert.match(html,/id="streetLifePrompt"/);
assert.match(html,/id="streetDialogue"/);
assert.match(html,/id="streetEventPrompt"/);
assert.match(html,/id="streetEventHud"/);
assert.match(html,/id="streetSetHud"/);

assert.match(garage,/tgg-garage-v1/);
assert.match(garage,/window\.TGGGarage/);
assert.match(garage,/street:/);
assert.match(garage,/sport:/);
assert.match(garage,/drift:/);
assert.match(garage,/setCarAppearance/);
assert.match(garage,/setDriveTuning/);

assert.match(game,/function setDriveTuning/);
assert.match(game,/function getDriveTuning/);
assert.match(game,/garageBtn/);
assert.match(game,/driftBtn/);
assert.match(game,/hornBtn/);
assert.match(game,/npcDialogue/);
assert.match(game,/md<16/);
assert.match(game,/canMovePercent\(nx,ny,true\)/);

assert.match(game3d,/function setCarAppearance/);
assert.match(game3d,/extra=vehicle \? \.9 : 0/);
assert.match(game3d,/window\.TGG3D/);
assert.match(game3d,/setVehicleDynamics/);
assert.match(game3d,/getVehicleDynamics/);

assert.match(studio3d,/id='studio3d'|getElementById\('studio3d'\)/);
assert.match(studio3d,/WebGLRenderer/);
assert.match(studio3d,/window\.TGGStudio3D/);
assert.match(studio3d,/DOMContentLoaded/);

assert.match(interiors3d,/window\.TGGInteriors3D/);
for(const host of ['home3d','media3d','shops3d','park3d']) assert.match(interiors3d,new RegExp(host));
assert.match(interiors3d,/WebGLRenderer/);
assert.match(garage3d,/window\.TGGGarage3D/);
assert.match(garage3d,/WebGLRenderer/);
assert.match(navigation,/window\.TGGNavigation/);
assert.match(navigation,/navDistance/);
assert.match(navigation,/navArrow/);
assert.match(game3d,/const trafficDefs=/);
assert.match(game3d,/const traffic=trafficDefs\.map/);
assert.match(game3d,/function animateTraffic/);
assert.match(game3d,/const pedestrians=/);
assert.equal(interiors3d.includes('TGGGame?.reward'),false);
assert.equal(garage3d.includes('TGGGame?.reward'),false);
assert.equal(navigation.includes('TGGGame?.reward'),false);

assert.match(streetLife,/tgg-street-life-v1/);
assert.match(streetLife,/window\.TGGStreetLife/);
for(const api of ['nearestPedestrian','nearestTraffic','activateNearest','onHorn','snapshot','render']) assert.match(streetLife,new RegExp('function '+api+'\\b'));
assert.match(streetLife,/Tasha/);
assert.match(streetLife,/Rico/);
assert.match(streetLife,/Nova/);
assert.match(game,/tgg:horn/);
assert.match(game,/TGGStreetLife\?\.activateNearest/);
assert.equal(streetLife.includes('TGGGame?.reward'),false);
assert.equal(streetLife.includes('TGGCareer?.addRep'),false);
assert.equal(streetLife.includes('TGGEconomy?.apply'),false);
assert.equal(streetLife.includes('TGGWorldSync'),false);



assert.match(streetEvents,/tgg-street-events-v1/);
assert.match(streetEvents,/window\.TGGStreetEvents/);
for(const api of ['nearest','start','startNearest','finish','status','captureCrowd','releaseCrowd','render','variant','totalRuns','calculateStreetRep','repRank','streetProfile']) assert.match(streetEvents,new RegExp('function '+api+'\\b'));
assert.match(streetEvents,/const VARIANTS=/);
for(const variantName of ['OPEN CIRCLE','LOCAL BUZZ CYPHER','STUDIO ROW FEATURE','CITY PREMIERE']) assert.match(streetEvents,new RegExp(variantName));
assert.match(streetEvents,/cosmeticOnly:true/);
assert.match(streetEvents,/rewardMultiplier:1/);
assert.match(streetEvents,/streetRep/);
assert.match(streetEvents,/bestHype/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/street-known/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/street-headliner/);
for(const eventId of ['downtown-cypher','studio-sidewalk','mixtape-popout']) assert.match(streetEvents,new RegExp(eventId));
assert.match(streetEvents,/streetEventMode/);
assert.match(streetEvents,/CROWD BUILDING/);
assert.match(streetEvents,/repRank\(\)/);
assert.equal(streetEvents.includes('TGGGame?.reward'),false);
assert.equal(streetEvents.includes('TGGCareer?.addRep'),false);
assert.equal(streetEvents.includes('TGGEconomy?.apply'),false);
assert.equal(streetEvents.includes('TGGWorldSync'),false);

assert.match(streetSets,/window\.TGGStreetSets/);
assert.match(streetSets,/Block To Studio/);
assert.match(streetSets,/Studio To Ave/);
assert.match(streetSets,/Full City Set/);
for(const api of ['memory','momentumRank','crowdBonus','expected','status','start','updateMomentum','onEventComplete','render']) assert.match(streetSets,new RegExp('function '+api+'\\b'));
assert.match(streetEvents,/TGGStreetSets\?\.onEventComplete/);
assert.match(streetEvents,/TGGStreetSets\?\.crowdBonus/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/first-street-set/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/crowd-momentum/);
assert.equal(streetSets.includes('localStorage'),false);
assert.equal(streetSets.includes('TGGGame?.reward'),false);
assert.equal(streetSets.includes('TGGCareer?.addRep'),false);
assert.equal(streetSets.includes('TGGEconomy?.apply'),false);
assert.equal(streetSets.includes('TGGWorldSync'),false);

assert.match(streetAudience,/window\.TGGStreetAudience/);
for(const crew of ['BLOCK CREW','AVE CREW','STUDIO CREW']) assert.match(streetAudience,new RegExp(crew));
for(const api of ['memory','person','personTier','crewBond','crewTier','crewSnapshot','audienceProfile','recordEvent','rankCandidates','summaryLine','render']) assert.match(streetAudience,new RegExp('function '+api+'\\b'));
assert.match(streetEvents,/TGGStreetAudience\?\.rankCandidates/);
assert.match(streetEvents,/TGGStreetAudience\?\.recordEvent/);
assert.match(streetSets,/data-audience-summary/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/audience-regulars/);
assert.match(fs.readFileSync(new URL('./progression.js',import.meta.url),'utf8'),/street-crew-locked/);
assert.equal(streetAudience.includes('localStorage'),false);
assert.equal(streetAudience.includes('TGGGame?.reward'),false);
assert.equal(streetAudience.includes('TGGCareer?.addRep'),false);
assert.equal(streetAudience.includes('TGGEconomy?.apply'),false);
assert.equal(streetAudience.includes('TGGWorldSync'),false);


for(const forbidden of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'sb_secret_',
  'sk_live_',
  'tgg_world_buy_property',
  'tgg_world_vehicle_spawn',
  'tgg_world_vehicle_drive_session',
  'tgg_world_mvp_v1_complete_mission',
  'tgg_world_social_post'
]){
  assert.equal(world.includes(forbidden),false,'world sync must exclude '+forbidden);
  assert.equal(game.includes(forbidden),false,'game runtime must exclude '+forbidden);
  assert.equal(game3d.includes(forbidden),false,'3D runtime must exclude '+forbidden);
}

assert.equal(release.release,'V1.35 Street Crews + Audience Memory');
assert.equal(release.base,'V1.34 Street Sets + Crowd Momentum');
assert.equal(auto.version,'1.35');
assert.equal(qa.version,'1.35');
assert.equal(release.production,'gated');
assert.ok(['candidate_pending_ci','automated_ci_pass'].includes(release.browser_smoke));
assert.ok(['candidate_pending_ci','passed'].includes(release.static_gate));
assert.ok(['pending_ci','passed'].includes(auto.verification));
assert.ok(['pending_ci','passed'].includes(qa.verification));

for(const gate of [
  'garage_api','garage_persistence','car_appearance_runtime','handling_preset_runtime',
  'vehicle_collision_margin','studio_3d_renderer','studio_3d_entry','manager_dialogue_proximity',
  'mobile_drift_control','mobile_horn_control','local_three_runtime','studio_dom_ready_boot',
  'interiors_3d_runtime','home_3d','media_3d','shops_3d','park_3d','garage_3d_runtime',
  'navigation_hud','traffic_population','traffic_animation','interior_no_reward_path',
  'street_life_api','pedestrian_proximity','street_contact_memory','street_talk_no_rewards','traffic_proximity','horn_reaction','contextual_prompt',
  'street_events_api','street_event_hotspots','street_event_local_state','crowd_gather_3d','crowd_reaction_animation','street_event_no_rewards','street_event_no_remote_mutations','contextual_event_hud','street_reputation_api','street_rank','event_variant_catalog','event_variants_cosmetic_only','street_rep_persistence','street_rep_achievements','street_sets_api','street_set_ordering','street_set_persistence','crowd_momentum','momentum_crowd_bonus','street_sets_no_rewards','street_sets_single_store','street_set_achievements','street_audience_api','audience_memory_persistence','returning_audience','street_crew_bonds','audience_aware_crowd_selection','audience_no_rewards','audience_single_store','audience_achievements'
]) assert.ok(release.gates.includes(gate),'missing V1.30 gate '+gate);

console.log('GAME_V1_35_STATIC_CONTRACT_PASS');
