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

assert.match(html,/Game V2\.50 REALITY MASTER/);
assert.match(html,/GAME V2\.50 • REALITY MASTER/);
assert.equal(runtime.canonical_runtime,'V3.00 FINAL MEGA BUILD');
assert.equal(runtime.base_runtime,'V2.50 REALITY MASTER CONSOLIDATION');
assert.equal(runtime.consolidation,'all-compatible-layers-one-runtime');
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
  'vertical-slice-director.js','mega-qa.js','photoreal-core.js','reality-master.js'
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
for(const token of ['human_realism','vehicle_realism','world_detail','unified_quality_presets','unified_movement_tuning','unified_vehicle_tuning','adaptive_crowd_density','integrated_readiness_matrix','integrated_mega_qa']) assert.ok(runtime.features.includes(token),'runtime feature missing '+token);

for(const forbidden of ['sb_secret_','SUPABASE_SERVICE_ROLE_KEY','sk_live_']){
  for(const [name,source] of Object.entries({game,game3d,street,garage,nav,finalBuild,story,story3d,vertical})){
    assert.equal(source.includes(forbidden),false,'secret marker '+forbidden+' found in '+name);
  }
}

console.log('GAME_V3_00_FINAL_MEGA_STATIC_CONTRACT_PASS');
