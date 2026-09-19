import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');
const html=read('index.html');
const game=read('game.js');
const game3d=read('game-3d.js');
const street=read('street-presence.js');
const garage=read('garage.js');
const garage3d=read('garage-3d.js');
const nav=read('navigation.js');
const gamepad=read('gamepad.js');
const finalBuild=read('final-build.js');
const story=read('story-missions.js');
const story3d=read('story-world-3d.js');
const vertical=read('vertical-slice-director.js');
const mega=read('mega-qa.js');
const style=read('style.css');
const runtime=JSON.parse(read('runtime-version.json'));
const photoreal=read('photoreal-core.js');
const reality=read('reality-master.js');
const v310=read('v310-aaa-visual-polish.js');
const v320=read('v320-realism-mega.js');
const v330=read('v330-motion-realism.js');
const v340=read('v340-city-world-mega.js');
const v350=read('v350-gamefeel-cinematic.js');
const v360=read('v360-living-city.js');
const v370=read('v370-world-interaction.js');
const v380=read('v380-life-sim.js');
const v390=read('v390-opportunity-loop.js');
const v400=read('v400-world-systems.js');
const v410=read('v410-lifestyle.js');
const v420=read('v420-social-world.js');
const v430=read('v430-routine-world.js');
const v440=read('v440-home-social.js');
const v450=read('v450-family-household.js');

assert.match(html,/V4\.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA/i);
assert.match(html,/GAME V4\.50 • FAMILY \+ HOUSEHOLD \+ LEGACY/);
assert.equal(runtime.canonical_runtime,'V4.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA');
assert.equal(runtime.base_runtime,'V4.40 HOME SOCIAL LIFE MEGA');
assert.equal(runtime.consolidation,'all-compatible-layers-one-runtime');
assert.ok(html.includes('<link rel="stylesheet" href="v450-family-household.css">'),'missing V4.50 stylesheet');
assert.ok(html.includes('<script src="v450-family-household.js"></script>'),'missing V4.50 runtime script');
for(const id of [
  'city3d','radar3d','radarPlayer','radarCar','vehicleHud','speedValue','gearValue',
  'driveStateValue','playerMoveHud','walkModeValue','walkSpeedValue','navHud','navArrow',
  'vehicleBtn','interact3dBtn','camera3dBtn','driftBtn','hornBtn','garageBtn',
  'worldLifeBtn','storyMissionsBtn','cityAssetsBtn','game','hud'
]) assert.match(html,new RegExp('id="'+id+'"'),'missing V2.18 DOM contract: '+id);

for(const src of [
  'vendor/three-r152.min.js','game.js','game-3d.js','garage.js','garage-3d.js',
  'studio-3d.js','interiors-3d.js','navigation.js','gamepad.js','final-build.js',
  'story-missions.js','story-cinematics.js','story-world-3d.js','street-presence.js',
  'vertical-slice-director.js','mega-qa.js','photoreal-core.js','reality-master.js',
  'v310-aaa-visual-polish.js','v320-realism-mega.js','v330-motion-realism.js',
  'v340-city-world-mega.js','v350-gamefeel-cinematic.js','v360-living-city.js','v370-world-interaction.js','v380-life-sim.js','v390-opportunity-loop.js','v400-world-systems.js','v410-lifestyle.js','v420-social-world.js','v430-routine-world.js'
]) assert.ok(html.includes('<script src="'+src+'"></script>'),'missing V2.18 script: '+src);

