(() => {
  const VERSION='V2.26';
  const DISTRICTS=[
    {id:'studio',name:'STUDIO ROW',x:24,y:37,color:'#7b86ff',activity:'RECORD'},
    {id:'downtown',name:'DOWNTOWN',x:50,y:50,color:'#c7ff00',activity:'BATTLE'},
    {id:'mixtape',name:'MIXTAPE AVE',x:76,y:63,color:'#48d7ff',activity:'SHOW'},
    {id:'media',name:'MEDIA DISTRICT',x:50,y:89,color:'#c56cff',activity:'VISUAL'}
  ];
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  const clean=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

  function districtDefault(id){
    const seeds={
      studio:{player:24,rival:31},
      downtown:{player:28,rival:34},
      mixtape:{player:22,rival:29},
      media:{player:18,rival:27}
    };
    return {...(seeds[id]||{player:20,rival:30}),captured:false,pushes:0,activities:0,lastSource:'CITY START'};
  }

  function normalizeDistrict(row,id){
    const d={...districtDefault(id),...(row||{})};
    d.player=clamp(d.player);
    d.rival=clamp(d.rival);
    d.captured=!!d.captured;
    d.pushes=Math.max(0,Math.floor(clean(d.pushes)));
    d.activities=Math.max(0,Math.floor(clean(d.activities)));
    d.lastSource=typeof d.lastSource==='string'?d.lastSource:'CITY START';
    return d;
  }

  function createState(saved={}){
    const districts={};
    for(const d of DISTRICTS)districts[d.id]=normalizeDistrict(saved?.districts?.[d.id],d.id);
    return {
      version:VERSION,
      districts,
      trackedDistrict:DISTRICTS.some(d=>d.id===saved.trackedDistrict)?saved.trackedDistrict:null,
      lastDay:Math.max(1,Math.floor(clean(saved.lastDay,1))),
      totalPushes:Math.max(0,Math.floor(clean(saved.totalPushes))),
      captures:Math.max(0,Math.floor(clean(saved.captures))),
      history:Array.isArray(saved.history)?saved.history.slice(-40):[]
    };
  }

  function controlOf(row){
    const d=normalizeDistrict(row,'studio');
    const diff=d.player-d.rival;
    if(d.player>=60&&diff>=10)return 'TGG CONTROL';
    if(d.rival>=60&&diff<=-10)return 'NIGHT SHIFT';
    if(diff>=12)return 'TGG LEAN';
    if(diff<=-12)return 'NIGHT SHIFT LEAN';
    return 'CONTESTED';
  }

  function cityScore(s){
    const state=createState(s);
    const vals=DISTRICTS.map(d=>state.districts[d.id].player);
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  }
  function rivalScore(s){
    const state=createState(s);
    const vals=DISTRICTS.map(d=>state.districts[d.id].rival);
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  }

  function entry(state,id,source,deltaPlayer,deltaRival){
    const row=state.districts[id];
    state.history=[...state.history,{
      id,source:String(source||'MOVE').slice(0,40),player:row.player,rival:row.rival,
      deltaPlayer,deltaRival,control:controlOf(row),at:Date.now()
    }].slice(-40);
  }

  function applyActivity(s,id,amount=8,source='CAREER MOVE'){
    const state=createState(s),row=state.districts[id];
    if(!row)return null;
    const beforePlayer=row.player,beforeRival=row.rival;
    const gain=clamp(amount,1,24);
    row.player=clamp(row.player+gain);
    row.rival=clamp(row.rival-Math.max(1,Math.round(gain*.16)));
    row.activities++;
    row.lastSource=String(source||'CAREER MOVE');
    const justCaptured=!row.captured&&controlOf(row)==='TGG CONTROL';
    if(justCaptured){row.captured=true;state.captures++;}
    entry(state,id,row.lastSource,row.player-beforePlayer,row.rival-beforeRival);
    return {...state,justCaptured,districtId:id,rewards:justCaptured?{cash:350,xp:80,rep:20}:{cash:0,xp:0,rep:0}};
  }

  function applyRivalChoice(s,choice){
    let state=createState(s);
    const moves={
      respect:[['downtown',5,-4],['mixtape',2,-2]],
      compete:[['downtown',9,7],['mixtape',4,3]],
      collab:[['studio',7,4],['media',7,4]]
    }[choice]||[];
    for(const [id,p,r] of moves){
      const row=state.districts[id];
      const bp=row.player,br=row.rival;
      row.player=clamp(row.player+p);row.rival=clamp(row.rival+r);row.lastSource='RIVAL • '+String(choice).toUpperCase();
      const justCaptured=!row.captured&&controlOf(row)==='TGG CONTROL';
      if(justCaptured){row.captured=true;state.captures++;}
      entry(state,id,row.lastSource,row.player-bp,row.rival-br);
    }
    return state;
  }

  function applyDayPressure(s,ctx={}){
    const state=createState(s);
    const rivalry=clamp(ctx.rivalry??25),respect=clamp(ctx.respect??10),alliance=clamp(ctx.alliance??0);
    const pressure=alliance>=70?1:rivalry>=55?6:respect>=55?2:4;
    for(const d of DISTRICTS){
      const row=state.districts[d.id],before=row.rival;
      row.rival=clamp(row.rival+pressure);
      row.lastSource='NIGHT SHIFT DAILY PRESSURE';
      entry(state,d.id,row.lastSource,0,row.rival-before);
    }
    state.lastDay=Math.max(state.lastDay+1,Math.floor(clean(ctx.day,state.lastDay+1)));
    return state;
  }

  function workDistrict(s,id,ctx={}){
    const state=createState(s),row=state.districts[id];
    if(!row)return null;
    const crew=clamp(ctx.crewStrength??0);
    const readiness=Math.max(.65,Math.min(1.30,clean(ctx.readiness,1)));
    const rivalry=clamp(ctx.rivalry??25);
    const alliance=clamp(ctx.alliance??0);
    let gain=7+Math.round(crew*.055)+Math.round((readiness-.7)*10);
    gain=Math.max(7,Math.min(19,gain));
    const rivalPush=alliance>=70?0:rivalry>=55?4:2;
    const bp=row.player,br=row.rival;
    row.player=clamp(row.player+gain);
    row.rival=clamp(row.rival+rivalPush);
    row.pushes++;state.totalPushes++;
    row.lastSource='STREET PUSH';
    const justCaptured=!row.captured&&controlOf(row)==='TGG CONTROL';
    if(justCaptured){row.captured=true;state.captures++;}
    entry(state,id,row.lastSource,row.player-bp,row.rival-br);
    return {
      ...state,justCaptured,districtId:id,gain,rivalPush,
      rewards:justCaptured?{cash:350,xp:80,rep:20}:{cash:45,xp:18,rep:2}
    };
  }

  function snapshot(s){
    const state=createState(s);
    return {
      version:VERSION,
      trackedDistrict:state.trackedDistrict,
      totalPushes:state.totalPushes,
      captures:state.captures,
      cityScore:cityScore(state),
      rivalScore:rivalScore(state),
      districts:DISTRICTS.map(d=>({
        ...d,...state.districts[d.id],control:controlOf(state.districts[d.id])
      })),
      history:state.history.slice(-12)
    };
  }

  globalThis.TGGV226Core={
    VERSION,DISTRICTS: DISTRICTS.map(x=>({...x})),createState,controlOf,cityScore,rivalScore,
    applyActivity,applyRivalChoice,applyDayPressure,workDistrict,snapshot
  };
})();