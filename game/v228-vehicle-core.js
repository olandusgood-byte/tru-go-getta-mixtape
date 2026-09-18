(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const color=(v,f)=>{
    const n=Number(v);
    return Number.isFinite(n)?Math.max(0,Math.min(0xffffff,Math.floor(n))):f;
  };
  const PRESETS={
    street:{id:'street',length:1,width:1,height:1,wheelSize:1,rideHeight:1,spoiler:true,paint:0xc7ff00,accent:0x61d9ff,rims:0xd8dde7},
    sport:{id:'sport',length:1.04,width:1.08,height:.92,wheelSize:1.08,rideHeight:.86,spoiler:true,paint:0xff315f,accent:0xc7ff00,rims:0xe8edf4},
    luxury:{id:'luxury',length:1.08,width:1.03,height:1.04,wheelSize:1.04,rideHeight:.96,spoiler:false,paint:0x17191f,accent:0xd8dde7,rims:0xf1f4f8}
  };
  function normalize(input={}){
    const base=PRESETS.street;
    return {
      id:String(input.id||base.id),
      length:clamp(Number.isFinite(Number(input.length))?Number(input.length):1,.88,1.2),
      width:clamp(Number.isFinite(Number(input.width))?Number(input.width):1,.86,1.18),
      height:clamp(Number.isFinite(Number(input.height))?Number(input.height):1,.82,1.18),
      wheelSize:clamp(Number.isFinite(Number(input.wheelSize))?Number(input.wheelSize):1,.82,1.3),
      rideHeight:clamp(Number.isFinite(Number(input.rideHeight))?Number(input.rideHeight):1,.72,1.2),
      spoiler:input.spoiler===undefined?!!base.spoiler:!!input.spoiler,
      paint:color(input.paint,base.paint),
      accent:color(input.accent,base.accent),
      rims:color(input.rims,base.rims)
    };
  }
  function preset(id='street'){
    const p=PRESETS[id]||PRESETS.street;
    return normalize(p);
  }
  function applyTuning(base={},tuning={}){
    return normalize({...base,...tuning});
  }
  const api={normalize,preset,applyTuning,presets:Object.keys(PRESETS)};
  globalThis.TGGV228Core=api;
  if(typeof window!=='undefined')window.TGGV228Core=api;
})();