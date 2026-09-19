(()=>{
  const VERSION='V4.40 FAMILY HOME RELATIONSHIP LIFE MEGA';
  const KEY='tgg-family-home-v440';
  const defaults={
    household:{name:'TGG HOUSEHOLD',members:1,harmony:72,support:55,privacy:65},
    home:{comfort:58,style:45,security:50,studioCorner:35},
    bonds:{M:18,'DJ V':12,Kane:14,'Rico Flame':3},
    responsibilities:{home:0,relationships:0,career:0},
    memories:[],
    lastTick:Date.now()
  };
  let state=load();
  function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...x,household:{...defaults.household,...(x.household||{})},home:{...defaults.home,...(x.home||{})},bonds:{...defaults.bonds,...(x.bonds||{})},responsibilities:{...defaults.responsibilities,...(x.responsibilities||{})},memories:Array.isArray(x.memories)?x.memories:[]}}catch{return structuredClone(defaults)}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function life(){return window.TGGLifeSim?.getStatus?.()||{energy:80,focus:80,social:60,momentum:30}}
  function world(){return window.TGGWorldSystems?.getStatus?.()||{cityRep:0,properties:{apartment:1}}}
  function social(){return window.TGGCityStatus?.getStatus?.()||{statusScore:0}}

  function remember(type,text,score=1){
    state.memories.push({type:String(type||'life'),text:String(text||''),score:Number(score)||0,at:Date.now()});
    state.memories=state.memories.slice(-30);save();return state.memories.at(-1);
  }
  function bond(name,amount=1,reason=''){
    const k=String(name||'CITY');
    state.bonds[k]=clamp((state.bonds[k]||0)+Number(amount||0));
    if(reason)remember('bond',k+': '+reason,amount);
    state.household.support=clamp(state.household.support+Math.max(-2,Math.min(2,amount*.25)));
    save();render();return state.bonds[k];
  }
  function improveHome(area,amount=3){
    if(!(area in state.home))return false;
    state.home[area]=clamp(state.home[area]+Number(amount||0));
    state.household.harmony=clamp(state.household.harmony+1.2);
    remember('home',area+' improved',amount);
    window.TGGLifeSim?.change?.({energy:area==='comfort'?4:0,focus:area==='studioCorner'?4:0,social:area==='style'?2:0,momentum:2});
    save();render();return true;
  }
  function addMember(label='FAMILY'){
    if(state.household.members>=6)return false;
    state.household.members++;
    state.household.harmony=clamp(state.household.harmony-2);
    state.household.support=clamp(state.household.support+6);
    remember('family',label+' joined the household',8);
    save();render();return true;
  }
  function dailyBalance(){
    const l=life(),w=world();
    state.responsibilities.home=clamp(100-(state.home.comfort+state.home.security)/2);
    state.responsibilities.relationships=clamp(100-state.household.support);
    state.responsibilities.career=clamp(55-(Number(l.momentum)||0)+(Number(w.cityRep)||0)*.15);
    const pressure=(state.responsibilities.home+state.responsibilities.relationships+state.responsibilities.career)/3;
    state.household.harmony=clamp(state.household.harmony+(pressure<45?.8:-.8));
    if(pressure>65)window.TGGLifeSim?.change?.({energy:-2,focus:-1,social:-1});
    else if(pressure<35)window.TGGLifeSim?.change?.({energy:1,focus:1,social:1});
    state.lastTick=Date.now();save();render();
  }
  function homeBonus(){
    return {
      recovery:Math.round((state.home.comfort+state.home.security)/20),
      creativeFocus:Math.round(state.home.studioCorner/15),
      socialLift:Math.round((state.home.style+state.household.harmony)/20)
    };
  }
  function relationshipTier(v){
    v=Number(v)||0;
    return v>=80?'INNER CIRCLE':v>=55?'TRUSTED':v>=30?'CONNECTED':v>=10?'KNOWN':'DISTANT';
  }
  function ensurePanel(){
    let el=document.getElementById('v440FamilyHome');if(el)return el;
    el=document.createElement('aside');el.id='v440FamilyHome';
    el.innerHTML='<small>V4.40 FAMILY + HOME</small><b id="v440Harmony">HARMONY 72</b><span id="v440Home">HOME 47</span><i id="v440Bond">TOP BOND • M</i><div><button data-v440-home="comfort">COMFORT</button><button data-v440-home="style">STYLE</button><button data-v440-home="security">SECURITY</button><button data-v440-home="studioCorner">STUDIO</button></div>';
    document.body.appendChild(el);
    el.querySelectorAll('[data-v440-home]').forEach(b=>b.addEventListener('click',()=>improveHome(b.dataset.v440Home,3)));
    return el;
  }
  function render(){
    ensurePanel();
    const homeScore=Math.round(Object.values(state.home).reduce((a,b)=>a+(Number(b)||0),0)/4);
    const top=Object.entries(state.bonds).sort((a,b)=>b[1]-a[1])[0]||['CITY',0];
    document.getElementById('v440Harmony').textContent='HARMONY '+Math.round(state.household.harmony);
    document.getElementById('v440Home').textContent='HOME '+homeScore+' • '+state.household.members+' MEMBER'+(state.household.members===1?'':'S');
    document.getElementById('v440Bond').textContent='TOP BOND • '+top[0]+' • '+relationshipTier(top[1]);
  }
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const txt=((b.id||'')+' '+(b.textContent||'')).toLowerCase();
      if(txt.includes('talk to m'))bond('M',1.5,'checked in');
      if(txt.includes('show')||txt.includes('event'))bond('DJ V',1,'shared city moment');
      if(txt.includes('studio')||txt.includes('record'))bond('Kane',1,'creative time');
      if(txt.includes('battle'))bond('Rico Flame',.5,'competitive respect');
      if(txt.includes('apartment')||txt.includes('home'))state.household.harmony=clamp(state.household.harmony+1);
      save();render();
    },true);
    window.addEventListener('tgg-story-event',e=>{
      if(/complete/i.test(String(e.detail?.type||''))){state.household.support=clamp(state.household.support+2);remember('career','family celebrated a win',2);save();render()}
    });
  }
  function getStatus(){return {version:VERSION,...state,homeBonus:homeBonus(),topRelationships:Object.fromEntries(Object.entries(state.bonds).map(([k,v])=>[k,{score:v,tier:relationshipTier(v)}])),features:['household-state','home-upgrade-loop','relationship-memory','relationship-tiers','family-support-loop','responsibility-pressure','home-recovery-bonuses','career-family-feedback']}}
  function boot(){ensurePanel();render();bind();setInterval(dailyBalance,12000);document.documentElement.dataset.tggV440='on';window.TGGFamilyHome={version:VERSION,getStatus,bond,improveHome,addMember,remember,homeBonus,dailyBalance};window.dispatchEvent(new CustomEvent('tgg:v440-ready',{detail:getStatus()}))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();