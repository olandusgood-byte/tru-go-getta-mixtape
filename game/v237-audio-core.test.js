(() => {
  const core=globalThis.__V237CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.37 Audio core API must exist');
  assert(typeof core.cue==='function','cue API');
  assert(typeof core.ambience==='function','ambience API');
  assert(typeof core.normalize==='function','normalize API');

  const city=core.ambience('city');
  assert(city.id==='city'&&city.noise>0&&city.hum>0,'city ambience');
  const studio=core.ambience('studio');
  assert(studio.id==='studio'&&studio.noise<city.noise,'studio ambience');
  const club=core.ambience('club');
  assert(club.pulse>0,'club pulse');
  const rain=core.ambience('rain');
  assert(rain.noise>city.noise,'rain noise');

  const impact=core.cue('impact');
  assert(impact.id==='impact'&&impact.frequency>0,'impact cue');
  const success=core.cue('success');
  assert(success.duration>0,'success cue');

  const n=core.normalize({gain:99,frequency:-4,duration:99,attack:-1,release:99});
  assert(n.gain<=1&&n.frequency>=30&&n.duration<=4&&n.attack>=0&&n.release<=4,'audio clamps');
  return true;
})();