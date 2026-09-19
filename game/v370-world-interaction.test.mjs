import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v370-world-interaction.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./v370-world-interaction.css',import.meta.url),'utf8');
for(const token of ['V3.70 NPC TRAFFIC WORLD INTERACTION MEGA','proximity-npc-reactions','traffic-player-awareness','simulation-tier-scaling','keyboard-street-talk-hook','window.TGGWorldInteraction'])assert.ok(js.includes(token),'missing '+token);
for(const token of ['data-tgg-v370','#v360CityHud','#v360Prompt'])assert.ok(css.includes(token),'missing '+token);
console.log('V370_WORLD_INTERACTION_STATIC_PASS');