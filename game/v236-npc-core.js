(() => {
  const SKINS=[0x6b3f2c,0x81523a,0x9d6a49,0xb9805c,0xc9946f,0x8c5d40];
  const TOPS=[0x111827,0x1f2937,0x251019,0x10211a,0x17111f,0x181818,0x203047,0x2c1d12];
  const PANTS=[0x0b0e14,0x151a22,0x222831,0x111318,0x1d2028,0x10151b];
  const ACCENTS=[0xc7ff00,0xff466d,0x61d9ff,0xffcf4a,0xc56cff,0x4cff88];
  const SHOES=[0x0b0c10,0xf1f4f8,0x151922,0x302f34];
  const HAIR=[0x050609,0x130e0b,0x261910,0x090a0d];
  function rnd(seed,salt=0){
    let x=((Number(seed)||1)*1664525+(salt+1)*1013904223)>>>0;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }
  function pick(arr,seed,salt){return arr[Math.floor(rnd(seed,salt)*arr.length)%arr.length]}
  function variant(seed=1){
    const n=Math.max(1,Math.floor(Number(seed)||1));
    return {
      id:'npc-'+n,
      height:Number((.88+rnd(n,1)*.27).toFixed(3)),
      shoulders:Number((.86+rnd(n,2)*.28).toFixed(3)),
      build:Number((.84+rnd(n,3)*.3).toFixed(3)),
      legLength:Number((.9+rnd(n,4)*.18).toFixed(3)),
      armLength:Number((.92+rnd(n,5)*.16).toFixed(3)),
      headScale:Number((.9+rnd(n,6)*.16).toFixed(3)),
      skin:pick(SKINS,n,7),
      outfit:{
        top:pick(TOPS,n,8),
        pants:pick(PANTS,n,9),
        shoes:pick(SHOES,n,10),
        accent:pick(ACCENTS,n,11),
        hair:pick(HAIR,n,12)
      },
      vibe:['street','creative','business','nightlife'][Math.floor(rnd(n,13)*4)],
      gesture:['idle','phone','talk','nod'][Math.floor(rnd(n,14)*4)]
    };
  }
  function lod(distance=0,quality='high'){
    const d=Math.max(0,Number(distance)||0);
    if(quality==='performance')return d<22?'medium':'low';
    if(quality==='balanced')return d<14?'high':d<38?'medium':'low';
    return d<18?'high':d<42?'medium':'low';
  }
  function populationCap(quality='high'){return quality==='performance'?8:quality==='balanced'?14:22}
  const api={variant,lod,populationCap};
  globalThis.TGGV236Core=api;
  if(typeof window!=='undefined')window.TGGV236Core=api;
})();