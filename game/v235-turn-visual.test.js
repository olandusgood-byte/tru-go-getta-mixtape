(() => {
  const game=String(globalThis.__V235GameSourceUnderTest||'');
  const anim=String(globalThis.__V235AnimSourceUnderTest||'');
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(game.includes("turnDelta:walkRuntime.turnDelta"),'game passes turnDelta into 3D dynamics');
  assert(game.includes("desiredHeading:walkRuntime.desiredHeading"),'game passes desired heading into 3D dynamics');
  assert(anim.includes("dyn.turnDelta"),'animation Forge reads turnDelta');
  assert(anim.includes("turnLean"),'animation Forge computes turn lean');
  assert(anim.includes("pose.body.z+=turnLean"),'animation Forge applies turn lean to torso');
  assert(anim.includes("pose.head.z-=turnLean"),'animation Forge counter-leans head');
  return true;
})();