(() => {
  const core=globalThis.__V225CoreUnderTest;
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  assert(core,'V2.25 core API must exist');
  assert(typeof core.createState==='function','createState API');
  assert(typeof core.applyChoice==='function','applyChoice API');
  assert(typeof core.relationshipTier==='function','relationshipTier API');
  assert(typeof core.canCollaborate==='function','canCollaborate API');

  const fresh=core.createState();
  assert(fresh.rivalry===25,'fresh rivalry 25');
  assert(fresh.respect===10,'fresh respect 10');
  assert(fresh.chemistry===0,'fresh chemistry 0');
  assert(Array.isArray(fresh.history)&&fresh.history.length===0,'fresh history');

  const respect=core.applyChoice(fresh,'respect',{crewChemistry:30});
  assert(respect.rivalry<fresh.rivalry,'respect lowers rivalry');
  assert(respect.respect>fresh.respect,'respect raises respect');
  assert(respect.lastChoice==='respect','respect choice stored');

  const compete=core.applyChoice(fresh,'compete',{crewChemistry:30});
  assert(compete.rivalry>fresh.rivalry,'compete raises rivalry');
  assert(compete.crewRepDelta>0,'compete grants crew rep delta');

  assert(core.canCollaborate(fresh,{crewChemistry:20})===false,'collab locked at low chemistry');
  assert(core.canCollaborate(fresh,{crewChemistry:65})===true,'collab unlocked at high chemistry');
  const collab=core.applyChoice(fresh,'collab',{crewChemistry:65});
  assert(collab.chemistry>fresh.chemistry,'collab raises chemistry');
  assert(collab.respect>fresh.respect,'collab raises respect');

  assert(core.relationshipTier({rivalry:80,respect:10})==='RIVALS','rivals tier');
  assert(core.relationshipTier({rivalry:25,respect:70})==='RESPECTED','respected tier');
  assert(core.relationshipTier({rivalry:10,respect:90,chemistry:70})==='ALLIES','allies tier');

  let s=fresh;
  for(let i=0;i<30;i++)s=core.applyChoice(s,'respect',{crewChemistry:50});
  assert(s.history.length<=20,'history capped');
  assert(s.rivalry>=0&&s.rivalry<=100,'rivalry clamped');
  assert(s.respect>=0&&s.respect<=100,'respect clamped');
  return {ok:true,tests:18};
})();