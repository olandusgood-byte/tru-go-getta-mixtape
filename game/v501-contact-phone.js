(()=>{
  const VERSION='5.1.0';
  const POLICY='local-only';
  const CONTACTS=['M','DJ V','Kane','Rico Flame'];
  let openState=false;
  function relations(){return window.TGGNPCRelations}
  function favors(){return window.TGGNPCFavors}
  function consequences(){return window.TGGContactConsequences?.snapshot?.()||{}}
  function contracts(){return window.TGGCareerContracts?.snapshot?.()||{}}
  function ensure(){
    let button=document.getElementById('v501PhoneBtn');
    const actions=document.querySelector('#game .actions');
    if(!button&&actions){
      button=document.createElement('button');
      button.id='v501PhoneBtn';
      button.type='button';
      button.className='action-primary';
      button.textContent='TGG PHONE';
      actions.appendChild(button);
      button.addEventListener('click',()=>openPhone());
    }
    let root=document.getElementById('v501Phone');
    if(!root){
      root=document.createElement('section');
      root.id='v501Phone';
      root.hidden=true;
      root.innerHTML='<div class="v501-shell"><header><div><small>V5.01 • TGG PHONE</small><h3>CONTACTS</h3></div><button id="v501PhoneClose" type="button">CLOSE</button></header><div id="v501ContractStrip"></div><div id="v501Contacts"></div></div>';
      document.body.appendChild(root);
      document.getElementById('v501PhoneClose')?.addEventListener('click',()=>closePhone());
      const style=document.createElement('style');
      style.id='v501PhoneStyle';
      style.textContent='#v501Phone{position:fixed;inset:0;z-index:16000;display:grid;place-items:center;background:#02040ab8;padding:18px;font-family:Inter,system-ui,sans-serif}#v501Phone[hidden]{display:none}.v501-shell{width:min(680px,96vw);max-height:88vh;overflow:auto;border:1px solid #ffffff20;border-radius:24px;background:#080b12f7;box-shadow:0 28px 90px #000d;color:#eef2f7;padding:18px}.v501-shell header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.v501-shell header small{color:#c7ff00;font-size:9px;font-weight:900;letter-spacing:.12em}.v501-shell h3{margin:4px 0 12px;font-size:28px}.v501-shell header button{border:1px solid #ffffff20;background:#121722;color:#fff;border-radius:10px;padding:8px 12px;font-weight:900}.v501-contract{margin-bottom:10px;border:1px solid #ffcc6635;background:#ffcc660d;border-radius:12px;padding:10px;font-size:10px}.v501-contact{display:grid;grid-template-columns:1fr auto;gap:10px;border:1px solid #ffffff16;border-radius:14px;background:#0f141e;padding:12px;margin-top:8px}.v501-contact b{display:block;font-size:13px}.v501-contact span{display:block;color:#aeb8c6;font-size:9px;margin-top:3px}.v501-actions{display:flex;gap:6px;align-items:center}.v501-actions button{border:1px solid #ffffff20;background:#151b27;color:#fff;border-radius:9px;padding:8px;font-size:9px;font-weight:900;cursor:pointer}.v501-actions button[data-ready="true"]{border-color:#c7ff0060;color:#c7ff00}';
      document.head.appendChild(style);
    }
    return {button,root};
  }
  function contactData(name){
    const r=relations()?.relationship?.(name)||null;
    const favor=favors()?.availability?.(name)||null;
    const consequence=consequences().contacts?.[name]||{};
    return {
      name,state:r?.npcState||'around',affinity:Number(r?.relation?.affinity)||0,
      meetings:Number(r?.relation?.meetings)||0,lastChoice:r?.relation?.lastChoice||null,
      favorReady:!!favor?.ready,favorLabel:favor?.label||'FAVOR',favorReason:favor?.reason||'locked',
      debt:Number(consequence.debt)||0,respect:Number(consequence.respect)||0,
      completedFavors:Number(consequence.completed)||0,missedFavors:Number(consequence.missed)||0
    };
  }
  function render(){
    const {root}=ensure();if(!root)return;
    const contract=contracts().active;
    const strip=document.getElementById('v501ContractStrip');
    if(strip)strip.innerHTML=contract
      ?'<div class="v501-contract"><b>ACTIVE CONTRACT • '+contract.label+'</b><span>'+contract.sponsor+' • '+contract.beat.replaceAll('-',' ').toUpperCase()+'</span></div>'
      :'<div class="v501-contract"><b>CAREER DIRECTOR READY</b><span>Relationships and completed favors unlock contracts.</span></div>';
    const list=document.getElementById('v501Contacts');
    if(!list)return;
    list.innerHTML=CONTACTS.map(name=>{
      const d=contactData(name);
      return '<article class="v501-contact" data-v501-contact="'+name.replaceAll('"','&quot;')+'"><div><b>'+name+' • '+d.state.toUpperCase()+'</b><span>AFFINITY '+Math.round(d.affinity)+' • RESPECT '+d.respect+' • DEBT '+d.debt+' • MEETINGS '+d.meetings+'</span><span>LAST '+String(d.lastChoice||'NONE').toUpperCase()+' • FAVORS '+d.completedFavors+' COMPLETE / '+d.missedFavors+' MISSED</span></div><div class="v501-actions"><button type="button" data-v501-talk="'+name.replaceAll('"','&quot;')+'">TALK</button><button type="button" data-v501-favor="'+name.replaceAll('"','&quot;')+'" data-ready="'+d.favorReady+'" '+(d.favorReady?'':'disabled')+'>'+d.favorLabel+'</button></div></article>';
    }).join('');
    list.querySelectorAll('[data-v501-talk]').forEach(btn=>btn.onclick=()=>callContact(btn.dataset.v501Talk));
    list.querySelectorAll('[data-v501-favor]').forEach(btn=>btn.onclick=()=>callFavor(btn.dataset.v501Favor));
  }
  function openPhone(){ensure();openState=true;document.getElementById('v501Phone').hidden=false;render();return snapshot()}
  function closePhone(){openState=false;const root=document.getElementById('v501Phone');if(root)root.hidden=true;return true}
  function callContact(name){
    closePhone();
    const result=relations()?.interact?.(name)||{ok:false,status:'relations_unavailable'};
    return {accepted:!!result?.ok,result};
  }
  function callFavor(name){
    closePhone();
    const result=favors()?.callFavor?.(name)||{ok:false,status:'favors_unavailable'};
    return {accepted:!!result?.ok,result};
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,open:openState,contacts:CONTACTS.map(contactData),contract:contracts().active||null}}
  function run(){
    const ui=ensure();
    const checks={
      button:!!ui.button,
      phone:!!ui.root,
      relations:!!relations(),
      contacts:CONTACTS.length===4,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensure();render();
    window.addEventListener('tgg:npc-choice-resolved',render);
    window.addEventListener('tgg:npc-favor',render);
    window.addEventListener('tgg:npc-favor-outcome',render);
    window.addEventListener('tgg:career-contract-start',render);
    window.addEventListener('tgg:career-contract-outcome',render);
    window.TGGPhone={version:VERSION,mutationPolicy:POLICY,openPhone,closePhone,callContact,callFavor,contactData,snapshot,run};
    window.TGGV501={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV501='on';
    window.dispatchEvent(new CustomEvent('tgg:v501-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();