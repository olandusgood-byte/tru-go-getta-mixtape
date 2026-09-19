(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const EFFECTS={
    'tire-smoke':{id:'tire-smoke',life:1.8,size:.34,opacity:.32,speed:1.3,count:4,gravity:.8,color:0xb8bec8},
    exhaust:{id:'exhaust',life:1.2,size:.22,opacity:.26,speed:.9,count:2,gravity:.45,color:0xaab1ba},
    'impact-sparks':{id:'impact-sparks',life:.75,size:.08,opacity:.95,speed:7.2,count:12,gravity:-12,color:0xffc15a},
    'stage-haze':{id:'stage-haze',life:5.6,size:.9,opacity:.14,speed:.35,count:5,gravity:.16,color:0xcbd5e1},
    'rain-splash':{id:'rain-splash',life:.48,size:.09,opacity:.6,speed:2.8,count:8,gravity:-8,color:0xbfe2ff},
    confetti:{id:'confetti',life:4.4,size:.12,opacity:.95,speed:3.6,count:18,gravity:-5.2,color:0xff4f81},
    'ambient-dust':{id:'ambient-dust',life:7.2,size:.08,opacity:.12,speed:.18,count:7,gravity:.05,color:0xd7c9b6},
    'neon-motes':{id:'neon-motes',life:3.8,size:.07,opacity:.45,speed:.22,count:6,gravity:.12,color:0x61d9ff}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'custom'),
      life:clamp(Number.isFinite(Number(input.life))?Number(input.life):1, .08,12),
      size:clamp(Number.isFinite(Number(input.size))?Number(input.size):.1,.02,2.5),
      opacity:clamp(Number.isFinite(Number(input.opacity))?Number(input.opacity):.5,0,1),
      speed:clamp(Number.isFinite(Number(input.speed))?Number(input.speed):1,0,18),
      count:Math.round(clamp(Number.isFinite(Number(input.count))?Number(input.count):1,1,64)),
      gravity:clamp(Number.isFinite(Number(input.gravity))?Number(input.gravity):0,-30,30),
      color:Number.isFinite(Number(input.color))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.color)))):0xffffff
    };
  }
  function effect(id='ambient-dust'){
    return normalize(EFFECTS[id]||EFFECTS['ambient-dust']);
  }
  function budget(quality='high'){
    return quality==='performance'?36:quality==='balanced'?72:120;
  }
  const api={effect,normalize,budget,effects:Object.keys(EFFECTS)};
  globalThis.TGGV236Core=api;
  if(typeof window!=='undefined')window.TGGV236Core=api;
})();