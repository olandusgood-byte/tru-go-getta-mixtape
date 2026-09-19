(()=>{
  const VERSION='V3.80 LIFE SIM PROPERTY SOCIAL WORLD MEGA';
  const KEY='tgg-life-v380';
  const defaults={energy:82,focus:74,social:58,momentum:40,day:1,lastTick:Date.now(),relationships:{M:15,'DJ V':8,Kane:10,'Rico Flame':0}};
  let state=load();
  function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
  function load(){
    try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function ensurePanel(){
    let el=document.getElementById('v380LifePanel');
    if(el)return el;
    el=document.createElement('section');el.id='v380LifePanel';
    el.innerHTML='<small>LIFE SIM</small><div><b>ENERGY <i id="v380Energy">82</i></b><b>FOCUS <i id="v380Focus">74</i></b><b>SOCIAL <i id="v380Social">58</i></b><b>MOMENTUM <i id="v380Momentum">40</i></b></div><span id="v380LifeHint">Build your day around the city.</span>';
    document.body.appendChild(el);return el;
  }
  function render(){
    ensurePanel();
    const map={v380Energy:'energy',v380Focus:'focus',v380Social:'social',v380Momentum:'momentum'};
    Object.entries(map).forEach(([id,k])=>{const e=document.getElementById(id);if(e)e.textContent=Math.round(state[k])});
    const hint=document.getElementById('v380LifeHint');
    if(hint){
      const low=Object.entries({ENERGY:state.energy,FOCUS:state.focus,SOCIAL:state.social}).sort((a,b)=>a[1]-b[1])[0];
      hint.textContent=low[1]<35?low[0]+' IS LOW • REBALANCE YOUR DAY':'DAY '+state.day+' • CAREER MOMENTUM '+Math.round(state.momentum);
    }
  }
  function change(delta={}){
    for(const k of ['energy','focus','social','momentum'])if(k in delta)state[k]=clamp(state[k]+delta[k]);
    save();render();return {...state};
  }
  function relate(name,amount=1){
    const key=String(name||'CITY');
    state.relationships[key]=clamp((state.relationships[key]||0)+Number(amount||0));
    save();return state.relationships[key];
  }
  function action(type){
    const map={
      rest:{energy:18,focus:5,social:-3,momentum:-1},
      studio:{energy:-8,focus:-7,momentum:7},
      perform:{energy:-12,focus:-4,social:8,momentum:10},
      gym:{energy:-7,focus:4,momentum:2},
      social:{energy:-3,focus:-2,social:10,momentum:2},
      business:{energy:-4,focus:-5,momentum:6}
    };
    change(map[type]||{});
    window.TGGGameFeel?.objective?.('LIFE UPDATE',String(type||'activity').toUpperCase()+' changed your daily balance.');
  }
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const id=(b.id||'')+' '+(b.textContent||'');
      if(/save game|my apartment|home/i.test(id))action('rest');
      else if(/record|studio|mix/i.test(id))action('studio');
      else if(/show|perform|battle/i.test(id))action('perform');
      else if(/gym|train/i.test(id))action('gym');
      else if(/phone|crew|world life|event/i.test(id))action('social');
      else if(/business|career|upgrade/i.test(id))action('business');
      if(/talk to m/i.test(id))relate('M',2);
    },true);
    window.addEventListener('tgg-story-event',e=>{
      const d=e.detail||{};
      if(/complete/i.test(String(d.type||'')))change({momentum:6,social:2});
    });
  }
  function tick(){
    const now=Date.now(),mins=Math.max(0,(now-state.lastTick)/60000);
    if(mins>=1){
      state.energy=clamp(state.energy-mins*.12);
      state.focus=clamp(state.focus-mins*.08);
      state.social=clamp(state.social-mins*.04);
      state.lastTick=now;
      save();render();
    }
  }
  function getStatus(){return {version:VERSION,...state,features:['persistent-life-stats','daily-balance-loop','property-rest-hook','studio-energy-loop','performance-social-loop','relationship-state','career-momentum','story-momentum-hook']}}
  function boot(){
    ensurePanel();render();bind();setInterval(tick,15000);
    document.documentElement.dataset.tggV380='on';
    window.TGGLifeSim={version:VERSION,getStatus,change,relate,action,save,load};
    window.dispatchEvent(new CustomEvent('tgg:v380-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();