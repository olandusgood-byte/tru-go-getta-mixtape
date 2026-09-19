(() => {
  const c=globalThis.TGGV242Core,assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(c,'V2.42 director core API');
  assert(Array.isArray(c.sequences)&&c.sequences.length===5,'five director sequences');
  for(const id of c.sequences){const s=c.sequence(id);assert(s.id===id,id+' id');assert(s.cues.length>=2,id+' cues');assert(s.duration>1000,id+' duration');assert(s.cues.every(x=>x.ms>=300&&x.ms<=12000),id+' cue timing')}
  assert(c.sequence('unknown').id==='showcase','fallback sequence');
  return true;
})();