(() => {
  const core=globalThis.__V237CoreUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.37 Avatar Customization core API must exist');
  assert(typeof core.style==='function','style API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.slot==='function','slot API');
  const street=core.style('street');assert(street.id==='street','street style');
  const luxury=core.style('luxury');assert(luxury.id==='luxury','luxury style');
  assert(core.slot('top').includes('jacket'),'top slot');
  assert(core.slot('shoes').includes('sneakers'),'shoe slot');
  const n=core.normalize({chainSize:99,shoeScale:-1,hairHeight:7});
  assert(n.chainSize<=1.5&&n.shoeScale>=.8&&n.hairHeight<=1.4,'avatar clamps');
  return true;
})();