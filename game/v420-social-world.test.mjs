import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync(new URL('./v420-social-world.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('./v420-social-world.css',import.meta.url),'utf8');
for(const t of ['V4.20 SOCIAL NETWORK CITY STATUS MEGA','city-status-score','contact-favor-system','social-consequences','city-reaction-text','window.TGGSocialWorld'])assert.ok(js.includes(t),'missing '+t);
for(const t of ['#v420Social','#v420Contacts','data-tgg-v420'])assert.ok(css.includes(t)||js.includes(t),'missing '+t);
console.log('V420_SOCIAL_WORLD_STATIC_PASS');