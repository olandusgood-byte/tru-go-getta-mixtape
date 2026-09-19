(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    street:{id:'street',top:0x151a22,pants:0x0d1117,shoes:0x11151b,accent:0xc7ff00,skin:0x9b6848,hair:0x090a0d},
    creator:{id:'creator',top:0x17111f,pants:0x10131a,shoes:0x0d0f14,accent:0xc56cff,skin:0x9b6848,hair:0x090a0d},
    nightlife:{id:'nightlife',top:0x1d1322,pants:0x0e1017,shoes:0x0a0b0f,accent:0xff466d,skin:0x8e5d41,hair:0x07080b},
    business:{id:'business',top:0x202630,pants:0x171b22,shoes:0x101216,accent:0x61d9ff,skin:0xa86f4d,hair:0x111318},
    casual:{id:'casual',top:0x25303a,pants:0x181d24,shoes:0x12151a,accent:0xffcf4a,skin:0xb47a56,hair:0x1a1615}
  };
  const BEHAVIORS={
    idle:{id:'idle',move:0,talk:0,phone:false,gesture:.12,look:.25},
    stroll:{id:'stroll',move:.7,talk:0,phone:false,gesture:.08,look:.2},
    social:{id:'social',move:.08,talk:.82,phone:false,gesture:.72,look:.8},
    phone:{id:'phone',move:.15,talk:.1,phone:true,gesture:.1,look:.15},
    hype:{id:'hype',move:.18,talk:.55,phone:false,gesture:1,look:.72}
  };
  const DISTRICTS={
    downtown:{profiles:['business','casual','street'],density:.82},
    'studio-row':{profiles:['creator','street','casual'],density:.86},
    shops:{profiles:['casual','street','creator'],density:.8},
    park:{profiles:['casual','street'],density:.65},
    media:{profiles:['creator','nightlife','street'],density:.92},
    business:{profiles:['business','creator'],density:.78}
  };
  function normalize(input={}){
    return {
      walkSpeed:clamp(Number.isFinite(Number(input.walkSpeed))?Number(input.walkSpeed):.75,0,1.6),
      turnSpeed:clamp(Number.isFinite(Number(input.turnSpeed))?Number(input.turnSpeed):.45,0,1.5),
      gesture:clamp(Number.isFinite(Number(input.gesture))?Number(input.gesture):.3,0,1),
      groupChance:clamp(Number.isFinite(Number(input.groupChance))?Number(input.groupChance):.45,0,1)
    };
  }
  function profile(id='street'){return {...(PROFILES[id]||PROFILES.street)}}
  function behavior(id='idle'){return {...(BEHAVIORS[id]||BEHAVIORS.idle)}}
  function district(id='downtown'){
    const d=DISTRICTS[id]||DISTRICTS.downtown;
    return {profiles:[...d.profiles],density:d.density};
  }
  const api={profile,behavior,district,normalize,profiles:Object.keys(PROFILES),behaviors:Object.keys(BEHAVIORS),districts:Object.keys(DISTRICTS)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();