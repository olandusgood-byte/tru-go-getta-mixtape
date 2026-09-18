(() => {
  const core=globalThis.__V232CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.32 Animation core API must exist');
  assert(typeof core.clip==='function','clip API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.blend==='function','blend API');

  const idle=core.clip('idle');
  assert(idle.id==='idle','idle clip');
  assert(idle.armSwing===0,'idle arm swing');
  const walk=core.clip('walk');
  assert(walk.armSwing>0&&walk.legSwing>0,'walk swings');
  const run=core.clip('run');
  assert(run.armSwing>walk.armSwing&&run.rate>walk.rate,'run stronger');
  const phone=core.clip('phone');
  assert(phone.special==='phone','phone clip');
  const rap=core.clip('rap');
  assert(rap.special==='rap','rap clip');
  const perform=core.clip('perform');
  assert(perform.special==='perform','perform clip');

  const n=core.normalize({rate:99,armSwing:-4,lean:9,bob:-2});
  assert(n.rate<=20&&n.armSwing>=0&&n.lean<=.5&&n.bob>=0,'clamps');

  const a=core.normalize({armSwing:.2,legSwing:.4,lean:.1,bob:.02,rate:4});
  const b=core.normalize({armSwing:1,legSwing:1,lean:.3,bob:.08,rate:10});
  const mid=core.blend(a,b,.5);
  assert(mid.armSwing>.2&&mid.armSwing<1,'blend arm');
  assert(mid.rate>4&&mid.rate<10,'blend rate');
  return true;
})();