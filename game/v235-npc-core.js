(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PALETTES=[
    {skin:0x8f5f43,top:0x111827,pants:0x0b0e14,shoes:0x10131a,accent:0xc7ff00,hair:0x07090d},
    {skin:0xa36f4d,top:0x24141a,pants:0x10151c,shoes:0x111318,accent:0xff466d,hair:0x09090b},
    {skin:0x6f4936,top:0x0d1c25,pants:0x161a21,shoes:0x0a0d11,accent:0x61d9ff,hair:0x060708},
    {skin:0xb8805b,top:0x1d1724,pants:0x0d1015,shoes:0x13151a,accent:0xc56cff,hair:0x100b0a},
    {skin:0x7b513b,top:0x20231a,pants:0x101218,shoes:0x080a0d,accent:0xffcf4a,hair:0x08090d},
    {skin:0x946246,top:0x151515,pants:0x20252d,shoes:0x0c0e12,accent:0x4cff88,hair:0x07080a}
  ];
  const BEHAVIORS={
    idle:{id:'idle',speed:0,turnRate:.7,special:null},
    walk:{id:'walk',speed:.72,turnRate:1.3,special:null},
    talk:{id:'talk',speed:0,turnRate:.8,special:'talk'},
    rap:{id:'rap',speed:0,turnRate:.9,special:'rap'},
    cheer:{id:'cheer',speed:0,turnRate:1.0,special:'perform'},
    phone:{id:'phone',speed:.18,turnRate:.75,special:'phone'}
  };
  function seeded(seed){
    let x=((Number(seed)||1)*2654435761)>>>0;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)%100000)/100000;
  }
  function color(v,f){
    const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(0xffffff,Math.floor(n))):f;
  }
  function profile(seed=1){
    const n=Math.max(0,Math.floor(Number(seed)||0));
    const p=PALETTES[n%PALETTES.length];
    const preset=['street','stage','luxury'][n%3];
    return {
      id:'npc-'+n,
      preset,
      height:clamp(.94+(seeded(n+11)-.5)*.16,.9,1.12),
      shoulders:clamp(.96+(seeded(n+23)-.5)*.16,.88,1.1),
      build:clamp(.96+(seeded(n+37)-.5)*.18,.86,1.12),
      legLength:clamp(.98+(seeded(n+53)-.5)*.12,.92,1.08),
      armLength:clamp(.98+(seeded(n+71)-.5)*.12,.92,1.08),
      headScale:clamp(.98+(seeded(n+89)-.5)*.08,.94,1.04),
      skin:color(p.skin,0x8f5f43),
      outfit:{
        top:color(p.top,0x111827),pants:color(p.pants,0x0b0e14),shoes:color(p.shoes,0x10131a),
        accent:color(p.accent,0xc7ff00),hair:color(p.hair,0x07090d)
      }
    };
  }
  function behavior(id='idle'){return {...(BEHAVIORS[id]||BEHAVIORS.idle)}}
  function crowdBudget(q='high'){return q==='performance'?8:q==='balanced'?14:22}
  const DISTRICTS={
    downtown:{cx:18,cz:18,spread:24},
    'studio-row':{cx:-26,cz:-12,spread:19},
    shops:{cx:-12,cz:26,spread:18},
    park:{cx:16,cz:-26,spread:20},
    media:{cx:2,cz:34,spread:16},
    business:{cx:-32,cz:2,spread:18}
  };
  function spawnPlan(district='downtown',quality='high'){
    const d=DISTRICTS[district]||DISTRICTS.downtown,count=crowdBudget(quality),out=[];
    for(let i=0;i<count;i++){
      const a=seeded(i*19+district.length*31)*Math.PI*2;
      const r=3+seeded(i*29+17)*d.spread*.72;
      const x=clamp(d.cx+Math.cos(a)*r,-44,44);
      const z=clamp(d.cz+Math.sin(a)*r,-44,44);
      const behaviorId=['walk','idle','talk','phone','walk','idle'][i%6];
      out.push({
        id:'spawn-'+district+'-'+i,
        x,z,heading:seeded(i*43+9)*Math.PI*2,
        behavior:behaviorId,
        profile:profile(i+district.length*101)
      });
    }
    return out;
  }
  const api={profile,behavior,crowdBudget,spawnPlan,behaviors:Object.keys(BEHAVIORS),districts:Object.keys(DISTRICTS)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();