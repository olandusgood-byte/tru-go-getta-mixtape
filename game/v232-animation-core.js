(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const CLIPS={
    idle:{id:'idle',rate:1.8,armSwing:0,legSwing:0,lean:0,bob:.018,head:.045,twist:.025,special:null},
    walk:{id:'walk',rate:7.2,armSwing:.72,legSwing:.62,lean:.06,bob:.055,head:.04,twist:.045,special:null},
    run:{id:'run',rate:12.4,armSwing:1.05,legSwing:.96,lean:.13,bob:.095,head:.06,twist:.08,special:null},
    talk:{id:'talk',rate:4.6,armSwing:.32,legSwing:0,lean:.05,bob:.025,head:.1,twist:.12,special:'talk'},
    phone:{id:'phone',rate:3.2,armSwing:.15,legSwing:0,lean:.035,bob:.02,head:.08,twist:.05,special:'phone'},
    rap:{id:'rap',rate:9.2,armSwing:.88,legSwing:.12,lean:.14,bob:.1,head:.09,twist:.18,special:'rap'},
    perform:{id:'perform',rate:11.2,armSwing:1.12,legSwing:.22,lean:.18,bob:.12,head:.1,twist:.22,special:'perform'}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'custom'),
      rate:clamp(Number.isFinite(Number(input.rate))?Number(input.rate):4,.2,20),
      armSwing:clamp(Number.isFinite(Number(input.armSwing))?Number(input.armSwing):0,0,1.4),
      legSwing:clamp(Number.isFinite(Number(input.legSwing))?Number(input.legSwing):0,0,1.3),
      lean:clamp(Number.isFinite(Number(input.lean))?Number(input.lean):0,0,.5),
      bob:clamp(Number.isFinite(Number(input.bob))?Number(input.bob):0,0,.2),
      head:clamp(Number.isFinite(Number(input.head))?Number(input.head):.04,0,.25),
      twist:clamp(Number.isFinite(Number(input.twist))?Number(input.twist):.04,0,.4),
      special:input.special||null
    };
  }
  function clip(id='idle'){const c=CLIPS[id]||CLIPS.idle;return normalize(c)}
  function blend(a={},b={},t=.5){
    const A=normalize(a),B=normalize(b),u=clamp(t,0,1),mix=(x,y)=>x+(y-x)*u;
    return normalize({
      id:B.id||A.id,rate:mix(A.rate,B.rate),armSwing:mix(A.armSwing,B.armSwing),
      legSwing:mix(A.legSwing,B.legSwing),lean:mix(A.lean,B.lean),bob:mix(A.bob,B.bob),
      head:mix(A.head,B.head),twist:mix(A.twist,B.twist),special:u>.5?B.special:A.special
    });
  }
  const api={clip,normalize,blend,clips:Object.keys(CLIPS)};
  globalThis.TGGV232Core=api;
  if(typeof window!=='undefined')window.TGGV232Core=api;
})();