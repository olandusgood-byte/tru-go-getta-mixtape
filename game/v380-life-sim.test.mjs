import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v380-life-sim.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./v380-life-sim.css',import.meta.url),'utf8');
for(const t of ['V3.80 LIFE SIM PROPERTY SOCIAL WORLD MEGA','persistent-life-stats','daily-balance-loop','relationship-state','career-momentum','window.TGGLifeSim'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v380LifePanel','data-tgg-v380','grid-template-columns'])assert.ok(css.includes(t),'missing '+t);
console.log('V380_LIFE_SIM_STATIC_PASS');