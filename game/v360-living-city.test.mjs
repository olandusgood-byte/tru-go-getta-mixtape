import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v360-living-city.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./v360-living-city.css',import.meta.url),'utf8');
for(const token of ['V3.60 LIVING CITY REACTIVE WORLD MEGA','district-heat-system','dynamic-city-events','context-interaction-prompts','performance-safe-density-sync','window.TGGLivingCity'])assert.ok(js.includes(token),'missing '+token);
for(const token of ['#v360CityHud','#v360Prompt','prefers-reduced-motion'])assert.ok(css.includes(token),'missing '+token);
console.log('V360_LIVING_CITY_STATIC_PASS');