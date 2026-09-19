(() => {
  const VERSION='V2.45 TGG DIALOGUE + CHOICE FORGE 100';
  const CONTACTS={
    manager:{
      id:'manager',name:'M',role:'MANAGER',accent:'#ff466d',
      prompt:'The city got eyes on us now. How you want to move?',
      context:{
        default:'M sizes up the next move and waits on your call.'
      },
      choices:[
        {id:'noise',label:'MAKE NOISE',detail:'Push hard, take the risk, make the city talk.',relationship:8,tags:['ambition','bold'],camera:'chase',audio:'street',tone:'BOLD'},
        {id:'smart',label:'PLAY IT SMART',detail:'Move calculated, stack wins, keep leverage.',relationship:10,tags:['strategy','focus'],camera:'orbit',audio:'cinematic',tone:'CALCULATED'},
        {id:'team',label:'BRING THE TEAM',detail:'Keep the crew close and build together.',relationship:9,tags:['loyalty','crew'],camera:'orbit',audio:'club',tone:'LOYAL'}
      ]
    },
    kane:{
      id:'kane',name:'KANE',role:'PRODUCER',accent:'#7b86ff',
      prompt:'We can make this record hit three different ways. What are you hearing?',
      context:{
        noise:'M said you came to shake the block. I got something dirty for that.',
        smart:'M said you move with a plan. We can make something precise.',
        team:'M said your people move with you. Let’s make a record everybody can own.',
        default:'Kane leans over the console and waits for your direction.'
      },
      choices:[
        {id:'street',label:'RAW STREET',detail:'Hard drums, pressure, no polish hiding the edges.',relationship:9,tags:['street','grit'],camera:'chase',audio:'street',tone:'STREET'},
        {id:'melodic',label:'BIG MELODY',detail:'Hooks, emotion and a record built for a crowd.',relationship:10,tags:['melody','stage'],camera:'orbit',audio:'club',tone:'MELODIC'},
        {id:'leftfield',label:'GO LEFT FIELD',detail:'Make something nobody in the city expects.',relationship:8,tags:['experimental','risk'],camera:'top',audio:'cinematic',tone:'EXPERIMENTAL'}
      ]
    },
    director:{
      id:'director',name:'DIRECTOR K',role:'MEDIA',accent:'#c56cff',
      prompt:'The song is moving. What should people see when the screen comes on?',
      context:{
        street:'Kane kept it raw. Director K wants the visual to feel just as immediate.',
        melodic:'Kane gave you a big record. Director K wants scale and emotion.',
        leftfield:'Kane went strange with it. Director K is ready to break the rules too.',
        default:'Director K frames the first shot and hands you the creative call.'
      },
      choices:[
        {id:'performance',label:'PERFORMANCE',detail:'Energy, crowd, movement and star presence.',relationship:9,tags:['performance','presence'],camera:'chase',audio:'club',tone:'PERFORMANCE'},
        {id:'story',label:'TELL A STORY',detail:'Characters, scenes and a real narrative arc.',relationship:10,tags:['narrative','cinematic'],camera:'orbit',audio:'cinematic',tone:'STORY'},
        {id:'luxury',label:'LUXURY WORLD',detail:'Cars, fashion, locations and premium flex.',relationship:8,tags:['luxury','image'],camera:'top',audio:'cinematic',tone:'LUXURY'}
      ]
    }
  };

  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function contact(id){const x=CONTACTS[id];return x?JSON.parse(JSON.stringify(x)):null}
  function choice(contactId,choiceId){
    const c=CONTACTS[contactId];if(!c)return null;
    const x=c.choices.find(v=>v.id===choiceId);return x?JSON.parse(JSON.stringify(x)):null;
  }
  function relationship(contactId,choices={}){
    const selected=choices?.[contactId];const x=choice(contactId,selected);
    return clamp(50+(x?.relationship||0));
  }
  function relationshipLevel(score=50){
    const n=clamp(score);
    return n>=85?'INNER CIRCLE':n>=68?'LOCKED IN':n>=52?'SOLID':n>=35?'WORKING':'COLD';
  }
  function tags(choices={}){
    const out=[];
    Object.entries(choices||{}).forEach(([contactId,choiceId])=>{
      const x=choice(contactId,choiceId);(x?.tags||[]).forEach(t=>{if(!out.includes(t))out.push(t)});
    });
    return out;
  }
  function identity(choices={}){
    const m=choice('manager',choices.manager)?.tone||'UNDEFINED';
    const k=choice('kane',choices.kane)?.tone||'UNDEFINED';
    const d=choice('director',choices.director)?.tone||'UNDEFINED';
    return {career:m,sound:k,visual:d,label:[m,k,d].filter(x=>x!=='UNDEFINED').join(' • ')||'FIND YOUR LANE'};
  }
  function context(contactId,choices={}){
    const c=CONTACTS[contactId];if(!c)return '';
    if(contactId==='kane')return c.context?.[choices.manager]||c.context.default;
    if(contactId==='director')return c.context?.[choices.kane]||c.context.default;
    return c.context.default;
  }
  const api={version:VERSION,contacts:Object.keys(CONTACTS),contact,choice,relationship,relationshipLevel,tags,identity,context};
  globalThis.TGGV245Core=api;
  if(typeof window!=='undefined')window.TGGV245Core=api;
})();