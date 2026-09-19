(() => {
  const c=globalThis.TGGV243Core,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(c,'V2.43 replay core API');assert(Array.isArray(c.types)&&c.types.length===5,'five highlight types');
  const x=c.profile('battle');assert(x.id==='battle'&&x.windowMs>=5000&&x.replayMs>=3000,'battle profile');
  const samples=[{at:100},{at:200},{at:300},{at:400}];assert(c.windowed(samples,400,220).length===3,'window slicing');
  assert(c.progress(100,150,100)===.5,'progress');assert(c.indexFor(10,.5)===4,'index');
  return true;
})();