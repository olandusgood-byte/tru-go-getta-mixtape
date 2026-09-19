(() => {
  const VERSION='V2.23';
  const KEY='tgg-social-schedule-v1';
  const $=id=>document.getElementById(id);
  const TEMPLATES=[
    {id:'manager-meet',contact:'manager',name:'M',title:'MANAGER CHECK-IN',message:'Pull up. We need to line up the next career move.',start:660,end:780,duration:60,relationship:10,target:{label:'M — MANAGER CORNER',x:72,y:36,radius:7,color:'#ff466d'}},
    {id:'studio-session',contact:'producer',name:'Kane',title:'STUDIO LINK',message:'I got a session open. Come lock in while the room is free.',start:840,end:1020,duration:120,relationship:10,target:{label:'KANE — STUDIO ROW',x:24,y:37,radius:8,color:'#7b86ff'}},
    {id:'club-set',contact:'dj',name:'DJ V',title:'CITY SET',message:'I got a crowd tonight. Slide through and make some noise.',start:1200,end:1380,duration:90,relationship:10,target:{label:'DJ V — MIXTAPE AVE',x:76,y:63,radius:8,color:'#48d7ff'}},
    {id:'video-call',contact:'director',name:'Director K',title:'VISUAL MEETING',message:'I have a treatment ready. Meet me at Media District.',start:960,end:1110,duration:90,relationship:10,target:{label:'DIRECTOR K — MEDIA DISTRICT',x:50,y:89,radius:8,color:'#c56cff'}},
    {id:'day-one-run',contact:'friend',name:'Day One',title:'DAY ONE LINK-UP',message:'Come kick it at the park. You been moving nonstop.',start:1080,end:1260,duration:75,relationship:9,target:{label:'DAY ONE — THE PARK',x:72,y:67,radius:9,color:'#c7ff00'}},
    {id:'family-dinner',contact:'family',name:'Mama G',title:'FAMILY DINNER',message:'Come home and eat. Career can wait for one hour.',start:1140,end:1320,duration:75,relationship:12,target:{label:'MAMA G — HOME',x:63,y:24,radius:9,color:'#ffc857'}}
  ];
  const defaults=()=>({version:VERSION,generatedDays:[],invites:[],stats:{accepted:0,declined:0,completed:0,missed:0},lastNoticeDay:0,updatedAt:Date.now()});
  let state=defaults();
  let lastRenderKey='';

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
      state.generatedDays=Array.isArray(saved.generatedDays)?saved.generatedDays:[];
      state.invites=Array.isArray(saved.invites)?saved.invites:[];
      state.stats={...defaults().stats,...(saved.stats||{})};
      state.version=VERSION;
    }catch(e){state=defaults();}
    return state;
  }
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function notify(text){window.__tggToast?.(text)}
  function life(){return window.TGGLifeOS?.getState?.()||{day:1,minute:540,relationships:{}}}
  function game(){return window.TGGGame?.getState?.()||{x:50,y:55}}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
  function timeText(minute){
    let h=Math.floor(Number(minute||0)/60)%24,m=Math.floor(Number(minute||0)%60),ap=h>=12?'PM':'AM';
    return (h%12||12)+':'+String(m).padStart(2,'0')+' '+ap;
  }
  function dayText(day){return ['MON','TUE','WED','THU','FRI','SAT','SUN'][(Math.max(1,Number(day)||1)-1)%7]+' • DAY '+day}
  function inviteFrom(template,day){
    return {
      id:day+'-'+template.id,day,templateId:template.id,contact:template.contact,name:template.name,
      title:template.title,message:template.message,start:template.start,end:template.end,duration:template.duration,
      relationship:template.relationship,target:{...template.target},status:'pending',createdAt:Date.now(),
      acceptedAt:0,completedAt:0,missedAt:0,declinedAt:0
    };
  }
  function generateDay(day){
    day=Math.max(1,Math.floor(Number(day)||1));
    if(state.generatedDays.includes(day))return false;
    const a=(day-1)%TEMPLATES.length;
    let b=(day+2)%TEMPLATES.length;
    if(b===a)b=(b+1)%TEMPLATES.length;
    state.invites.push(inviteFrom(TEMPLATES[a],day),inviteFrom(TEMPLATES[b],day));
    state.generatedDays.push(day);
    save();
    if(state.lastNoticeDay!==day){
      state.lastNoticeDay=day;save();
      notify('PHONE — 2 NEW INVITES FOR '+dayText(day));
    }
    return true;
  }
  function relationshipDelta(id,amount,reason){
    window.TGGLifeOS?.adjustRelationship?.(id,amount,reason);
  }
  function markMissed(invite,reason='MISSED APPOINTMENT'){
    if(!invite||!['pending','accepted'].includes(invite.status))return false;
    const penalty=invite.status==='accepted'?-6:-2;
    invite.status='missed';invite.missedAt=Date.now();invite.outcome=reason;
    state.stats.missed++;
    relationshipDelta(invite.contact,penalty,reason+' • '+invite.name);
    save();
    notify(reason+' — '+invite.name.toUpperCase()+' '+penalty+' RELATIONSHIP');
    return true;
  }
  function expirePast(){
    const now=life();
    let changed=false;
    state.invites.forEach(invite=>{
      if(!['pending','accepted'].includes(invite.status))return;
      if(invite.day<now.day){changed=markMissed(invite,'MISSED APPOINTMENT')||changed;return;}
      if(invite.day===now.day&&now.minute>invite.end)changed=markMissed(invite,'APPOINTMENT EXPIRED')||changed;
    });
    return changed;
  }
  function accept(id){
    const invite=state.invites.find(x=>x.id===id);
    if(!invite||invite.status!=='pending')return false;
    const now=life();
    if(invite.day<now.day||(invite.day===now.day&&now.minute>invite.end))return markMissed(invite,'APPOINTMENT EXPIRED');
    invite.status='accepted';invite.acceptedAt=Date.now();state.stats.accepted++;save();
    notify('INVITE ACCEPTED — '+invite.name.toUpperCase()+' • '+timeText(invite.start));
    window.TGGGame?.show?.('game');
    render(true);
    return true;
  }
  function decline(id){
    const invite=state.invites.find(x=>x.id===id);
    if(!invite||invite.status!=='pending')return false;
    invite.status='declined';invite.declinedAt=Date.now();state.stats.declined++;
    relationshipDelta(invite.contact,-1,'DECLINED INVITE • '+invite.name);
    save();notify('INVITE DECLINED — '+invite.name.toUpperCase()+' • -1 RELATIONSHIP');render(true);
    return true;
  }
  function distance(invite){
    if(!invite?.target)return Infinity;
    const s=game();
    return Math.hypot((Number(s.x)||50)-invite.target.x,(Number(s.y)||55)-invite.target.y);
  }
  function near(invite){return distance(invite)<=Number(invite?.target?.radius||8)}
  function activeInvite(){
    const now=life();
    return state.invites
      .filter(x=>x.status==='accepted'&&x.day>=now.day)
      .sort((a,b)=>(a.day-b.day)||(a.start-b.start))[0]||null;
  }
  function nextInvite(){
    const now=life();
    return state.invites
      .filter(x=>['pending','accepted'].includes(x.status)&&(x.day>now.day||(x.day===now.day&&x.end>=now.minute)))
      .sort((a,b)=>(a.day-b.day)||(a.start-b.start))[0]||null;
  }
  function checkIn(id){
    const invite=state.invites.find(x=>x.id===id)||activeInvite();
    if(!invite||invite.status!=='accepted'){notify('ACCEPT AN INVITE FIRST');return false;}
    const now=life();
    if(now.day!==invite.day){
      if(now.day>invite.day)return markMissed(invite,'MISSED APPOINTMENT');
      notify('THIS APPOINTMENT IS ON '+dayText(invite.day));return false;
    }
    if(now.minute<invite.start-60){notify('TOO EARLY — CHECK IN AFTER '+timeText(invite.start-60));return false;}
    if(now.minute>invite.end)return markMissed(invite,'APPOINTMENT EXPIRED');
    if(!near(invite)){
      window.TGGGame?.show?.('game');
      notify('FOLLOW THE APPOINTMENT MARKER — '+invite.target.label);
      return false;
    }
    invite.status='completed';invite.completedAt=Date.now();state.stats.completed++;
    window.TGGLifeOS?.applySocialAppointment?.(invite.contact,invite.duration,invite.relationship,invite.title);
    save();
    notify('APPOINTMENT COMPLETE — '+invite.name.toUpperCase()+' +'+invite.relationship+' RELATIONSHIP');
    render(true);
    return true;
  }
  function go(id){
    const invite=state.invites.find(x=>x.id===id)||activeInvite();
    if(!invite)return false;
    if(invite.status==='pending')accept(invite.id);
    window.TGGGame?.show?.('game');
    notify('NAV SET — '+invite.target.label);
    renderHud();
    return true;
  }
  function navigationTarget(){
    const invite=activeInvite();
    if(!invite)return null;
    return {
      label:'APPOINTMENT • '+invite.target.label,
      x:invite.target.x,y:invite.target.y,radius:invite.target.radius,color:invite.target.color,
      arrived:near(invite),id:'appointment-'+invite.id,inviteId:invite.id,schedule:true,contact:invite.contact,
      name:invite.name,start:invite.start,end:invite.end
    };
  }
  function status(){
    const now=life(),active=activeInvite(),next=nextInvite();
    return JSON.parse(JSON.stringify({
      version:VERSION,day:now.day,minute:now.minute,clock:now.clock||'',active,next,
      invites:state.invites.filter(x=>x.day>=Math.max(1,now.day-1)).sort((a,b)=>(a.day-b.day)||(a.start-b.start)),
      stats:state.stats
    }));
  }
  function statusLabel(invite){
    if(invite.status==='completed')return 'COMPLETED';
    if(invite.status==='missed')return 'MISSED';
    if(invite.status==='declined')return 'DECLINED';
    if(invite.status==='accepted')return 'ACCEPTED • NAV ACTIVE';
    return 'NEW INVITE';
  }
  function relativeTime(invite){
    const now=life();
    if(invite.day>now.day)return 'TOMORROW • '+timeText(invite.start);
    const d=invite.start-now.minute;
    if(d>60)return Math.floor(d/60)+'H '+(d%60)+'M';
    if(d>0)return d+' MIN';
    if(now.minute<=invite.end)return 'NOW';
    return 'ENDED';
  }
  function ensure(){
    let root=$('scheduleBoard');
    if(!root){
      root=document.createElement('section');root.id='scheduleBoard';root.className='screen';
      document.querySelector('main')?.appendChild(root);
    }
    if(!$('scheduleBtn')){
      const deck=document.querySelector('.action-deck .actions');
      if(deck){const b=document.createElement('button');b.id='scheduleBtn';b.className='action-primary';b.textContent='PHONE + SCHEDULE';deck.appendChild(b);}
    }
    if(!$('appointmentHud')){
      const city=document.querySelector('#game .city');
      if(city){
        const hud=document.createElement('div');hud.id='appointmentHud';hud.className='appointment-hud';
        hud.innerHTML='<small id="appointmentHudKicker">PHONE</small><b id="appointmentHudTitle">NO APPOINTMENT</b><span id="appointmentHudMeta">Open your schedule.</span><div><button id="appointmentHudOpen" type="button">SCHEDULE</button><button id="appointmentHudCheck" type="button">CHECK IN</button></div>';
        city.appendChild(hud);
      }
    }
    if(!$('scheduleStyles')){
      const style=document.createElement('style');style.id='scheduleStyles';
      style.textContent=`
      .schedule-shell{width:min(1120px,calc(100% - 32px));margin:22px auto 70px;padding:22px;border:1px solid #ffffff18;border-radius:24px;background:linear-gradient(145deg,#0b0f17f7,#06080df7);box-shadow:0 26px 70px #000a;color:#f4f7fb}
      .schedule-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.schedule-head h2{margin:2px 0 5px;font-size:clamp(30px,4vw,54px)}.schedule-head p{max-width:700px;color:#9aa4b6}.schedule-clock{padding:11px 13px;border:1px solid #48d7ff40;border-radius:13px;background:#48d7ff08;text-align:right}.schedule-clock b{display:block;color:#48d7ff;font-size:12px}.schedule-clock span{font-size:9px;color:#9aa4b6}
      .schedule-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.schedule-card{padding:15px;border:1px solid #ffffff14;border-radius:17px;background:#090d14;display:grid;gap:8px;min-width:0}.schedule-card.accepted{border-color:#c7ff0055;box-shadow:inset 0 0 0 1px #c7ff0015}.schedule-card.completed{border-color:#48d7ff45}.schedule-card.missed,.schedule-card.declined{opacity:.62}.schedule-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.schedule-top div{display:grid;gap:2px}.schedule-top small{font-size:8px;color:#9ba4b5;letter-spacing:.1em}.schedule-top b{font-size:15px}.schedule-status{font-size:8px;font-weight:950;color:#c7ff00}.schedule-card p{margin:0;color:#aeb7c7;font-size:10px;line-height:1.45}.schedule-meta{display:flex;flex-wrap:wrap;gap:6px}.schedule-meta span{padding:5px 7px;border:1px solid #ffffff10;border-radius:8px;background:#05080d;font-size:8px}.schedule-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.schedule-actions button{min-height:44px;font-weight:950}.schedule-empty{padding:20px;border:1px dashed #ffffff20;border-radius:16px;color:#9aa4b6;text-align:center}
      .appointment-hud{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:19;width:min(390px,calc(100% - 190px));padding:10px 12px;border:1px solid #48d7ff40;border-radius:14px;background:#05080ddd;backdrop-filter:blur(10px);display:none;gap:3px;box-shadow:0 12px 30px #0008}.appointment-hud.active{display:grid}.appointment-hud small{font-size:7px;letter-spacing:.16em;color:#48d7ff}.appointment-hud b{font-size:12px}.appointment-hud span{font-size:8px;color:#b8c0cf}.appointment-hud>div{display:flex;gap:6px;margin-top:4px}.appointment-hud button{min-height:34px;padding:6px 9px;font-size:8px;font-weight:950}.appointment-hud #appointmentHudCheck{background:#c7ff00;color:#050607}.appointment-hud #appointmentHudCheck:disabled{opacity:.35}
      @media(max-width:760px){.schedule-shell{width:calc(100% - 20px);margin:10px auto 50px;padding:14px;border-radius:18px}.schedule-head{display:grid}.schedule-clock{text-align:left}.schedule-list{grid-template-columns:1fr}.schedule-actions{grid-template-columns:1fr 1fr}.appointment-hud{top:8px;width:min(270px,calc(100% - 110px));padding:8px 9px}.appointment-hud b{font-size:10px}.appointment-hud span{font-size:7px}.appointment-hud button{min-height:32px}}
      `;
      document.head.appendChild(style);
    }
    $('scheduleBtn')?.addEventListener('click',openBoard);
    $('appointmentHudOpen')?.addEventListener('click',openBoard);
    $('appointmentHudCheck')?.addEventListener('click',()=>checkIn(activeInvite()?.id));
    return root;
  }
  function openBoard(){render(true);window.TGGGame?.show?.('scheduleBoard')}
  function renderHud(){
    ensure();
    const hud=$('appointmentHud');if(!hud)return;
    const screen=window.TGGGame?.getActiveScreen?.();
    const active=activeInvite(),next=nextInvite();
    const visible=screen==='game'&&!!(active||next);
    hud.classList.toggle('active',visible);
    if(!visible)return;
    const invite=active||next;
    $('appointmentHudKicker').textContent=active?'NEXT APPOINTMENT':'NEW INVITE';
    $('appointmentHudTitle').textContent=invite.name+' • '+invite.title;
    const meters=Math.round(distance(invite)*3.2);
    $('appointmentHudMeta').textContent=active
      ?timeText(invite.start)+' • '+(near(invite)?'AT LOCATION':meters+' m • '+invite.target.label)
      :timeText(invite.start)+' • '+relativeTime(invite);
    const check=$('appointmentHudCheck');
    check.style.display=active?'':'none';
    check.disabled=!active||!near(invite);
  }
  function render(force=false){
    const root=ensure();
    const now=life();
    const view=state.invites.filter(x=>x.day>=Math.max(1,now.day-1)).sort((a,b)=>(a.day-b.day)||(a.start-b.start));
    const key=JSON.stringify([now.day,now.minute,view.map(x=>[x.id,x.status]),state.stats]);
    if(!force&&key===lastRenderKey){renderHud();return;}
    lastRenderKey=key;
    root.innerHTML='<div class="schedule-shell"><header class="schedule-head"><div><p class="eyebrow">V2.23 • SOCIAL SCHEDULE</p><h2>YOUR DAY MOVES WITH YOU.</h2><p>Calls, texts, meetings and hangouts now happen on the city clock. Accept the invite, get to the location and show up on time.</p></div><div class="schedule-clock"><b>'+dayText(now.day)+' • '+timeText(now.minute)+'</b><span>'+state.stats.completed+' SHOWED • '+state.stats.missed+' MISSED</span></div></header><div class="schedule-list">'+(view.length?view.map(invite=>{
      const actions=invite.status==='pending'
        ?'<button data-schedule-accept="'+invite.id+'">ACCEPT</button><button data-schedule-decline="'+invite.id+'">DECLINE</button>'
        :invite.status==='accepted'
          ?'<button data-schedule-go="'+invite.id+'">GO TO LOCATION</button><button data-schedule-check="'+invite.id+'">CHECK IN</button>'
          :'';
      return '<article class="schedule-card '+invite.status+'"><div class="schedule-top"><div><small>'+invite.name.toUpperCase()+' • '+dayText(invite.day)+'</small><b>'+invite.title+'</b></div><span class="schedule-status">'+statusLabel(invite)+'</span></div><p>'+invite.message+'</p><div class="schedule-meta"><span>'+timeText(invite.start)+'–'+timeText(invite.end)+'</span><span>'+invite.target.label+'</span><span>'+relativeTime(invite)+'</span></div>'+(actions?'<div class="schedule-actions">'+actions+'</div>':'')+'</article>';
    }).join(''):'<div class="schedule-empty">No invites on the calendar yet.</div>')+'</div><button id="scheduleBack" class="secondary" style="width:100%;min-height:48px;margin-top:14px">BACK TO CITY</button></div>';
    root.querySelectorAll('[data-schedule-accept]').forEach(b=>b.onclick=()=>accept(b.dataset.scheduleAccept));
    root.querySelectorAll('[data-schedule-decline]').forEach(b=>b.onclick=()=>decline(b.dataset.scheduleDecline));
    root.querySelectorAll('[data-schedule-go]').forEach(b=>b.onclick=()=>go(b.dataset.scheduleGo));
    root.querySelectorAll('[data-schedule-check]').forEach(b=>b.onclick=()=>checkIn(b.dataset.scheduleCheck));
    $('scheduleBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    renderHud();
  }
  function sync(){
    const now=life();
    let changed=generateDay(now.day);
    changed=expirePast()||changed;
    render(changed);
    return status();
  }
  function reset(){
    state=defaults();save();generateDay(life().day);render(true);return status();
  }
  function bind(){
    ensure();generateDay(life().day);render(true);
    setInterval(sync,1000);
  }
  window.TGGSocialSchedule={
    version:VERSION,load,save,sync,render,status,accept,decline,go,checkIn,reset,
    activeInvite,nextInvite,navigationTarget,near,distance,templates:TEMPLATES.map(x=>({...x,target:{...x.target}}))
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();