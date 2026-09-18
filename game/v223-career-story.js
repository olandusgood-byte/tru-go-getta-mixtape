(() => {
  const VERSION='V2.23 CAREER STORY + PHONE 100';
  const KEY='tgg-v223-career-story';
  const LAYERS=[
    'six chapter career arc','chapter one first move','chapter two studio pressure','chapter three city buzz','chapter four prove it live','chapter five show night','chapter six headliner','chapter order guard','chapter unlock guard','chapter completion guard',
    'chapter reward guard','chapter claim persistence','chapter state persistence','chapter reload recovery','chapter objective text','chapter caller mapping','chapter reward text','chapter progress API','chapter active API','chapter completed API',
    'phone button','phone panel','phone close','phone caller','phone role','phone message','phone objective','phone reward','phone track goal','phone history',
    'phone unread badge','phone unread count','phone call persistence','phone call dedupe','phone call timestamp','phone chapter call','phone manual reopen','phone keyboard shortcut','phone accessibility live','phone mobile layout',
    'M story calls','Kane story calls','DJ V story calls','manager finale call','producer studio call','DJ city buzz call','battle call','concert call','headliner call','relationship dialogue bridge',
    'mission completion listener','rap battle listener','concert listener','world event listener','career rep listener','career level polling','mission polling','battle polling','concert polling','event polling',
    'first move completion','studio session completion','mixtape promo completion','rap battle win completion','concert win completion','headliner completion','virtual cash reward','XP reward','career REP reward','reward toast',
    'one-time chapter reward','chapter reward history','career milestone history','career milestone cap','career summary HUD','career chapter badge','career chapter progress','career goal hint','career status color','career headline',
    'track flyer mission','track studio mission','track promo mission','track street cypher','track live venue','track career level','contact focus bridge','game screen bridge','career screen bridge','event board bridge',
    'ringtone cue','ringtone audio guard','ringtone mute-safe','new chapter pulse','chapter complete pulse','phone open pulse','reduced motion safety','rollback isolation','status API','release QA hooks'
  ];

  const CHAPTERS=[
    {id:'first-move',n:1,title:'FIRST MOVE',caller:'M',role:'Manager',message:'Start small and move clean. Prove you can finish a street job before anybody puts more behind you.',objective:'Complete Flyer Run.',reward:{cash:100,xp:25,rep:10},check:()=>done('flyer-run'),track:()=>trackMission('flyer-run')},
    {id:'studio-pressure',n:2,title:'STUDIO PRESSURE',caller:'Kane',role:'Producer',message:'The city heard your name. Now prove you can turn movement into a record that sounds ready.',objective:'Complete Studio Session.',reward:{cash:150,xp:35,rep:15},check:()=>done('studio-session'),track:()=>trackMission('studio-session')},
    {id:'city-buzz',n:3,title:'CITY BUZZ',caller:'DJ V',role:'DJ',message:'A record does not move itself. Take it through the city and make people remember the name.',objective:'Complete Mixtape Promo.',reward:{cash:200,xp:45,rep:20},check:()=>done('mixtape-promo'),track:()=>trackMission('mixtape-promo')},
    {id:'prove-it-live',n:4,title:'PROVE IT LIVE',caller:'M',role:'Manager',message:'Studio work is one thing. Now step in the cypher and show the city you can perform under pressure.',objective:'Win one Street Cypher rap battle.',reward:{cash:250,xp:55,rep:25},check:()=>Number(window.TGGV221?.status?.()?.wins||0)>=1,track:()=>trackBattle()},
    {id:'show-night',n:5,title:'SHOW NIGHT',caller:'DJ V',role:'DJ',message:'You earned a crowd. Now hold one. Finish a full show and leave with the room still talking.',objective:'Complete one live concert.',reward:{cash:350,xp:75,rep:35},check:()=>Number(window.TGGV222?.status?.()?.wins||0)>=1,track:()=>trackConcert()},
    {id:'headliner',n:6,title:'HEADLINER',caller:'M',role:'Manager',message:'You moved the streets, built records, survived the stage, and kept the city with you. This is the first real level-up.',objective:'Reach Studio Level 2 and complete 3 city-event runs.',reward:{cash:500,xp:100,rep:50},check:()=>careerLevel()>=2&&eventRuns()>=3,track:()=>trackHeadliner()}
  ];

  const state={claimed:[],heard:[],history:[],activeId:'first-move',unread:0,lastCheck:0,lastOpenAt:0,muted:false};
  let panel=null,phoneBtn=null,badge=null,live=null,lastRendered='';

  function done(id){return Array.isArray(window.TGGContent?.state?.completed)&&window.TGGContent.state.completed.includes(id)}
  function careerLevel(){return Math.max(1,Number(window.TGGCareer?.career?.studioLevel)||1)}
  function eventRuns(){return Math.max(0,Number(window.TGGEvents?.cityProfile?.()?.totalRuns)||0)}
  function gameState(){return window.TGGGame?.getState?.()||{}}
  function currentIndex(){
    for(let i=0;i<CHAPTERS.length;i++)if(!CHAPTERS[i].check())return i;
    return CHAPTERS.length-1;
  }
  function activeChapter(){return CHAPTERS[currentIndex()]||CHAPTERS[CHAPTERS.length-1]}
  function isComplete(c){try{return !!c?.check?.()}catch{return false}}
  function rewardText(r){return '$'+r.cash+' • +'+r.xp+' XP • +'+r.rep+' REP'}

  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.claimed=Array.isArray(s.claimed)?s.claimed:[];
      state.heard=Array.isArray(s.heard)?s.heard:[];
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
      state.activeId=typeof s.activeId==='string'?s.activeId:'first-move';
      state.muted=!!s.muted;
    }catch{}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({claimed:state.claimed,heard:state.heard,history:state.history.slice(-20),activeId:state.activeId,muted:state.muted}))}catch{}
  }

  function ring(){
    if(state.muted)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      const c=new AC();[0,.16].forEach((d,i)=>{
        const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=i?780:620;
        g.gain.setValueAtTime(.025,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.12);
        o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.13);
      });
      setTimeout(()=>c.close?.(),500);
    }catch{}
  }

  function install(){
    document.body.classList.add('tgg-v223');
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.23 CAREER STORY + PHONE 100';
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v223PhoneBtn')){
      phoneBtn=document.createElement('button');phoneBtn.id='v223PhoneBtn';phoneBtn.className='v223-phone-btn';phoneBtn.type='button';phoneBtn.innerHTML='PHONE <i id="v223Unread">0</i>';
      phoneBtn.setAttribute('aria-label','Open career phone');phoneBtn.addEventListener('click',()=>openPhone());top.appendChild(phoneBtn);
    }else phoneBtn=document.getElementById('v223PhoneBtn');

    if(!document.getElementById('v223PhonePanel')){
      panel=document.createElement('aside');panel.id='v223PhonePanel';panel.className='v223-phone-panel';panel.setAttribute('aria-label','Career phone');
      panel.innerHTML='<div class="v223-phone-head"><div><small>TRU GO GETTA PHONE</small><b id="v223Chapter">CHAPTER 1</b></div><button id="v223Close" type="button">×</button></div><div class="v223-caller"><span id="v223Avatar">M</span><div><b id="v223Caller">M</b><small id="v223Role">MANAGER</small></div></div><p id="v223Message"></p><div class="v223-objective"><small>CAREER GOAL</small><b id="v223Objective"></b><span id="v223Reward"></span></div><div class="v223-actions"><button id="v223Track" type="button">TRACK GOAL</button><button id="v223Mute" type="button">CALL SOUND: ON</button></div><div class="v223-history"><small>CAREER HISTORY</small><div id="v223History"></div></div>';
      document.body.appendChild(panel);
      document.getElementById('v223Close')?.addEventListener('click',closePhone);
      document.getElementById('v223Track')?.addEventListener('click',()=>activeChapter()?.track?.());
      document.getElementById('v223Mute')?.addEventListener('click',toggleMute);
    }else panel=document.getElementById('v223PhonePanel');

    const city=document.querySelector('.city');
    if(city&&!document.getElementById('v223CareerHud')){
      const hud=document.createElement('div');hud.id='v223CareerHud';hud.className='v223-career-hud';
      hud.innerHTML='<small>CAREER STORY</small><b id="v223HudChapter">CHAPTER 1</b><span id="v223HudGoal">FIRST MOVE</span>';
      city.appendChild(hud);
    }

    if(!document.getElementById('v223Live')){
      live=document.createElement('div');live.id='v223Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }else live=document.getElementById('v223Live');
  }

  function claim(c){
    if(!c||state.claimed.includes(c.id)||!isComplete(c))return false;
    state.claimed.push(c.id);
    state.history.push({id:c.id,title:c.title,at:Date.now(),reward:{...c.reward}});
    state.history=state.history.slice(-20);
    window.TGGGame?.reward?.(c.reward.cash,c.reward.xp);
    window.TGGCareer?.addRep?.(c.reward.rep);
    window.dispatchEvent(new CustomEvent('tgg:career-chapter-complete',{detail:{id:c.id,title:c.title,reward:{...c.reward}}}));
    window.__tggToast?.('CAREER CHAPTER COMPLETE — '+c.title+' • '+rewardText(c.reward));
    document.body.classList.add('v223-chapter-complete');setTimeout(()=>document.body.classList.remove('v223-chapter-complete'),700);
    save();return true;
  }

  function sync(){
    install();
    for(const c of CHAPTERS){
      if(!isComplete(c))break;
      claim(c);
    }
    const next=activeChapter();
    const changed=state.activeId!==next.id;
    state.activeId=next.id;
    if(changed&&!state.heard.includes(next.id)){
      state.unread=1;ring();
      document.body.classList.add('v223-new-call');setTimeout(()=>document.body.classList.remove('v223-new-call'),900);
      setTimeout(()=>openPhone(true),350);
    }
    render();
    save();
    return next;
  }

  function render(){
    install();
    const c=activeChapter(),complete=isComplete(c);
    const idx=CHAPTERS.indexOf(c);
    const chapter='CHAPTER '+c.n+' / '+CHAPTERS.length+' • '+c.title;
    const q=id=>document.getElementById(id);
    q('v223Chapter')&&(q('v223Chapter').textContent=chapter);
    q('v223Caller')&&(q('v223Caller').textContent=c.caller);
    q('v223Role')&&(q('v223Role').textContent=c.role.toUpperCase());
    q('v223Avatar')&&(q('v223Avatar').textContent=c.caller==='Kane'?'K':c.caller==='DJ V'?'V':'M');
    q('v223Message')&&(q('v223Message').textContent=c.message);
    q('v223Objective')&&(q('v223Objective').textContent=c.objective);
    q('v223Reward')&&(q('v223Reward').textContent='REWARD • '+rewardText(c.reward));
    q('v223Track')&&(q('v223Track').textContent=complete?'GOAL COMPLETE':'TRACK GOAL');
    q('v223HudChapter')&&(q('v223HudChapter').textContent='CHAPTER '+c.n+' / '+CHAPTERS.length);
    q('v223HudGoal')&&(q('v223HudGoal').textContent=c.title+' • '+c.objective);
    q('v223Unread')&&(q('v223Unread').textContent=String(state.unread));
    q('v223Mute')&&(q('v223Mute').textContent='CALL SOUND: '+(state.muted?'OFF':'ON'));
    const hist=q('v223History');
    if(hist)hist.innerHTML=state.history.length?state.history.slice().reverse().map(h=>'<span><b>'+h.title+'</b><small>'+new Date(h.at).toLocaleDateString()+' • '+rewardText(h.reward)+'</small></span>').join(''):'<em>No chapters completed yet.</em>';
    document.body.dataset.careerChapter=String(c.n);
  }

  function openPhone(auto=false){
    install();
    const c=activeChapter();
    panel?.classList.add('active');state.lastOpenAt=Date.now();state.unread=0;
    if(!state.heard.includes(c.id))state.heard.push(c.id);
    if(auto&&live)live.textContent='Incoming career call from '+c.caller+'. '+c.objective;
    save();render();
  }
  function closePhone(){panel?.classList.remove('active')}
  function toggleMute(){state.muted=!state.muted;save();render()}

  function focusMission(id){
    const c=window.TGGStreetContacts?.contactForMission?.(id);
    if(c){window.TGGStreetContacts?.focusMission?.(id);window.TGGGame?.show?.('game');closePhone();window.__tggToast?.('CAREER NAV — GO SEE '+c.name);return true}
    return false;
  }
  function trackMission(id){
    if(done(id)){window.__tggToast?.('GOAL ALREADY COMPLETE');return true}
    const active=window.TGGContent?.current?.();
    if(active&&active.id===id){window.TGGGame?.show?.('game');closePhone();window.__tggToast?.('FOLLOW THE LIVE OBJECTIVE');return true}
    if(active){window.__tggToast?.('FINISH YOUR ACTIVE JOB FIRST');return false}
    return focusMission(id);
  }
  function trackBattle(){window.TGGGame?.show?.('game');closePhone();window.__tggToast?.('CAREER NAV — FIND THE STREET CYPHER LIVE EVENT');return true}
  function trackConcert(){window.TGGGame?.show?.('game');closePhone();window.__tggToast?.('CAREER NAV — GO TO SHOW NIGHT IN THE PARK DISTRICT');return true}
  function trackHeadliner(){window.TGGGame?.show?.('career');closePhone();window.__tggToast?.('HEADLINER GOAL — STUDIO LVL 2 + 3 CITY EVENT RUNS');return true}

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='p'||e.key==='P'){e.preventDefault();panel?.classList.contains('active')?closePhone():openPhone()}
    if(e.key==='Escape'&&panel?.classList.contains('active'))closePhone();
  }
  document.addEventListener('keydown',keyHandler);

  ['tgg:mission-complete','tgg:rap-battle-complete','tgg:concert-complete','tgg:world-event-complete'].forEach(type=>window.addEventListener(type,()=>setTimeout(sync,120)));

  function tick(ts=performance.now()){
    requestAnimationFrame(tick);
    if(ts-state.lastCheck>900){state.lastCheck=ts;sync()}
    state.ready=true;
    const version=document.querySelector('.v201-badge');if(version)version.textContent='V2.23 CAREER STORY + PHONE 100';
  }

  function status(){
    const c=activeChapter();
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,chapter:c.n,chapterId:c.id,title:c.title,
      objective:c.objective,complete:isComplete(c),completedChapters:state.claimed.length,totalChapters:CHAPTERS.length,
      unread:state.unread,historyCount:state.history.length,careerLevel:careerLevel(),eventRuns:eventRuns(),
      battleWins:Number(window.TGGV221?.status?.()?.wins||0),concertWins:Number(window.TGGV222?.status?.()?.wins||0)
    };
  }

  load();install();
  window.TGGV223={version:VERSION,layers:LAYERS,chapters:CHAPTERS,status,sync,openPhone,closePhone,activeChapter,trackMission};
  requestAnimationFrame(tick);
})();