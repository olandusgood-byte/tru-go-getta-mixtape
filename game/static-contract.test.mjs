import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const game3d=fs.readFileSync(new URL('./game-3d.js',import.meta.url),'utf8');
const world=fs.readFileSync(new URL('./world-sync.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('./release-manifest.json',import.meta.url),'utf8'));
const auto=JSON.parse(fs.readFileSync(new URL('./auto-builder-manifest.json',import.meta.url),'utf8'));
const qa=JSON.parse(fs.readFileSync(new URL('./qa-manifest.json',import.meta.url),'utf8'));

assert.match(html,/Game V1\.28 3D/);
assert.match(html,/GAME V1\.28 • DRIFT \+ HORN/);
assert.match(html,/id="vehicleBtn"/);
assert.match(html,/id="camera3dBtn"/);
assert.match(html,/id="speedValue"/);
assert.match(html,/id="gearValue"/);
assert.match(html,/id="driveStateValue"/);
assert.match(html,/id="radar3d"/);
assert.match(html,/game-3d\.js/);

for(const token of [
  'driveKeys',
  'driveRuntime',
  'updateVehiclePhysics',
  "setDriveKey('handbrake'",
  'function horn',
  'toggleVehicle',
  'requestAnimationFrame(updateVehiclePhysics)'
]) assert.ok(game.includes(token),'missing V1.28 game token: '+token);

assert.match(game,/driveRuntime\.handbrake&&Math\.abs\(driveRuntime\.speed\)>2\?'DRIFT'/);
assert.match(game,/driftBoost=driveRuntime\.handbrake\?1\.65:1/);
assert.match(game,/if\(k==='h'\).*horn\(\)/s);
assert.match(game,/if\(k===' '|k==='Spacebar'\)/);

for(const token of [
  'window.TGG3D',
  'vehicleDynamics',
  'setVehicleDynamics',
  'getVehicleDynamics',
  'skidMarks',
  'driftOn',
  'brakeLights',
  'headGlow',
  'cycleCamera',
  'updateRadar',
  'pedestrians',
  'traffic'
]) assert.ok(game3d.includes(token),'missing V1.28 3D token: '+token);

assert.match(game3d,/vehicleDynamics\.handbrake&&Math\.abs\(vehicleDynamics\.speed\)>2/);
assert.match(game3d,/driftOn \? \.72 : 0/);
assert.match(game3d,/cameraModes=\['orbit','chase','top'\]/);

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

assert.equal(release.release,'V1.28 Drift + Horn');
assert.equal(release.base,'V1.27 Cinematic Radar + Smooth Driving');
assert.equal(auto.version,'1.28');
assert.equal(qa.version,'1.28');
assert.equal(release.production,'gated');
assert.ok(['candidate_pending_ci','automated_ci_pass'].includes(release.browser_smoke));
assert.ok(['candidate_pending_ci','passed'].includes(release.static_gate));
assert.ok(['pending_ci','passed'].includes(auto.verification));
assert.ok(['pending_ci','passed'].includes(qa.verification));

for(const gate of [
  'handbrake_drift',
  'vehicle_horn',
  'drift_visuals',
  'drive_state_hud',
  'vehicle_physics_loop',
  'starter_car_preserved'
]) assert.ok(release.gates.includes(gate),'missing V1.28 gate '+gate);

console.log('GAME_V1_28_STATIC_CONTRACT_PASS');
