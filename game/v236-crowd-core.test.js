(() => {
  const core=globalThis.__V236CoreUnderTest,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.36 Crowd core API must exist');
  assert(typeof core.archetype==='function','archetype API');
  assert(typeof core.densityBudget==='function','density API');
  assert(typeof core.motion==='function','motion API');
  const fan=core.archetype('fan'); assert(fan.id==='fan'&&fan.energy>0,'fan archetype');
  const artist=core.archetype('artist'); assert(artist.id==='artist'&&artist.style==='artist','artist archetype');
  assert(core.densityBudget('high')>core.densityBudget('balanced'),'high density');
  assert(core.densityBudget('balanced')>core.densityBudget('performance'),'balanced density');
  const m=core.motion('walk'); assert(m.rate>0&&m.arm>0&&m.leg>0,'walk motion');
  const phone=core.motion('phone'); assert(phone.special==='phone','phone motion');
  return true;
})();