(() => {
  const KEY = 'tgg-golden-path-v1';
  const steps = [
    { id:'create', name:'Create Your Artist', description:'Choose a stage name and style.', done: s => !!s?.name && s.name !== 'PLAYER' },
    { id:'record', name:'Record 3 Tracks', description:'Build the catalog before the first release.', done: () => (window.TGGCareer?.career?.recordings || 0) >= 3 },
    { id:'release', name:'Release A Mixtape', description:'Turn the catalog into a real release.', done: () => (window.TGGCareer?.career?.mixtapes || 0) >= 1 },
    { id:'promo', name:'Run Mixtape Promo', description:'Push the release through the city.', done: () => (window.TGGContent?.state?.completed || []).includes('mixtape-promo') },
    { id:'show', name:'Hit The Street Show', description:'Take the finished project into the city.', done: () => !!window.TGGExpansion?.state?.completed?.includes?.('street-show') || (window.TGGExpansion?.state?.completed || []).includes('street-show') }
  ];
  let state = { started:false, completed:[] };
  function load(){ try { const saved=JSON.parse(localStorage.getItem(KEY)||'{}'); if(saved && typeof saved==='object') state={...state,...saved}; } catch(e){} }
  function save(){ localStorage.setItem(KEY,JSON.stringify(state)); }
  function sync(){
    const game=window.TGGGame?.getState?.();
    state.completed=steps.filter(step=>step.done(game)).map(step=>step.id);
    if(state.completed.length===steps.length) state.started=true;
    save();
    return state;
  }
  function current(){
    sync();
    return steps.find(step=>!state.completed.includes(step.id)) || steps[steps.length-1];
  }
  function progress(){ sync(); return {done:state.completed.length,total:steps.length,percent:Math.round(state.completed.length/steps.length*100)}; }
  function start(){ state.started=true; save(); sync(); window.__tggToast?.('CREATIVE GOLDEN PATH STARTED'); window.TGGCareer?.render?.(); }
  window.TGGCodexPath={steps,state,load,save,sync,current,progress,start};
  load();
})();
