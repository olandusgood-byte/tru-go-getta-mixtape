(() => {
  const core=globalThis.__V235CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.35 Face core API must exist');
  assert(typeof core.expression==='function','expression API');
  assert(typeof core.normalize==='function','normalize API');
  assert(typeof core.blend==='function','blend API');

  const neutral=core.expression('neutral');
  assert(neutral.id==='neutral','neutral preset');
  const focus=core.expression('focus');
  assert(focus.brow>neutral.brow,'focus brow');
  const happy=core.expression('happy');
  assert(happy.mouthCurve>0,'happy mouth');
  const angry=core.expression('angry');
  assert(angry.brow<0&&angry.eyeSquint>0,'angry expression');
  const rap=core.expression('rap');
  assert(rap.jawOpen>0,'rap jaw');

  const n=core.normalize({jawOpen:9,eyeSquint:-1,brow:5,mouthCurve:-9,headFollow:9});
  assert(n.jawOpen<=1&&n.eyeSquint>=0&&n.brow<=1&&n.mouthCurve>=-1&&n.headFollow<=1,'face clamps');

  const mid=core.blend(neutral,happy,.5);
  assert(mid.mouthCurve>neutral.mouthCurve&&mid.mouthCurve<happy.mouthCurve,'blend mouth');
  return true;
})();