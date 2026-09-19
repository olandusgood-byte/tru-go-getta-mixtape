(()=>{const f=globalThis.__V235ForgeUnderTest,a=(x,m)=>{if(!x)throw new Error(m)};
a(f,'V2.35 Audio Forge adapter API must exist');a(Array.isArray(f.layers)&&f.layers.length===100,'exact 100 Audio layers');
for(const k of ['status','unlock','applyProfile','play','setEnabled','restore'])a(typeof f[k]==='function',k+' API');
a(f.profiles.includes('street')&&f.profiles.includes('club')&&f.profiles.includes('studio'),'profiles');
const s=f.status();a(s.version==='V2.35 TGG AUDIO + SPATIAL FORGE 100','version');a(s.mode==='native-audio-forge','mode');a(s.enabled===true,'enabled');a(s.layerCount===100,'layer count');return true})();