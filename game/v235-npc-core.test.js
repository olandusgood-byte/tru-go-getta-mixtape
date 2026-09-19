(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 NPC Life core API must exist');
  assert(typeof core.profile==='function','profile API');
  assert(typeof core.behavior==='function','behavior API');
  assert(typeof core.district==='function','district API');
  assert(typeof core.normalize==='function','normalize API');

  const street=core.profile('street');
  assert(street.id==='street','street profile');
  const creator=core.profile('creator');
  assert(creator.id==='creator','creator profile');
  const nightlife=core.profile('nightlife');
  assert(nightlife.id==='nightlife','nightlife profile');

  const idle=core.behavior('idle');
  assert(idle.id==='idle'&&idle.move===0,'idle behavior');
  const social=core.behavior('social');
  assert(social.talk>0,'social behavior');
  const phone=core.behavior('phone');
  assert(phone.phone===true,'phone behavior');

  const media=core.district('media');
  assert(Array.isArray(media.profiles)&&media.profiles.includes('creator'),'media district profiles');

  const n=core.normalize({walkSpeed:99,turnSpeed:-1,gesture:9,groupChance:4});
  assert(n.walkSpeed<=1.6&&n.turnSpeed>=0&&n.gesture<=1&&n.groupChance<=1,'clamps');
  return true;
})();