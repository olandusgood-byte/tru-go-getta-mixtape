import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('.',import.meta.url);const read=n=>fs.readFileSync(new URL(n,root),'utf8');
const index=read('index.html'),js=read('reality-master.js'),css=read('reality-master.css'),runtime=JSON.parse(read('runtime-version.json'));
assert.ok(index.includes('reality-master.css'));assert.ok(index.includes('reality-master.js'));
for(const token of ['V2.50 REALITY MASTER CONSOLIDATION','human-anatomy-detail','vehicle-clearcoat-glass-trim','adaptive-fps-quality','MeshPhysicalMaterial','SpotLight','CatmullRomCurve3'])assert.ok(js.includes(token),token);
assert.ok(css.includes('data-tgg-reality-master'));assert.equal(runtime.canonical_runtime,'V2.50 REALITY MASTER CONSOLIDATION');
for(const f of ['human_realism','vehicle_realism','world_detail','cinematic_fx','adaptive_master_quality'])assert.ok(runtime.features.includes(f),f);
console.log(JSON.stringify({ok:true,version:runtime.canonical_runtime,checks:14}));