(() => {
  const KEY = 'tgg-daily-v1';
  const DAY = () => new Date().toISOString().slice(0,10);
  const goals = [
    {id:'move',label:'Hit the streets',target:10,reward:75,xp:10},
    {id:'cash',label:'Stack city cash',target:500,reward:125,xp:20},
    {id:'mission',label:'Finish a city job',target:1,reward:200,xp:35}
  ];
  let state = {day:DAY(),progress:{move:0,cash:0,mission:0},claimed:false};
  const $=id=>document.getElementById(id);
  function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x)state={...state,...x}}catch(e){} if(state.day!==DAY())state={day:DAY(),progress:{move:0,cash:0,mission:0},claimed:false};render()}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
  function render(){const el=$('dailyList');if(!el)return;const done=goals.filter(g=>state.progress[g.id]>=g.target).length;el.innerHTML='<div class="daily-head"><b>DAILY GRIND</b><span>'+done+'/'+goals.length+' complete</span></div>'+goals.map(g=>{const p=Math.min(g.target,state.progress[g.id]||0);return '<div class="daily-row"><b>'+g.label+'</b><span>'+p+'/'+g.target+' • +$'+g.reward+' • '+g.xp+' XP</span></div>'}).join('')+'<button id="dailyClaim" class="primary" '+(done===goals.length&&!state.claimed?'':'disabled')+'>'+ (state.claimed?'REWARD CLAIMED':'CLAIM DAILY BONUS') +'</button>';const b=$('dailyClaim');if(b)b.onclick=claim}
  function bump(id,n=1){if(!goals.some(g=>g.id===id)||state.claimed)return;state.progress[id]=Math.min((state.progress[id]||0)+Math.max(0,Number(n)||0),goals.find(g=>g.id===id).target);save()}
  function claim(){if(state.claimed||goals.some(g=>state.progress[g.id]<g.target))return;state.claimed=true;const game=window.TGGGame;if(game?.reward)game.reward(400,65);else localStorage.setItem('tgg-daily-pending','1');window.__tggToast?.('DAILY BONUS +$400 +65 XP');render()}
  window.TGGDaily={load,render,bump,getState:()=>state};
  load();
})();
