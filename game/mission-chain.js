(() => {
  const KEY='tgg-chains-v1';
  const chains=[
    {id:'first-move',name:'FIRST MOVE',detail:'Build momentum from the block to the studio.',missions:['flyer-run','studio-session','mixtape-promo']},
    {id:'city-run',name:'CITY RUN',detail:'Complete every city mission in sequence.',missions:['flyer-run','studio-session']}
  ];
  let state={active:null,completed:[]};
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...s};if(!Array.isArray(state.completed))state.completed=[];if(state.active&&!get(state.active))state.active=null}catch(e){state={active:null,completed:[]}}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function get(id){return chains.find(c=>c.id===id)}
  function progress(c){const done=window.TGGContent?.state?.completed||[];return c.missions.filter(id=>done.includes(id)).length}
  function completeIfDone(c){if(progress(c)===c.missions.length){if(!state.completed.includes(c.id)){state.completed.push(c.id);if(window.__tggToast)window.__tggToast('CHAIN COMPLETE — '+c.name)}if(state.active===c.id)state.active=null;save();return true}return false}
  function start(id){const c=get(id);if(!c)return false;if(completeIfDone(c))return false;const done=window.TGGContent?.state?.completed||[];const next=c.missions.find(m=>!done.includes(m));if(window.TGGContent?.state?.active&&window.TGGContent.state.active!==next)return false;state.active=c.id;save();return !!window.TGGContent?.start?.(next)}
  function sync(){chains.forEach(completeIfDone);save();return state}
  function current(){return state.active?get(state.active):null}
  load(); sync(); window.TGGChains={chains,state,load,save,get,progress,start,sync,current};
})();
