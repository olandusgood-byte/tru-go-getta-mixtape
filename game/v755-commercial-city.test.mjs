import fs from 'node:fs';
const js=fs.readFileSync(new URL('./v755-commercial-city.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('./navigation.js',import.meta.url),'utf8');
const checks=[
 ['commercial screen',html.includes('id="commercial"')],
 ['commercial navigation',nav.includes('TGGCommercialCity?.navigationTarget')],
 ['eight sites',(js.match(/id:'/g)||[]).length>=8],
 ['ownership',js.includes('business-ownership')],
 ['passive income',js.includes('passive-income')],
 ['parking',js.includes('parking-before-entry')],
 ['no secrets',!/(SERVICE_ROLE|STRIPE_SECRET|VERCEL_TOKEN)/.test(js)]
];
const failed=checks.filter(([,ok])=>!ok).map(([n])=>n);
console.log(JSON.stringify({ok:!failed.length,total:checks.length,failed}));
if(failed.length)process.exit(1);