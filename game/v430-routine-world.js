(()=>{
  const VERSION='V4.30 DAILY ROUTINE WELLNESS SCHEDULE WORLD MEGA';
  const KEY='tgg-routine-v430';
  const defaults={
    routine:{sleep:0,studio:0,gym:0,network:0,recovery:0},
    streak:0,bestStreak:0,lastDay:0,mood:'FOCUSED',fatigue:18,wellness:72,
    activeBuff:null,lastAction:null
  };
  let state=load();
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...s,routine:{...defaults.routine,...(s.routine||{})}}}catch{return JSON.parse(JSON.stringify(defaults))}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function worldDay(){return Number(window.TGGWorldSystems?.getStatus?.()?.day)||1}
  function life(){return window.TGGLifeSim?.getStatus?.()||{energy:100,focus:100,social:50,momentum:0}}
  function resetForDay(){
    const d=worldDay();if(d===state.lastDay)return false;
    const completed=Object.values(state.routine).filter(v=>v>0).length;
    if(state.lastDay>0){
      if(completed>=3){state.streak++;state.bestStreak=Math.max(state.bestStreak,state.streak);state.wellness=clamp(state.wellness+5);window.TGGLifeSim?.change?.({momentum:3})}
      else{state.streak=0;state.wellness=clamp(state.wellness-6);window.TGGWorldSystems?.applyConsequence?.('poor daily routine',1)}
    }
    state.routine={sleep:0,studio:0,gym:0,network:0,recovery:0};state.lastDay=d;save();render();return true;
  }
  function recalc(){
    const l=life();
    state.fatigue=clamp(100-(Number(l.energy)||0)+Math.max(0,35-(Number(l.focus)||0))*.35,0,100);
    state.wellness=clamp((Number(l.energy)||0)*.42+(Number(l.focus)||0)*.28+(Number(l.social)||0)*.14+(100-state.fatigue)*.16,0,100);
    state.mood=state.wellness>=80?'LOCKED IN':state.wellness>=60?'FOCUSED':state.wellness>=40?'TIRED':state.wellness>=22?'DRAINED':'BURNED OUT';
    if(state.fatigue>=80)state.activeBuff='RECOVERY NEEDED';
    else if(state.streak>=5)state.activeBuff='DISCIPLINE +';
    else if((l.momentum||0)>=60)state.activeBuff='MOMENTUM HIGH';
    else state.activeBuff=null;
  }
  function doRoutine(type){
    const effects={
      sleep:{energy:22,focus:8,social:-1,momentum:1},
      studio:{energy:-8,focus:-5,social:-1,momentum:6},
      gym:{energy:-6,focus:5,social:1,momentum:2},
      network:{energy:-3,focus:-2,social:9,momentum:4},
      recovery:{energy:12,focus:6,social:2,momentum:0}
    };
    if(!effects[type])return false;
    const l=life();
    if(state.fatigue>88&&['studio','gym','network'].includes(type)){
      window.TGGGameFeel?.objective?.('TOO DRAINED','Recover before pushing harder.');
      return false;
    }
    window.TGGLifeSim?.change?.(effects[type]);
    state.routine[type]=(state.routine[type]||0)+1;
    state.lastAction={type,at:Date.now()};
    if(type==='network')window.TGGLivingCity?.nudgeHeat?.(1.5);
    if(type==='studio')window.TGGWorldSystems?.eligibleMove?.('industry-meeting');
    recalc();save();render();
    window.TGGGameFeel?.objective?.('ROUTINE COMPLETE',type.toUpperCase()+' • '+state.mood);
    return true;
  }
  function opportunityModifier(){
    recalc();
    return {
      rewardMultiplier:state.wellness>=80?1.12:state.wellness>=60?1.05:state.wellness<35?.85:1,
      xpMultiplier:state.streak>=5?1.12:state.streak>=3?1.06:1,
      blocked:state.fatigue>=92
    };
  }
  function ensure(){
    let el=document.getElementById('v430Routine');if(el)return el;
    el=document.createElement('aside');el.id='v430Routine';
    el.innerHTML='<small>DAILY ROUTINE</small><div class="v430-head"><b id="v430Mood">FOCUSED</b><span id="v430Wellness">WELLNESS 72</span><i id="v430Streak">STREAK 0</i></div><div id="v430Actions"></div><em id="v430Buff">BALANCED</em>';
    document.body.appendChild(el);return el;
  }
  function render(){
    ensure();recalc();
    document.getElementById('v430Mood').textContent=state.mood;
    document.getElementById('v430Wellness').textContent='WELLNESS '+Math.round(state.wellness)+' • FATIGUE '+Math.round(state.fatigue);
    document.getElementById('v430Streak').textContent='STREAK '+state.streak+' • BEST '+state.bestStreak;
    document.getElementById('v430Buff').textContent=state.activeBuff||'BALANCED';
    const root=document.getElementById('v430Actions');
    root.innerHTML=['sleep','studio','gym','network','recovery'].map(k=>'<button data-v430="'+k+'"><b>'+k.toUpperCase()+'</b><span>'+Number(state.routine[k]||0)+'</span></button>').join('');
    root.querySelectorAll('[data-v430]').forEach(b=>b.onclick=()=>doRoutine(b.dataset.v430));
  }
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const t=((b.id||'')+' '+(b.textContent||'')).toLowerCase();
      if(/save game|my apartment/.test(t))doRoutine('sleep');
      else if(/record track|mix session/.test(t))doRoutine('studio');
      else if(/gym|train/.test(t))doRoutine('gym');
      else if(/phone|crew|event/.test(t))doRoutine('network');
    },true);
  }
  function getStatus(){return {version:VERSION,...state,modifier:opportunityModifier(),features:['daily-routine-tracker','wellness-score','fatigue-system','routine-streaks','recovery-gating','routine-buffs','opportunity-wellness-modifier','routine-consequence-loop']}}
  function boot(){
    ensure();resetForDay();recalc();render();bind();setInterval(()=>{resetForDay();recalc();render()},12000);
    document.documentElement.dataset.tggV430='on';
    window.TGGRoutineWorld={version:VERSION,getStatus,doRoutine,recalc,opportunityModifier,resetForDay};
    window.dispatchEvent(new CustomEvent('tgg:v430-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();