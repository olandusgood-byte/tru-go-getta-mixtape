import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v430-routine-world.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('./v430-routine-world.css',import.meta.url),'utf8');
for(const t of ['V4.30 DAILY ROUTINE WELLNESS SCHEDULE WORLD MEGA','daily-routine-tracker','wellness-score','fatigue-system','routine-streaks','routine-consequence-loop','window.TGGRoutineWorld'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v430Routine','#v430Actions','data-tgg-v430'])assert.ok(css.includes(t)||js.includes(t),'missing '+t);
console.log('V430_ROUTINE_WORLD_STATIC_PASS');