for(const token of ['window.TGGGame','setDriveKey','getDrivingState']) assert.ok(game.includes(token),'game runtime missing '+token);
for(const token of ['window.TGG3D','isReady','getVehicleDynamics']) assert.ok(game3d.includes(token),'3D runtime missing '+token);
for(const token of ['window.TGGStreetPresence','getStatus','setDensity','citizens','socialPeople','activityNodes']) assert.ok(street.includes(token),'street presence missing '+token);
for(const token of ['window.TGGGarage','getState','getPresets','apply','load']) assert.ok(garage.includes(token),'garage runtime missing '+token);
assert.ok(garage3d.includes('THREE'),'garage 3D runtime missing Three.js integration');
assert.ok(nav.includes('window.TGGNavigation'),'navigation runtime missing');
assert.ok(gamepad.includes('gamepad')||gamepad.includes('Gamepad'),'gamepad runtime missing');
assert.ok(finalBuild.length>1000,'final build runtime unexpectedly small');
for(const token of ['V3.00 FINAL MEGA BUILD','applyPreset','readiness','runIntegratedQA','TGGRealism','TGGRealityMaster','setWalkTuning','setDriveTuning','setDensity']) assert.ok(finalBuild.includes(token),'V3 mega runtime missing '+token);
assert.ok(story.includes('window.TGGStoryMissions'),'story mission runtime missing');
assert.ok(story3d.includes('THREE')||story3d.includes('TGG3D'),'story 3D integration missing');
assert.ok(vertical.includes('window.TGGVerticalSlice'),'adaptive vertical slice runtime missing');
assert.ok(mega.includes('window.TGGMegaQA'),'mega QA runtime missing');
assert.ok(style.includes('.city3d')&&style.includes('.vehicle-hud')&&style.includes('.player-move-hud'),'baseline presentation styles missing');
for(const token of ['ACESFilmicToneMapping','MeshPhysicalMaterial','adaptive-pixel-ratio']) assert.ok(photoreal.includes(token),'photoreal core missing '+token);
for(const token of ['V2.50 REALITY MASTER CONSOLIDATION','human-anatomy-detail','vehicle-clearcoat-glass-trim','adaptive-fps-quality']) assert.ok(reality.includes(token),'reality master missing '+token);
for(const token of ['V3.10 AAA VISUAL POLISH','cinematic-glass-ui','hud-depth']) assert.ok(v310.includes(token),'V3.10 layer missing '+token);
for(const token of ['V3.20 REALISM MEGA PASS','physical-lighting-balance','adaptive-detail-scaling']) assert.ok(v320.includes(token),'V3.20 layer missing '+token);
for(const token of ['V3.30 MOTION VEHICLE CHARACTER','body-weight-transfer','vehicle-pitch-roll']) assert.ok(v330.includes(token),'V3.30 layer missing '+token);
for(const token of ['V3.40 CITY WORLD MEGA PASS','dynamic-cloud-layer','crowd-quality-sync']) assert.ok(v340.includes(token),'V3.40 layer missing '+token);
for(const token of ['V3.50 GAME FEEL CINEMATIC MEGA','cinematic-letterbox','story-cinematic-sync']) assert.ok(v350.includes(token),'V3.50 layer missing '+token);
for(const token of ['V3.60 LIVING CITY REACTIVE WORLD MEGA','district-heat-system','dynamic-city-events','context-interaction-prompts','performance-safe-density-sync']) assert.ok(v360.includes(token),'V3.60 layer missing '+token);
for(const token of ['V3.70 NPC TRAFFIC WORLD INTERACTION MEGA','proximity-npc-reactions','traffic-player-awareness','simulation-tier-scaling','keyboard-street-talk-hook']) assert.ok(v370.includes(token),'V3.70 layer missing '+token);
for(const token of ['V3.80 LIFE SIM PROPERTY SOCIAL WORLD MEGA','persistent-life-stats','daily-balance-loop','relationship-state','career-momentum']) assert.ok(v380.includes(token),'V3.80 layer missing '+token);
for(const token of ['V3.90 CAREER MISSION ECONOMY WORLD LOOP MEGA','dynamic-world-opportunities','life-stat-gating','economy-reward-hooks','adaptive-opportunity-ranking']) assert.ok(v390.includes(token),'V3.90 layer missing '+token);
for(const token of ['V4.00 WORLD SYSTEMS','property-ownership-upgrades','city-reputation-system','career-consequence-system','mission-chain-progression','relationship-gated-moves']) assert.ok(v400.includes(token),'V4.00 layer missing '+token);
for(const token of ['V4.10 PROPERTY RELATIONSHIP LIFESTYLE MEGA','property-passive-income','property-upkeep-loop','relationship-tiers','property-visit-effects']) assert.ok(v410.includes(token),'V4.10 layer missing '+token);
for(const token of ['V4.20 SOCIAL NETWORK CITY STATUS MEGA','city-status-score','contact-favor-system','social-consequences','city-reaction-text']) assert.ok(v420.includes(token),'V4.20 layer missing '+token);
for(const token of ['V4.30 DAILY ROUTINE WELLNESS SCHEDULE WORLD MEGA','daily-routine-tracker','wellness-score','fatigue-system','routine-streaks','routine-consequence-loop']) assert.ok(v430.includes(token),'V4.30 layer missing '+token);
for(const token of ['V4.40 HOME SOCIAL LIFE MEGA','home-upgrade-loop','social-bond-state','relationship-memory','relationship-tiers']) assert.ok(v440.includes(token),'V4.40 layer missing '+token);
for(const token of ['V4.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA','family-household-state','responsibility-loop','neglect-consequences','legacy-progression']) assert.ok(v450.includes(token),'V4.50 layer missing '+token);
for(const token of [
  'human_realism','vehicle_realism','world_detail','unified_quality_presets','unified_movement_tuning',
  'unified_vehicle_tuning','adaptive_crowd_density','integrated_readiness_matrix','integrated_mega_qa',
  'v310_aaa_visual_polish','v320_realism_mega_pass','v330_motion_vehicle_character',
  'v340_city_world_mega_pass','v350_game_feel_cinematic_mega','v360_living_city_reactive_world','v370_npc_traffic_world_interaction','v380_life_sim_property_social_world','v390_career_mission_economy_world_loop','v400_world_systems','v410_property_relationship_lifestyle','v420_social_network_city_status','v430_daily_routine_wellness_schedule_world','v440_home_social_life','v450_family_household_legacy_world'
]) assert.ok(runtime.features.includes(token),'runtime feature missing '+token);

for(const forbidden of ['sb_secret_','SUPABASE_SERVICE_ROLE_KEY','sk_live_']){
  for(const [name,source] of Object.entries({game,game3d,street,garage,nav,finalBuild,story,story3d,vertical})){
    assert.equal(source.includes(forbidden),false,'secret marker '+forbidden+' found in '+name);
  }
}

console.log('GAME_V4_50_FAMILY_HOUSEHOLD_STATIC_CONTRACT_PASS');

// V4.50 validation refresh

// V4.50 final gate refresh

// V2.53 exact-head certification refresh
