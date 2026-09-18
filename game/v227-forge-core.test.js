(() => {
  const core=globalThis.__V227CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.27 Forge core API must exist');
  assert(typeof core.normalizePreset==='function','normalizePreset API');
  assert(typeof core.applyMorph==='function','applyMorph API');
  assert(typeof core.preset==='function','preset API');
  assert(typeof core.materialProfile==='function','materialProfile API');

  const d=core.normalizePreset({});
  assert(d.height===1&&d.shoulders===1&&d.build===1,'default proportions');
  assert(d.skin>=0&&d.skin<=0xffffff,'skin normalized');
  assert(d.outfit.accent>=0&&d.outfit.accent<=0xffffff,'accent normalized');

  const tall=core.applyMorph(d,{height:1.25,shoulders:1.2,build:.9,legLength:1.15});
  assert(tall.height===1.25,'height morph');
  assert(tall.shoulders===1.2,'shoulder morph');
  assert(tall.build===.9,'build morph');
  assert(tall.legLength===1.15,'leg morph');

  const clamped=core.applyMorph(d,{height:99,shoulders:-10,headScale:0});
  assert(clamped.height<=1.3,'height clamped');
  assert(clamped.shoulders>=.75,'shoulders clamped');
  assert(clamped.headScale>=.82,'head scale clamped');

  const street=core.preset('street');
  assert(street.id==='street','street preset exists');
  const stage=core.preset('stage');
  assert(stage.id==='stage','stage preset exists');
  const luxury=core.preset('luxury');
  assert(luxury.id==='luxury','luxury preset exists');

  const cloth=core.materialProfile('cloth');
  assert(cloth.roughness>.5&&cloth.metalness<.2,'cloth profile');
  const chrome=core.materialProfile('chrome');
  assert(chrome.metalness>.8,'chrome profile');
  return true;
})();