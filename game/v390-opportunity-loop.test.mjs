import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v390-opportunity-loop.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('./v390-opportunity-loop.css',import.meta.url),'utf8');
for(const t of ['V3.90 CAREER MISSION ECONOMY WORLD LOOP MEGA','dynamic-world-opportunities','life-stat-gating','economy-reward-hooks','adaptive-opportunity-ranking','window.TGGOpportunityLoop'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v390Opportunity','data-tgg-v390','WORLD OPPORTUNITY'])assert.ok(css.includes(t)||js.includes(t),'missing '+t);
console.log('V390_OPPORTUNITY_LOOP_STATIC_PASS');