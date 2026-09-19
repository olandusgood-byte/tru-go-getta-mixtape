import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v400-world-systems.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./v400-world-systems.css',import.meta.url),'utf8');
for(const t of ['V4.00 WORLD SYSTEMS','property-ownership-upgrades','city-reputation-system','career-consequence-system','mission-chain-progression','relationship-gated-moves','daily-world-progression','window.TGGWorldSystems'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v400WorldSystems','#v400Properties','data-tgg-v400'])assert.ok(css.includes(t)||js.includes(t),'missing '+t);
console.log('V400_WORLD_SYSTEMS_STATIC_PASS');