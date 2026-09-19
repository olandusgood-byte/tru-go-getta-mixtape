import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v450-family-household.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./v450-family-household.css',import.meta.url),'utf8');
for(const t of ['V4.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA','family-household-state','responsibility-loop','neglect-consequences','legacy-progression','window.TGGFamilyHousehold'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v450FamilyHousehold','data-tgg-v450','grid-template-columns'])assert.ok(css.includes(t),'missing '+t);
console.log('V450_FAMILY_HOUSEHOLD_STATIC_PASS');