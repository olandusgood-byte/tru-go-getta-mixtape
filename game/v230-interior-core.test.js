(() => {
  const core=globalThis.__V230CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.30 Interior Forge core API must exist');
  assert(typeof core.room==='function','room API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.canWalk==='function','canWalk API');
  const studio=core.room('studio');
  assert(studio.id==='studio'&&studio.type==='recording','studio room');
  const home=core.room('home');
  assert(home.id==='home'&&home.type==='apartment','home room');
  const club=core.room('media');
  assert(club.type==='club','media room');
  const n=core.normalize({width:99,depth:-1,height:9});
  assert(n.width<=10&&n.depth>=5&&n.height<=5,'room clamps');
  assert(core.canWalk({x:0,z:0},{x:0,z:0},studio)===true,'center walk');
  assert(core.canWalk({x:20,z:20},{x:0,z:0},studio)===false,'outside blocked');
  return true;
})();