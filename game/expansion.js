(() => {
  const KEY='tgg-expansion-v1';
  const activities=[
    {id:'open-mic',name:'Open Mic',district:'Downtown',cost:0,reward:200,xp:40,rep:15,unlock:1},
    {id:'beat-meet',name:'Beat Meet',district:'Studio Row',cost:100,reward:350,xp:70,rep:25,unlock:2},
    {id:'street-show',name:'Street Show',district:'Mixtape Ave',cost:200,reward:650,xp:120,rep:50,unlock:3}
  ];
  const npcs=[
    {id:'m',name:'M',role:'Manager',dialogue:'Keep moving. The city is watching.'},
    {id:'djv',name:'DJ V',role:'DJ',dialogue:'Bring me something worth spinning.'},
    {id:'kane',name:'Kane',role:'Producer',dialogue:'You need better beats to level up.'}
  ];
  let state={completed:[],unlocked:['open-mic']};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function player(){return window.TGGGame?.getState?.()||{level:1,cash:0,xp:0}}
  function syncUnlocks(){
    const p=player();
    activities.forEach(a=>{if(p.level>=a.unlock&&!state.unlocked.includes(a.id))state.unlocked.push(a.id)});
    save();
  }
  function districtReady(a){
    const districts=window.TGGDistricts;
    if(!districts?.canEnter)return true;
    return districts.canEnter(a.district);
  }
  function run(id){
    const a=activities.find(x=>x.id===id); if(!a)return false;
    const p=player(); if(p.level<a.unlock){window.__tggToast?.('LEVEL '+a.unlock+' REQUIRED');return false}
    if(!districtReady(a)){window.__tggToast?.(a.district.toUpperCase()+' LOCKED');return false}
    if(p.cash<a.cost){window.__tggToast?.('NOT ENOUGH CASH');return false}
    if(a.cost&&window.TGGGame?.spend&&!window.TGGGame.spend(a.cost))return false;
    const reward=window.TGGEconomy?.apply
      ? window.TGGEconomy.apply({cash:a.reward,xp:a.xp,rep:a.rep})
      : (window.TGGGame?.reward?.(a.reward,a.xp),window.TGCCareer?.addRep?.(a.rep),{cash:a.reward,xp:a.xp,rep:a.rep,crew:{cash:0,xp:0,rep:0}});
    if(!state.completed.includes(id))state.completed.push(id);
    const after=player();
    activities.forEach(x=>{if(after.level>=x.unlock&&!state.unlocked.includes(x.id))state.unlocked.push(x.id)});
    save(); window.__tggToast?.(a.name+' COMPLETE — +$'+reward.cash+' / +'+reward.xp+' XP / +'+reward.rep+' REP'); return true;
  }
  window.TGGExpansion={activities,npcs,state,run,load,save,syncUnlocks}; load(); syncUnlocks();
})();
