(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  function normDeg(v){return ((Number(v)||0)%360+360)%360}
  function deltaDeg(from,to){
    let d=normDeg(to)-normDeg(from);
    if(d>180)d-=360;
    if(d<-180)d+=360;
    return d;
  }
  function turnTowards(current,target,maxStep){
    const c=normDeg(current),d=deltaDeg(c,target),m=Math.max(0,Number(maxStep)||0);
    if(Math.abs(d)<=m)return normDeg(target);
    return normDeg(c+Math.sign(d)*m);
  }
  function inputHeading(x,y){
    if(Math.abs(Number(x)||0)<1e-9&&Math.abs(Number(y)||0)<1e-9)return null;
    return normDeg(Math.atan2(Number(y)||0,Number(x)||0)*180/Math.PI);
  }
  function forwardVector(heading){
    const r=normDeg(heading)*Math.PI/180;
    return {x:Math.cos(r),y:Math.sin(r)};
  }
  function turnSpeedScale(delta){
    const a=Math.min(180,Math.abs(Number(delta)||0));
    if(a<=18)return 1;
    const t=(a-18)/162;
    return clamp(1-t*.72,.28,1);
  }
  function approach(value,target,amount){
    const v=Number(value)||0,t=Number(target)||0,a=Math.max(0,Number(amount)||0);
    if(v<t)return Math.min(t,v+a);
    if(v>t)return Math.max(t,v-a);
    return t;
  }
  const api={normDeg,deltaDeg,turnTowards,inputHeading,forwardVector,turnSpeedScale,approach};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();