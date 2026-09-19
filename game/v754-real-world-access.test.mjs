import fs from 'node:fs';
const js=fs.readFileSync(new URL('./v754-real-world-access.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('./navigation.js',import.meta.url),'utf8');
const req=[
 ['parking zones',js.includes('parking-zones')],
 ['park exit',js.includes('speed-gated-park-exit')],
 ['walk door',js.includes('walk-to-door-entry')],
 ['roof walking',js.includes('rooftop-walking')],
 ['physical route',nav.includes('TGGPhysicalAccess?.navigationTarget')],
 ['roof screen',html.includes('id="roof"')],
 ['roof runtime screen registration',game.includes("'businessBoard','roof'")],
 ['no remote secrets',!/(SUPABASE_SERVICE_ROLE|STRIPE_SECRET|VERCEL_TOKEN)/.test(js)]
];
const failed=req.filter(([,ok])=>!ok).map(([name])=>name);
console.log(JSON.stringify({ok:!failed.length,total:req.length,failed}));
if(failed.length)process.exit(1);