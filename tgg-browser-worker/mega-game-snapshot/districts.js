(() => {
  const KEY='tgg-districts-v1';
  const districts=[
    {id:'downtown',name:'Downtown',level:1},
    {id:'studio-row',name:'Studio Row',level:2},
    {id:'mixtape-ave',name:'Mixtape Ave',level:3}
  ];
  let state={unlocked:[]};
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...s};if(!Array.isArray(state.unlocked))state.unlocked=[]}catch(e){state={unlocked:[]}}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function sync(){const level=Number(window.TGGGame?.getState?.()?.level)||1;let changed=false;districts.forEach(d=>{if(level>=d.level&&!state.unlocked.includes(d.id)){state.unlocked.push(d.id);changed=true}});if(changed)save();return state}
  function get(name){return districts.find(d=>d.name.toLowerCase()===String(name).toLowerCase()||d.id===name)}
  function unlocked(name){const d=get(name);return !!d&&state.unlocked.includes(d.id)}
  function canEnter(name){sync();return unlocked(name)}
  load();sync();window.TGGDistricts={districts,state,load,save,sync,get,unlocked,canEnter};
})();
