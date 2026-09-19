(() => {
  const KEY='tgg-story-missions-v1';
  const $=id=>document.getElementById(id);
  const defaultsChapter2=()=>({
    active:false,completed:false,step:0,startedAt:0,completedAt:0,baselines:null,
    flags:{manager:false,kane:false,director:false,visual:false},lastSync:0
  });
  const defaultsChapter3=()=>({
    active:false,completed:false,step:0,startedAt:0,completedAt:0,baselines:null,
    flags:{dj:false,premiere:false,manager:false},lastSync:0
  });
  const defaults=()=>({
    active:false,completed:false,step:0,startedAt:0,completedAt:0,baselines:null,lastSync:0,
    chapter2:defaultsChapter2(),chapter3:defaultsChapter3()
  });
  let state=defaults();

  const firstSteps=[
    {id:'manager',title:'MEET M',detail:'Open the manager opportunity and lock in your first contract.',go:'phone'},
    {id:'job',title:'WORK THE CITY',detail:'Complete one city job for M.',go:'jobs'},
    {id:'studio',title:'LOCK IN',detail:'Record a new track in the studio.',go:'studio'},
    {id:'battle',title:'WIN THE ROOM',detail:'Win one rap battle.',go:'battle'},
    {id:'show',title:'TOUCH THE STAGE',detail:'Complete one live show.',go:'show'},
    {id:'mixtape',title:'DROP THE TAPE',detail:'Release your first mixtape.',go:'career'}
  ];

  const cityBuzzSteps=[
    {id:'manager-return',title:'BACK TO M',detail:'Meet M in the city and get the next move.',kind:'talk',talk:'manager',target:{label:'M — MANAGER',x:72,y:36,radius:6,color:'#ff466d'}},
    {id:'studio-arrival',title:'DRIVE TO STUDIO ROW',detail:'Take the car or walk to Studio Row.',kind:'arrive',target:{label:'STUDIO ROW',x:24,y:37,radius:7,color:'#ff466d'}},
    {id:'kane',title:'TALK TO KANE',detail:'Meet producer Kane outside the studio.',kind:'talk',talk:'kane',target:{label:'KANE — PRODUCER',x:24,y:37,radius:7,color:'#7b86ff'}},
    {id:'record',title:'CUT THE SINGLE',detail:'Enter the studio and record a new track.',kind:'metric',metric:'recordings',go:'studio',target:{label:'RECORDING STUDIO',x:24,y:37,radius:8,color:'#ff466d'}},
    {id:'cypher-arrival',title:'HIT DOWNTOWN',detail:'Get to the Downtown cypher block.',kind:'arrive',target:{label:'DOWNTOWN CYPHER',x:50,y:50,radius:7,color:'#c7ff00'}},
    {id:'battle',title:'TAKE THE CYPHER',detail:'Win a rap battle in Downtown.',kind:'metric',metric:'battleWins',go:'battle',target:{label:'DOWNTOWN CYPHER',x:50,y:50,radius:8,color:'#c7ff00'}},
    {id:'stage-arrival',title:'GET TO MIXTAPE AVE',detail:'Move across the city to the live-stage block.',kind:'arrive',target:{label:'MIXTAPE AVE STAGE',x:76,y:63,radius:7,color:'#48d7ff'}},
    {id:'show',title:'ROCK THE STAGE',detail:'Finish a live show and move the crowd.',kind:'metric',metric:'shows',go:'show',target:{label:'MIXTAPE AVE STAGE',x:76,y:63,radius:8,color:'#48d7ff'}},
    {id:'director',title:'LINK DIRECTOR K',detail:'Meet Director K at Media District.',kind:'talk',talk:'director',target:{label:'DIRECTOR K — MEDIA DISTRICT',x:50,y:89,radius:7,color:'#c56cff'}},
    {id:'visual',title:'SHOOT THE VISUAL',detail:'Enter Media District and shoot your first visual.',kind:'flag',flag:'visual',go:'media',target:{label:'MEDIA DISTRICT',x:50,y:89,radius:8,color:'#c56cff'}}
  ];

  const cityTakeoverSteps=[
    {id:'dj-v',title:'LINK WITH DJ V',detail:'Meet DJ V at Mixtape Ave and lock in the city rotation.',kind:'talk',talk:'dj',target:{label:'DJ V — MIXTAPE AVE',x:76,y:63,radius:7,color:'#48d7ff'}},
    {id:'headline-show',title:'PACK THE VENUE',detail:'Finish a live show while DJ V has the city watching.',kind:'metric',metric:'shows',go:'show',target:{label:'MIXTAPE AVE STAGE',x:76,y:63,radius:8,color:'#48d7ff'}},
    {id:'business-arrival',title:'HANDLE BUSINESS',detail:'Drive across town to the Business District.',kind:'arrive',target:{label:'BUSINESS DISTRICT',x:11,y:50,radius:7,color:'#c7ff00'}},
    {id:'next-release',title:'FEED THE MOMENTUM',detail:'Release another mixtape while the city buzz is hot.',kind:'metric',metric:'mixtapes',go:'career',target:{label:'BUSINESS DISTRICT',x:11,y:50,radius:9,color:'#c7ff00'}},
    {id:'media-return',title:'TAKE IT TO MEDIA',detail:'Get back to Media District for the premiere push.',kind:'arrive',target:{label:'MEDIA DISTRICT',x:50,y:89,radius:7,color:'#c56cff'}},
    {id:'premiere',title:'PREMIERE THE DROP',detail:'Premiere the new release from Media District.',kind:'flag',flag:'premiere',go:'media',target:{label:'MEDIA DISTRICT',x:50,y:89,radius:8,color:'#c56cff'}},
    {id:'home-base',title:'TOUCH HOME BASE',detail:'Head back to your apartment after the city run.',kind:'arrive',target:{label:'MY APARTMENT',x:63,y:24,radius:7,color:'#ffc84a'}},
    {id:'manager-finale',title:'REPORT BACK TO M',detail:'Meet M one more time and close the city takeover run.',kind:'talk',talk:'manager',target:{label:'M — MANAGER',x:72,y:36,radius:6,color:'#ff466d'}}
  ];

  function snapshot(){
    const career=window.TGGCareer?.career||{};
    const life=window.TGGWorldLife?.getState?.()||{};
    const content=window.TGGContent?.state||{};
    const director=window.TGGCareerDirector?.getState?.()||{};
    return {
      jobs:Array.isArray(content.completed)?content.completed.length:0,
      recordings:Number(career.recordings)||0,
      battleWins:Number(life.battleWins)||0,
      shows:Number(life.shows)||0,
      mixtapes:Number(career.mixtapes)||0,
      managerContract:director?.activeContract?.contactId==='manager',
      managerHistory:Array.isArray(director.history)&&director.history.some(x=>x?.title==='MANAGER MOVE')
    };
  }

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
      state.chapter2={...defaultsChapter2(),...(saved.chapter2||{})};
      state.chapter2.flags={...defaultsChapter2().flags,...(saved.chapter2?.flags||{})};
      state.chapter3={...defaultsChapter3(),...(saved.chapter3||{})};
      state.chapter3.flags={...defaultsChapter3().flags,...(saved.chapter3?.flags||{})};
    }catch(e){state=defaults();}
    if(!Number.isInteger(state.step))state.step=0;
    state.step=Math.max(0,Math.min(firstSteps.length,state.step));
    if(!Number.isInteger(state.chapter2.step))state.chapter2.step=0;
    state.chapter2.step=Math.max(0,Math.min(cityBuzzSteps.length,state.chapter2.step));
    if(!Number.isInteger(state.chapter3.step))state.chapter3.step=0;
    state.chapter3.step=Math.max(0,Math.min(cityTakeoverSteps.length,state.chapter3.step));
    return state;
  }

  function save(){
    state.lastSync=Date.now();
    state.chapter2.lastSync=Date.now();
    state.chapter3.lastSync=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function emit(type,chapter,title,detail=''){
    try{window.dispatchEvent(new CustomEvent('tgg-story-event',{detail:{type,chapter,title,detail,at:Date.now()}}));}catch{}
  }
  function notify(text){window.__tggToast?window.__tggToast(text):console.log(text)}
  function gameState(){return window.TGGGame?.getState?.()||{x:50,y:55}}
  function distanceTo(target){
    const g=gameState();
    return Math.hypot((Number(g.x)||50)-target.x,(Number(g.y)||55)-target.y);
  }
  function isNear(target){return !!target&&distanceTo(target)<=Number(target.radius||7)}

  function start(){
    if(state.completed)return state;
    if(!state.active){
      const s=snapshot();
      state.active=true;state.step=0;state.startedAt=Date.now();
      state.baselines={jobs:s.jobs,recordings:s.recordings,battleWins:s.battleWins,shows:s.shows,mixtapes:s.mixtapes};
      save();
      notify('STORY MISSION STARTED — FIRST CONTRACT');
      emit('chapter-start',1,'FIRST CONTRACT','MAKE YOUR FIRST COMPLETE RUN THROUGH THE CITY.');
    }
    render();return state;
  }

  function isFirstStepComplete(index,s=snapshot()){
    const b=state.baselines||{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0};
    if(index===0)return s.managerContract||s.managerHistory;
    if(index===1)return s.jobs>b.jobs;
    if(index===2)return s.recordings>b.recordings;
    if(index===3)return s.battleWins>b.battleWins;
    if(index===4)return s.shows>b.shows;
    if(index===5)return s.mixtapes>b.mixtapes;
    return false;
  }

  function finishFirst(){
    if(state.completed)return;
    state.active=false;state.completed=true;state.step=firstSteps.length;state.completedAt=Date.now();
    save();
    window.TGGGame?.reward?.(1000,250);window.TGGCareer?.addRep?.(100);window.TGGProgression?.sync?.();
    notify('FIRST CONTRACT COMPLETE — +$1000 • +250 XP • +100 REP');
    emit('chapter-complete',1,'FIRST CONTRACT COMPLETE','+$1000 • +250 XP • +100 REP');
    render();
  }

  function syncFirst(){
    if(!state.active||state.completed)return state;
    let advanced=false;
    while(state.step<firstSteps.length&&isFirstStepComplete(state.step)){
      state.step++;advanced=true;
      if(state.step<firstSteps.length){
        notify('STORY ADVANCED — '+firstSteps[state.step].title);
        emit('objective',1,firstSteps[state.step].title,firstSteps[state.step].detail);
      }
    }
    if(state.step>=firstSteps.length)finishFirst(); else if(advanced)save();
    return state;
  }

  function startChapter2(){
    if(!state.completed)return false;
    const c=state.chapter2;if(c.completed)return c;
    if(!c.active){
      const s=snapshot();
      c.active=true;c.step=0;c.startedAt=Date.now();
      c.baselines={recordings:s.recordings,battleWins:s.battleWins,shows:s.shows};
      c.flags={manager:false,kane:false,director:false,visual:false};
      save();notify('CHAPTER 2 STARTED — CITY BUZZ');
      emit('chapter-start',2,'CITY BUZZ','MOVE THROUGH THE CITY FOR REAL.');
      window.TGGGame?.show?.('game');
    }
    render();return c;
  }

  function chapter2Complete(index,s=snapshot()){
    const c=state.chapter2,step=cityBuzzSteps[index];if(!step)return false;
    if(step.kind==='arrive')return isNear(step.target);
    if(step.kind==='talk')return !!c.flags[step.talk];
    if(step.kind==='flag')return !!c.flags[step.flag];
    if(step.kind==='metric')return Number(s[step.metric])>(Number(c.baselines?.[step.metric])||0);
    return false;
  }

  function finishChapter2(){
    const c=state.chapter2;if(c.completed)return;
    c.active=false;c.completed=true;c.step=cityBuzzSteps.length;c.completedAt=Date.now();
    save();
    const visualBonus=Number(window.TGGLifeOS?.careerOutcome?.('visual')?.repBonus)||0;
    const totalRep=175+visualBonus;
    window.TGGGame?.reward?.(1800,450);window.TGGCareer?.addRep?.(totalRep);window.TGGProgression?.sync?.();
    notify('CITY BUZZ COMPLETE — +$1800 • +450 XP • +'+totalRep+' REP');
    emit('chapter-complete',2,'CITY BUZZ COMPLETE','+$1800 • +450 XP • +'+totalRep+' REP');
    render();
  }

  function syncChapter2(){
    const c=state.chapter2;if(!c.active||c.completed)return c;
    let advanced=false,guard=0;
    while(c.step<cityBuzzSteps.length&&chapter2Complete(c.step)&&guard++<cityBuzzSteps.length){
      c.step++;advanced=true;
      if(c.step<cityBuzzSteps.length){
        notify('CITY BUZZ — '+cityBuzzSteps[c.step].title);
        emit('objective',2,cityBuzzSteps[c.step].title,cityBuzzSteps[c.step].detail);
      }
    }
    if(c.step>=cityBuzzSteps.length)finishChapter2(); else if(advanced)save();
    return c;
  }

  function startChapter3(){
    if(!state.chapter2.completed)return false;
    const c=state.chapter3;if(c.completed)return c;
    if(!c.active){
      const s=snapshot();
      c.active=true;c.step=0;c.startedAt=Date.now();
      c.baselines={shows:s.shows,mixtapes:s.mixtapes};
      c.flags={dj:false,premiere:false,manager:false};
      save();notify('CHAPTER 3 STARTED — CITY TAKEOVER');
      emit('chapter-start',3,'CITY TAKEOVER','TURN CITY BUZZ INTO REAL MOMENTUM.');
      window.TGGGame?.show?.('game');
    }
    render();return c;
  }

  function chapter3Complete(index,s=snapshot()){
    const c=state.chapter3,step=cityTakeoverSteps[index];if(!step)return false;
    if(step.kind==='arrive')return isNear(step.target);
    if(step.kind==='talk')return !!c.flags[step.talk];
    if(step.kind==='flag')return !!c.flags[step.flag];
    if(step.kind==='metric')return Number(s[step.metric])>(Number(c.baselines?.[step.metric])||0);
    return false;
  }

  function finishChapter3(){
    const c=state.chapter3;if(c.completed)return;
    c.active=false;c.completed=true;c.step=cityTakeoverSteps.length;c.completedAt=Date.now();
    save();
    window.TGGGame?.reward?.(3500,700);window.TGGCareer?.addRep?.(300);window.TGGProgression?.sync?.();
    notify('CITY TAKEOVER COMPLETE — +$3500 • +700 XP • +300 REP');
    emit('chapter-complete',3,'CITY TAKEOVER COMPLETE','+$3500 • +700 XP • +300 REP');
    render();
  }

  function syncChapter3(){
    const c=state.chapter3;if(!c.active||c.completed)return c;
    let advanced=false,guard=0;
    while(c.step<cityTakeoverSteps.length&&chapter3Complete(c.step)&&guard++<cityTakeoverSteps.length){
      c.step++;advanced=true;
      if(c.step<cityTakeoverSteps.length){
        notify('CITY TAKEOVER — '+cityTakeoverSteps[c.step].title);
        emit('objective',3,cityTakeoverSteps[c.step].title,cityTakeoverSteps[c.step].detail);
      }
    }
    if(c.step>=cityTakeoverSteps.length)finishChapter3(); else if(advanced)save();
    return c;
  }

  function go(target){
    if(target==='phone'){
      window.TGGWorldLife?.setTab?.('phone');window.TGGGame?.show?.('worldLifeBoard');return true;
    }
    if(target==='jobs'){window.TGGGame?.show?.('contentBoard');return true}
    if(target==='studio'){window.TGGGame?.show?.('studio');return true}
    if(target==='battle'||target==='show'){
      window.TGGWorldLife?.setTab?.(target);window.TGGGame?.show?.('worldLifeBoard');return true;
    }
    if(target==='career'){window.TGGGame?.show?.('career');return true}
    if(target==='media'){window.TGGGame?.show?.('media');return true}
    if(target==='home'){window.TGGGame?.show?.('home');return true}
    if(target==='business'){window.TGGGame?.show?.('businessBoard');return true}
    return false;
  }

  function doFirstCurrent(){
    if(!state.active&&!state.completed)start();
    if(state.completed)return false;
    const step=firstSteps[state.step];if(!step)return false;
    if(step.id==='manager'){
      const life=window.TGGWorldLife?.getState?.()||{};
      if(!life.activeOpportunity||life.activeOpportunity.contactId!=='manager')window.TGGWorldLife?.callContact?.('manager');
      window.TGGCareerDirector?.captureOpportunity?.();syncFirst();
      if(!isFirstStepComplete(0))go('phone');return true;
    }
    return go(step.go);
  }

  function talkChapter2(step){
    if(!isNear(step.target)){notify('FOLLOW THE STORY MARKER — '+step.target.label);window.TGGGame?.show?.('game');return false;}
    if(step.talk==='manager'){
      state.chapter2.flags.manager=true;notify('M: THE CITY IS WATCHING. GO LOCK IN WITH KANE.');
    }else if(step.talk==='kane'){
      state.chapter2.flags.kane=true;window.TGGWorldLife?.callContact?.('producer');notify('KANE: CUT SOMETHING THEY CANNOT IGNORE.');
    }else if(step.talk==='director'){
      state.chapter2.flags.director=true;window.TGGWorldLife?.callContact?.('director');notify('DIRECTOR K: BRING THE RECORD TO LIFE.');
    }
    save();syncChapter2();render();return true;
  }

  function talkChapter3(step){
    if(!isNear(step.target)){notify('FOLLOW THE STORY MARKER — '+step.target.label);window.TGGGame?.show?.('game');return false;}
    if(step.talk==='dj'){
      state.chapter3.flags.dj=true;window.TGGWorldLife?.callContact?.('dj');notify('DJ V: THE CITY IS LISTENING. GIVE THEM A SHOW.');
    }else if(step.talk==='manager'){
      state.chapter3.flags.manager=true;window.TGGWorldLife?.callContact?.('manager');notify('M: THAT WAS A CITY RUN. NOW WE BUILD BIGGER.');
    }
    save();syncChapter3();render();return true;
  }

  function doChapterCurrent(c,steps,syncFn,talkFn){
    if(c.completed)return false;
    const step=steps[c.step];if(!step)return false;
    if(step.kind==='arrive'){
      if(isNear(step.target)){syncFn();return true;}
      window.TGGGame?.show?.('game');notify('FOLLOW THE MARKER — '+step.target.label);return true;
    }
    if(step.kind==='talk')return talkFn(step);
    if(step.kind==='metric'||step.kind==='flag'){
      if(step.target&&!isNear(step.target)){
        window.TGGGame?.show?.('game');notify('GET TO '+step.target.label+' FIRST');return true;
      }
      if(step.go)return go(step.go);
    }
    return false;
  }

  function doChapter2Current(){
    if(!state.chapter2.active&&!state.chapter2.completed)return startChapter2();
    return doChapterCurrent(state.chapter2,cityBuzzSteps,syncChapter2,talkChapter2);
  }
  function doChapter3Current(){
    if(!state.chapter3.active&&!state.chapter3.completed)return startChapter3();
    return doChapterCurrent(state.chapter3,cityTakeoverSteps,syncChapter3,talkChapter3);
  }

  function doCurrent(){
    if(state.chapter3.active)return doChapter3Current();
    if(state.chapter2.completed&&!state.chapter3.completed)return startChapter3();
    if(state.chapter2.active)return doChapter2Current();
    if(state.completed&&!state.chapter2.completed)return startChapter2();
    if(state.chapter3.completed)return false;
    return doFirstCurrent();
  }

  function reset(){
    if(state.chapter3.active||state.chapter3.completed){
      state.chapter3=defaultsChapter3();save();render();notify('CITY TAKEOVER RESET');return state.chapter3;
    }
    if(state.chapter2.active||state.chapter2.completed){
      state.chapter2=defaultsChapter2();state.chapter3=defaultsChapter3();save();render();notify('CITY BUZZ RESET');return state.chapter2;
    }
    state=defaults();save();render();notify('FIRST CONTRACT RESET');return state;
  }

  function firstStatus(){
    const current=firstSteps[state.step]||null;
    return {chapter:1,chapterName:'FIRST CONTRACT',...state,current,
      progress:Math.min(100,Math.round((state.step/firstSteps.length)*100)),
      steps:firstSteps.map((x,i)=>({...x,done:i<state.step,active:state.active&&i===state.step}))
    };
  }
  function chapter2Status(){
    const c=state.chapter2,current=cityBuzzSteps[c.step]||null;
    return {chapter:2,chapterName:'CITY BUZZ',...c,current,
      progress:Math.min(100,Math.round((c.step/cityBuzzSteps.length)*100)),
      steps:cityBuzzSteps.map((x,i)=>({...x,done:i<c.step,active:c.active&&i===c.step}))
    };
  }
  function chapter3Status(){
    const c=state.chapter3,current=cityTakeoverSteps[c.step]||null;
    return {chapter:3,chapterName:'CITY TAKEOVER',...c,current,
      progress:Math.min(100,Math.round((c.step/cityTakeoverSteps.length)*100)),
      steps:cityTakeoverSteps.map((x,i)=>({...x,done:i<c.step,active:c.active&&i===c.step}))
    };
  }
  function status(){
    if(state.chapter3.active||state.chapter3.completed)return chapter3Status();
    if(state.chapter2.active||state.chapter2.completed)return chapter2Status();
    return firstStatus();
  }

  function navigationTarget(){
    const st=status();
    if(st.chapter<2||!st.active||st.completed||!st.current?.target)return null;
    const step=st.current;
    return {
      label:st.chapterName+' • '+step.target.label,x:step.target.x,y:step.target.y,
      radius:step.target.radius,color:step.target.color||'#c7ff00',
      arrived:isNear(step.target),step:st.step,id:step.id,chapter:st.chapter,talk:step.talk||''
    };
  }

  function ensureWorldHud(){
    const city=document.querySelector('#game .city');if(!city)return null;
    let root=$('storyWorldHud');
    if(!root){
      root=document.createElement('div');root.id='storyWorldHud';root.className='story-world-hud';
      root.innerHTML='<small id="storyWorldChapter">STORY</small><b id="storyWorldTitle">OBJECTIVE</b><span id="storyWorldDetail">FOLLOW THE MARKER</span><em id="storyWorldDistance"></em><button id="storyWorldAction" type="button">INTERACT</button>';
      city.appendChild(root);$('storyWorldAction')?.addEventListener('click',doCurrent);
    }
    if(!document.getElementById('storyWorldStyles')){
      const style=document.createElement('style');style.id='storyWorldStyles';
      style.textContent=`
        .story-world-hud{position:absolute;left:18px;bottom:18px;z-index:18;width:min(360px,calc(100% - 36px));padding:14px 15px;border:1px solid #c7ff0045;border-radius:16px;background:linear-gradient(145deg,#090d14f2,#05070bf2);box-shadow:0 18px 44px #0009,inset 0 1px #ffffff10;display:none;gap:4px;backdrop-filter:blur(12px)}
        .story-world-hud.active{display:grid}.story-world-hud small{font-size:8px;letter-spacing:.17em;color:#c7ff00}.story-world-hud b{font-size:16px}.story-world-hud span{font-size:10px;line-height:1.35;color:#aeb6c5}.story-world-hud em{font-style:normal;font-weight:900;font-size:9px;color:#fff}.story-world-hud button{margin-top:7px;min-height:42px;border-color:#c7ff0060;background:#c7ff00;color:#050607;font-weight:950}
        @media(max-width:760px){.story-world-hud{left:10px;bottom:10px;width:min(310px,calc(100% - 20px));padding:11px 12px}.story-world-hud b{font-size:14px}.story-world-hud button{min-height:46px}}
      `;document.head.appendChild(style);
    }
    return root;
  }

  function renderWorldHud(){
    const root=ensureWorldHud();if(!root)return;
    const st=status(),step=st.current;
    const visible=st.chapter>=2&&st.active&&!st.completed&&!!step&&window.TGGGame?.getActiveScreen?.()==='game';
    root.classList.toggle('active',visible);if(!visible)return;
    const near=step.target?isNear(step.target):false;
    $('storyWorldChapter') && ($('storyWorldChapter').textContent='CHAPTER '+st.chapter+' • '+(st.step+1)+'/'+st.steps.length+' • '+st.chapterName);
    $('storyWorldTitle') && ($('storyWorldTitle').textContent=step.title);
    $('storyWorldDetail') && ($('storyWorldDetail').textContent=step.detail);
    $('storyWorldDistance') && ($('storyWorldDistance').textContent=step.target?(near?'AT OBJECTIVE':Math.round(distanceTo(step.target)*3.2)+' m TO '+step.target.label):'OBJECTIVE ACTIVE');
    const button=$('storyWorldAction');
    if(button){
      const action=step.kind==='talk'?'TALK':step.go==='studio'?'ENTER STUDIO':step.go==='battle'?'START CYPHER':step.go==='show'?'START SHOW':step.go==='media'?'ENTER MEDIA':step.go==='career'?'OPEN CAREER':'INTERACT';
      button.textContent=near?action:'FOLLOW MARKER';
    }
  }

  function render(){
    const root=$('storyMissionsBoard');if(!root){renderWorldHud();return;}
    const st=status(),title=$('storyMissionTitle'),detail=$('storyMissionDetail'),progress=$('storyMissionProgress'),label=$('storyMissionProgressLabel'),list=$('storyMissionSteps'),action=$('storyMissionAction');
    const chapterHeading=$('storyMissionChapterHeading'),chapterCopy=$('storyMissionChapterCopy');
    const firstComplete=state.completed&&!state.chapter2.active&&!state.chapter2.completed;
    const chapter2CompleteReady=state.chapter2.completed&&!state.chapter3.active&&!state.chapter3.completed;

    if(chapterHeading)chapterHeading.textContent=st.chapter===3?'CITY TAKEOVER.':st.chapter===2?'CITY BUZZ.':'FIRST CONTRACT.';
    if(chapterCopy)chapterCopy.textContent=st.chapter===3
      ?'Turn your buzz into citywide momentum — DJ V, live stage, business, a new release, premiere and the final manager check-in.'
      :st.chapter===2?'Move through the city for real — manager, producer, cypher, stage, media district and your first visual.'
      :'One connected artist run through the city — manager, street work, studio, battle, stage and release.';

    if(title)title.textContent=st.completed?st.chapterName+' COMPLETE':(st.current?.title||st.chapterName);
    if(detail)detail.textContent=st.completed
      ?(st.chapter===3?'You turned local momentum into a full city takeover.':st.chapter===2?'Your name is moving through every side of the city.':'You built your first complete artist run through the city.')
      :st.active?(st.current?.detail||'Keep moving.'):'Start the connected career storyline.';
    if(progress)progress.style.width=st.progress+'%';
    if(label)label.textContent=st.completed?'100% COMPLETE':st.progress+'% COMPLETE';
    if(list)list.innerHTML=st.steps.map((x,i)=>'<article class="story-step '+(x.done?'done ':'')+(x.active?'active':'')+'"><span>'+(x.done?'✓':String(i+1).padStart(2,'0'))+'</span><div><b>'+x.title+'</b><small>'+x.detail+'</small></div></article>').join('');

    if(action){
      if(firstComplete){action.textContent='START CHAPTER 2 — CITY BUZZ';action.disabled=false;}
      else if(chapter2CompleteReady){action.textContent='START CHAPTER 3 — CITY TAKEOVER';action.disabled=false;}
      else if(state.chapter3.completed){action.textContent='STORY ARC COMPLETE';action.disabled=true;}
      else{action.textContent=st.active?'GO TO '+(st.current?.title||'NEXT STEP'):'START '+st.chapterName;action.disabled=false;}
    }
    const resetBtn=$('storyMissionReset');
    if(resetBtn){
      resetBtn.classList.toggle('hidden',!st.active&&!st.completed);
      resetBtn.textContent=st.chapter===3?'RESET CITY TAKEOVER':st.chapter===2?'RESET CITY BUZZ':'RESET STORY';
    }
    renderWorldHud();
  }

  function sync(){
    syncFirst();syncChapter2();syncChapter3();render();return state;
  }

  function bind(){
    ensureWorldHud();
    $('storyMissionsBtn')?.addEventListener('click',()=>{window.TGGGame?.show?.('storyMissionsBoard');sync();});
    $('storyMissionBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    $('storyMissionAction')?.addEventListener('click',doCurrent);
    $('storyMissionReset')?.addEventListener('click',reset);

    document.querySelector('[data-media="video"]')?.addEventListener('click',()=>{
      const c=state.chapter2,step=cityBuzzSteps[c.step];
      if(c.active&&step?.id==='visual'&&isNear(step.target)){c.flags.visual=true;save();syncChapter2();render();}
    });
    document.querySelector('[data-media="premiere"]')?.addEventListener('click',()=>{
      const c=state.chapter3,step=cityTakeoverSteps[c.step];
      if(c.active&&step?.id==='premiere'&&isNear(step.target)){c.flags.premiere=true;save();syncChapter3();render();}
    });

    setInterval(sync,700);render();
  }

  window.TGGStoryMissions={
    start,startChapter2,startChapter3,sync,go,doCurrent,reset,status,render,snapshot,navigationTarget,
    chapters:{
      firstContract:firstSteps.map(x=>({...x})),
      cityBuzz:cityBuzzSteps.map(x=>({...x})),
      cityTakeover:cityTakeoverSteps.map(x=>({...x}))
    }
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();