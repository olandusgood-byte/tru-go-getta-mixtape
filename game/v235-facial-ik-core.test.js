(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Facial IK core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.look==='function','look API');

  const idle=core.profile('idle');
  assert(idle.id==='idle','idle profile');
  const talk=core.profile('talk');
  assert(talk.mouth>idle.mouth&&talk.gaze>0,'talk profile');
  const rap=core.profile('rap');
  assert(rap.mouth>talk.mouth&&rap.energy>talk.energy,'rap profile');
  const perform=core.profile('perform');
  assert(perform.energy>=rap.energy,'perform profile');

  const n=core.normalize({mouth:9,gaze:-2,blink:4,energy:7,headYaw:9,headPitch:-9});
  assert(n.mouth<=1&&n.gaze>=0&&n.blink<=1&&n.energy<=1,'face clamps');
  assert(n.headYaw<=.55&&n.headPitch>=-.4,'head clamps');

  const look=core.look({x:1,z:1},{x:0,z:0},0);
  assert(Number.isFinite(look.yaw)&&Number.isFinite(look.pitch),'look finite');
  assert(Math.abs(look.yaw)<=.55,'look yaw clamp');
  return true;
})();