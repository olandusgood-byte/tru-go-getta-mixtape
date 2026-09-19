(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const EFFECTS={
    sparks:{id:'sparks',count:26,life:.62,speed:14,size:.055,opacity:.95,gravity:9.8,color:0xffd45c},
    'tire-smoke':{id:'tire-smoke',count:20,life:1.45,speed:2.6,size:.48,opacity:.5,gravity:0,color:0xb8c0cb},
    exhaust:{id:'exhaust',count:10,life:.85,speed:1.8,size:.22,opacity:.42,gravity:0,color:0xcbd5e1},
    dust:{id:'dust',count:16,life:1.0,speed:2.4,size:.35,opacity:.38,gravity:.5,color:0xa88f72},
    'rain-spray':{id:'rain-spray',count:22,life:.55,speed:5.5,size:.12,opacity:.55,gravity:6.2,color:0xbfdcff},
    boost:{id:'boost',count:18,life:.44,speed:8.8,size:.12,opacity:.9,gravity:0,color:0x61d9ff},
    confetti:{id:'confetti',count:80,life:4.2,speed:6.2,size:.1,opacity:.95,gravity:3.8,color:0xff466d},
    flash:{id:'flash',count:1,life:.16,speed:0,size:2.4,opacity:1,gravity:0,color:0xffffff},
    laser:{id:'laser',count:8,life:2.6,speed:0,size:.035,opacity:.72,gravity:0,color:0xc56cff}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'effect'),
      count:Math.round(clamp(Number.isFinite(Number(input.count))?Number(input.count):12,1,256)),
      life:clamp(Number.isFinite(Number(input.life))?Number(input.life):1,.1,8),
      speed:clamp(Number.isFinite(Number(input.speed))?Number(input.speed):2,0,40),
      size:clamp(Number.isFinite(Number(input.size))?Number(input.size):.1,.01,4),
      opacity:clamp(Number.isFinite(Number(input.opacity))?Number(input.opacity):.8,0,1),
      gravity:clamp(Number.isFinite(Number(input.gravity))?Number(input.gravity):0,0,20),
      color:Number.isFinite(Number(input.color))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.color)))):0xffffff
    };
  }
  function effect(id='sparks'){return normalize(EFFECTS[id]||EFFECTS.sparks)}
  function budget(q='high'){return q==='performance'?120:q==='balanced'?260:480}
  const api={effect,normalize,budget,effects:Object.keys(EFFECTS)};
  globalThis.TGGV236Core=api;
  if(typeof window!=='undefined')window.TGGV236Core=api;
})();