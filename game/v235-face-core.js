(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const EXPRESSIONS={
    neutral:{id:'neutral',jawOpen:.03,eyeSquint:.02,brow:0,mouthCurve:0,headFollow:.18,blinkRate:1},
    focus:{id:'focus',jawOpen:.02,eyeSquint:.12,brow:.28,mouthCurve:-.04,headFollow:.52,blinkRate:.9},
    happy:{id:'happy',jawOpen:.12,eyeSquint:.16,brow:.08,mouthCurve:.58,headFollow:.34,blinkRate:1.15},
    angry:{id:'angry',jawOpen:.08,eyeSquint:.28,brow:-.42,mouthCurve:-.28,headFollow:.46,blinkRate:.8},
    rap:{id:'rap',jawOpen:.48,eyeSquint:.1,brow:.14,mouthCurve:.06,headFollow:.38,blinkRate:1.05}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'neutral'),
      jawOpen:clamp(Number.isFinite(Number(input.jawOpen))?Number(input.jawOpen):.03,0,1),
      eyeSquint:clamp(Number.isFinite(Number(input.eyeSquint))?Number(input.eyeSquint):.02,0,1),
      brow:clamp(Number.isFinite(Number(input.brow))?Number(input.brow):0,-1,1),
      mouthCurve:clamp(Number.isFinite(Number(input.mouthCurve))?Number(input.mouthCurve):0,-1,1),
      headFollow:clamp(Number.isFinite(Number(input.headFollow))?Number(input.headFollow):.18,0,1),
      blinkRate:clamp(Number.isFinite(Number(input.blinkRate))?Number(input.blinkRate):1,.35,2.2)
    };
  }
  function expression(id='neutral'){return normalize(EXPRESSIONS[id]||EXPRESSIONS.neutral)}
  function blend(a={},b={},t=.5){
    const A=normalize(a),B=normalize(b),u=clamp(t,0,1),mix=(x,y)=>x+(y-x)*u;
    return normalize({
      id:B.id||A.id,jawOpen:mix(A.jawOpen,B.jawOpen),eyeSquint:mix(A.eyeSquint,B.eyeSquint),
      brow:mix(A.brow,B.brow),mouthCurve:mix(A.mouthCurve,B.mouthCurve),
      headFollow:mix(A.headFollow,B.headFollow),blinkRate:mix(A.blinkRate,B.blinkRate)
    });
  }
  const api={expression,normalize,blend,expressions:Object.keys(EXPRESSIONS)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();