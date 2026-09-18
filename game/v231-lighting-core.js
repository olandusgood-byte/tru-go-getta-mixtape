(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const MOODS={
    night:{id:'night',exposure:1.16,fogDensity:.017,keyIntensity:2.25,hemiIntensity:1.55,accentIntensity:18,sky:0x04060b,fog:0x05070d,keyColor:0xffffff,hemiSky:0x7c8cff,hemiGround:0x101016,accentColor:0xc7ff00},
    golden:{id:'golden',exposure:1.42,fogDensity:.012,keyIntensity:5.1,hemiIntensity:2.1,accentIntensity:8,sky:0x2a1a12,fog:0x3a2317,keyColor:0xffd7a2,hemiSky:0xffc788,hemiGround:0x251611,accentColor:0xffb347},
    studio:{id:'studio',exposure:1.28,fogDensity:.009,keyIntensity:3.6,hemiIntensity:1.8,accentIntensity:16,sky:0x070b12,fog:0x0a0f18,keyColor:0xeaf2ff,hemiSky:0x8eb8ff,hemiGround:0x121722,accentColor:0x61d9ff},
    club:{id:'club',exposure:1.24,fogDensity:.014,keyIntensity:2.7,hemiIntensity:1.35,accentIntensity:22,sky:0x09040f,fog:0x100718,keyColor:0xd7c7ff,hemiSky:0x7b55b7,hemiGround:0x100714,accentColor:0xc56cff},
    overcast:{id:'overcast',exposure:1.08,fogDensity:.02,keyIntensity:2.9,hemiIntensity:2.35,accentIntensity:6,sky:0x3e4652,fog:0x4b5563,keyColor:0xdfe7ef,hemiSky:0xc4d1de,hemiGround:0x39414b,accentColor:0x88aacc}
  };
  const MATERIALS={
    skin:{roughness:.62,metalness:.02,envMapIntensity:.55},
    cloth:{roughness:.82,metalness:.04,envMapIntensity:.28},
    leather:{roughness:.36,metalness:.12,envMapIntensity:.82},
    chrome:{roughness:.12,metalness:.94,envMapIntensity:1.45},
    glass:{roughness:.08,metalness:.08,envMapIntensity:.9,transparent:true,opacity:.68},
    rubber:{roughness:.9,metalness:.02,envMapIntensity:.16},
    paint:{roughness:.22,metalness:.72,envMapIntensity:1.3}
  };
  function normalizeScene(input={}){
    return {
      exposure:clamp(Number.isFinite(Number(input.exposure))?Number(input.exposure):1.18,.65,2.2),
      fogDensity:clamp(Number.isFinite(Number(input.fogDensity))?Number(input.fogDensity):.017,0,.05),
      keyIntensity:clamp(Number.isFinite(Number(input.keyIntensity))?Number(input.keyIntensity):2.25,0,8),
      hemiIntensity:clamp(Number.isFinite(Number(input.hemiIntensity))?Number(input.hemiIntensity):1.55,0,5),
      accentIntensity:clamp(Number.isFinite(Number(input.accentIntensity))?Number(input.accentIntensity):18,0,40),
      sky:Number.isFinite(Number(input.sky))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.sky)))):0x04060b,
      fog:Number.isFinite(Number(input.fog))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.fog)))):0x05070d,
      keyColor:Number.isFinite(Number(input.keyColor))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.keyColor)))):0xffffff,
      hemiSky:Number.isFinite(Number(input.hemiSky))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.hemiSky)))):0x7c8cff,
      hemiGround:Number.isFinite(Number(input.hemiGround))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.hemiGround)))):0x101016,
      accentColor:Number.isFinite(Number(input.accentColor))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.accentColor)))):0xc7ff00
    };
  }
  function mood(id='night'){
    const m=MOODS[id]||MOODS.night;
    return {...normalizeScene(m),id:m.id};
  }
  function material(id='cloth'){return {...(MATERIALS[id]||MATERIALS.cloth)}}
  const api={mood,material,normalizeScene,moods:Object.keys(MOODS),materials:Object.keys(MATERIALS)};
  globalThis.TGGV231Core=api;
  if(typeof window!=='undefined')window.TGGV231Core=api;
})();