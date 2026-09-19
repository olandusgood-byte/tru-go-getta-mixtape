(()=>{
  const VERSION='V3.90 CAREER MISSION ECONOMY WORLD LOOP MEGA';
  const KEY='tgg-opportunities-v390';
  const templates=[
    {id:'street-promo',title:'STREET PROMO RUN',detail:'Work Downtown and build buzz.',energy:5,focus:2,reward:{cash:120,xp:20,rep:6},heat:4,life:{energy:-5,focus:-2,social:5,momentum:4}},
    {id:'studio-grind',title:'LATE STUDIO PUSH',detail:'Lock in at Studio Row and sharpen the catalog.',energy:8,focus:6,reward:{cash:180,xp:35,rep:8},heat:3,life:{energy:-8,focus:-6,social:-1,momentum:7}},
    {id:'live-show',title:'POP-UP LIVE SHOW',detail:'Turn city heat into a crowd moment.',energy:12,focus:4,reward:{cash:320,xp:60,rep:15},heat:8,life:{energy:-12,focus:-4,social:9,momentum:10}},
    {id:'business-move',title:'BUSINESS MEETING',detail:'Use momentum to unlock a money move.',energy:4,focus:8,reward:{cash:260,xp:30,rep:10},heat:2,life:{energy:-4,focus:-8,social:3,momentum:8}}
  ];
  let state=load();
  function load(){try{return {...JSON.parse(localStorage.getItem(KEY)||'{}'),completed:JSON.parse(localStorage.getItem(KEY)||'{}').completed||[]}}catch{return {active:null,completed:[],lastRun:0}}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function life(){return window.TGGLifeSim?.getStatus?.()||{energy:100,focus:100,momentum:0,relationships:{}}}
  function city(){return window.TGGLivingCity?.getStatus?.()||{heat:0,district:'DOWNTOWN'}}
  function eligible(t){
    const l=life(),c=city();
    if(l.energy<t.energy||l.focus<t.focus)return false;
    if(t.id==='live-show'&&c.heat<8)return false;
    if(t.id==='business-move'&&l.momentum<12)return false;
    return true;
  }
  function rank(t){
    const l=life(),c=city();
    let s=(c.heat||0)*.4+(l.momentum||0)*.5;
    if(t.id==='studio-grind'&&c.district==='STUDIO ROW')s+=18;
    if(t.id==='street-promo'&&c.district==='DOWNTOWN')s+=14;
    if(t.id==='live-show')s+=(c.heat||0)*.8;
    if(t.id==='business-move')s+=(l.momentum||0)*.7;
    return s;
  }
  function choose(){
    const list=templates.filter(eligible).sort((a,b)=>rank(b)-rank(a));
    state.active=list[0]?.id||'street-promo';save();render();return current();
  }
  function current(){return templates.find(x=>x.id===state.active)||templates[0]}
  function ensure(){
    let el=document.getElementById('v390Opportunity');
    if(el)return el;
    el=document.createElement('aside');el.id='v390Opportunity';
    el.innerHTML='<small>WORLD OPPORTUNITY</small><b id="v390Title">SCANNING CITY...</b><span id="v390Detail">Build momentum to unlock moves.</span><button id="v390Run">RUN MOVE</button>';
    document.body.appendChild(el);
    el.querySelector('#v390Run')?.addEventListener('click',()=>run(current().id));
    return el;
  }
  function render(){
    ensure();const t=current();
    document.getElementById('v390Title').textContent=t.title;
    document.getElementById('v390Detail').textContent=t.detail+' • $'+t.reward.cash+' • '+t.reward.xp+' XP';
    const b=document.getElementById('v390Run');if(b){b.disabled=!eligible(t);b.textContent=eligible(t)?'RUN MOVE':'BUILD STATS FIRST'}
  }
  function run(id){
    const t=templates.find(x=>x.id===id);if(!t||!eligible(t))return false;
    const now=Date.now();if(now-state.lastRun<3000)return false;
    state.lastRun=now;state.completed.push({id:t.id,at:now});state.completed=state.completed.slice(-20);
    window.TGGLifeSim?.change?.(t.life);
    window.TGGLivingCity?.nudgeHeat?.(t.heat);
    window.TGGEconomy?.apply?.(t.reward) || window.TGGGame?.reward?.(t.reward.cash,t.reward.xp);
    window.TGGCareer?.addRep?.(t.reward.rep);
    if(t.id==='studio-grind')window.TGGLifeSim?.relate?.('Kane',2);
    if(t.id==='live-show')window.TGGLifeSim?.relate?.('DJ V',2);
    if(t.id==='business-move')window.TGGLifeSim?.relate?.('M',2);
    window.TGGGameFeel?.objective?.('OPPORTUNITY COMPLETE',t.title+' paid $'+t.reward.cash+' and '+t.reward.xp+' XP.');
    save();choose();return true;
  }
  function getStatus(){return {version:VERSION,active:current(),completed:state.completed.length,features:['dynamic-world-opportunities','life-stat-gating','city-heat-gating','career-momentum-gating','economy-reward-hooks','relationship-reward-hooks','opportunity-history','adaptive-opportunity-ranking']}}
  function boot(){ensure();choose();setInterval(()=>{if(Date.now()-state.lastRun>15000)choose()},15000);document.documentElement.dataset.tggV390='on';window.TGGOpportunityLoop={version:VERSION,getStatus,choose,run,current};window.dispatchEvent(new CustomEvent('tgg:v390-ready',{detail:getStatus()}))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();