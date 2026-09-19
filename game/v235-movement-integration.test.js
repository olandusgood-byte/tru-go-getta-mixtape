(() => {
  const src=String(globalThis.__V235GameSourceUnderTest||'');
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(src,'game.js source must be provided');
  assert(src.includes("turnRateDeg:420"),'walk tuning includes turnRateDeg');
  assert(src.includes("window.TGGV235Core?.inputHeading"),'player loop uses V2.35 inputHeading');
  assert(src.includes("window.TGGV235Core?.turnTowards"),'player loop uses smoothed turnTowards');
  assert(src.includes("window.TGGV235Core?.turnSpeedScale"),'player loop slows during hard turns');
  assert(src.includes("window.TGGV235Core?.forwardVector"),'player velocity follows smoothed heading');
  assert(src.includes("walkRuntime.turnDelta"),'player runtime tracks turn delta');
  assert(!src.includes("if(dx||dy)state.heading=(Math.atan2(dy,dx)*180/Math.PI+360)%360;"),'fallback move no longer snaps heading');
  return true;
})();