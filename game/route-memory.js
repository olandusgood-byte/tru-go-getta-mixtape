(() => {
  const KEY='tgg-route-memory-v1';
  const NPCS={
    m:{id:'m',name:'M',role:'Manager',district:'downtown',line:'Keep moving. The city remembers consistency.'},
    producer:{id:'producer',name:'Kane',role:'Producer',district:'studio-row',line:'Bring the work in sharp. Every session should level you up.'},
    dj:{id:'dj',name:'DJ V',role:'DJ',district:'mixtape-ave',line:'If the record moves here, the whole city hears it.'}
  };
  let state={districts:{},encounters:[],relationships:{},lastFingerprint:null,updatedAt:0,remoteStatus:'offline_ready'};

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(saved&&typeof saved==='object')state={...state,...saved};
    }catch(e){}
    if(!state.districts||typeof state.districts!=='object'||Array.isArray(state.districts))state.districts={};
    if(!Array.isArray(state.encounters))state.encounters=[];
    if(!state.relationships||typeof state.relationships!=='object'||Array.isArray(state.relationships))state.relationships={};
    if(typeof state.lastFingerprint!=='string')state.lastFingerprint=null;
    if(typeof state.remoteStatus!=='string')state.remoteStatus='offline_ready';
    return state;
  }

  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function districtMemory(id){
    const key=String(id||'').trim();
    if(!key)return null;
    if(!state.districts[key]){
      state.districts[key]={visits:0,beats:[],npcs:[],lastBeat:null,lastNpc:null,updatedAt:0};
    }
    return state.districts[key];
  }

  function npc(id){return NPCS[String(id||'')]||null}

  const RELATION_EVENT={m:'street-cypher',producer:'studio-pop-in',dj:'release-rush'};
  const DIALOGUE={
    m:{
      STRANGER:'M does not know your work yet.',
      INTRO:'Keep moving. One appearance is only the start.',
      FAMILIAR:'I keep hearing your name. Stay consistent and make the next move count.',
      TRUSTED:'Now you are moving like somebody I can put in rooms.',
      'INNER CIRCLE':'You already know the play. Build the next run and bring the city with you.'
    },
    producer:{
      STRANGER:'Kane has not worked with you yet.',
      INTRO:'Bring the work in sharp. Every session should level you up.',
      FAMILIAR:'Your sessions are getting tighter. Come prepared and we can move faster.',
      TRUSTED:'I trust your ear now. We can build records instead of just recording songs.',
      'INNER CIRCLE':'This room is yours when the work is serious. Let us build the next sound.'
    },
    dj:{
      STRANGER:'DJ V has not seen your record move yet.',
      INTRO:'If the record moves here, the whole city hears it.',
      FAMILIAR:'People are reacting when I drop your name. Keep feeding the city.',
      TRUSTED:'I can test your records in real rooms now. Bring me the right one.',
      'INNER CIRCLE':'When you are ready to move the city, I know exactly where to put the record.'
    }
  };

  function relationship(npcId){
    const person=npc(npcId);
    if(!person)return {npcId:String(npcId||''),tier:'STRANGER',mastery:'rookie',met:false};
    const met=state.encounters.some(x=>x.npcId===person.id);
    const eventId=RELATION_EVENT[person.id];
    const mastery=window.TGGEvents?.mastery?.(eventId)||{tier:'rookie',runs:0};
    let tier='STRANGER';
    if(met){
      tier=mastery.tier==='headliner'?'INNER CIRCLE':mastery.tier==='known'?'TRUSTED':mastery.tier==='regular'?'FAMILIAR':'INTRO';
    }
    return {npcId:person.id,npcName:person.name,eventId,met,tier,mastery:mastery.tier,runs:Number(mastery.runs)||0};
  }

  function dialogue(npcId){
    const rel=relationship(npcId);
    const lines=DIALOGUE[rel.npcId]||{};
    return {...rel,line:String(lines[rel.tier]||'Keep building your name.')};
  }

  function syncRelationships(){
    let changed=false;
    Object.keys(NPCS).forEach(id=>{
      const next=dialogue(id);
      if(!next.met)return;
      const prev=state.relationships[id]||{};
      if(prev.tier!==next.tier||prev.mastery!==next.mastery||prev.line!==next.line){
        state.relationships[id]={tier:next.tier,mastery:next.mastery,runs:next.runs,line:next.line,updatedAt:Date.now()};
        changed=true;
      }
    });
    if(changed)save();
    return JSON.parse(JSON.stringify(state.relationships));
  }

  function recordBeat(beat){
    if(!beat||!beat.district||!beat.eventId)return {ok:false,status:'invalid_beat'};
    if(window.TGGDistricts?.canEnter&&!window.TGGDistricts.canEnter(beat.district))return {ok:false,status:'district_locked',district:beat.district};
    const fingerprint=[beat.district,beat.eventId,beat.beat||''].join(':');
    const memory=districtMemory(beat.district);
    if(state.lastFingerprint!==fingerprint){
      memory.visits=Math.max(0,Number(memory.visits)||0)+1;
      if(beat.beat&&!memory.beats.includes(beat.beat))memory.beats.push(beat.beat);
      memory.lastBeat=beat.beat||null;
      memory.updatedAt=Date.now();
      state.lastFingerprint=fingerprint;
      save();
    }
    render();
    return {ok:true,status:'recorded',district:beat.district,memory:{...memory}};
  }

  function currentNpc(){
    const beat=window.TGGDistrictStory?.currentBeat?.();
    if(!beat)return null;
    return npc(beat.npcId)||null;
  }

  function encounterCurrent(){
    const beat=window.TGGDistrictStory?.currentBeat?.();
    if(!beat)return {ok:false,status:'no_active_story_beat'};
    const person=npc(beat.npcId);
    if(!person)return {ok:false,status:'no_npc_for_beat'};
    if(window.TGGDistricts?.canEnter&&!window.TGGDistricts.canEnter(beat.district))return {ok:false,status:'district_locked',district:beat.district};
    const key=[beat.eventId,person.id].join(':');
    const existing=state.encounters.find(x=>x.key===key);
    if(existing){
      syncRelationships();
      const talk=dialogue(person.id);
      render();
      return {ok:true,status:'already_met',encounter:{...existing},relationship:talk,dialogue:talk.line};
    }
    const encounter={
      key,
      npcId:person.id,
      npcName:person.name,
      role:person.role,
      district:beat.district,
      eventId:beat.eventId,
      beat:beat.beat||null,
      at:Date.now()
    };
    state.encounters.push(encounter);
    const memory=districtMemory(beat.district);
    if(!memory.npcs.includes(person.id))memory.npcs.push(person.id);
    memory.lastNpc=person.id;
    memory.updatedAt=Date.now();
    save();
    syncRelationships();
    window.TGGProgression?.sync?.();
    window.__tggToast?.('MET '+person.name.toUpperCase()+' — '+person.role.toUpperCase());
    render();
    const talk=dialogue(person.id);
    return {ok:true,status:'recorded',encounter:{...encounter},relationship:talk,dialogue:talk.line};
  }

  function uniqueNpcIds(){
    return [...new Set(state.encounters.map(x=>x.npcId).filter(Boolean))];
  }

  function memorySnapshot(){
    return {
      districts:JSON.parse(JSON.stringify(state.districts)),
      encounters:state.encounters.map(x=>({...x})),
      uniqueNpcIds:uniqueNpcIds(),
      relationships:JSON.parse(JSON.stringify(state.relationships)),
      remoteStatus:state.remoteStatus,
      updatedAt:state.updatedAt
    };
  }

  function summarizeRemote(encounters,memory){
    const list=value=>Array.isArray(value)?value:Array.isArray(value?.items)?value.items:Array.isArray(value?.data)?value.data:[];
    return {
      ok:encounters?.ok===true&&memory?.ok===true,
      status:encounters?.ok===true&&memory?.ok===true?'ready':String(encounters?.status||memory?.status||'offline_ready'),
      summary:{
        encounters:list(encounters?.data).length,
        memory:list(memory?.data).length
      }
    };
  }

  async function refreshRemoteMemory(){
    const encounters=await window.TGGWorldSync?.npcEncounters?.();
    if(!encounters?.ok){
      state.remoteStatus=String(encounters?.status||'offline_ready');
      save();render();
      return {ok:false,status:state.remoteStatus};
    }
    const memory=await window.TGGWorldSync?.memoryHistory?.();
    const summary=summarizeRemote(encounters,memory);
    state.remoteStatus=summary.status;
    save();
    render(summary.summary);
    return summary;
  }

  function render(remoteSummary){
    const host=document.getElementById('eventsList');
    if(!host)return;
    host.querySelector('[data-route-memory]')?.remove();
    const story=window.TGGDistrictStory?.status?.()||{};
    const beat=story.currentBeat;
    const person=currentNpc();
    const memory=beat?districtMemory(beat.district):null;
    const talk=person?dialogue(person.id):null;
    const remote=remoteSummary
      ? 'REMOTE READ: '+remoteSummary.encounters+' encounters • '+remoteSummary.memory+' memories'
      : 'REMOTE MEMORY: '+String(state.remoteStatus).toUpperCase().replaceAll('_',' ');
    const active=beat&&person
      ? '<span>CURRENT CONTACT: '+esc(person.name)+' • '+esc(person.role)+' • '+esc(beat.district)+' • '+esc(talk?.tier||'INTRO')+'</span><span>'+esc(talk?.line||person.line)+'</span>'
      : '<span>Start a district story route to meet local contacts and build district memory.</span>';
    const local=memory
      ? '<span>LOCAL MEMORY: '+memory.visits+' visits • '+memory.npcs.length+' contacts • '+memory.beats.length+' story beats</span>'
      : '<span>LOCAL MEMORY: READY</span>';
    const wrap=document.createElement('div');
    wrap.className='mission-card route-memory';
    wrap.dataset.routeMemory='1';
    wrap.innerHTML=
      '<b>V1.19 • NPC RELATIONSHIP MEMORY</b>'+
      active+local+
      '<span>'+esc(remote)+'</span>'+
      (beat&&person?'<button class="secondary" data-route-encounter="1">TALK TO '+esc(person.name.toUpperCase())+'</button>':'')+
      '<button class="secondary" data-memory-refresh="1">REFRESH READ-ONLY MEMORY</button>';
    host.prepend(wrap);
    wrap.querySelector('[data-route-encounter]')?.addEventListener('click',()=>encounterCurrent());
    wrap.querySelector('[data-memory-refresh]')?.addEventListener('click',()=>refreshRemoteMemory());
  }

  load();
  window.TGGRouteMemory={npcs:NPCS,state,load,save,districtMemory,npc,relationship,dialogue,syncRelationships,recordBeat,currentNpc,encounterCurrent,uniqueNpcIds,memorySnapshot,summarizeRemote,refreshRemoteMemory,render};
})();