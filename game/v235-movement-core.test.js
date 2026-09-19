(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 movement core API must exist');
  assert(typeof core.turnTowards==='function','turnTowards API');
  assert(typeof core.inputHeading==='function','inputHeading API');
  assert(typeof core.forwardVector==='function','forwardVector API');
  assert(typeof core.turnSpeedScale==='function','turnSpeedScale API');
  assert(typeof core.approach==='function','approach API');

  assert(Math.abs(core.inputHeading(1,0)-0)<.001,'right is 0 degrees');
  assert(Math.abs(core.inputHeading(0,1)-90)<.001,'down is 90 degrees');
  assert(Math.abs(core.inputHeading(-1,0)-180)<.001,'left is 180 degrees');
  assert(Math.abs(core.inputHeading(0,-1)-270)<.001,'up is 270 degrees');

  assert(Math.abs(core.turnTowards(350,10,6)-356)<.001,'wrap turn takes shortest path');
  assert(Math.abs(core.turnTowards(10,350,6)-4)<.001,'reverse wrap takes shortest path');
  assert(Math.abs(core.turnTowards(20,25,12)-25)<.001,'small turn snaps only to target');

  const f=core.forwardVector(90);
  assert(Math.abs(f.x)<.001&&Math.abs(f.y-1)<.001,'forward vector from heading');

  assert(core.turnSpeedScale(0)===1,'straight keeps full speed');
  assert(core.turnSpeedScale(90)<1&&core.turnSpeedScale(90)>.3,'90 degree turn slows');
  assert(core.turnSpeedScale(180)<=.35,'about-face pivots slowly');

  assert(core.approach(0,10,3)===3,'approach accelerates');
  assert(core.approach(10,0,4)===6,'approach decelerates');
  return true;
})();