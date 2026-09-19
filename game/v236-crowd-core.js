(() => {
  const ARCH={
    fan:{id:'fan',style:'street',energy:.78,skin:0xa87552,top:0x232a35,pants:0x11151b,accent:0xc7ff00},
    artist:{id:'artist',style:'artist',energy:.9,skin:0x8f6046,top:0x16111e,pants:0x0c1016,accent:0xff466d},
    exec:{id:'exec',style:'business',energy:.45,skin:0xb77b5a,top:0x1c2028,pants:0x15181e,accent:0xd8dde7},
    local:{id:'local',style:'casual',energy:.55,skin:0x6f4637,top:0x334155,pants:0x171b22,accent:0x61d9ff},
    promoter:{id:'promoter',style:'nightlife',energy:.72,skin:0x9a6549,top:0x201429,pants:0x10131a,accent:0xc56cff}
  };
  const MOTIONS={
    idle:{id:'idle',rate:1.6,arm:0,leg:0,bob:.02,special:null},
    walk:{id:'walk',rate:6.8,arm:.58,leg:.5,bob:.05,special:null},
    talk:{id:'talk',rate:4.2,arm:.32,leg:0,bob:.025,special:'talk'},
    phone:{id:'phone',rate:3.0,arm:.14,leg:0,bob:.018,special:'phone'},
    rap:{id:'rap',rate:8.8,arm:.8,leg:.08,bob:.08,special:'rap'}
  };
  const clone=x=>JSON.parse(JSON.stringify(x));
  const archetype=id=>clone(ARCH[id]||ARCH.local);
  const motion=id=>clone(MOTIONS[id]||MOTIONS.idle);
  const densityBudget=q=>q==='performance'?8:q==='balanced'?14:22;
  const api={archetype,motion,densityBudget,archetypes:Object.keys(ARCH),motions:Object.keys(MOTIONS)};
  globalThis.TGGV236Core=api;if(typeof window!=='undefined')window.TGGV236Core=api;
})();