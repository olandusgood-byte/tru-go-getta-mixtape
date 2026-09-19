(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const AMBIENCE={
    city:{id:'city',noise:.34,hum:.28,pulse:0,filter:1800,gain:.24},
    traffic:{id:'traffic',noise:.28,hum:.42,pulse:.04,filter:1300,gain:.28},
    studio:{id:'studio',noise:.08,hum:.12,pulse:.02,filter:2200,gain:.16},
    club:{id:'club',noise:.12,hum:.32,pulse:.7,filter:1500,gain:.3},
    rain:{id:'rain',noise:.72,hum:.1,pulse:0,filter:2600,gain:.28},
    crowd:{id:'crowd',noise:.4,hum:.18,pulse:.08,filter:1100,gain:.24}
  };
  const CUES={
    impact:{id:'impact',gain:.42,frequency:92,duration:.18,attack:.002,release:.16,type:'sawtooth'},
    success:{id:'success',gain:.3,frequency:660,duration:.42,attack:.01,release:.32,type:'sine'},
    checkpoint:{id:'checkpoint',gain:.24,frequency:520,duration:.24,attack:.005,release:.18,type:'triangle'},
    boost:{id:'boost',gain:.2,frequency:180,duration:.22,attack:.01,release:.18,type:'sawtooth'},
    lightning:{id:'lightning',gain:.46,frequency:58,duration:.55,attack:.002,release:.5,type:'square'},
    hype:{id:'hype',gain:.25,frequency:340,duration:.32,attack:.008,release:.24,type:'triangle'}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'custom'),
      gain:clamp(Number.isFinite(Number(input.gain))?Number(input.gain):.2,0,1),
      frequency:clamp(Number.isFinite(Number(input.frequency))?Number(input.frequency):220,30,8000),
      duration:clamp(Number.isFinite(Number(input.duration))?Number(input.duration):.25,.02,4),
      attack:clamp(Number.isFinite(Number(input.attack))?Number(input.attack):.01,0,2),
      release:clamp(Number.isFinite(Number(input.release))?Number(input.release):.2,0,4),
      type:['sine','square','sawtooth','triangle'].includes(input.type)?input.type:'sine'
    };
  }
  function ambience(id='city'){
    const a=AMBIENCE[id]||AMBIENCE.city;
    return {...a};
  }
  function cue(id='impact'){
    return normalize(CUES[id]||CUES.impact);
  }
  const api={ambience,cue,normalize,ambiences:Object.keys(AMBIENCE),cues:Object.keys(CUES)};
  globalThis.TGGV237Core=api;
  if(typeof window!=='undefined')window.TGGV237Core=api;
})();