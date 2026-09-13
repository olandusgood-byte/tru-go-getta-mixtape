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
  function run(id){
    const a=activities.find(x=>x.id===id); if(!a)return false;
    const p=player(); if(p.level<a.unlock){window.__tggToast?.('LEVEL '+a.unlock+' REQUIRED');return false}
    if(p.cash<a.cost){window.__tggToast?.('NOT ENOUGH CASH');return false}
    if(a.cost&&window.TGGGame?.spend)window.TGGGame.spend(a.cost);
    window.TGGGame?.reward?.(a.reward,a.xp);
    state.completed.push(id);
    const next=activities.find(x=>x.unlock===p.level+1); if(next&&!state.unlocked.includes(next.id))state.unlocked.push(next.id);
    save(); window.TGGCareer?.addRep?.(a.rep); window.__tggToast?.(a.name+' COMPLETE — +$'+a.reward+' / +'+a.xp+' XP'); return true;
  }
  window.TGGExpansion={activities,npcs,state,run,load,save}; load();
})();
