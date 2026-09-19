(()=>{
  const contacts=['manager','kane','director'];
  const definitions={
    manager:{
      name:'M',role:'MANAGER',
      context:()=> 'M wants to know how you plan to move through the city.',
      choices:[
        {id:'smart',label:'PLAY IT SMART',detail:'Move calculated. Build leverage before chasing noise.',identity:{career:'CALCULATED'}},
        {id:'bold',label:'GO BIG NOW',detail:'Push the city hard and force attention.',identity:{career:'FEARLESS'}},
        {id:'loyal',label:'BUILD THE TEAM',detail:'Keep the circle tight and grow together.',identity:{career:'LOYAL'}}
      ]
    },
    kane:{
      name:'KANE',role:'PRODUCER',
      context:s=>s?.choices?.manager==='smart'?'M says you have a precise plan. Kane wants the sound to match that calculated move.':'Kane wants to know what kind of record defines you.',
      choices:[
        {id:'melodic',label:'MELODIC',detail:'Emotion, hooks and atmosphere.',identity:{sound:'MELODIC'}},
        {id:'street',label:'STREET',detail:'Hard drums, direct bars and raw energy.',identity:{sound:'STREET'}},
        {id:'experimental',label:'EXPERIMENTAL',detail:'New textures and unexpected structure.',identity:{sound:'EXPERIMENTAL'}}
      ]
    },
    director:{
      name:'DIRECTOR K',role:'DIRECTOR',
      context:s=>s?.choices?.kane==='melodic'?'Kane says you made a big record with emotion. Director K wants the visual to scale that feeling.':'Director K wants to know what the camera should say about you.',
      choices:[
        {id:'story',label:'TELL A STORY',detail:'Cinematic scenes with a real beginning, turn and payoff.',identity:{visual:'STORY'}},
        {id:'performance',label:'PERFORMANCE',detail:'Make the energy and presence the whole visual.',identity:{visual:'PERFORMANCE'}},
        {id:'luxury',label:'LIFESTYLE',detail:'Show the world, style and success around the record.',identity:{visual:'LIFESTYLE'}}
      ]
    }
  };
  const api={
    version:'V2.45 TGG DIALOGUE + CHOICE FORGE 100',
    layers:100,
    contacts,
    definition:id=>definitions[id]||null,
    choices:id=>(definitions[id]?.choices||[]).map(x=>({...x,identity:{...x.identity}})),
    context:(id,state)=>definitions[id]?.context?.(state)||''
  };
  globalThis.TGGV245Core=api;if(typeof window!=='undefined')window.TGGV245Core=api;
})();