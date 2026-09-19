(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const STYLES={
    street:{id:'street',top:0x111827,pants:0x0b0e14,shoes:0x12151c,accent:0xc7ff00,hair:0x07090d,chain:0xd8dde7},
    luxury:{id:'luxury',top:0x161616,pants:0x0f1116,shoes:0x090a0d,accent:0xe2e6ec,hair:0x090a0d,chain:0xf2d16b},
    stage:{id:'stage',top:0x211126,pants:0x11131a,shoes:0x08090c,accent:0xff466d,hair:0x08090d,chain:0xffffff},
    sport:{id:'sport',top:0x18202b,pants:0x121820,shoes:0x10151d,accent:0x61d9ff,hair:0x07090d,chain:0xc7ff00}
  };
  const SLOTS={
    top:['jacket','hoodie','tee','vest'],
    pants:['cargo','denim','track','tailored'],
    shoes:['sneakers','high-tops','boots','luxury'],
    head:['fade','cap','beanie','hood'],
    accessory:['chain','glasses','watch','backpack']
  };
  function normalize(input={}){
    return {
      chainSize:clamp(Number.isFinite(Number(input.chainSize))?Number(input.chainSize):1,.65,1.5),
      shoeScale:clamp(Number.isFinite(Number(input.shoeScale))?Number(input.shoeScale):1,.8,1.25),
      hairHeight:clamp(Number.isFinite(Number(input.hairHeight))?Number(input.hairHeight):1,.7,1.4),
      jacketBulk:clamp(Number.isFinite(Number(input.jacketBulk))?Number(input.jacketBulk):1,.8,1.3),
      glasses:!!input.glasses,
      cap:!!input.cap,
      backpack:!!input.backpack
    };
  }
  const style=id=>({...STYLES[id]||STYLES.street});
  const slot=id=>[...(SLOTS[id]||[])];
  const api={style,slot,normalize,styles:Object.keys(STYLES),slots:Object.keys(SLOTS)};
  globalThis.TGGV237Core=api;if(typeof window!=='undefined')window.TGGV237Core=api;
})();