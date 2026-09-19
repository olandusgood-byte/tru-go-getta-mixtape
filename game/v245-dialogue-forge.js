(()=>{
  const VERSION='V2.45 TGG DIALOGUE + CHOICE FORGE 100',KEY='tgg-v245-dialogue-choice';
  const core=()=>globalThis.TGGV245Core;
  const blank=()=>({
    choices:{manager:null,kane:null,director:null},
    relationships:{manager:{score:0},kane:{score:0},director:{score:0}},
    identity:{career:null,sound:null,visual:null},
    active:null,step:null,epilogue:false,history:[],runCount:0
  });
  let state=blank(),panel=null,contextEl=null,choicesEl=null,titleEl=null;
  const hasDOM=()=>typeof document!=='undefined';
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)state={...blank(),...s,choices:{...blank().choices,...s.choices},relationships:{...blank().relationships,...s.relationships},identity:{...blank().identity,...s.identity}}}catch{}}
  function status(){return {version:VERSION,mode:'branching-cinematic-dialogue',layerCount:100,...JSON.parse(JSON.stringify(state))}}
  function ensureUI(){
    if(!hasDOM()||panel)return;
    const btn=document.createElement('button');btn.id='v245DialogueBtn';btn.className='v245-dialogue-btn';btn.textContent='DIALOGUE';document.body.appendChild(btn);
    panel=document.createElement('section');panel.id='v245DialoguePanel';panel.className='v245-dialogue-panel';
    panel.innerHTML='<small id="v245Role">STORY CONTACT</small><b id="v245Title">DIALOGUE</b><p id="v245Context">Your choices shape relationships and identity.</p><div id="v245Choices" class="v245-choices"></div><button id="v245Close" class="v245-close">CLOSE</button>';
    document.body.appendChild(panel);
    titleEl=document.getElementById('v245Title');contextEl=document.getElementById('v245Context');choicesEl=document.getElementById('v245Choices');
    btn.addEventListener('click',()=>panel.classList.toggle('active'));document.getElementById('v245Close')?.addEventListener('click',()=>panel.classList.remove('active'));
    choicesEl.addEventListener('click',e=>{const b=e.target.closest('[data-v245-choice]');if(b)choose(b.dataset.v245Choice)});
  }
  function presentation(contact,choice){
    window.TGGV243?.mark?.('dialogue',{contact,choice});
    window.TGGV234?.applyPreset?.(contact==='director'?'cinematic':'street');
    window.TGGV240?.applyProfile?.(contact==='kane'?'studio':'cinematic');
    window.TGGV240?.play?.('dialogue-choice');
    window.TGGV232?.play?.('talk',1600);
    window.TGGV238?.emit?.('dialogue',{strength:.72});
  }
  function render(){
    ensureUI();if(!panel)return;
    const def=core()?.definition?.(state.active);
    if(!def)return;
    document.getElementById('v245Role').textContent=def.role;
    titleEl.textContent=def.name+' — YOUR MOVE';
    contextEl.textContent=core().context(state.active,state);
    choicesEl.innerHTML=core().choices(state.active).map(c=>'<button class="v245-choice" data-v245-choice="'+c.id+'"><b>'+c.label+'</b><span>'+c.detail+'</span></button>').join('');
    panel.classList.add('active');
  }
  function open(contact,step={}){
    if(!core()?.contacts?.includes(contact))return false;
    state.active=contact;state.step=step?.id||null;state.history.push({type:'open',contact,step:state.step,at:Date.now()});save();render();return status();
  }
  function intercept(step){
    if(step?.kind!=='talk'||!step?.contact)return false;
    open(step.contact,step);return true;
  }
  function choose(id){
    const contact=state.active,def=core()?.definition?.(contact),choice=def?.choices?.find(x=>x.id===id);
    if(!contact||!choice)return false;
    state.choices[contact]=choice.id;
    state.relationships[contact]={score:60};
    Object.assign(state.identity,choice.identity||{});
    state.history.push({type:'choice',contact,choice:id,at:Date.now()});
    presentation(contact,id);state.active=null;state.step=null;save();
    panel?.classList.remove('active');
    window.TGGV244?.advance?.('dialogue:'+contact+':'+id);
    return status();
  }
  function beginRun(meta={}){
    state.active=null;state.step=null;state.epilogue=false;state.runCount=(state.runCount||0)+1;
    state.history.push({type:'run',story:meta.story||null,at:Date.now()});save();panel?.classList.remove('active');return status();
  }
  function epilogue(detail={}){
    state.epilogue=true;state.active=null;state.step=null;state.history.push({type:'epilogue',story:detail.id||'city-buzz',at:Date.now()});save();
    ensureUI();if(panel){
      document.getElementById('v245Role').textContent='CITY BUZZ COMPLETE';
      titleEl.textContent='YOUR VERSION OF THE STORY';
      contextEl.textContent='Career: '+(state.identity.career||'OPEN')+' • Sound: '+(state.identity.sound||'OPEN')+' • Visual: '+(state.identity.visual||'OPEN');
      choicesEl.innerHTML='<div class="v245-epilogue">M '+state.relationships.manager.score+' • KANE '+state.relationships.kane.score+' • DIRECTOR K '+state.relationships.director.score+'</div>';
      panel.classList.add('active');
    }
    window.TGGV243?.mark?.('dialogue-epilogue',{identity:{...state.identity}});
    return status();
  }
  function bind(){
    if(!hasDOM()||bind.done)return;bind.done=true;ensureUI();
    window.addEventListener('tgg:v244-story-complete',e=>epilogue(e.detail||{}));
  }
  load();bind();
  const api={version:VERSION,layers:100,status,open,choose,intercept,beginRun,epilogue,render};
  globalThis.TGGV245=api;if(hasDOM())window.TGGV245=api;
})();