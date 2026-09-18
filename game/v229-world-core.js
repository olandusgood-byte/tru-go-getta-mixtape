(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PRESETS={
    downtown:{id:'downtown',density:.9,neon:.65,heightScale:1.18,accent:0xffcf4a,modules:['tower','storefront','club','office','billboard']},
    'studio-row':{id:'studio-row',density:.82,neon:.88,heightScale:1.05,accent:0xff466d,modules:['studio','storefront','warehouse','billboard','alley']},
    shops:{id:'shops',density:.76,neon:.72,heightScale:.92,accent:0x48d7ff,modules:['storefront','boutique','cafe','awning','billboard']},
    park:{id:'park',density:.46,neon:.28,heightScale:.72,accent:0x4cff88,modules:['house','townhouse','tree','bench','planter']},
    media:{id:'media',density:.86,neon:.94,heightScale:1.08,accent:0xc56cff,modules:['media','club','storefront','billboard','roof-unit']},
    business:{id:'business',density:.88,neon:.52,heightScale:1.16,accent:0xc7ff00,modules:['office','tower','storefront','garage','billboard']}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'downtown'),
      density:clamp(Number.isFinite(Number(input.density))?Number(input.density):.75,0,1),
      neon:clamp(Number.isFinite(Number(input.neon))?Number(input.neon):.6,0,1),
      heightScale:clamp(Number.isFinite(Number(input.heightScale))?Number(input.heightScale):1,.65,1.35),
      accent:Number.isFinite(Number(input.accent))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.accent)))):0xc7ff00
    };
  }
  function preset(id='downtown'){
    const p=PRESETS[id]||PRESETS.downtown;
    return {...normalize(p),modules:[...p.modules]};
  }
  function modulesFor(id='downtown'){
    return [...(PRESETS[id]||PRESETS.downtown).modules];
  }
  const api={preset,normalize,modulesFor,presets:Object.keys(PRESETS)};
  globalThis.TGGV229Core=api;
  if(typeof window!=='undefined')window.TGGV229Core=api;
})();