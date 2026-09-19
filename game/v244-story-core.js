(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const STORIES={
    'city-buzz':{
      id:'city-buzz',title:'CITY BUZZ',rewardCash:1800,rewardXp:450,rewardRep:175,
      steps:[
        {id:'manager-talk',title:'BACK TO M',detail:'Meet M in the city and get the next move.',kind:'talk',contact:'manager',target:{x:72,y:36,radius:6,label:'M — MANAGER',color:'#ff466d'}},
        {id:'studio-arrival',title:'DRIVE TO STUDIO ROW',detail:'Take the car or walk to Studio Row.',kind:'arrive',target:{x:24,y:37,radius:7,label:'STUDIO ROW',color:'#ff466d'}},
        {id:'kane-talk',title:'TALK TO KANE',detail:'Meet producer Kane outside the studio.',kind:'talk',contact:'kane',target:{x:24,y:37,radius:7,label:'KANE — PRODUCER',color:'#7b86ff'}},
        {id:'record',title:'CUT THE SINGLE',detail:'Enter the studio and record a track.',kind:'action',action:'record',target:{x:24,y:37,radius:8,label:'RECORDING STUDIO',color:'#ff466d'}},
        {id:'cypher-arrival',title:'HIT DOWNTOWN',detail:'Get to the Downtown cypher block.',kind:'arrive',target:{x:50,y:50,radius:7,label:'DOWNTOWN CYPHER',color:'#c7ff00'}},
        {id:'battle',title:'TAKE THE CYPHER',detail:'Win a rap battle in Downtown.',kind:'event',event:'tgg:rap-battle-complete',target:{x:50,y:50,radius:8,label:'DOWNTOWN CYPHER',color:'#c7ff00'}},
        {id:'stage-arrival',title:'GET TO MIXTAPE AVE',detail:'Move across the city to the live-stage block.',kind:'arrive',target:{x:76,y:63,radius:7,label:'MIXTAPE AVE STAGE',color:'#48d7ff'}},
        {id:'concert',title:'ROCK THE STAGE',detail:'Finish a live show and move the crowd.',kind:'event',event:'tgg:concert-complete',target:{x:76,y:63,radius:8,label:'MIXTAPE AVE STAGE',color:'#48d7ff'}},
        {id:'director-talk',title:'LINK DIRECTOR K',detail:'Meet Director K at Media District.',kind:'talk',contact:'director',target:{x:50,y:89,radius:7,label:'DIRECTOR K — MEDIA DISTRICT',color:'#c56cff'}},
        {id:'video',title:'SHOOT THE VISUAL',detail:'Enter Media District and shoot your first visual.',kind:'action',action:'video',target:{x:50,y:89,radius:8,label:'MEDIA DISTRICT',color:'#c56cff'}}
      ]
    }
  };
  function normalizeTarget(t){
    if(!t)return null;
    return {
      x:clamp(t.x,0,100),y:clamp(t.y,0,100),radius:clamp(t.radius||7,2,20),
      label:String(t.label||'STORY OBJECTIVE'),color:String(t.color||'#c7ff00')
    };
  }
  function normalizeStep(s={}){return {...s,id:String(s.id||'step'),title:String(s.title||'OBJECTIVE'),detail:String(s.detail||''),kind:String(s.kind||'arrive'),target:normalizeTarget(s.target)}}
  function story(id='city-buzz'){
    const s=STORIES[id]||STORIES['city-buzz'];
    return {...s,steps:s.steps.map(normalizeStep)};
  }
  function step(id='city-buzz',index=0){const s=story(id);return s.steps[Math.max(0,Math.min(s.steps.length-1,Number(index)||0))]||null}
  function progress(id='city-buzz',index=0){const s=story(id);return Math.round(clamp(index,0,s.steps.length)/Math.max(1,s.steps.length)*100)}
  function toWorld(target){return target?{x:(target.x-50)*.92,z:(target.y-50)*.92}:null}
  const api={story,step,progress,toWorld,stories:Object.keys(STORIES)};
  globalThis.TGGV244Core=api;if(typeof window!=='undefined')window.TGGV244Core=api;
})();