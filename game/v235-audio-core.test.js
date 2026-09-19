(()=>{const c=globalThis.__V235CoreUnderTest,a=(x,m)=>{if(!x)throw new Error(m)};
a(c,'V2.35 Audio core API must exist');a(typeof c.profile==='function','profile API');a(typeof c.normalize==='function','normalize API');a(typeof c.attenuation==='function','attenuation API');
const street=c.profile('street');a(street.id==='street'&&street.master>0,'street profile');
const club=c.profile('club');a(club.bass>street.bass,'club bass');
const studio=c.profile('studio');a(studio.reverb>street.reverb,'studio reverb');
const n=c.normalize({master:9,bass:-3,reverb:9,spatial:9});a(n.master<=1&&n.bass>=0&&n.reverb<=1&&n.spatial<=1,'clamps');
a(c.attenuation(0,20)===1,'near attenuation');a(c.attenuation(40,20)===0,'far attenuation');a(c.attenuation(10,20)>.4,'mid attenuation');return true})();