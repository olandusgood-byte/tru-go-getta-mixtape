(() => {
  const KEY='tgg-content-v1';
  const missions=[
    {id:'flyer-run',name:'Flyer Run',district:'Downtown',goal:1,reward:150,xp:30,rep:10},
    {id:'studio-session',name:'Studio Session',district:'Studio Row',goal:1,reward:300,xp:60,rep:25},
    {id:'mixtape-promo',name:'Mixtape Promo',district:'Mixtape Ave',goal:2,reward:500,xp:100,rep:50}
  ];
  const content={missions,npcs:[{id:'m',name:'M',role:'Manager'},{id:'dj',name:'DJ V',role:'DJ'},{id:'producer',name:'Kane',role:'Producer'}],locations:['Studio Row','Downtown','Mixtape Ave'],items:['Mic','Notebook','Promo Flyers','Beat Pack'],rewards:['Cash','XP','Reputation','Unlocks']};
  let state={active:null,progress:0,completed:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function notify(t){if(window.__tggToast)window.__tggToast(t);else console.log(t)}
  function current(){return missions.find(m=>m.id===state.active)}
  function start(id){const m=missions.find(x=>x.id===id);if(!m)return false;if(state.active===id)return true;state.active=id;state.progress=0;save();notify('MISSION STARTED — '+m.name);return true}
  function advance(){
    const m=current(); if(!m)return false;
    state.progress++;
    if(state.progress>=m.goal){
      state.completed.push(m.id); state.active=null; state.progress=0;
      const base={cash:m.reward,xp:m.xp,rep:m.rep};
      const applied=window.TGGEconomy?.apply?.(base);
      if(!applied){window.TGGGame?.reward?.(m.reward,m.xp);window.TGGCareer?.addRep?.(m.rep)}
      const cash=applied?.cash??m.reward;
      const xp=applied?.xp??m.xp;
      const rep=applied?.rep??m.rep;
      notify('CONTENT MISSION COMPLETE — +$'+cash+' / +'+xp+' XP / +'+rep+' REP');
      save(); return true;
    }
    notify(m.name+': '+state.progress+'/'+m.goal); save(); return false;
  }
  window.TGGContent={content,state,start,advance,load,save,current};
  load();
})();
