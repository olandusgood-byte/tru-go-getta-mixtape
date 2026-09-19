(() => {
  const KEY='tgg-world-life-v1';
  const $=id=>document.getElementById(id);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const defaults=()=>({
    tab:'battle',
    attributes:{stamina:1,focus:1,presence:1},
    battle:{active:false,round:0,player:0,rival:0,last:'Pick your approach and win the room.'},
    show:{active:false,move:0,energy:70,crowd:35,score:0,last:'Build a set and move the crowd.'},
    battleWins:0,battleLosses:0,shows:0,training:0,
    contacts:{manager:0,dj:0,producer:0,director:0},
    activeOpportunity:null,
    updatedAt:0
  });
  let state=defaults();

  const contacts=[
    {id:'manager',name:'M',role:'Manager',need:1,opportunity:'Manager Meeting',detail:'Career planning + next-city move.'},
    {id:'dj',name:'DJ V',role:'DJ',need:2,opportunity:'Club Spin',detail:'Get your record into the city rotation.'},
    {id:'producer',name:'Kane',role:'Producer',need:2,opportunity:'Beat Session',detail:'Lock in for a focused studio session.'},
    {id:'director',name:'Director K',role:'Video Director',need:3,opportunity:'Visual Treatment',detail:'Plan a music-video concept.'}
  ];

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
      state.attributes={...defaults().attributes,...saved.attributes};
      state.battle={...defaults().battle,...saved.battle};
      state.show={...defaults().show,...saved.show};
      state.contacts={...defaults().contacts,...saved.contacts};
    }catch(e){state=defaults();}
    return state;
  }
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function notify(text){window.__tggToast?window.__tggToast(text):console.log(text)}
  function game(){return window.TGGGame?.getState?.()||{level:1,cash:0}}
  function career(){return window.TGGCareer?.career||{studioLevel:1,reputation:0,recordings:0,mixtapes:0}}
  function reward(cash,xp,rep=0){
    window.TGGGame?.reward?.(cash,xp);
    if(rep)window.TGGCareer?.addRep?.(rep);
    window.TGGProgression?.sync?.();
    window.TGGWorldSync?.sync?.();
  }
  function contactUnlocked(contact){
    return Math.max(Number(game().level)||1,Number(career().studioLevel)||1)>=contact.need;
  }
  function battleModifier(choice,rival){
    if((choice==='bars'&&rival==='flow')||(choice==='flow'&&rival==='crowd')||(choice==='crowd'&&rival==='bars'))return 2;
    if(choice===rival)return 0;
    return -1;
  }
  function emitFocus(focus){
    try{window.dispatchEvent(new CustomEvent('tgg:worldlife:focus',{detail:{focus}}))}catch(e){}
  }
  function startBattle(){
    state.show.active=false;
    state.tab='battle';
    state.battle={active:true,round:0,player:0,rival:0,last:'ROUND 1 — set the tone.'};
    window.TGGLifeOS?.applyCareerAction?.('battle');
    save();render();emitFocus('downtown');notify('RAP BATTLE STARTED');
  }
  function battleChoice(choice){
    if(!state.battle.active)startBattle();
    const round=state.battle.round;
    const rivalMoves=['flow','bars','crowd'];
    const rival=rivalMoves[(round+state.battleWins)%rivalMoves.length];
    const attr=choice==='bars'?state.attributes.focus:choice==='crowd'?state.attributes.presence:Math.ceil((state.attributes.focus+state.attributes.presence)/2);
    const base={flow:4,bars:4.5,crowd:3.5}[choice]||3;
    const lifeReadiness=window.TGGLifeOS?.performanceModifier?.()||1;
    const playerScore=(base+attr*.7+battleModifier(choice,rival))*lifeReadiness;
    const rivalScore=3.8+round*.65+(game().level||1)*.12;
    state.battle.player+=playerScore;
    state.battle.rival+=rivalScore;
    state.battle.round++;
    state.battle.last=`You used ${choice.toUpperCase()} • Rival used ${rival.toUpperCase()} • ${playerScore>=rivalScore?'YOU TOOK THE ROUND':'RIVAL TOOK THE ROUND'}`;
    if(state.battle.round>=3){
      const won=state.battle.player>=state.battle.rival;
      state.battle.active=false;
      if(won){
        state.battleWins++;
        const cash=220+state.battleWins*20;
        reward(cash,55,30);
        state.battle.last=`BATTLE WON • +$${cash} • +55 XP • +30 REP`;
        notify('RAP BATTLE WON');
      }else{
        state.battleLosses++;
        reward(35,20,8);
        state.battle.last='BATTLE LOST • +$35 • +20 XP • +8 REP — RUN IT BACK';
        notify('BATTLE OVER — RUN IT BACK');
      }
    }
    save();render();
  }

  function startShow(){
    state.battle.active=false;
    state.tab='show';
    state.show={active:true,move:0,energy:clamp(62+state.attributes.stamina*6,0,100),crowd:35,score:0,last:'LIGHTS UP — build the crowd.'};
    window.TGGLifeOS?.applyCareerAction?.('show');
    save();render();emitFocus('stage');notify('LIVE SHOW STARTED');
  }
  function showMove(move){
    if(!state.show.active)startShow();
    const a=state.attributes;
    const lifeReadiness=window.TGGLifeOS?.performanceModifier?.()||1;
    if(move==='perform'){
      state.show.energy-=18;
      state.show.crowd+=10+a.presence*2;
      state.show.score+=16+a.focus*2;
      state.show.last='PERFORM TRACK — clean delivery and momentum.';
    }else if(move==='hype'){
      state.show.energy-=11;
      state.show.crowd+=15+a.presence*3;
      state.show.score+=8+a.presence;
      state.show.last='WORK THE CROWD — energy jumps.';
    }else{
      state.show.energy+=12+a.stamina*2;
      state.show.crowd+=4+a.presence;
      state.show.score+=7+a.focus;
      state.show.last='PACE THE SET — recover and reset the room.';
    }
    state.show.score+=Math.round((lifeReadiness-1)*10);
    state.show.crowd+=Math.round((lifeReadiness-1)*8);
    state.show.energy=clamp(state.show.energy,0,100);
    state.show.crowd=clamp(state.show.crowd,0,100);
    state.show.move++;
    if(state.show.move>=4||state.show.energy<=3){
      const success=state.show.crowd>=55;
      state.show.active=false;
      if(success){
        state.shows++;
        const cash=Math.round(180+state.show.crowd*3+state.show.score);
        const xp=45+state.attributes.presence*4;
        reward(cash,xp,25);
        state.show.last=`SHOW COMPLETE • CROWD ${Math.round(state.show.crowd)} • +$${cash} • +${xp} XP`;
        notify('SHOW COMPLETE — CROWD ROCKED');
      }else{
        reward(60,20,6);
        state.show.last='SHOW COMPLETE • CROWD NEEDS MORE • +$60 • +20 XP';
        notify('SHOW COMPLETE — BUILD MORE BUZZ');
      }
    }
    save();render();
  }

  function callContact(id){
    const contact=contacts.find(x=>x.id===id);
    if(!contact||!contactUnlocked(contact)){notify('BUILD YOUR LEVEL TO UNLOCK THIS CONTACT');return false;}
    state.contacts[id]=(Number(state.contacts[id])||0)+1;
    window.TGGLifeOS?.contactInteraction?.(id,'call');
    state.activeOpportunity={contactId:id,title:contact.opportunity,detail:contact.detail,createdAt:Date.now()};
    save();render();
    notify(contact.name.toUpperCase()+' PICKED UP — '+contact.opportunity.toUpperCase());
    return true;
  }
  function clearOpportunity(){
    state.activeOpportunity=null;save();render();notify('OPPORTUNITY CLEARED');
  }

  function train(attr){
    if(!['stamina','focus','presence'].includes(attr))return false;
    const level=Number(state.attributes[attr])||1;
    if(level>=10){notify(attr.toUpperCase()+' MAXED');return false;}
    const cost=40+level*25;
    if(!window.TGGGame?.spend?.(cost))return false;
    state.attributes[attr]=level+1;
    state.training++;
    window.TGGLifeOS?.applyCareerAction?.('training');
    window.TGGCareer?.addRep?.(5);
    save();render();
    notify(`${attr.toUpperCase()} +1 • TRAINING COST $${cost}`);
    return true;
  }
  function trainingCost(attr){return 40+(Number(state.attributes[attr])||1)*25}

  function setTab(tab){
    if(!['battle','show','phone','gym'].includes(tab))return;
    state.tab=tab;save();render();
  }

  function render(){
    const root=$('worldLifeBoard');if(!root)return;
    const g=game(),c=career();
    $('worldLifeStats') && ($('worldLifeStats').innerHTML=
      `<span><b>LVL ${g.level||1}</b><small>PLAYER</small></span><span><b>${state.battleWins}-${state.battleLosses}</b><small>BATTLE RECORD</small></span><span><b>${state.shows}</b><small>SHOWS</small></span><span><b>${c.recordings||0}</b><small>TRACKS</small></span>`);
    root.querySelectorAll('[data-life-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.lifeTab===state.tab));
    root.querySelectorAll('[data-life-panel]').forEach(p=>p.classList.toggle('selected',p.dataset.lifePanel===state.tab));

    $('battleRound') && ($('battleRound').textContent=state.battle.active?`ROUND ${state.battle.round+1}/3`:'READY');
    $('battleScore') && ($('battleScore').textContent=`${state.battle.player.toFixed(1)} — ${state.battle.rival.toFixed(1)}`);
    $('battleFeed') && ($('battleFeed').textContent=state.battle.last);
    $('battleStart') && ($('battleStart').textContent=state.battle.active?'RESET BATTLE':'START BATTLE');

    $('showEnergy') && ($('showEnergy').style.width=clamp(state.show.energy,0,100)+'%');
    $('showCrowd') && ($('showCrowd').style.width=clamp(state.show.crowd,0,100)+'%');
    $('showEnergyText') && ($('showEnergyText').textContent=Math.round(state.show.energy));
    $('showCrowdText') && ($('showCrowdText').textContent=Math.round(state.show.crowd));
    $('showFeed') && ($('showFeed').textContent=state.show.last);
    $('showStart') && ($('showStart').textContent=state.show.active?'RESET SHOW':'START SHOW');

    const contactList=$('phoneContacts');
    if(contactList){
      contactList.innerHTML=contacts.map(x=>{
        const unlocked=contactUnlocked(x),calls=Number(state.contacts[x.id])||0;
        return `<article class="life-contact ${unlocked?'':'locked'}"><div><b>${x.name}</b><span>${x.role} • calls ${calls}</span><small>${unlocked?x.detail:'Unlock at LVL '+x.need}</small></div><button data-call-contact="${x.id}" ${unlocked?'':'disabled'}>CALL</button></article>`;
      }).join('');
      contactList.querySelectorAll('[data-call-contact]').forEach(b=>b.addEventListener('click',()=>callContact(b.dataset.callContact)));
    }
    const opp=$('phoneOpportunity');
    if(opp){
      opp.innerHTML=state.activeOpportunity
        ?`<b>${state.activeOpportunity.title}</b><span>${state.activeOpportunity.detail}</span><button id="clearOpportunity">CLEAR</button>`
        :'<b>NO ACTIVE OPPORTUNITY</b><span>Call a contact to open a city opportunity.</span>';
      $('clearOpportunity')?.addEventListener('click',clearOpportunity);
    }

    ['stamina','focus','presence'].forEach(attr=>{
      const value=state.attributes[attr];
      const meter=$(attr+'Meter');if(meter)meter.style.width=(value*10)+'%';
      const text=$(attr+'Value');if(text)text.textContent=value+'/10';
      const btn=root.querySelector(`[data-train="${attr}"]`);
      if(btn)btn.textContent=value>=10?'MAXED':`TRAIN $${trainingCost(attr)}`;
    });
  }

  function bind(){
    $('worldLifeBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    $('battleStart')?.addEventListener('click',startBattle);
    $('showStart')?.addEventListener('click',startShow);
    document.querySelectorAll('[data-life-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.lifeTab)));
    document.querySelectorAll('[data-battle-choice]').forEach(b=>b.addEventListener('click',()=>battleChoice(b.dataset.battleChoice)));
    document.querySelectorAll('[data-show-move]').forEach(b=>b.addEventListener('click',()=>showMove(b.dataset.showMove)));
    document.querySelectorAll('[data-train]').forEach(b=>b.addEventListener('click',()=>train(b.dataset.train)));
    render();
  }

  window.TGGWorldLife={
    getState:()=>JSON.parse(JSON.stringify(state)),
    render,setTab,startBattle,battleChoice,startShow,showMove,callContact,clearOpportunity,train
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();