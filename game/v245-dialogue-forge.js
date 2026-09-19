(() => {
  const VERSION='V2.45 TGG DIALOGUE + CHOICE FORGE 100';
  const PACKS=['dialogue','choices','relationships','identity','cinematic','audio','animation','consequences','persistence','ui'];
  const LAYERS=PACKS.flatMap(p=>Array.from({length:10},(_,i)=>p+' '+String(i+1).padStart(2,'0')));
  const KEY='tgg-v245-dialogue-choice';
  const core=()=>globalThis.TGGV245Core||globalThis.window?.TGGV245Core;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const state={
    enabled:true,
    choices:{manager:null,kane:null,director:null},
    relationships:{manager:50,kane:50,director:50},
    active:null,
    activeStep:null,
    runResolved:{manager:false,kane:false,director:false},
    history:[],
    scenes:0,
    ready:false,
    lastChoiceAt:0,
    storyRun:0,
    epilogue:false
  };
  let panel=null,button=null;

  function clone(v){return JSON.parse(JSON.stringify(v))}
  function save(){
    if(!hasDOM())return;
    try{
      localStorage.setItem(KEY,JSON.stringify({
        enabled:state.enabled,choices:state.choices,history:state.history.slice(-40),
        scenes:state.scenes,lastChoiceAt:state.lastChoiceAt,storyRun:state.storyRun
      }));
    }catch{}
  }
  function recompute(){
    const c=core();if(!c)return;
    c.contacts.forEach(id=>state.relationships[id]=c.relationship(id,state.choices));
  }
  function load(){
    if(!hasDOM())return;
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(typeof x.enabled==='boolean')state.enabled=x.enabled;
      ['manager','kane','director'].forEach(id=>{
        const selected=String(x.choices?.[id]||'');
        state.choices[id]=core()?.choice?.(id,selected)?selected:null;
      });
      state.history=Array.isArray(x.history)?x.history.slice(-40):[];
      state.scenes=Math.max(0,Number(x.scenes)||0);
      state.lastChoiceAt=Number(x.lastChoiceAt)||0;
      state.storyRun=Number(x.storyRun)||0;
    }catch{}
    recompute();
  }
  function relationSnapshot(){
    const c=core();const out={};
    c?.contacts?.forEach(id=>{
      const score=state.relationships[id]??50;
      out[id]={score,level:c.relationshipLevel(score)};
    });
    return out;
  }
  function status(){
    const c=core();
    return {
      version:VERSION,mode:'branching-cinematic-dialogue',ready:state.ready||!hasDOM(),enabled:state.enabled,
      layerCount:LAYERS.length,active:state.active,activeStep:state.activeStep,
      choices:{...state.choices},relationships:relationSnapshot(),
      identity:c?.identity?.(state.choices)||{},tags:c?.tags?.(state.choices)||[],
      runResolved:{...state.runResolved},scenes:state.scenes,storyRun:state.storyRun,
      history:state.history.slice(-10),epilogue:state.epilogue
    };
  }

  function toast(msg){if(hasDOM())window.__tggToast?.(msg)}
  function emit(type,detail={}){
    if(hasDOM())window.dispatchEvent(new CustomEvent(type,{detail:{version:VERSION,...detail}}));
  }
  function presentation(contactId,choice){
    if(!hasDOM()||!choice)return;
    window.TGGV242?.start?.('mission-intro',{auto:true,source:'v245',contact:contactId});
    window.TGGV234?.applyPreset?.(choice.camera||'orbit');
    window.TGGV240?.applyProfile?.(choice.audio||'cinematic');
    window.TGGV240?.play?.('checkpoint');
    window.TGGV232?.play?.('talk',1900);
    window.TGGV235?.pulseCrowd?.('mission',1200);
    window.TGGV238?.emit?.('mission',{strength:.72});
    window.TGGV243?.mark?.('dialogue',{contact:contactId,choice:choice.id,tone:choice.tone,source:'v245'});
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v245');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v245DialogueBtn')){
      button=document.createElement('button');
      button.id='v245DialogueBtn';button.className='v245-dialogue-btn';button.textContent='RELATIONSHIPS';
      button.addEventListener('click',()=>{ensurePanel();state.epilogue=false;render();panel?.classList.toggle('active')});
      top.appendChild(button);
    }
    ensurePanel();
    state.ready=true;
    render();
  }
  function ensurePanel(){
    if(!hasDOM()||panel)return panel;
    panel=document.createElement('aside');
    panel.id='v245DialoguePanel';panel.className='v245-dialogue-panel';
    panel.innerHTML=
      '<div class="v245-head"><div><small>V2.45 • DIALOGUE + CHOICE</small><b id="v245Heading">RELATIONSHIPS</b></div><button id="v245Close" aria-label="Close">×</button></div>'+
      '<div id="v245Portrait" class="v245-portrait"><strong id="v245Initials">TGG</strong><span id="v245Role">STORY PROFILE</span></div>'+
      '<p id="v245Context" class="v245-context">Your decisions shape how the people around you see the run.</p>'+
      '<h3 id="v245Prompt">MAKE THE CALL.</h3>'+
      '<div id="v245Choices" class="v245-choices"></div>'+
      '<div id="v245Relationships" class="v245-relationships"></div>'+
      '<div id="v245Identity" class="v245-identity"></div>'+
      '<div class="v245-foot"><span>1 / 2 / 3 SELECT</span><button id="v245Reset">RESET PROFILE</button></div>';
    document.body.appendChild(panel);
    document.getElementById('v245Close')?.addEventListener('click',()=>panel?.classList.remove('active'));
    document.getElementById('v245Reset')?.addEventListener('click',resetProfile);
    panel.addEventListener('click',e=>{
      const el=e.target?.closest?.('[data-v245-choice]');
      if(el)choose(el.dataset.v245Choice);
    });
    return panel;
  }

  function initials(id){
    return id==='manager'?'M':id==='kane'?'K':id==='director'?'DK':'TGG';
  }
  function render(){
    if(!hasDOM())return;
    ensurePanel();
    const c=core();
    const contact=state.active?c?.contact?.(state.active):null;
    const heading=document.getElementById('v245Heading');
    const init=document.getElementById('v245Initials');
    const role=document.getElementById('v245Role');
    const context=document.getElementById('v245Context');
    const prompt=document.getElementById('v245Prompt');
    const choices=document.getElementById('v245Choices');
    const rel=document.getElementById('v245Relationships');
    const ident=document.getElementById('v245Identity');

    if(contact){
      panel?.style.setProperty('--v245-accent',contact.accent||'#c7ff00');
      if(heading)heading.textContent=contact.name;
      if(init)init.textContent=initials(contact.id);
      if(role)role.textContent=contact.role;
      if(context)context.textContent=c.context(contact.id,state.choices);
      if(prompt)prompt.textContent=contact.prompt;
      if(choices)choices.innerHTML=contact.choices.map((x,i)=>
        '<button class="v245-choice '+(state.choices[contact.id]===x.id?'selected':'')+'" data-v245-choice="'+x.id+'">'+
        '<i>0'+(i+1)+'</i><div><b>'+x.label+'</b><span>'+x.detail+'</span></div><em>+'+x.relationship+' REL</em></button>'
      ).join('');
    }else{
      panel?.style.setProperty('--v245-accent','#c7ff00');
      const identity=c?.identity?.(state.choices)||{};
      if(heading)heading.textContent=state.epilogue?'STORY IDENTITY':'RELATIONSHIPS';
      if(init)init.textContent='TGG';
      if(role)role.textContent=state.epilogue?'CITY BUZZ COMPLETE':'STORY PROFILE';
      if(context)context.textContent=state.epilogue
        ?'The run is complete. These choices define the version of your artist the city just met.'
        :'Your decisions stay with your profile and change later conversation context.';
      if(prompt)prompt.textContent=identity.label||'FIND YOUR LANE';
      if(choices)choices.innerHTML='<div class="v245-summary">'+
        '<span>CAREER <b>'+(identity.career||'UNDEFINED')+'</b></span>'+
        '<span>SOUND <b>'+(identity.sound||'UNDEFINED')+'</b></span>'+
        '<span>VISUAL <b>'+(identity.visual||'UNDEFINED')+'</b></span>'+
        '</div>';
    }

    if(rel){
      const rs=relationSnapshot();
      rel.innerHTML=Object.entries(rs).map(([id,x])=>{
        const cc=c?.contact?.(id);return '<article><span>'+String(cc?.name||id).toUpperCase()+'</span><b>'+x.score+'</b><em>'+x.level+'</em><i><u style="width:'+x.score+'%"></u></i></article>';
      }).join('');
    }
    if(ident){
      const t=c?.tags?.(state.choices)||[];
      ident.innerHTML='<small>YOUR STORY DNA</small><div>'+(t.length?t.map(x=>'<span>'+x.toUpperCase()+'</span>').join(''):'<span>UNDEFINED</span>')+'</div>';
    }
  }

  function open(contactId,step=null){
    if(!state.enabled)return false;
    const c=core()?.contact?.(contactId);if(!c)return false;
    state.active=contactId;state.activeStep=step?.id||null;state.epilogue=false;
    state.scenes++;state.history.push({type:'open',contact:contactId,step:state.activeStep,at:Date.now()});
    if(state.history.length>40)state.history=state.history.slice(-40);
    save();ensureUI();render();panel?.classList.add('active');
    const npc=document.getElementById('npcDialogue');
    if(npc){npc.textContent=c.name+': '+c.prompt;npc.classList.add('show')}
    window.TGGV242?.start?.('mission-intro',{auto:true,source:'v245',contact:contactId});
    window.TGGV240?.applyProfile?.('cinematic');
    window.TGGV232?.play?.('talk',1800);
    emit('tgg:v245-dialogue-open',{contact:contactId,step:state.activeStep});
    return true;
  }

  function choose(choiceId){
    const contactId=state.active;if(!contactId)return false;
    const c=core(),choice=c?.choice?.(contactId,choiceId);if(!choice)return false;
    state.choices[contactId]=choice.id;
    state.runResolved[contactId]=true;
    state.lastChoiceAt=Date.now();
    state.history.push({type:'choice',contact:contactId,choice:choice.id,tone:choice.tone,at:state.lastChoiceAt});
    if(state.history.length>40)state.history=state.history.slice(-40);
    recompute();save();presentation(contactId,choice);
    const contact=c.contact(contactId);
    const npc=document.getElementById('npcDialogue');
    if(npc){npc.textContent=contact.name+': '+choice.label+'. Locked.';npc.classList.add('show')}
    emit('tgg:v245-choice',{
      contact:contactId,choice:choice.id,tone:choice.tone,
      relationship:state.relationships[contactId],identity:c.identity(state.choices)
    });
    toast(contact.name+' — '+choice.label+' • REL '+state.relationships[contactId]);
    state.active=null;state.activeStep=null;panel?.classList.remove('active');render();
    if(hasDOM()&&window.TGGV244?.status?.()?.active){
      window.TGGV244.advance?.('dialogue:'+contactId+':'+choice.id);
    }
    return status();
  }

  function interceptStoryTalk(step){
    if(!state.enabled||!step||step.kind!=='talk'||!core()?.contacts?.includes(step.contact))return false;
    open(step.contact,step);
    return true;
  }

  function beginRun(detail={}){
    state.storyRun=Date.now();
    state.runResolved={manager:false,kane:false,director:false};
    state.active=null;state.activeStep=null;state.epilogue=false;
    state.history.push({type:'story-run',story:detail?.story||'city-buzz',at:state.storyRun});
    save();render();
  }
  function finishRun(detail={}){
    state.active=null;state.activeStep=null;state.epilogue=true;
    state.history.push({type:'epilogue',story:detail?.id||detail?.story||'city-buzz',identity:core()?.identity?.(state.choices),at:Date.now()});
    save();ensureUI();render();panel?.classList.add('active');
    window.TGGV243?.mark?.('dialogue-epilogue',{identity:core()?.identity?.(state.choices),source:'v245'});
    emit('tgg:v245-epilogue',{identity:core()?.identity?.(state.choices),relationships:relationSnapshot()});
  }

  function resetProfile(){
    state.choices={manager:null,kane:null,director:null};
    state.relationships={manager:50,kane:50,director:50};
    state.runResolved={manager:false,kane:false,director:false};
    state.active=null;state.activeStep=null;state.epilogue=false;
    state.history.push({type:'profile-reset',at:Date.now()});save();render();toast('DIALOGUE PROFILE RESET');return status();
  }
  function setEnabled(v){state.enabled=!!v;if(!state.enabled){state.active=null;panel?.classList.remove('active')}save();render();return state.enabled}

  function bind(){
    if(!hasDOM()||bind.done)return;bind.done=true;
    window.addEventListener('tgg:v244-story-start',e=>beginRun(e.detail||{}));
    window.addEventListener('tgg:v244-story-complete',e=>finishRun(e.detail||{}));
    document.addEventListener('keydown',e=>{
      if(state.active&&['1','2','3'].includes(e.key)){
        const contact=core()?.contact?.(state.active),pick=contact?.choices?.[Number(e.key)-1];
        if(pick){e.preventDefault();choose(pick.id)}
      }
      if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
      if(e.key==='F11'){e.preventDefault();ensureUI();state.epilogue=false;render();panel?.classList.toggle('active')}
    });
  }

  load();bind();
  const api={
    version:VERSION,layers:LAYERS,status,open,choose,interceptStoryTalk,
    beginRun,finishRun,resetProfile,setEnabled,relationships:relationSnapshot
  };
  globalThis.TGGV245=api;
  if(hasDOM()){window.TGGV245=api;ensureUI()}
})();