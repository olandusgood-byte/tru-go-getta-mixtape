(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const SKINS=[0x6d422f,0x8b5a3c,0xa9714c,0xc48a63,0xd8a47c,0x704632];
  const TOPS=[0x111827,0x20242d,0x2e1d36,0x15291f,0x35241d,0x1d2335,0x2c2f37,0x241a27];
  const PANTS=[0x0b0e14,0x171a21,0x20242b,0x141820,0x25211f,0x11151b];
  const ACCENTS=[0xc7ff00,0x61d9ff,0xff466d,0xffcf4a,0xc56cff,0x4cff88];
  function normalize(input={}){
    return {
      id:String(input.id||'npc'),
      height:clamp(Number.isFinite(Number(input.height))?Number(input.height):1,.84,1.2),
      shoulders:clamp(Number.isFinite(Number(input.shoulders))?Number(input.shoulders):1,.78,1.22),
      build:clamp(Number.isFinite(Number(input.build))?Number(input.build):1,.76,1.25),
      legLength:clamp(Number.isFinite(Number(input.legLength))?Number(input.legLength):1,.86,1.18),
      armLength:clamp(Number.isFinite(Number(input.armLength))?Number(input.armLength):1,.88,1.16),
      headScale:clamp(Number.isFinite(Number(input.headScale))?Number(input.headScale):1,.88,1.12),
      skin:Number.isFinite(Number(input.skin))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.skin)))):SKINS[0],
      outfit:{
        top:Number.isFinite(Number(input.outfit?.top))?Number(input.outfit.top):TOPS[0],
        pants:Number.isFinite(Number(input.outfit?.pants))?Number(input.outfit.pants):PANTS[0],
        shoes:Number.isFinite(Number(input.outfit?.shoes))?Number(input.outfit.shoes):0x101318,
        accent:Number.isFinite(Number(input.outfit?.accent))?Number(input.outfit.accent):ACCENTS[0],
        hair:Number.isFinite(Number(input.outfit?.hair))?Number(input.outfit.hair):0x07090d
      }
    };
  }
  function profile(index=0){
    const i=Math.max(0,Math.floor(Number(index)||0));
    const jitter=(seed,span)=>(((((i+1)*(seed*9301+49297))%233280)/233280)*2-1)*span;
    return normalize({
      id:'npc-'+i,
      height:1+jitter(1,.11),
      shoulders:1+jitter(2,.11),
      build:1+jitter(3,.14),
      legLength:1+jitter(4,.10),
      armLength:1+jitter(5,.08),
      headScale:1+jitter(6,.08),
      skin:SKINS[i%SKINS.length],
      outfit:{
        top:TOPS[i%TOPS.length],
        pants:PANTS[(i*3+1)%PANTS.length],
        shoes:i%3===0?0xebeef2:0x0f1218,
        accent:ACCENTS[(i*2+1)%ACCENTS.length],
        hair:0x06080c
      }
    });
  }
  function lod(distance=0,quality='high'){
    const d=Math.max(0,Number(distance)||0);
    if(quality==='performance')return d<16?'medium':'low';
    if(quality==='balanced')return d<12?'high':d<30?'medium':'low';
    return d<12?'high':d<36?'medium':'low';
  }
  const api={profile,lod,normalize};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();