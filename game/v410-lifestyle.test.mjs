import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v410-lifestyle.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('./v410-lifestyle.css',import.meta.url),'utf8');
for(const t of ['V4.10 PROPERTY RELATIONSHIP LIFESTYLE MEGA','property-passive-income','property-upkeep-loop','relationship-tiers','property-visit-effects','window.TGGLifestyle'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v410Lifestyle','#v410Relations','data-tgg-v410'])assert.ok(css.includes(t)||js.includes(t),'missing '+t);
console.log('V410_LIFESTYLE_STATIC_PASS');