(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const CUES={
    'mission-intro':[
      {id:'establish',ms:1600,mood:'night',weather:'clear',camera:'cinematic',animation:'talk',audioProfile:'cinematic',audio:'mission-start',effect:'mission',pulse:['mission',.34,520]},
      {id:'focus',ms:2200,mood:'night',weather:'mist',camera:'action',animation:'walk',audioProfile:'street',audio:'checkpoint',effect:'mission',pulse:['checkpoint',.25,380]}
    ],
    concert:[
      {id:'lights-up',ms:1700,mood:'club',weather:'clear',camera:'cinematic',animation:'perform',audioProfile:'club',audio:'concert',effect:'boost',stage:'concert',crowd:1,pulse:['concert',.48,720]},
      {id:'crowd-hit',ms:2200,mood:'club',weather:'clear',camera:'action',animation:'perform',audioProfile:'club',audio:'concert',effect:'mission',stage:'concert',crowd:1,pulse:['concert',.58,620]},
      {id:'hero-shot',ms:2100,mood:'golden',weather:'clear',camera:'cinematic',animation:'perform',audioProfile:'cinematic',audio:'confirm',effect:'repair',stage:'concert',crowd:.9,pulse:['concert',.3,500]}
    ],
    battle:[
      {id:'face-off',ms:1500,mood:'night',weather:'mist',camera:'cinematic',animation:'rap',audioProfile:'street',audio:'rival',effect:'mission',stage:'battle',crowd:.82,pulse:['rap',.42,520]},
      {id:'bars',ms:2100,mood:'club',weather:'clear',camera:'action',animation:'rap',audioProfile:'club',audio:'rap',effect:'impact',stage:'battle',crowd:.96,pulse:['rap',.56,420]},
      {id:'reaction',ms:1600,mood:'golden',weather:'clear',camera:'cinematic',animation:'perform',audioProfile:'street',audio:'confirm',effect:'mission',stage:'battle',crowd:1,pulse:['rap',.36,460]}
    ],
    club:[
      {id:'club-open',ms:1800,mood:'club',weather:'clear',camera:'cinematic',animation:'perform',audioProfile:'club',audio:'concert',effect:'boost',stage:'club',crowd:.78,pulse:['concert',.36,560]},
      {id:'floor-energy',ms:2400,mood:'club',weather:'clear',camera:'action',animation:'perform',audioProfile:'club',audio:'concert',effect:'mission',stage:'club',crowd:.9,pulse:['concert',.44,520]}
    ],
    showcase:[
      {id:'showcase-open',ms:1800,mood:'studio',weather:'clear',camera:'cinematic',animation:'perform',audioProfile:'studio',audio:'mission-start',effect:'mission',stage:'showcase',crowd:.68,pulse:['mission',.3,480]},
      {id:'performance',ms:2200,mood:'golden',weather:'clear',camera:'action',animation:'perform',audioProfile:'cinematic',audio:'concert',effect:'boost',stage:'showcase',crowd:.82,pulse:['concert',.38,520]}
    ]
  };
  function cue(input={}){
    return {
      id:String(input.id||'cue'),ms:clamp(input.ms||1800,300,12000),
      mood:String(input.mood||'night'),weather:String(input.weather||'clear'),
      camera:String(input.camera||'street'),animation:String(input.animation||'idle'),
      audioProfile:String(input.audioProfile||'street'),audio:String(input.audio||'click'),
      effect:String(input.effect||'mission'),stage:input.stage?String(input.stage):null,
      crowd:clamp(input.crowd??0,0,1),pulse:Array.isArray(input.pulse)?input.pulse.slice(0,3):null
    };
  }
  function sequence(id='showcase'){
    const key=Object.prototype.hasOwnProperty.call(CUES,id)?id:'showcase';
    return {id:key,cues:CUES[key].map(cue),duration:CUES[key].reduce((n,x)=>n+clamp(x.ms,300,12000),0)};
  }
  const api={sequence,cue,sequences:Object.keys(CUES)};
  globalThis.TGGV242Core=api;if(typeof window!=='undefined')window.TGGV242Core=api;
})();