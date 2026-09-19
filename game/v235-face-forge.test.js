(() => {
  const forge=globalThis.__V235ForgeUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(forge,'V2.35 Face Forge adapter API must exist');
  assert(Array.isArray(forge.layers)&&forge.layers.length===100,'exact 100 Face Forge layers');
  assert(typeof forge.status==='function','status API');
  assert(typeof forge.applyExpression==='function','applyExpression API');
  assert(typeof forge.setEnabled==='function','enabled API');
  assert(typeof forge.restore==='function','restore API');
  assert(Array.isArray(forge.expressions)&&forge.expressions.includes('neutral')&&forge.expressions.includes('focus')&&forge.expressions.includes('happy')&&forge.expressions.includes('angry')&&forge.expressions.includes('rap'),'expressions');
  const s=forge.status();
  assert(s.version==='V2.35 TGG FACE + EXPRESSION FORGE 100','version');
  assert(s.mode==='native-face-forge','mode');
  assert(s.enabled===true,'enabled default');
  assert(s.expression==='neutral','neutral default');
  assert(s.layerCount===100,'layer count');
  return true;
})();