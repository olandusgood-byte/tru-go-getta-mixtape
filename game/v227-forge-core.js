(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const color=(v,fallback)=>{
    const n=Number(v);
    return Number.isFinite(n)?Math.max(0,Math.min(0xffffff,Math.floor(n))):fallback;
  };
  const MATERIALS={
    skin:{roughness:.68,metalness:.02},
    cloth:{roughness:.78,metalness:.06},
    leather:{roughness:.38,metalness:.16},
    chrome:{roughness:.12,metalness:.92},
    rubber:{roughness:.86,metalness:.02},
    glass:{roughness:.08,metalness:.12}
  };
  const PRESETS={
    street:{id:'street',height:1,shoulders:1,build:1,legLength:1,armLength:1,headScale:1,skin:0x9d6a49,outfit:{top:0x111827,pants:0x0b0e14,shoes:0x12151c,accent:0xc7ff00,hair:0x07090d}},
    stage:{id:'stage',height:1.04,shoulders:1.08,build:1.04,legLength:1.02,armLength:1,headScale:.98,skin:0x9d6a49,outfit:{top:0x17111f,pants:0x0d1118,shoes:0x080a0d,accent:0xff466d,hair:0x07090d}},
    luxury:{id:'luxury',height:1.02,shoulders:1.05,build:1.02,legLength:1.01,armLength:1,headScale:.99,skin:0x9d6a49,outfit:{top:0x181818,pants:0x101218,shoes:0x0b0c10,accent:0xd8dde7,hair:0x08090d}}
  };
  function normalizePreset(input={}){
    const base=PRESETS.street;
    return {
      id:String(input.id||base.id),
      height:clamp(Number.isFinite(Number(input.height))?Number(input.height):base.height,.85,1.3),
      shoulders:clamp(Number.isFinite(Number(input.shoulders))?Number(input.shoulders):base.shoulders,.75,1.3),
      build:clamp(Number.isFinite(Number(input.build))?Number(input.build):base.build,.75,1.35),
      legLength:clamp(Number.isFinite(Number(input.legLength))?Number(input.legLength):base.legLength,.8,1.25),
      armLength:clamp(Number.isFinite(Number(input.armLength))?Number(input.armLength):base.armLength,.8,1.25),
      headScale:clamp(Number.isFinite(Number(input.headScale))?Number(input.headScale):base.headScale,.82,1.18),
      skin:color(input.skin,base.skin),
      outfit:{
        top:color(input.outfit?.top,base.outfit.top),
        pants:color(input.outfit?.pants,base.outfit.pants),
        shoes:color(input.outfit?.shoes,base.outfit.shoes),
        accent:color(input.outfit?.accent,base.outfit.accent),
        hair:color(input.outfit?.hair,base.outfit.hair)
      }
    };
  }
  function applyMorph(presetValue={},morph={}){
    return normalizePreset({...presetValue,...morph,outfit:{...(presetValue.outfit||{}),...(morph.outfit||{})}});
  }
  function preset(id='street'){
    const p=PRESETS[id]||PRESETS.street;
    return normalizePreset(p);
  }
  function materialProfile(id='cloth'){
    return {...(MATERIALS[id]||MATERIALS.cloth)};
  }
  const api={normalizePreset,applyMorph,preset,materialProfile,presets:Object.keys(PRESETS)};
  globalThis.TGGV227Core=api;
  if(typeof window!=='undefined')window.TGGV227Core=api;
})();