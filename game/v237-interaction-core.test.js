(() => {
  const core=globalThis.__V237CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.37 Interaction core API must exist');
  assert(typeof core.interaction==='function','interaction API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.lookAngles==='function','lookAngles API');
  assert(typeof core.weight==='function','weight API');

  const mic=core.interaction('mic');
  assert(mic.id==='mic'&&mic.hand==='right'&&mic.look>0,'mic profile');
  const console=core.interaction('console');
  assert(console.hand==='both','console profile');
  const door=core.interaction('door');
  assert(door.reach>0,'door reach');
  const npc=core.interaction('npc');
  assert(npc.look>0&&npc.duration>0,'npc profile');

  const n=core.normalize({reach:99,look:-3,duration:99999,bodyTwist:9});
  assert(n.reach<=1&&n.look>=0&&n.duration<=12000&&n.bodyTwist<=.5,'interaction clamps');

  const a=core.lookAngles({x:0,y:1.7,z:0},{x:2,y:2,z:2},0);
  assert(Number.isFinite(a.yaw)&&Number.isFinite(a.pitch),'look angles');
  assert(Math.abs(a.yaw)<=1.4&&Math.abs(a.pitch)<=.65,'angle clamps');

  assert(core.weight(0,1000,2000)===0,'weight before');
  assert(core.weight(1500,1000,2000)>0,'weight active');
  assert(core.weight(2500,1000,2000)===0,'weight after');
  return true;
})();